'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
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

fs.mkdirSync(config.upload.tempDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.upload.tempDir),
    filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.pdf`),
  }),
  limits: {
    fileSize: config.upload.maxFileSizeMb * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new AppError('Only PDF files are allowed', ErrorCodes.VALIDATION_FAILED, 400));
    }
  },
});

function readChunkingConfig() {
  try {
    return db.getChunkingConfig();
  } catch {
    return { strategy: 'semantic', chunk_size: 200, overlap: 50 };
  }
}

function scopeIdToOwner(id, userId) {
  if (!userId) {
    return id;
  }
  return crypto.createHash('sha256').update(`${userId}:${id}`).digest('hex').slice(0, 16);
}

async function indexItem(item, chunkingConfig) {
  const chunks = await chunk(item.content, chunkingConfig.strategy, {
    chunkSize: chunkingConfig.chunk_size,
    overlap: chunkingConfig.overlap,
  });

  for (const piece of chunks) {
    db.insertChunk({
      id: `${item.id}_chunk_${piece.chunkIndex}`,
      parentId: item.id,
      content: piece.content,
      chunkIndex: piece.chunkIndex,
      level: piece.level || 'section',
      strategy: piece.strategy,
      vector: await embedOrNull(piece.content),
      metadata: piece.metadata || {},
    });
  }

  logger.info(
    { itemId: item.id, chunksCreated: chunks.length, strategy: chunkingConfig.strategy },
    'Document chunked and indexed',
  );
}

async function embedOrNull(content) {
  try {
    return SearchEngine.serializeVector(await SearchEngine.generateEmbedding(content));
  } catch {
    return null;
  }
}

async function processFile(file, context) {
  const buffer = await fsp.readFile(file.path);
  const parsed = await context.parse(buffer, file.originalname);

  parsed.id = scopeIdToOwner(parsed.id, context.userId);
  parsed.metadata = { ...parsed.metadata, batchId: context.batchId };

  const validation = validateIR(parsed);
  if (!validation.success) {
    throw new AppError(
      `Invalid IR generated: ${validation.error}`,
      ErrorCodes.VALIDATION_FAILED,
      500,
    );
  }

  const inserted = db.insertItem({
    ...validation.data,
    userId: context.userId || null,
    collectionId: 'files',
  });
  if (!inserted) {
    throw new AppError(
      'Duplicate document (already in your library)',
      ErrorCodes.VALIDATION_FAILED,
      409,
    );
  }

  try {
    await indexItem(validation.data, context.chunkingConfig);
  } catch (err) {
    logger.error({ err, itemId: validation.data.id }, 'Chunking failed for item');
  }

  return validation.data;
}

async function removeTempFile(filePath) {
  try {
    await fsp.unlink(filePath);
  } catch (err) {
    logger.warn({ err, filePath }, 'Failed to remove temporary upload file');
  }
}

function buildUploadContext(body, userId) {
  const useResumeParser = body && body.type === 'resume';
  return {
    batchId: (body && body.batchId) || crypto.randomUUID(),
    userId,
    parse: useResumeParser ? parseResume : parseDocument,
    chunkingConfig: readChunkingConfig(),
  };
}

async function processBatch(files, context) {
  const results = [];
  const errors = [];

  for (const file of files) {
    try {
      results.push(await processFile(file, context));
    } catch (err) {
      logger.error({ err, fileName: file.originalname }, 'Failed to process document');
      errors.push({ fileName: file.originalname, error: err.message });
    } finally {
      await removeTempFile(file.path);
    }
  }

  return { results, errors };
}

router.post('/', upload.array('files', config.upload.maxFiles), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw new AppError('No files uploaded', ErrorCodes.VALIDATION_FAILED, 400);
    }

    const context = buildUploadContext(req.body, req.userId);
    const { results, errors } = await processBatch(req.files, context);

    res.status(200).json({
      success: true,
      batchId: context.batchId,
      processed: results.length,
      failed: errors.length,
      items: results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    if (req.files) {
      await Promise.all(req.files.map((file) => removeTempFile(file.path)));
    }
    next(err);
  }
});

module.exports = router;
