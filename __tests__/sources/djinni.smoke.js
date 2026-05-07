const djinni = require('../../src/sources/djinni');

// Цей тест звертається до РЕАЛЬНОГО Djinni.co
// Не запускай його в CI — тільки вручну
test('Djinni returns real jobs (smoke)', async () => {
  const items = await djinni.fetch({ limit: 5 });
  
  // eslint-disable-next-line no-console
  console.log(`Djinni returned ${items.length} jobs`);
  items.forEach(item => {
    // eslint-disable-next-line no-console
    console.log(`  - ${item.metadata.title} (${item.metadata.url})`);
  });

  // Якщо 0 — верстка Djinni змінилась!
  expect(items.length).toBeGreaterThan(0);
  expect(items[0]).toHaveProperty('content');
  expect(items[0]).toHaveProperty('metadata.url');
}, 30000); // 30s timeout для мережі