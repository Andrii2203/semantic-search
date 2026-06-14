'use strict';

const express = require('express');
const SearchEngine = require('../search-engine');
const ProfileGenerator = require('../profile-generator');
const { rerank } = require('../reranker');
const { explain } = require('../explainer');
const { hydeExpand } = require('../hyde');
const db = require('../db');
const logger = require('../logger');
const config = require('../config');
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
      mmrLambda,
      useHyde = false,
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

    // ── Step 1b: Optional HyDE query expansion (paid, opt-in) ──
    // Embed a hypothetical ideal document instead of the raw query for sharper
    // semantic match. Keywords (BM25) stay from the original query. Does NOT
    // change the saved profile — HyDE is per-search, not a profile edit.
    let profileVector = SearchEngine.deserializeVector(profile.vector);
    let hypotheticalDoc = null;
    if (useHyde) {
      if (!config.groq.apiKey) {
        throw new AppError('Groq API key required for HyDE', ErrorCodes.VALIDATION_FAILED, 400);
      }
      hypotheticalDoc = await hydeExpand(query || profile.rawInput || profile.raw_input);
      if (hypotheticalDoc) {
        profileVector = await SearchEngine.generateEmbedding(hypotheticalDoc);
      }
    }

    // ── Step 2: Retrieve BM25 + semantic ranked lists ───────
    const hasKeywords = profile.keywords && profile.keywords.length > 0;
    const bm25List = hasKeywords
      ? db.chunksSearch(profile.keywords, { limit: maxBm25Results, collectionId, userId: req.userId })
      : [];

    let semanticList = [];
    if (profileVector) {
      if (mode === 'sequential') {
        // Sequential: embeddings only for the BM25-filtered subset (fast)
        semanticList = SearchEngine.scoreChunksByVector(bm25List, profileVector, threshold);
      } else {
        // Parallel: score the whole corpus by cosine (thorough)
        const allChunksRaw = db.getAllChunksWithVectors({ collectionId, userId: req.userId });
        semanticList = SearchEngine.scoreChunksByVector(allChunksRaw, profileVector, threshold);
      }
    }

    // ── Step 3: Fuse — RRF by default, weighted sum as rollback ──
    let scoredChunks;
    if (config.search.useRrf) {
      scoredChunks = SearchEngine.rrfMerge(bm25List, semanticList, { k: config.search.rrfK });
    } else {
      scoredChunks = SearchEngine.mergeResults(bm25List, semanticList, {
        bm25Weight: weights?.bm25 || config.search.bm25Weight,
        semanticWeight: weights?.semantic || config.search.semanticWeight,
      });
    }

    // ── Step 4: Group by parent document ─────────────────────
    let results = SearchEngine.groupByParent(scoredChunks);

    // Enrich with parent item data
    for (const doc of results) {
      const item = db.getItemById(doc.parentId);
      if (item) {
        doc.item = item;
      }
    }

    // ── Step 4b: MMR diversity (document-level) ──────────────
    // λ=1.0 disables diversity (pure relevance). Free, always-on by default.
    const lambda = mmrLambda ?? config.search.mmrLambda;
    if (results.length > 0 && lambda < 1) {
      results = SearchEngine.mmrSelect(results, { lambda, topN: Math.max(topN, results.length) });
    }

    // ── Step 5: Optional reranking ──────────────────────────
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

    // ── Step 6: Shape response ──────────────────────────────
    // Drop the internal representative vector; surface per-document scores
    // (best chunk's ranks) for the debug panel.
    results = results.slice(0, topN).map((doc) => {
      const top = doc.matchedChunks?.[0] || {};
      // eslint-disable-next-line no-unused-vars
      const { vector, ...rest } = doc;
      return {
        ...rest,
        scores: {
          bm25Rank: top.bm25Rank ?? null,
          semanticRank: top.semanticRank ?? null,
          rrfScore: top.rrfScore ?? null,
          semanticScore: top.semanticScore ?? null,
        },
      };
    });
    const duration = Math.round(performance.now() - startTime);

    logger.info({
      mode,
      ranking: config.search.useRrf ? 'rrf' : 'weighted',
      mmrLambda: lambda,
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
      hydeUsed: !!hypotheticalDoc,
      hypotheticalDoc,
      stats: {
        mode,
        ranking: config.search.useRrf ? 'rrf' : 'weighted',
        mmrLambda: lambda,
        hydeUsed: !!hypotheticalDoc,
        bm25Results: bm25List.length,
        semanticResults: semanticList.length,
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
