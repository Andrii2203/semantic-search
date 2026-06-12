'use strict';

const request = require('supertest');
const { app } = require('../src/server');
const db = require('../src/db');

// Mock parsers
jest.mock('../src/parsers', () => ({
  parseResume: jest.fn()
}));
const parsers = require('../src/parsers');

async function registerAndGetCookie(email) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'password123' });
  const header = res.headers['set-cookie'];
  return (Array.isArray(header) ? header[0] : header).split(';')[0];
}

describe('Upload API', () => {
  let cookie;
  let userId;

  beforeAll(async () => {
    db.init(':memory:');
    cookie = await registerAndGetCookie('upload-test@example.com');
    userId = db.findUserByEmail('upload-test@example.com').id;
  });

  afterAll(() => {
    db.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('rejects upload without session → 401', async () => {
    const res = await request(app).post('/api/upload');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects upload without files', async () => {
    const res = await request(app).post('/api/upload').set('Cookie', cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects non-pdf files', async () => {
    const dummyBuffer = Buffer.from('dummy text');
    const res = await request(app)
      .post('/api/upload')
      .set('Cookie', cookie)
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
      .set('Cookie', cookie)
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

  it('saves uploaded item with owner user_id and collection_id=files', async () => {
    const dummyBuffer = Buffer.from('dummy pdf');
    parsers.parseResume.mockResolvedValue({
      id: 'mock-id-owner',
      content: 'Owned content',
      type: 'resume',
      source: 'file-upload',
      metadata: { fileName: 'owned.pdf' }
    });

    const res = await request(app)
      .post('/api/upload')
      .set('Cookie', cookie)
      .attach('files', dummyBuffer, { filename: 'owned.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    const saved = db.getItemById('mock-id-owner');
    expect(saved.user_id).toBe(userId);
    expect(saved.collection_id).toBe('files');
  });

  it('returns errors for files that failed to parse', async () => {
    const dummyBuffer = Buffer.from('dummy pdf');
    parsers.parseResume.mockRejectedValue(new Error('Corrupt PDF'));

    const res = await request(app)
      .post('/api/upload')
      .set('Cookie', cookie)
      .attach('files', dummyBuffer, { filename: 'bad.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200); // The batch request itself succeeds
    expect(res.body.processed).toBe(0);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors[0].fileName).toBe('bad.pdf');
    expect(res.body.errors[0].error).toBe('Corrupt PDF');
  });
});

describe('Upload API — multi-tenant isolation', () => {
  let cookieA, cookieB;

  beforeAll(async () => {
    db.init(':memory:');
    cookieA = await registerAndGetCookie('files-user-a@example.com');
    cookieB = await registerAndGetCookie('files-user-b@example.com');
  });

  afterAll(() => {
    db.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('user B does not see files uploaded by user A', async () => {
    parsers.parseResume.mockResolvedValue({
      id: 'file-of-user-a',
      content: 'Private resume of user A',
      type: 'resume',
      source: 'file-upload',
      metadata: { fileName: 'private-a.pdf' }
    });

    const uploadRes = await request(app)
      .post('/api/upload')
      .set('Cookie', cookieA)
      .attach('files', Buffer.from('dummy pdf'), { filename: 'private-a.pdf', contentType: 'application/pdf' });
    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.processed).toBe(1);

    const listA = await request(app).get('/api/items').set('Cookie', cookieA);
    expect(listA.status).toBe(200);
    expect(listA.body.items.map((i) => i.id)).toContain('file-of-user-a');

    const listB = await request(app).get('/api/items').set('Cookie', cookieB);
    expect(listB.status).toBe(200);
    expect(listB.body.items.map((i) => i.id)).not.toContain('file-of-user-a');
  });
});
