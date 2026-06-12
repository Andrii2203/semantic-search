'use strict';

const express = require('express');
const multer = require('multer');
const { parseResume } = require('../parsers');
const db = require('../db');
const { validateIR } = require('../validation');
const { AppError, ErrorCodes } = require('../errors');
const logger = require('../logger');
const { chunk } = require('../chunker');
const SearchEngine = require('../search-engine');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new AppError('Only PDF files are allowed', ErrorCodes.VALIDATION_FAILED, 400));
    }
  }
});

router.post('/', upload.array('files', 50), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw new AppError('No files uploaded', ErrorCodes.VALIDATION_FAILED, 400);
    }

    // Get chunking config
    let chunkingConfig;
    try {
      chunkingConfig = db.getChunkingConfig();
    } catch {
      chunkingConfig = { strategy: 'semantic', chunk_size: 200, overlap: 50 };
    }

    const results = [];
    const errors = [];

    for (const file of req.files) {
      try {
        const irObject = await parseResume(file.buffer, file.originalname);
        
        const validation = validateIR(irObject);
        if (!validation.success) {
          throw new AppError(`Invalid IR generated: ${validation.error}`, ErrorCodes.VALIDATION_FAILED, 500);
        }

        const inserted = db.insertItem({
          ...validation.data,
          userId: req.userId || null,
          collectionId: 'files',
        });
        if (inserted) {
          results.push(validation.data);

          // Chunk the document and generate embeddings
          try {
            const chunks = await chunk(validation.data.content, chunkingConfig.strategy, {
              chunkSize: chunkingConfig.chunk_size,
              overlap: chunkingConfig.overlap,
            });

            for (const c of chunks) {
              let vector = null;
              try {
                const embedding = await SearchEngine.generateEmbedding(c.content);
                vector = SearchEngine.serializeVector(embedding);
              } catch {
                // Skip embedding generation on failure — chunk is still searchable via FTS5
              }

              db.insertChunk({
                id: `${validation.data.id}_chunk_${c.chunkIndex}`,
                parentId: validation.data.id,
                content: c.content,
                chunkIndex: c.chunkIndex,
                level: c.level || 'section',
                strategy: c.strategy,
                vector,
                metadata: c.metadata || {},
              });
            }

            logger.info(
              { itemId: validation.data.id, chunksCreated: chunks.length, strategy: chunkingConfig.strategy },
              'Document chunked and indexed',
            );
          } catch (chunkErr) {
            logger.error({ err: chunkErr, itemId: validation.data.id }, 'Chunking failed for item');
            // Item is still saved even if chunking fails
          }
        } else {
          errors.push({ fileName: file.originalname, error: 'Duplicate resume (already exists in database)' });
        }
      } catch (err) {
        logger.error({ err, fileName: file.originalname }, 'Failed to process resume');
        errors.push({ fileName: file.originalname, error: err.message });
      }
    }

    res.status(200).json({
      success: true,
      processed: results.length,
      failed: errors.length,
      items: results,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
