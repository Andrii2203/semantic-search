# ADR-003: Reranking Strategy

## Проблема
Hybrid search повертає результати з комбінованим BM25 + cosine score. Але цей score може бути неточним, BM25 і cosine мають різні шкали і характеристики.

## Альтернативи
- Без reranking → простіше, але менш точно
- Cross-encoder model (local) → точно, але повільно і heavy
- Cohere Rerank API → точно, але платно і зовнішня залежність
- Groq LLM reranking → good enough, вже маємо API

## Рішення
Groq-based reranking з batch processing:
1. Топ-N результатів (default 20) відправляються на reranking
2. Groq оцінює кожну пару (query, document) від 0 до 1
3. Batch по 5 щоб зменшити кількість API calls
4. Fallback: зберігаємо original score якщо API fails

Reranking опціональний (useReranker=false за замовчуванням).

## Trade-offs
+ Значно покращує якість топ результатів
+ Опціональний: не впливає на performance якщо вимкнений
+ Shared rate limiter з іншими Groq модулями
- Додаткова затримка (1-3 секунди)
- Groq API cost

## Коли переглянути
Якщо потрібна вища точність → Cohere Rerank API.
Якщо потрібен offline → cross-encoder model.
