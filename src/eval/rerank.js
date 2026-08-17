'use strict';

async function rerankRanking({ ranking, queryText, texts, scorer, depth }) {
  if (!depth || ranking.length === 0) {
    return ranking;
  }

  const head = ranking.slice(0, depth);
  const tail = ranking.slice(depth);
  const scores = await scorer(queryText, head.map((id) => texts.get(id) || ''));

  const reordered = head
    .map((id, position) => ({ id, score: scores[position] }))
    .sort((first, second) => second.score - first.score)
    .map((row) => row.id);

  return [...reordered, ...tail];
}

module.exports = { rerankRanking };
