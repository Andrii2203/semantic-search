# ADR-001: Hybrid Search через SQLite FTS5

Status: partly superseded by `docs/adr/008-parallel-candidate-generation.md` at
2026-08-14 19:52:18 +0200. The choice of SQLite FTS5 and of running two branches stands. The
sequential default, and the claim that it economises CPU at an acceptable cost, is superseded by
measurement recorded in `docs/eval/beir-axes-a-b.md`.

## Проблема
Pure cosine similarity погано матчить точні технічні терміни. "Node.js" в запиті може не знайти "Node.js" в резюме якщо embedding вектори різні через контекст.

## Альтернативи
- pgvector + PostgreSQL full-text search → зміна стеку, overhead
- Qdrant hybrid search → зовнішня залежність, ускладнення deployment
- SQLite FTS5 + existing embeddings → нульова міграція

## Рішення
SQLite FTS5 для BM25 keyword search + cosine similarity для semantic search. Два алгоритми доповнюють один одного:
- BM25 знаходить точні збіги технічних термінів
- Cosine similarity знаходить семантично близькі документи

Sequential mode як default: BM25 фільтрує спочатку, cosine similarity тільки для відфільтрованих. Це значно швидше ніж parallel scan всіх vectors.

## Trade-offs
+ Нульова міграція інфраструктури
+ Працює офлайн
+ Sequential mode економить CPU
- Менш потужний ніж pgvector для великих обсягів (>1M документів)
- FTS5 tokenizer не ідеальний для всіх мов

## Коли переглянути
Якщо corpus > 100K документів або потрібен мультимовний пошук.
