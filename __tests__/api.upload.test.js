'use strict';

const request = require('supertest');
const { app } = require('../src/server');
const db = require('../src/db');

// Mock parsers
jest.mock('../src/parsers', () => ({
  parseResume: jest.fn()
}));
const parsers = require('../src/parsers');

describe('Upload API', () => {
  beforeAll(() => {
    db.init(':memory:');
  });

  afterAll(() => {
    db.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('rejects upload without files', async () => {
    const res = await request(app).post('/api/upload');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects non-pdf files', async () => {
    const dummyBuffer = Buffer.from('dummy text');
    const res = await request(app)
      .post('/api/upload')
      .attach('files', dummyBuffer, 'test.txt');
    
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Only PDF files are allowed');
  });

  it('processes valid pdf files and returns IR items', async () => {
    const dummyBuffer = Buffer.from('dummy pdf');
    
    const mockIr = {
      id: 'mock-id-123',
      content: 'Parsed content',
      type: 'resume',
      source: 'file-upload',
      metadata: {
        fileName: 'test.pdf'
      }
    };
    parsers.parseResume.mockResolvedValue(mockIr);

    const res = await request(app)
      .post('/api/upload')
      .attach('files', dummyBuffer, { filename: 'test.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.processed).toBe(1);
    expect(res.body.failed).toBe(0);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe('mock-id-123');

    // Verify it was saved to DB
    const saved = db.getItemById('mock-id-123');
    expect(saved).not.toBeNull();
    expect(saved.content).toBe('Parsed content');
  });

  it('returns errors for files that failed to parse', async () => {
    const dummyBuffer = Buffer.from('dummy pdf');
    parsers.parseResume.mockRejectedValue(new Error('Corrupt PDF'));

    const res = await request(app)
      .post('/api/upload')
      .attach('files', dummyBuffer, { filename: 'bad.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200); // The batch request itself succeeds
    expect(res.body.processed).toBe(0);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors[0].fileName).toBe('bad.pdf');
    expect(res.body.errors[0].error).toBe('Corrupt PDF');
  });
});
