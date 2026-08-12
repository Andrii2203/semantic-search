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
const events = require('../events');

const router = express.Router();

const DEFAULTS = {
  mode: 'sequential',
  threshold: 0.65,
  maxBm25Results: 100,
  topN: 20,
};

function readSearchRequest(body) {
  return {
    query: body.query,
    profileId: body.profileId,
    customKeywords: body.keywords,
    mode: body.mode || DEFAULTS.mode,
    weights: body.weights,
    threshold: body.threshold ?? DEFAULTS.threshold,
    maxBm25Results: body.maxBm25Results ?? DEFAULTS.maxBm25Results,
    topN: body.topN ?? DEFAULTS.topN,
    useReranker: body.useReranker === true,
    collectionId: body.collectionId ?? null,
    batchId: body.batchId ?? null,
    mmrLambda: body.mmrLambda ?? config.search.mmrLambda,
    useHyde: body.useHyde === true,
  };
}

async function resolveProfile(request, userId) {
  if (request.profileId) {
    return ProfileGenerator.loadProfile(request.profileId);
  }

  if (!request.query) {
    throw new AppError(
      'Either "query" or "profileId" is required',
      ErrorCodes.VALIDATION_FAILED,
      400,
    );
  }

  const profile = await ProfileGenerator.fromText(request.query, { useAI: true, save: false });
  const isInternetSearch = !request.collectionId || request.collectionId === 'internet';

  if (isInternetSearch && userId && profile.vector) {
    db.saveProfileForUser(userId, {
      keywords: profile.keywords,
      rawInput: request.query,
      vector: profile.vector,
    });
    scheduler.invalidateProfileCache(userId);
  }

  return profile;
}

async function expandWithHyde(request, profile) {
  if (!request.useHyde) {
    return { profileVector: SearchEngine.deserializeVector(profile.vector), hypotheticalDoc: null };
  }

  if (!config.groq.apiKey) {
    throw new AppError('Groq API key required for HyDE', ErrorCodes.VALIDATION_FAILED, 400);
  }

  const hypotheticalDoc = await hydeExpand(request.query || profile.rawInput || profile.raw_input);
  if (!hypotheticalDoc) {
    return { profileVector: SearchEngine.deserializeVector(profile.vector), hypotheticalDoc: null };
  }

  return { profileVector: await SearchEngine.generateEmbedding(hypotheticalDoc), hypotheticalDoc };
}

function retrieveCandidates(request, profile, profileVector, userId) {
  const hasKeywords = profile.keywords && profile.keywords.length > 0;
  const bm25List = hasKeywords
    ? db.chunksSearch(profile.keywords, {
        limit: request.maxBm25Results,
        collectionId: request.collectionId,
        userId,
        batchId: request.batchId,
      })
    : [];

  if (!profileVector) {
    return { bm25List, semanticList: [] };
  }

  const corpus =
    request.mode === 'sequential'
      ? bm25List
      : db.getAllChunksWithVectors({
          collectionId: request.collectionId,
          userId,
          batchId: request.batchId,
        });

  return {
    bm25List,
    semanticList: SearchEngine.scoreChunksByVector(corpus, profileVector, request.threshold),
  };
}

function fuseRankings(request, bm25List, semanticList) {
  if (config.search.useRrf) {
    return SearchEngine.rrfMerge(bm25List, semanticList, { k: config.search.rrfK });
  }
  return SearchEngine.mergeResults(bm25List, semanticList, {
    bm25Weight: request.weights?.bm25 || config.search.bm25Weight,
    semanticWeight: request.weights?.semantic || config.search.semanticWeight,
  });
}

function groupAndDiversify(request, scoredChunks) {
  let results = SearchEngine.groupByParent(scoredChunks);

  for (const doc of results) {
    const item = db.getItemById(doc.parentId);
    if (item) {
      doc.item = item;
    }
  }

  if (results.length > 0 && request.mmrLambda < 1) {
    results = SearchEngine.mmrSelect(results, {
      lambda: request.mmrLambda,
      topN: Math.max(request.topN, results.length),
    });
  }

  return results;
}

async function rerankResults(request, results) {
  if (!request.useReranker || !request.query || results.length === 0) {
    return results;
  }

  const flatResults = results.map((doc) => ({
    ...doc,
    content: doc.item?.content || doc.matchedChunks?.[0]?.content || '',
    score: doc.bestScore,
  }));

  const reranked = await rerank(flatResults, request.query, request.topN);
  return reranked.map((entry) => ({
    parentId: entry.parentId,
    item: entry.item,
    matchedChunks: entry.matchedChunks,
    bestScore: entry.bestScore,
    rerankScore: entry.rerankScore,
  }));
}

function shapeResults(results, topN) {
  return results.slice(0, topN).map((doc) => {
    const top = doc.matchedChunks?.[0] || {};
    const { vector: _vector, ...rest } = doc;
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
}

router.post('/', async (req, res, next) => {
  try {
    const startTime = performance.now();
    const request = readSearchRequest(req.body || {});

    const profile = await resolveProfile(request, req.userId);
    if (request.customKeywords && Array.isArray(request.customKeywords)) {
      profile.keywords = request.customKeywords;
    }

    const { profileVector, hypotheticalDoc } = await expandWithHyde(request, profile);
    const { bm25List, semanticList } = retrieveCandidates(
      request,
      profile,
      profileVector,
      req.userId,
    );

    const scoredChunks = fuseRankings(request, bm25List, semanticList);
    const grouped = groupAndDiversify(request, scoredChunks);
    const reranked = await rerankResults(request, grouped);
    const results = shapeResults(reranked, request.topN);

    const duration = Math.round(performance.now() - startTime);
    const stats = {
      mode: request.mode,
      ranking: config.search.useRrf ? 'rrf' : 'weighted',
      mmrLambda: request.mmrLambda,
      hydeUsed: !!hypotheticalDoc,
      bm25Results: bm25List.length,
      semanticResults: semanticList.length,
      totalChunks: scoredChunks.length,
      totalDocuments: results.length,
      duration,
    };

    logger.info(stats, 'Search complete');
    events.emit('search.completed', {
      userId: req.userId,
      mode: request.mode,
      hydeUsed: !!hypotheticalDoc,
      documentsFound: results.length,
      duration,
    });

    res.json({
      results,
      profile: { id: profile.id, keywords: profile.keywords },
      hydeUsed: !!hypotheticalDoc,
      hypotheticalDoc,
      stats,
    });
  } catch (err) {
    next(err);
  }
});

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
