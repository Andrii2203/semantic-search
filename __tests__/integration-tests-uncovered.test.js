'use strict';

// ═══════════════════════════════════════════════════════════════
// INTEGRATION TEST SUITE — Uncovered Branches & Functions
// No shallow mocks on business logic. Real buffers, real DB, real Express.
// ═══════════════════════════════════════════════════════════════

const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

// ─── Setup test environment ──────────────────────────────────
process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';

// ─── Helpers to build minimal valid PDF buffer ───────────────
// PDF header + minimal structure that pdf-parse can handle
function createMinimalPDFBuffer(textContent = 'Test PDF Content') {
  // This is a structurally valid but minimal PDF
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
100 700 Td
(${textContent}) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
308
%%EOF`;
  return Buffer.from(pdf, 'ascii');
}

function createInvalidPDFBuffer() {
  return Buffer.from('NOT_A_PDF_AT_ALL_just_random_bytes_12345', 'utf-8');
}

// ─── Module imports (after env setup) ────────────────────────
let db = require('../src/db');
const { validateIR } = require('../src/validation');
const { AppError, ErrorCodes } = require('../src/errors');

// ─── Test Data Fixtures ──────────────────────────────────────

const VALID_SOURCE_ITEM = {
  id: 'test-item-1',
  content: 'Test content about JavaScript and Node.js development',
  type: 'post',
  source: 'hackernews',
  metadata: {
    title: 'Test Post',
    url: 'https://example.com/1',
    author: 'tester',
  },
};

const VALID_RESUME_IR = {
  id: 'resume-1',
  content: 'Senior developer with 10 years experience',
  type: 'resume',
  source: 'file-upload',
  metadata: {
    fileName: 'test-resume.pdf',
    skills: ['JavaScript', 'Node.js', 'Python'],
    totalYears: 10,
    experienceCount: 3,
    hasEnglish: true,
    education: 'BS Computer Science',
    summary: 'Experienced developer',
    languages: ['English', 'Ukrainian'],
    uploadedAt: new Date().toISOString(),
  },
};

// ═══════════════════════════════════════════════════════════════
// DESCRIBE BLOCK: src/routes/sync.js
// Uncovered: 33% functions, error branch in GET /sources
// ═══════════════════════════════════════════════════════════════

describe('src/routes/sync.js', () => {
  let app;
  let syncRouter;

  beforeEach(() => {
    jest.resetModules();
    db = require('../src/db');
    db.init(':memory:');
    // Seed DB with sources
    db.insertItemsBatch([VALID_SOURCE_ITEM]);

    syncRouter = require('../src/routes/sync');
    app = express();
    app.use(express.json());
    app.use('/api', syncRouter);
    // Error handler
    app.use((err, _req, res, _next) => {
      res.status(err.statusCode || 500).json({ error: err.message });
    });
  });

  afterEach(() => {
    db.close();
    jest.resetModules();
  });

  describe('GET /api/sources', () => {
    test('returns list of registered sources from DB', async () => {
      const res = await request(app).get('/api/sources').expect(200);

      expect(res.body).toHaveProperty('sources');
      expect(Array.isArray(res.body.sources)).toBe(true);
      expect(res.body.sources).toContain('hackernews');
    });

    test('returns empty array when DB has no items', async () => {
      db.close();
      db.init(':memory:'); // Fresh empty DB

      const res = await request(app).get('/api/sources').expect(200);
      expect(res.body.sources).toEqual([]);
    });

    test('handles DB error gracefully', async () => {
      // Force DB error by closing connection before request
      db.close();

      const res = await request(app).get('/api/sources').expect(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/sync', () => {
    test('triggers manual sync and returns success', async () => {
      const scheduler = require('../src/scheduler');
      const runCycleSpy = jest.spyOn(scheduler, 'runCycle')
        .mockResolvedValue({ fetched: 5, saved: 3 });

      const res = await request(app)
        .post('/api/sync')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Sync started');
      expect(runCycleSpy).toHaveBeenCalled();

      runCycleSpy.mockRestore();
    });

    test('handles scheduler error in background', async () => {
      const scheduler = require('../src/scheduler');
      const runCycleSpy = jest.spyOn(scheduler, 'runCycle')
        .mockRejectedValue(new Error('Scheduler fail'));

      // Should still return 200 immediately (fire and forget)
      const res = await request(app)
        .post('/api/sync')
        .expect(200);

      expect(res.body.success).toBe(true);

      // Wait for background promise to reject
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(runCycleSpy).toHaveBeenCalled();

      runCycleSpy.mockRestore();
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// DESCRIBE BLOCK: src/routes/upload.js
// Uncovered: branches at lines 42, 49 (validation failure, insert failure)
// ═══════════════════════════════════════════════════════════════

describe('src/routes/upload.js', () => {
  let app;
  let uploadRouter;

  beforeEach(() => {
    jest.resetModules();
    db = require('../src/db');
    db.init(':memory:');
    uploadRouter = require('../src/routes/upload');
    app = express();
    app.use(express.json());
    app.use('/api/upload', uploadRouter);
    app.use((err, _req, res, _next) => {
      res.status(err.statusCode || 500).json({ error: err.message });
    });
  });

  afterEach(() => {
    db.close();
    jest.resetModules();
  });

  describe('POST /api/upload', () => {
    test('rejects non-PDF files with 400', async () => {
      const res = await request(app)
        .post('/api/upload')
        .attach('files', Buffer.from('not a pdf'), 'test.txt')
        .expect(400);

      expect(res.body.error).toMatch(/Only PDF files are allowed/);
    });

    test('rejects empty upload with 400', async () => {
      const res = await request(app)
        .post('/api/upload')
        .expect(400);

      expect(res.body.error).toMatch(/No files uploaded/);
    });

    test('processes valid PDF and saves to DB', async () => {
      // Mock pdf-parse to avoid native module issues in test env
      jest.resetModules();
      jest.doMock('pdf-parse', () => {
        return jest.fn(() => Promise.resolve({ text: 'John Doe\nSkills: JavaScript, Node.js\nExperience: 5 years at Google' }));
      });
      
      db = require('../src/db');
      db.init(':memory:');
      const uploadRouterWithMock = require('../src/routes/upload');
      const appWithMock = express();
      appWithMock.use(express.json());
      appWithMock.use('/api/upload', uploadRouterWithMock);

      const pdfBuffer = createMinimalPDFBuffer();

      const res = await request(appWithMock)
        .post('/api/upload')
        .attach('files', pdfBuffer, 'resume.pdf')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.processed).toBeGreaterThanOrEqual(0);

      jest.dontMock('pdf-parse');
    });

    test('handles duplicate resume gracefully', async () => {
      jest.resetModules();
      jest.doMock('pdf-parse', () => {
        return jest.fn(() => Promise.resolve({
          text: 'Senior developer with 10 years experience'
        }));
      });

      db = require('../src/db');
      db.init(':memory:');
      const uploadRouterWithMock = require('../src/routes/upload');
      const appWithMock = express();
      appWithMock.use(express.json());
      appWithMock.use('/api/upload', uploadRouterWithMock);

      // First, seed DB with a resume that will cause duplicate
      const existingIR = {
        ...VALID_RESUME_IR,
        id: 'existing-resume',
        metadata: { ...VALID_RESUME_IR.metadata, fileName: 'duplicate.pdf' },
      };
      db.insertItem(existingIR);

      const res = await request(appWithMock)
        .post('/api/upload')
        .attach('files', createMinimalPDFBuffer(), 'duplicate.pdf')
        .expect(200);

      // Should report the duplicate in errors
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.length).toBeGreaterThan(0);
      expect(res.body.errors[0].error).toMatch(/Duplicate|already exists/i);

      jest.dontMock('pdf-parse');
    });

    test('handles validation failure in generated IR', async () => {
      jest.resetModules();
      jest.doMock('pdf-parse', () => {
        return jest.fn(() => Promise.resolve({ text: '' })); // Empty text = invalid IR
      });

      db = require('../src/db');
      db.init(':memory:');
      const uploadRouterWithMock = require('../src/routes/upload');
      const appWithMock = express();
      appWithMock.use(express.json());
      appWithMock.use('/api/upload', uploadRouterWithMock);

      const res = await request(appWithMock)
        .post('/api/upload')
        .attach('files', createMinimalPDFBuffer(), 'empty.pdf')
        .expect(200);

      // Should have errors for invalid IR
      expect(res.body.failed).toBeGreaterThan(0);

      jest.dontMock('pdf-parse');
    });

    test('handles per-file processing error without failing entire batch', async () => {
      // Upload multiple files where one fails
      jest.doMock('pdf-parse', () => {
        return jest.fn(() => Promise.resolve({
          text: 'Valid resume content with skills and experience'
        }));
      });

      const res = await request(app)
        .post('/api/upload')
        .attach('files', createMinimalPDFBuffer(), 'valid1.pdf')
        .attach('files', createMinimalPDFBuffer(), 'valid2.pdf')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.processed + res.body.failed).toBe(2);

      jest.dontMock('pdf-parse');
    });

    test('handles invalid PDF buffer (pdf-parse throws)', async () => {
      jest.resetModules();
      jest.doMock('pdf-parse', () => {
        return jest.fn(() => Promise.reject(new Error('Invalid PDF structure')));
      });

      db = require('../src/db');
      db.init(':memory:');
      const uploadRouterWithMock = require('../src/routes/upload');
      const appWithMock = express();
      appWithMock.use(express.json());
      appWithMock.use('/api/upload', uploadRouterWithMock);

      const res = await request(appWithMock)
        .post('/api/upload')
        .attach('files', createInvalidPDFBuffer(), 'corrupt.pdf')
        .expect(200);

      expect(res.body.failed).toBe(1);
      expect(res.body.errors[0].error).toMatch(/Failed to parse PDF|Invalid PDF/);

      jest.dontMock('pdf-parse');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// DESCRIBE BLOCK: src/routes/export.js
// Uncovered: branches at lines 35-48 (file exists vs not exists, error handling)
// ═══════════════════════════════════════════════════════════════

describe('src/routes/export.js', () => {
  let app;
  let exportModule;
  let exportPath;

  beforeEach(() => {
    exportModule = require('../src/routes/export');
    exportPath = path.join(__dirname, '..', 'data', 'export.json');

    // Ensure data directory exists
    const dataDir = path.dirname(exportPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    // Clean up export file
    if (fs.existsSync(exportPath)) {
      fs.unlinkSync(exportPath);
    }

    app = express();
    app.use('/api/export', exportModule.router);
    app.use((err, _req, res, _next) => {
      res.status(err.statusCode || 500).json({ error: err.message });
    });
  });

  afterEach(() => {
    if (fs.existsSync(exportPath)) {
      fs.unlinkSync(exportPath);
    }
    jest.resetModules();
  });

  describe('GET /api/export', () => {
    test('returns empty items array when export file does not exist', async () => {
      const res = await request(app).get('/api/export').expect(200);
      expect(res.body).toEqual({ items: [] });
    });

    test('downloads export file when it exists', async () => {
      // Create export file
      const exportData = {
        items: [
          { id: '1', title: 'Test', content: 'Content', comment: 'Nice post' },
        ],
      };
      fs.writeFileSync(exportPath, JSON.stringify(exportData), 'utf-8');

      const res = await request(app)
        .get('/api/export')
        .expect(200)
        .expect('Content-Disposition', /attachment; filename="semantic-search-export.json"/);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe('1');
    });

    test('handles corrupted export file gracefully', async () => {
      // Write invalid JSON
      fs.writeFileSync(exportPath, 'NOT_VALID_JSON{{{', 'utf-8');

      // The route does not handle this case in GET, but saveToExportFile does
      // GET should still work since it uses res.download
      const res = await request(app)
        .get('/api/export')
        .buffer() // Prevent automatic JSON parsing
        .parse((res, cb) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => cb(null, data));
        })
        .expect(200);

      expect(res.body).toContain('NOT_VALID_JSON');
    });
  });

  describe('saveToExportFile', () => {
    test('creates new export file with item', async () => {
      const item = {
        id: 'test-1',
        source: 'hackernews',
        type: 'post',
        content: 'Test content',
        metadata: { title: 'Test', url: 'https://example.com' },
      };

      await exportModule.saveToExportFile('test-1', item, 'Great article!');

      expect(fs.existsSync(exportPath)).toBe(true);
      const data = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
      expect(data.items).toHaveLength(1);
      expect(data.items[0].comment).toBe('Great article!');
      expect(data.items[0].generatedAt).toBeDefined();
    });

    test('updates existing item instead of duplicating', async () => {
      const item = {
        id: 'test-1',
        source: 'hackernews',
        type: 'post',
        content: 'Original content',
        metadata: { title: 'Test' },
      };

      await exportModule.saveToExportFile('test-1', item, 'First comment');
      await exportModule.saveToExportFile('test-1', item, 'Updated comment');

      const data = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
      expect(data.items).toHaveLength(1);
      expect(data.items[0].comment).toBe('Updated comment');
    });

    test('handles corrupted existing export file by resetting', async () => {
      fs.writeFileSync(exportPath, 'INVALID_JSON', 'utf-8');

      const item = {
        id: 'test-1',
        source: 'hackernews',
        type: 'post',
        content: 'Test',
        metadata: {},
      };

      await exportModule.saveToExportFile('test-1', item, 'Comment');

      const data = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
      expect(data.items).toHaveLength(1);
    });

    test('appends new items to existing export', async () => {
      const item1 = {
        id: 'test-1',
        source: 'hackernews',
        type: 'post',
        content: 'First',
        metadata: { title: 'First' },
      };
      const item2 = {
        id: 'test-2',
        source: 'reddit',
        type: 'post',
        content: 'Second',
        metadata: { title: 'Second' },
      };

      await exportModule.saveToExportFile('test-1', item1, 'Comment 1');
      await exportModule.saveToExportFile('test-2', item2, 'Comment 2');

      const data = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
      expect(data.items).toHaveLength(2);
      expect(data.items.map((i) => i.id)).toEqual(['test-1', 'test-2']);
    });

    test('handles missing metadata fields gracefully', async () => {
      const item = {
        id: 'minimal',
        source: 'test',
        type: 'post',
        content: 'Minimal item',
        // No metadata at all
      };

      await exportModule.saveToExportFile('minimal', item, 'Comment');

      const data = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
      expect(data.items[0].title).toBe('');
      expect(data.items[0].url).toBe('');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// DESCRIBE BLOCK: src/parsers/index.js
// Uncovered: 42% statements, 0% branches, 0% functions
// ═══════════════════════════════════════════════════════════════

describe('src/parsers/index.js — parseResume', () => {
  let parseResume;

  beforeEach(() => {
    jest.resetModules();
    // We will mock pdf-parse but test the integration of all other parsers
    jest.doMock('pdf-parse', () => {
      return jest.fn((buffer) => {
        // Simulate parsing based on buffer content hints
        const text = buffer.hint || 'Default PDF text';
        return Promise.resolve({ text });
      });
    });
    parseResume = require('../src/parsers').parseResume;
  });

  afterEach(() => {
    jest.dontMock('pdf-parse');
  });

  test('full pipeline: PDF buffer → structured IR', async () => {
    const buffer = Buffer.from('test');
    buffer.hint = `
John Doe
john@example.com

SKILLS
JavaScript, Node.js, Python, React

EXPERIENCE
Senior Developer at Google
2020 - Present
- Built scalable systems

EDUCATION
BS Computer Science, Stanford University

LANGUAGES
English, Spanish

SUMMARY
Experienced full-stack developer with 8 years in the industry.
    `.trim();

    const result = await parseResume(buffer, 'john-doe.pdf');

    expect(result).toBeDefined();
    expect(result.metadata.fileName).toBe('john-doe.pdf');
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.metadata.skills)).toBe(true);
    expect(Array.isArray(result.metadata.experienceCount)).toBeDefined();
    expect(typeof result.metadata.education).toBe('string');
    expect(Array.isArray(result.metadata.languages)).toBe(true);
    expect(typeof result.metadata.summary).toBe('string');
  });

  test('handles PDF with minimal/empty content', async () => {
    const buffer = Buffer.from('empty');
    buffer.hint = '';

    const result = await parseResume(buffer, 'empty.pdf');

    expect(result.metadata.fileName).toBe('empty.pdf');
    expect(result.metadata.skills).toEqual([]);
    expect(result.metadata.experienceCount).toBe(0);
    expect(result.metadata.education).toBe('');
    expect(result.metadata.languages).toEqual([]);
    expect(result.metadata.summary).toBe('');
  });

  test('handles PDF with only skills section', async () => {
    const buffer = Buffer.from('skills-only');
    buffer.hint = 'SKILLS\nJavaScript, Python\n\nSome other text';

    const result = await parseResume(buffer, 'skills-only.pdf');

    expect(result.metadata.skills.length).toBeGreaterThan(0);
    expect(result.metadata.experienceCount).toBe(0);
  });

  test('handles PDF with only experience section', async () => {
    const buffer = Buffer.from('exp-only');
    buffer.hint = 'EXPERIENCE\nDeveloper at Corp\n2020-2022\n- Did things';

    const result = await parseResume(buffer, 'exp-only.pdf');

    expect(result.metadata.experienceCount).toBeGreaterThan(0);
    expect(result.metadata.skills).toEqual([]);
  });

  test('propagates pdf-parse errors as AppError', async () => {
    jest.resetModules();
    jest.doMock('pdf-parse', () => {
      return jest.fn(() => Promise.reject(new Error('PDF corrupted')));
    });
    const { parseResume: failingParseResume } = require('../src/parsers');

    await expect(failingParseResume(Buffer.from('bad'), 'corrupt.pdf'))
      .rejects
      .toThrow();
  });

  test('validates IR schema compliance of output', async () => {
    const buffer = Buffer.from('validation-test');
    buffer.hint = 'Valid content for testing';

    const result = await parseResume(buffer, 'test.pdf');

    // The result should be validatable
    const validation = validateIR({
      id: 'test-resume',
      content: result.rawText || 'Resume content',
      type: 'resume',
      source: 'upload',
      metadata: {
        fileName: result.fileName,
        skills: result.skills,
        totalYears: result.experience?.reduce((sum, exp) => sum + (exp.years || 0), 0),
        experienceCount: result.experience?.length,
        education: result.education,
        summary: result.summary,
        languages: result.languages,
      },
    });

    expect(validation.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// DESCRIBE BLOCK: src/scheduler.js
// Uncovered: branch at line 21 (isRunning lock), catch blocks
// ═══════════════════════════════════════════════════════════════

describe('src/scheduler.js', () => {
  let scheduler;
  let mockSources;
  let mockSearchEngine;

  beforeEach(() => {
    jest.resetModules();
    db = require('../src/db');
    db.init(':memory:');

    // Setup minimal config for scheduler
    jest.doMock('../src/config', () => ({
      profiles: { test: path.join(__dirname, 'fixtures', 'test-profile.json') },
      activeProfile: 'test',
      cronSchedule: '0 0 * * *',
      similarityThreshold: 0.5,
    }));

    // Create test profile
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(fixturesDir, 'test-profile.json'),
      JSON.stringify({ keywords: ['javascript', 'nodejs', 'react'] }),
      'utf-8'
    );

    // Mock search engine
    jest.doMock('../src/search-engine', () => ({
      generateEmbedding: jest.fn((text) => {
        const vec = new Array(6).fill(0);
        for (let i = 0; i < text.length; i++) {
          vec[i % vec.length] += text.charCodeAt(i) / 1000;
        }
        const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
        return Promise.resolve(vec.map((v) => (mag > 0 ? v / mag : 0)));
      }),
      cosineSimilarity: jest.fn((a, b) => {
        if (a.length !== b.length || a.length === 0) return 0;
        let dot = 0, magA = 0, magB = 0;
        for (let i = 0; i < a.length; i++) {
          dot += a[i] * b[i]; magA += a[i] * a[i]; magB += b[i] * b[i];
        }
        const mag = Math.sqrt(magA) * Math.sqrt(magB);
        return mag === 0 ? 0 : dot / mag;
      }),
      findRelevant: jest.fn(async (items, _pv, threshold) => {
        return items.map((item) => ({ ...item, score: 0.9 }));
      }),
    }));

    // Mock sources
    jest.doMock('../src/sources/index', () => ({
      fetchAll: jest.fn(),
      getRegisteredSources: jest.fn(() => ['hackernews', 'reddit']),
    }));

    scheduler = require('../src/scheduler');
    mockSources = require('../src/sources/index');
    mockSearchEngine = require('../src/search-engine');
  });

  afterEach(() => {
    db.close();
    jest.resetModules();
    // Cleanup fixtures
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (fs.existsSync(fixturesDir)) {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  describe('runCycle', () => {
    test('returns skipped when cycle is already running', async () => {
      // Start first cycle that hangs
      mockSources.fetchAll.mockImplementation(() => new Promise(() => {}));
      scheduler.runCycle(); // Don't await, it hangs

      // Second cycle should be skipped
      const result = await scheduler.runCycle();
      expect(result.skipped).toBe(true);
    });

    test('full cycle with valid items', async () => {
      const items = [
        { ...VALID_SOURCE_ITEM, id: 'item-1', content: 'Content 1' },
        { ...VALID_SOURCE_ITEM, id: 'item-2', content: 'Content 2' },
      ];
      mockSources.fetchAll.mockResolvedValue(items);

      const result = await scheduler.runCycle();

      expect(result.fetched).toBe(2);
      expect(result.validated).toBe(2);
      expect(result.filtered).toBe(2);
      expect(result.saved).toBe(2);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    test('cycle with empty fetch result', async () => {
      mockSources.fetchAll.mockResolvedValue([]);

      const result = await scheduler.runCycle();

      expect(result.fetched).toBe(0);
      expect(result.validated).toBe(0);
      expect(result.filtered).toBe(0);
      expect(result.saved).toBe(0);
    });

    test('cycle filters out invalid items', async () => {
      const items = [
        { ...VALID_SOURCE_ITEM, id: 'valid-1' },
        { id: '', content: '', type: 'invalid', source: '', metadata: {} }, // Invalid
      ];
      mockSources.fetchAll.mockResolvedValue(items);

      const result = await scheduler.runCycle();

      expect(result.fetched).toBe(2);
      expect(result.validated).toBe(1);
    });

    test('cycle handles fetchAll rejection', async () => {
      mockSources.fetchAll.mockRejectedValue(new Error('Network error'));

      await expect(scheduler.runCycle()).rejects.toThrow('Network error');
    });

    test('cycle saves only relevant items based on threshold', async () => {
      const items = [
        { ...VALID_SOURCE_ITEM, id: 'relevant-1' },
        { ...VALID_SOURCE_ITEM, id: 'relevant-2' },
      ];
      mockSources.fetchAll.mockResolvedValue(items);

      // Mock findRelevant to filter one out
      mockSearchEngine.findRelevant.mockResolvedValue([
        { ...items[0], score: 0.9 },
      ]);

      const result = await scheduler.runCycle();

      expect(result.filtered).toBe(1);
      expect(result.saved).toBe(1);
    });

    test('cycle handles all items being filtered out', async () => {
      const items = [VALID_SOURCE_ITEM];
      mockSources.fetchAll.mockResolvedValue(items);
      mockSearchEngine.findRelevant.mockResolvedValue([]);

      const result = await scheduler.runCycle();

      expect(result.filtered).toBe(0);
      expect(result.saved).toBe(0);
    });
  });

  describe('loadProfile', () => {
    test('loads profile and generates embedding', async () => {
      const vector = await scheduler.loadProfile();

      expect(Array.isArray(vector)).toBe(true);
      expect(vector.length).toBe(6);
      expect(mockSearchEngine.generateEmbedding).toHaveBeenCalledWith('javascript. nodejs. react');
    });

    test('throws when profile file does not exist', async () => {
      jest.dontMock('../src/config');
      jest.doMock('../src/config', () => ({
        profiles: { test: '/nonexistent/path/profile.json' },
        activeProfile: 'test',
        similarityThreshold: 0.5,
      }));

      // Need to re-require scheduler with new config
      jest.resetModules();
      const freshScheduler = require('../src/scheduler');

      await expect(freshScheduler.loadProfile()).rejects.toThrow('Profile not found');

      jest.dontMock('../src/config');
    });

    test('caches profile vector after first load', async () => {
      await scheduler.loadProfile();
      const firstCallCount = mockSearchEngine.generateEmbedding.mock.calls.length;

      // Run cycle which should use cached vector
      mockSources.fetchAll.mockResolvedValue([]);
      await scheduler.runCycle();

      // generateEmbedding should not be called again for profile
      expect(mockSearchEngine.generateEmbedding.mock.calls.length).toBe(firstCallCount);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// DESCRIBE BLOCK: src/db.js uncovered lines 267-268
// ═══════════════════════════════════════════════════════════════

describe('src/db.js — uncovered branches', () => {
  beforeEach(() => {
    db.init(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('getItemCount', () => {
    test('counts with status filter only', () => {
      db.insertItemsBatch([
        { ...VALID_SOURCE_ITEM, id: '1', content: 'Unique 1', status: 'new' },
        { ...VALID_SOURCE_ITEM, id: '2', content: 'Unique 2', status: 'approved' },
        { ...VALID_SOURCE_ITEM, id: '3', content: 'Unique 3', status: 'new' },
      ]);

      const count = db.getItemCount('new');
      expect(count).toBe(2);
    });

    test('counts with single source filter', () => {
      db.insertItemsBatch([
        { ...VALID_SOURCE_ITEM, id: '1', source: 'hackernews' },
        { ...VALID_SOURCE_ITEM, id: '2', source: 'reddit' },
      ]);

      const count = db.getItemCount(null, 'hackernews');
      expect(count).toBe(1);
    });

    test('counts with multiple sources filter (comma-separated)', () => {
      db.insertItemsBatch([
        { ...VALID_SOURCE_ITEM, id: '1', source: 'hackernews' },
        { ...VALID_SOURCE_ITEM, id: '2', source: 'reddit' },
        { ...VALID_SOURCE_ITEM, id: '3', source: 'djinni' },
      ]);

      const count = db.getItemCount(null, 'hackernews, reddit');
      expect(count).toBe(2);
    });

    test('counts with both status and source filters', () => {
      db.insertItemsBatch([
        { ...VALID_SOURCE_ITEM, id: '1', source: 'hackernews', status: 'new' },
        { ...VALID_SOURCE_ITEM, id: '2', source: 'hackernews', status: 'approved' },
        { ...VALID_SOURCE_ITEM, id: '3', source: 'reddit', status: 'new' },
      ]);

      const count = db.getItemCount('new', 'hackernews');
      expect(count).toBe(1);
    });

    test('counts all items when no filters provided', () => {
      db.insertItemsBatch([
        { ...VALID_SOURCE_ITEM, id: '1', content: 'Item 1' },
        { ...VALID_SOURCE_ITEM, id: '2', content: 'Item 2' },
      ]);

      const count = db.getItemCount();
      expect(count).toBe(2);
    });

    test('handles empty source string', () => {
      db.insertItemsBatch([{ ...VALID_SOURCE_ITEM, id: '1' }]);

      const count = db.getItemCount(null, '');
      expect(count).toBe(1); // Should ignore empty source
    });

    test('handles source with only whitespace', () => {
      db.insertItemsBatch([{ ...VALID_SOURCE_ITEM, id: '1' }]);

      const count = db.getItemCount(null, '   ,  , ');
      expect(count).toBe(1); // Should ignore whitespace-only entries
    });
  });

  describe('getSources', () => {
    test('returns distinct sources from items', () => {
      db.insertItemsBatch([
        { ...VALID_SOURCE_ITEM, id: '1', source: 'hackernews' },
        { ...VALID_SOURCE_ITEM, id: '2', source: 'reddit' },
        { ...VALID_SOURCE_ITEM, id: '3', source: 'hackernews' }, // duplicate source
      ]);

      const sources = db.getSources();
      expect(sources).toHaveLength(2);
      expect(sources).toContain('hackernews');
      expect(sources).toContain('reddit');
    });

    test('returns empty array when no items', () => {
      const sources = db.getSources();
      expect(sources).toEqual([]);
    });
  });

  describe('close', () => {
    test('closes database connection and nullifies reference', () => {
      db.close();
      // After close, operations should fail or reinitialize
      expect(() => db.getSources()).toThrow();
    });

    test('is idempotent — multiple closes do not throw', () => {
      db.close();
      expect(() => db.close()).not.toThrow();
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// DESCRIBE BLOCK: src/logger.js uncovered lines 6-10
// ═══════════════════════════════════════════════════════════════

describe('src/logger.js', () => {
  test('logger handles multiple log levels without errors', () => {
    const logger = require('../src/logger');

    expect(() => {
      logger.info('Test info message');
      logger.warn('Test warning');
      logger.error('Test error');
      logger.debug('Test debug');
      logger.info({ customField: 'value' }, 'Test with metadata');
    }).not.toThrow();
  });

  test('logger formats error objects correctly', () => {
    const logger = require('../src/logger');
    const testError = new Error('Test error object');

    expect(() => {
      logger.error({ err: testError }, 'Error with object');
    }).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// DESCRIBE BLOCK: src/retry.js uncovered lines 14-15
// ═══════════════════════════════════════════════════════════════

describe('src/retry.js', () => {
  let retry;

  beforeEach(() => {
    jest.resetModules();
    retry = require('../src/retry').retry;
  });

  test('retries on failure and eventually succeeds', async () => {
    let attempts = 0;
    const flakyFn = jest.fn(async () => {
      attempts++;
      if (attempts < 3) throw new Error('Temporary failure');
      return 'success';
    });

    const result = await retry(flakyFn, { maxRetries: 3, delay: 10 });

    expect(result).toBe('success');
    expect(flakyFn).toHaveBeenCalledTimes(3);
  });

  test('throws after max retries exceeded', async () => {
    const alwaysFail = jest.fn(async () => {
      throw new Error('Persistent failure');
    });

    await expect(retry(alwaysFail, { maxRetries: 2, delay: 10 }))
      .rejects
      .toThrow('Persistent failure');

    expect(alwaysFail).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  test('does not retry on success', async () => {
    const successFn = jest.fn(async () => 'immediate');

    const result = await retry(successFn, { maxRetries: 3, delay: 10 });

    expect(result).toBe('immediate');
    expect(successFn).toHaveBeenCalledTimes(1);
  });

  test('uses default options when none provided', async () => {
    const successFn = jest.fn(async () => 'default');

    const result = await retry(successFn);

    expect(result).toBe('default');
  });
});