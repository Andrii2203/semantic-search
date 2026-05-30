'use strict';

const express = require('express');
const SearchEngine = require('../search-engine');
const ProfileGenerator = require('../profile-generator');
const { rerank } = require('../reranker');
const { explain } = require('../explainer');
const db = require('../db');
const logger = require('../logger');
const { AppError, ErrorCodes } = require('../errors');
const scheduler = require('../scheduler');

const router = express.Router();

// ─── POST /api/search — main hybrid search endpoint ─────────
//
// This route is the ORCHESTRATOR:
//   1. Gets/generates profile (via ProfileGenerator)
//   2. Fetches data from DB (BM25 search, chunks with vectors)
//   3. Passes data to SearchEngine pure functions (scoring, merging, grouping)
//   4. Returns results
//
// SearchEngine never touches the DB directly.

router.post('/', async (req, res, next) => {
  try {
    const {
      query,
      profileId,
      keywords: customKeywords,
      mode = 'sequential',
      weights,
      threshold = 0.65,
      maxBm25Results = 100,
      topN = 20,
      useReranker = false,
      collectionId = null,
    } = req.body;

    const startTime = performance.now();

    // ── Step 1: Get or generate profile ──────────────────────
    let profile;
    if (profileId) {
      profile = ProfileGenerator.loadProfile(profileId);
    } else if (query) {
      profile = await ProfileGenerator.fromText(query, { useAI: true, save: false });

      // Auto-save search query as user's profile so scheduler uses it
      if (req.userId && profile.vector) {
        db.saveProfileForUser(req.userId, {
          keywords: profile.keywords,
          rawInput: query,
          vector: profile.vector,
        });
        scheduler.invalidateProfileCache(req.userId);
      }
    } else {
      throw new AppError('Either "query" or "profileId" is required', ErrorCodes.VALIDATION_FAILED, 400);
    }

    // Override keywords if provided
    if (customKeywords && Array.isArray(customKeywords)) {
      profile.keywords = customKeywords;
    }

    const profileVector = SearchEngine.deserializeVector(profile.vector);

    // ── Step 2: Fetch data from DB ───────────────────────────
    let scoredChunks;

    if (mode === 'sequential') {
      // Sequential: BM25 first → score BM25 results by cosine similarity
      const bm25Chunks = (profile.keywords && profile.keywords.length > 0)
        ? db.chunksSearch(profile.keywords, { limit: maxBm25Results, collectionId, userId: req.userId })
        : [];

      if (profileVector && bm25Chunks.length > 0) {
        // Score BM25 results using stored vectors
        scoredChunks = SearchEngine.scoreChunksByVector(bm25Chunks, profileVector, threshold);
      } else {
        // No vector or no BM25 results — return BM25 as-is with normalized ranks
        scoredChunks = bm25Chunks.map((chunk, i) => ({
          ...chunk,
          score: 1 - i / Math.max(bm25Chunks.length, 1),
          bm25Rank: chunk.rank || 0,
          semanticScore: null,
        }));
      }
    } else {
      // Parallel: BM25 + semantic independently → merge
      const bm25Chunks = (profile.keywords && profile.keywords.length > 0)
        ? db.chunksSearch(profile.keywords, { limit: maxBm25Results, collectionId, userId: req.userId })
        : [];

      let semanticChunks = [];
      if (profileVector) {
        // Get all chunks with vectors for semantic scoring
        const allChunksRaw = db.getAllChunksWithVectors({ collectionId, userId: req.userId });

        semanticChunks = SearchEngine.scoreChunksByVector(allChunksRaw, profileVector, threshold);
      }

      scoredChunks = SearchEngine.mergeResults(bm25Chunks, semanticChunks, {
        bm25Weight: weights?.bm25 || 0.4,
        semanticWeight: weights?.semantic || 0.6,
      });
    }

    // ── Step 3: Group by parent document ─────────────────────
    let results = SearchEngine.groupByParent(scoredChunks);

    // Enrich with parent item data
    for (const doc of results) {
      const item = db.getItemById(doc.parentId);
      if (item) {
        doc.item = item;
      }
    }

    // ── Step 4: Optional reranking ──────────────────────────
    if (useReranker && query && results.length > 0) {
      const flatResults = results.map((doc) => ({
        ...doc,
        content: doc.item?.content || doc.matchedChunks?.[0]?.content || '',
        score: doc.bestScore,
      }));

      const reranked = await rerank(flatResults, query, topN);
      results = reranked.map((r) => ({
        parentId: r.parentId,
        item: r.item,
        matchedChunks: r.matchedChunks,
        bestScore: r.bestScore,
        rerankScore: r.rerankScore,
      }));
    }

    // ── Step 5: Return ──────────────────────────────────────
    results = results.slice(0, topN);
    const duration = Math.round(performance.now() - startTime);

    logger.info({
      mode,
      chunksScored: scoredChunks.length,
      documentsFound: results.length,
      duration,
    }, 'Search complete');

    res.json({
      results,
      profile: {
        id: profile.id,
        keywords: profile.keywords,
      },
      stats: {
        mode,
        bm25Results: scoredChunks.filter((c) => c.bm25Rank != null).length,
        semanticResults: scoredChunks.filter((c) => c.semanticScore != null).length,
        totalChunks: scoredChunks.length,
        totalDocuments: results.length,
        duration,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/search/explain — on-demand explanation ───────

router.post('/explain', async (req, res, next) => {
  try {
    const { itemId, profileId, query } = req.body;

    if (!itemId) {
      throw new AppError('"itemId" is required', ErrorCodes.VALIDATION_FAILED, 400);
    }

    const item = db.getItemById(itemId);
    if (!item) {
      throw new AppError(`Item not found: ${itemId}`, ErrorCodes.NOT_FOUND, 404);
    }

    // Get profile for context
    let profile;
    if (profileId) {
      profile = ProfileGenerator.loadProfile(profileId);
    } else if (query) {
      profile = { keywords: [], rawInput: query };
    } else {
      throw new AppError('Either "profileId" or "query" is required', ErrorCodes.VALIDATION_FAILED, 400);
    }

    const explanation = await explain(item, profile);

    res.json({ itemId, explanation });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
