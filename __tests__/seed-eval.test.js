'use strict';

// The "Henry Ford bench": real-embedding ranking eval over the synthetic
// dataset. Heavy (loads the MiniLM model), so it is OPT-IN:
//
//   RUN_EVAL=1 npx jest seed-eval
//
// Normal `npm test` skips it to stay fast and offline. This is the bench you
// run deliberately to measure search quality, per docs/VISION.md §6.

jest.mock('../src/scheduler');
jest.mock('../src/config', () => {
  const actual = jest.requireActual('../src/config');
  return Object.create(actual, {
    sessionSecret: { value: 'test-secret-32-chars-xxxxxxxxxxx', enumerable: true },
    isProduction: { value: false, enumerable: true },
  });
});

const request = require('supertest');
const { app } = require('../src/server');
const db = require('../src/db');

const evalDescribe = process.env.RUN_EVAL === '1' ? describe : describe.skip;

async function registerAndGetCookie(email) {
  const res = await request(app).post('/api/auth/register').send({ email, password: 'password123' });
  const header = res.headers['set-cookie'];
  return (Array.isArray(header) ? header[0] : header).split(';')[0];
}

// rank (1-based) of the first result belonging to a group; Infinity if absent
function firstRankOfGroup(results, group) {
  const idx = results.findIndex((doc) => doc.item?.metadata?.group === group);
  return idx === -1 ? Infinity : idx + 1;
}

evalDescribe('Hybrid search ranking eval (query: "rust async")', () => {
  let cookie;
  let results;

  beforeAll(async () => {
    db.init(':memory:');
    cookie = await registerAndGetCookie('eval@example.com');

    await request(app).post('/api/seed-test-data').set('Cookie', cookie);

    const res = await request(app)
      .post('/api/search')
      .set('Cookie', cookie)
      .send({
        query: 'rust async',
        collectionId: '__test__',
        mode: 'parallel',
        threshold: 0.0,
        topN: 16,
        mmrLambda: 1.0, // pure relevance for ranking measurement (MMR diversity tested separately)
      });
    results = res.body.results || [];

    // eslint-disable-next-line no-console
    console.log('\nRanking for "rust async":');
    results.forEach((doc, i) => {
      // eslint-disable-next-line no-console
      console.log(`  ${i + 1}. [${doc.item?.metadata?.group}] ${doc.item?.metadata?.title}`);
    });
  }, 180_000);

  afterAll(() => db.close());

  test('returns the full seeded set', () => {
    expect(results.length).toBeGreaterThanOrEqual(12);
  });

  test('exact-match post ranks in the top 3', () => {
    expect(firstRankOfGroup(results, 'exact')).toBeLessThanOrEqual(3);
  });

  test('semantic match (no query words) reaches the top 10', () => {
    expect(firstRankOfGroup(results, 'semantic')).toBeLessThanOrEqual(10);
  });

  test('trap post (keyword present, wrong topic) is NOT in the top 5', () => {
    expect(firstRankOfGroup(results, 'trap')).toBeGreaterThan(5);
  });

  test('exact match ranks above the trap', () => {
    expect(firstRankOfGroup(results, 'exact')).toBeLessThan(firstRankOfGroup(results, 'trap'));
  });

  test('exact match ranks above the irrelevant group', () => {
    expect(firstRankOfGroup(results, 'exact')).toBeLessThan(firstRankOfGroup(results, 'irrelevant'));
  });
});
