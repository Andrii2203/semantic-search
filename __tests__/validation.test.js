'use strict';

const { validateIR, validateIRBatch, validateItemQuery, validateItemId } = require('../src/validation');

// ─── Helper: valid IR object ─────────────────────────────────

function makeIR(overrides = {}) {
  return {
    id: 'test-id-123',
    content: 'This is a test post about JavaScript frameworks',
    type: 'post',
    source: 'hn',
    metadata: {
      title: 'Test Post',
      url: 'https://example.com/post/123',
      author: 'testuser',
    },
    ...overrides,
  };
}

// ─── IR Validation ───────────────────────────────────────────

describe('validateIR', () => {
  test('valid IR object passes validation', () => {
    const result = validateIR(makeIR());
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ id: 'test-id-123', type: 'post', source: 'hn' });
    expect(result.error).toBeNull();
  });

  test('accepts all valid types', () => {
    for (const type of ['post', 'job', 'code_snippet', 'ui_component']) {
      const result = validateIR(makeIR({ type }));
      expect(result.success).toBe(true);
    }
  });

  test('rejects missing id', () => {
    const result = validateIR(makeIR({ id: '' }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('id');
  });

  test('rejects missing content', () => {
    const result = validateIR(makeIR({ content: '' }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('content');
  });

  test('rejects invalid type', () => {
    const result = validateIR(makeIR({ type: 'invalid_type' }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('type');
  });

  test('rejects missing source', () => {
    const result = validateIR(makeIR({ source: '' }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('source');
  });

  test('rejects invalid metadata.url', () => {
    const result = validateIR(makeIR({ metadata: { url: 'not-a-url' } }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('url');
  });

  test('allows extra metadata fields (passthrough)', () => {
    const result = validateIR(
      makeIR({ metadata: { title: 'Test', company: 'Acme Inc', salary: '100k' } }),
    );
    expect(result.success).toBe(true);
    expect(result.data.metadata.company).toBe('Acme Inc');
  });

  test('allows metadata with no optional fields', () => {
    const result = validateIR(makeIR({ metadata: {} }));
    expect(result.success).toBe(true);
  });

  test('rejects completely invalid input', () => {
    const result = validateIR(null);
    expect(result.success).toBe(false);
  });

  test('provides detailed error messages', () => {
    const result = validateIR({ id: '', content: '', type: 'bad', source: '' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('id');
    expect(result.error).toContain('content');
  });
});

// ─── Batch Validation ────────────────────────────────────────

describe('validateIRBatch', () => {
  test('returns only valid items', () => {
    const items = [
      makeIR({ id: '1' }),
      { id: '', content: '', type: 'bad', source: '' }, // invalid
      makeIR({ id: '2' }),
    ];
    const valid = validateIRBatch(items);
    expect(valid).toHaveLength(2);
    expect(valid[0].id).toBe('1');
    expect(valid[1].id).toBe('2');
  });

  test('logs warnings for invalid items when logger provided', () => {
    const mockLogger = { warn: jest.fn() };
    const items = [{ id: 'bad', content: '' }];
    validateIRBatch(items, mockLogger);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });

  test('returns empty array for all invalid items', () => {
    const result = validateIRBatch([{ broken: true }, null, undefined]);
    expect(result).toEqual([]);
  });

  test('returns empty array for empty input', () => {
    const result = validateIRBatch([]);
    expect(result).toEqual([]);
  });
});

// ─── API Query Validation ────────────────────────────────────

describe('validateItemQuery', () => {
  test('valid query passes', () => {
    const result = validateItemQuery({ status: 'new', limit: '10', offset: '0' });
    expect(result.success).toBe(true);
    expect(result.data.limit).toBe(10);
    expect(result.data.offset).toBe(0);
  });

  test('applies defaults for missing fields', () => {
    const result = validateItemQuery({});
    expect(result.success).toBe(true);
    expect(result.data.limit).toBe(50);
    expect(result.data.offset).toBe(0);
  });

  test('rejects invalid status', () => {
    const result = validateItemQuery({ status: 'invalid' });
    expect(result.success).toBe(false);
  });

  test('rejects limit over 200', () => {
    const result = validateItemQuery({ limit: '500' });
    expect(result.success).toBe(false);
  });
});

// ─── Item ID Validation ──────────────────────────────────────

describe('validateItemId', () => {
  test('valid id passes', () => {
    const result = validateItemId({ id: 'abc-123' });
    expect(result.success).toBe(true);
  });

  test('rejects empty id', () => {
    const result = validateItemId({ id: '' });
    expect(result.success).toBe(false);
  });
});
