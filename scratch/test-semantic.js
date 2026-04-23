// scratch/test-semantic.js
// Запуск: node scratch/test-semantic.js

const searchEngine = require('../src/search-engine');

async function main() {
  console.log('Loading model... (перший раз ~30с)');

  // Твій профіль
  const profileText = "I build autonomous AI agents that use retrieval augmented generation";
  const profileVector = await searchEngine.generateEmbedding(profileText);

  // Тестові "пости" — деякі релевантні, деякі ні
  const testItems = [
    { id: '1', content: 'Building a chatbot with LangChain and vector databases for knowledge retrieval', type: 'post', source: 'test' },
    { id: '2', content: 'Best pizza recipe with mozzarella and tomato sauce', type: 'post', source: 'test' },
    { id: '3', content: 'How to create an intelligent agent that answers questions from documents using embeddings', type: 'post', source: 'test' },
    { id: '4', content: 'JavaScript framework comparison: React vs Vue vs Svelte', type: 'post', source: 'test' },
    { id: '5', content: 'RAG pipeline implementation with chunking and semantic search', type: 'post', source: 'test' },
    { id: '6', content: 'How to grow tomatoes in your backyard garden', type: 'post', source: 'test' },
    { id: '7', content: 'Fine-tuning language models for domain-specific question answering', type: 'post', source: 'test' },
    { id: '8', content: 'autonomous agents that use retrieval augmented generation', type: 'post', source: 'test' },
  ];

  console.log('\n--- Profile ---');
  console.log(`"${profileText}"\n`);
  console.log('--- Results (threshold: 0.3) ---\n');

  const results = await searchEngine.findRelevant(testItems, profileVector, 0.3);

  for (const item of results) {
    const bar = '█'.repeat(Math.round(item.score * 40));
    const status = item.score >= 0.65 ? '✅ RELEVANT' : '🟡 maybe';
    console.log(`${status} [${item.score.toFixed(3)}] ${bar}`);
    console.log(`  "${item.content}"\n`);
  }

  console.log('--- Filtered OUT (below 0.3) ---\n');
  const filtered = testItems.filter(t => !results.find(r => r.id === t.id));
  for (const item of filtered) {
    const vec = await searchEngine.generateEmbedding(item.content);
    const score = searchEngine.cosineSimilarity(vec, profileVector);
    console.log(`❌ [${score.toFixed(3)}] "${item.content}"`);
  }
}

main().catch(console.error);
