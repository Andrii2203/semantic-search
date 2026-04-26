'use strict';

const { z } = require('zod');

// ─── IR Schema ───────────────────────────────────────────────

const IRSchema = z.object({
  id: z.string().min(1, 'id is required'),
  content: z.string().min(1, 'content is required'),
  type: z.enum(['post', 'job', 'code_snippet', 'ui_component', 'resume']),
  source: z.string().min(1, 'source is required'),
  metadata: z
    .object({
      title: z.string().optional(),
      url: z.string().url('metadata.url must be a valid URL').optional(),
      author: z.string().optional(),
      
      // Resume-specific fields
      fileName: z.string().optional(),
      skills: z.array(z.string()).optional(),
      totalYears: z.number().optional(),
      experienceCount: z.number().optional(),
      hasEnglish: z.boolean().optional(),
      education: z.string().optional(),
      summary: z.string().optional(),
      languages: z.array(z.string()).optional(),
      uploadedAt: z.string().optional(),
    })
    .passthrough(),
});

// ─── API Input Schemas ───────────────────────────────────────

const ItemStatusSchema = z.enum(['new', 'approved', 'skipped', 'pending']);

const ItemQuerySchema = z.object({
  status: ItemStatusSchema.optional(),
  source: z.string().min(1).optional(),
  type: z.enum(['post', 'job', 'code_snippet', 'ui_component', 'resume']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const ItemIdSchema = z.object({
  id: z.string().min(1, 'Item id is required'),
});

// ─── Validators ──────────────────────────────────────────────

/**
 * Validates a single IR object. Returns { success, data, error }.
 */
function validateIR(obj) {
  const result = IRSchema.safeParse(obj);
  if (result.success) {
    return { success: true, data: result.data, error: null };
  }
  return {
    success: false,
    data: null,
    error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
  };
}

/**
 * Validates an array of IR objects. Returns only valid ones + logs invalids.
 */
function validateIRBatch(items, logger) {
  const valid = [];
  for (const item of items) {
    const result = validateIR(item);
    if (result.success) {
      valid.push(result.data);
    } else if (logger) {
      logger.warn({ itemId: item?.id, error: result.error }, 'Invalid IR object skipped');
    }
  }
  return valid;
}

/**
 * Validates API query params for item listing.
 */
function validateItemQuery(params) {
  return ItemQuerySchema.safeParse(params);
}

/**
 * Validates item ID from route params.
 */
function validateItemId(params) {
  return ItemIdSchema.safeParse(params);
}

module.exports = {
  IRSchema,
  ItemStatusSchema,
  ItemQuerySchema,
  ItemIdSchema,
  validateIR,
  validateIRBatch,
  validateItemQuery,
  validateItemId,
};
