'use strict';

const fs = require('fs');
const request = require('supertest');
const { app } = require('../src/server');
const db = require('../src/db');
const config = require('../src/config');

// Mock parsers (default is the generic document parser; resume is opt-in)
jest.mock('../src/parsers', () => ({
  parseResume: jest.fn(),
  parseDocument: jest.fn(),
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

  it('processes valid pdf as a generic document (default) and returns a batchId', async () => {
    parsers.parseDocument.mockResolvedValue({
      id: 'mock-doc-123',
      content: 'Parsed content',
      type: 'document',
      source: 'file-upload',
      metadata: { fileName: 'test.pdf' },
    });

    const res = await request(app)
      .post('/api/upload')
      .set('Cookie', cookie)
      .attach('files', Buffer.from('dummy pdf'), { filename: 'test.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.processed).toBe(1);
    expect(res.body.batchId).toBeDefined();
    expect(parsers.parseDocument).toHaveBeenCalled();
    expect(parsers.parseResume).not.toHaveBeenCalled();

    // id is re-scoped to the owner, so read it back from the response
    const saved = db.getItemById(res.body.items[0].id);
    expect(saved).not.toBeNull();
    expect(saved.content).toBe('Parsed content');
    // upload tags every item with the batch id for scoped Match
    expect(saved.metadata.batchId).toBe(res.body.batchId);
  });

  it('type=resume opts into the resume parser', async () => {
    parsers.parseResume.mockResolvedValue({
      id: 'mock-resume-1',
      content: 'Resume content',
      type: 'resume',
      source: 'file-upload',
      metadata: { fileName: 'cv.pdf' },
    });

    const res = await request(app)
      .post('/api/upload')
      .set('Cookie', cookie)
      .field('type', 'resume')
      .attach('files', Buffer.from('dummy pdf'), { filename: 'cv.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(parsers.parseResume).toHaveBeenCalled();
    expect(parsers.parseDocument).not.toHaveBeenCalled();
    expect(db.getItemById(res.body.items[0].id)).not.toBeNull();
  });

  it('saves uploaded item with owner user_id and collection_id=files', async () => {
    parsers.parseDocument.mockResolvedValue({
      id: 'mock-id-owner',
      content: 'Owned content',
      type: 'document',
      source: 'file-upload',
      metadata: { fileName: 'owned.pdf' },
    });

    const res = await request(app)
      .post('/api/upload')
      .set('Cookie', cookie)
      .attach('files', Buffer.from('dummy pdf'), { filename: 'owned.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    const saved = db.getItemById(res.body.items[0].id);
    expect(saved.user_id).toBe(userId);
    expect(saved.collection_id).toBe('files');
  });

  it('writes the incoming file to the temp directory instead of holding it in memory', async () => {
    let filesOnDiskDuringParse = 0;
    parsers.parseDocument.mockImplementation(async () => {
      filesOnDiskDuringParse = fs.readdirSync(config.upload.tempDir).length;
      return {
        id: 'disk-storage-doc',
        content: 'Parsed content',
        type: 'document',
        source: 'file-upload',
        metadata: { fileName: 'on-disk.pdf' },
      };
    });

    await request(app)
      .post('/api/upload')
      .set('Cookie', cookie)
      .attach('files', Buffer.from('dummy pdf'), { filename: 'on-disk.pdf', contentType: 'application/pdf' });

    expect(filesOnDiskDuringParse).toBeGreaterThan(0);
  });

  it('removes the temporary file after a successful upload', async () => {
    parsers.parseDocument.mockResolvedValue({
      id: 'cleanup-success',
      content: 'Parsed content',
      type: 'document',
      source: 'file-upload',
      metadata: { fileName: 'clean.pdf' },
    });

    await request(app)
      .post('/api/upload')
      .set('Cookie', cookie)
      .attach('files', Buffer.from('dummy pdf'), { filename: 'clean.pdf', contentType: 'application/pdf' });

    expect(fs.readdirSync(config.upload.tempDir)).toEqual([]);
  });

  it('removes the temporary file when parsing throws', async () => {
    parsers.parseDocument.mockRejectedValue(new Error('Corrupt PDF'));

    await request(app)
      .post('/api/upload')
      .set('Cookie', cookie)
      .attach('files', Buffer.from('dummy pdf'), { filename: 'broken.pdf', contentType: 'application/pdf' });

    expect(fs.readdirSync(config.upload.tempDir)).toEqual([]);
  });

  it('returns errors for files that failed to parse', async () => {
    parsers.parseDocument.mockRejectedValue(new Error('Corrupt PDF'));

    const res = await request(app)
      .post('/api/upload')
      .set('Cookie', cookie)
      .attach('files', Buffer.from('dummy pdf'), { filename: 'bad.pdf', contentType: 'application/pdf' });

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
    parsers.parseDocument.mockResolvedValue({
      id: 'file-of-user-a',
      content: 'Private document of user A',
      type: 'document',
      source: 'file-upload',
      metadata: { fileName: 'private-a.pdf' },
    });

    const uploadRes = await request(app)
      .post('/api/upload')
      .set('Cookie', cookieA)
      .attach('files', Buffer.from('dummy pdf'), { filename: 'private-a.pdf', contentType: 'application/pdf' });
    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.processed).toBe(1);
    const idA = uploadRes.body.items[0].id;

    const listA = await request(app).get('/api/items').set('Cookie', cookieA);
    expect(listA.body.items.map((i) => i.id)).toContain(idA);

    const listB = await request(app).get('/api/items').set('Cookie', cookieB);
    expect(listB.body.items.map((i) => i.id)).not.toContain(idA);
  });

  it('two users can each upload the SAME file (id is owner-scoped, not a cross-user dupe)', async () => {
    parsers.parseDocument.mockResolvedValue({
      id: 'shared-content-id',
      content: 'Identical document content',
      type: 'document',
      source: 'file-upload',
      metadata: { fileName: 'shared.pdf' },
    });

    const resA = await request(app)
      .post('/api/upload')
      .set('Cookie', cookieA)
      .attach('files', Buffer.from('dummy pdf'), { filename: 'shared.pdf', contentType: 'application/pdf' });
    const resB = await request(app)
      .post('/api/upload')
      .set('Cookie', cookieB)
      .attach('files', Buffer.from('dummy pdf'), { filename: 'shared.pdf', contentType: 'application/pdf' });

    // Both succeed — the same file is NOT treated as a duplicate across users
    expect(resA.body.processed).toBe(1);
    expect(resB.body.processed).toBe(1);
    expect(resA.body.items[0].id).not.toBe(resB.body.items[0].id);
  });
});
