'use strict';

const express = require('express');
const multer = require('multer');
const { parseResume } = require('../parsers');
const db = require('../db');
const { validateIR } = require('../validation');
const { AppError, ErrorCodes } = require('../errors');
const logger = require('../logger');

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

    const results = [];
    const errors = [];

    for (const file of req.files) {
      try {
        const irObject = await parseResume(file.buffer, file.originalname);
        
        const validation = validateIR(irObject);
        if (!validation.success) {
          throw new AppError(`Invalid IR generated: ${validation.error}`, ErrorCodes.VALIDATION_FAILED, 500);
        }

        const inserted = db.insertItem(validation.data);
        if (inserted) {
          results.push(validation.data);
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
