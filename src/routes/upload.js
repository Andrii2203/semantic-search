'use strict';

const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { parseResume, parseDocument } = require('../parsers');
const db = require('../db');
const { validateIR } = require('../validation');
const { AppError, ErrorCodes } = require('../errors');
const logger = require('../logger');
const { chunk } = require('../chunker');
const SearchEngine = require('../search-engine');
const config = require('../config');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.upload.maxFileSizeMb * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new AppError('Only PDF files are allowed', ErrorCodes.VALIDATION_FAILED, 400));
    }
  }
});

router.post('/', upload.array('files', config.upload.maxFiles), async (req, res, next) => {
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

    // One upload = one batch (for scoped Match: this batch vs the whole library).
    // Default parser is generic 'document'; resume parsing is opt-in (type=resume).
    const batchId = (req.body && req.body.batchId) || crypto.randomUUID();
    const useResumeParser = req.body && req.body.type === 'resume';
    const parse = useResumeParser ? parseResume : parseDocument;

    const results = [];
    const errors = [];

    for (const file of req.files) {
      try {
        const irObject = await parse(file.buffer, file.originalname);
        // Private library: the content-addressed id is the PK, so two users
        // uploading the same file would collide (INSERT OR IGNORE drops the
        // second). Scope the id to the owner — same user re-uploading still
        // dedups; different users each keep their own copy. (fingerprint is
        // already user-scoped for non-internet collections.)
        if (req.userId) {
          irObject.id = crypto.createHash('sha256')
            .update(`${req.userId}:${irObject.id}`)
            .digest('hex')
            .slice(0, 16);
        }
        irObject.metadata = { ...irObject.metadata, batchId };

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
          errors.push({ fileName: file.originalname, error: 'Duplicate document (already in your library)' });
        }
      } catch (err) {
        logger.error({ err, fileName: file.originalname }, 'Failed to process document');
        errors.push({ fileName: file.originalname, error: err.message });
      }
    }

    res.status(200).json({
      success: true,
      batchId,
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
