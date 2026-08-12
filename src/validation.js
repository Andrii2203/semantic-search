'use strict';

const { z } = require('zod');

const IRSchema = z.object({
  id: z.string().min(1, 'id is required'),
  content: z.string().min(1, 'content is required'),
  type: z.enum(['post', 'job', 'code_snippet', 'ui_component', 'resume', 'document']),
  source: z.string().min(1, 'source is required'),
  metadata: z
    .object({
      title: z.string().optional(),
      url: z.string().url('metadata.url must be a valid URL').optional(),
      author: z.string().optional(),

      batchId: z.string().optional(),

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

const ItemStatusSchema = z.enum(['new', 'approved', 'skipped', 'pending', 'starred']);

const ItemQuerySchema = z.object({
  status: ItemStatusSchema.optional(),
  source: z.string().min(1).optional(),
  type: z.enum(['post', 'job', 'code_snippet', 'ui_component', 'resume', 'document']).optional(),
  collectionId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  offset: z.coerce.number().int().min(0).default(0),
});

const ItemIdSchema = z.object({
  id: z.string().min(1, 'Item id is required'),
});

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

function validateItemQuery(params) {
  return ItemQuerySchema.safeParse(params);
}

function validateItemId(params) {
  return ItemIdSchema.safeParse(params);
}

const SearchRequestSchema = z.object({
  query: z.string().min(1).optional(),
  profileId: z.string().min(1).optional(),
  keywords: z.array(z.string()).optional(),
  mode: z.enum(['sequential', 'parallel']).default('sequential'),
  weights: z
    .object({
      bm25: z.number().min(0).max(1).default(0.4),
      semantic: z.number().min(0).max(1).default(0.6),
    })
    .optional(),
  threshold: z.number().min(0).max(1).default(0.65),
  maxBm25Results: z.number().int().min(1).max(1000).default(100),
  topN: z.number().int().min(1).max(200).default(20),
  useReranker: z.boolean().default(false),
});

const ChunkingConfigSchema = z.object({
  strategy: z.enum(['fixed', 'semantic', 'hierarchical']).optional(),
  chunkSize: z.number().int().min(50).max(1000).optional(),
  overlap: z.number().int().min(0).max(200).optional(),
});

module.exports = {
  IRSchema,
  ItemStatusSchema,
  ItemQuerySchema,
  ItemIdSchema,
  SearchRequestSchema,
  ChunkingConfigSchema,
  validateIR,
  validateIRBatch,
  validateItemQuery,
  validateItemId,
};
