Напишу статтю українською і серію LinkedIn-постів англійською. І те, і те на основі реальної роботи з твоїм рушієм (гібридний пошук, RRF, MMR, eval-харнес, історія nDCG 0.72→0.98) — це робить контент автентичним і вирізняє з-поміж тисяч переказів теорії.

СТАТТЯ (UA)
Семантичний пошук на практиці: ембединги, гібридний пошук і чому ваші «ручки» тихо вбивають якість
Проблема, з якої все починається
Класичний пошук шукає слова. Ви вводите «Rust async backend» — система знаходить документи, де є саме ці слова. Але кандидат, який написав у резюме «системний інженер, неблокуючі рантайми, Tokio», — ідеальний збіг, якого пошук за словами не побачить. Бо слів немає, а зміст є.

Семантичний пошук вирішує саме це: шукає за змістом, а не за літерами. І в основі лежить одна ідея — ембединги.

Що таке ембединг
Ембединг — це перетворення тексту на вектор чисел (наприклад, 384 числа для моделі all-MiniLM-L6-v2). Модель навчена так, що тексти з близьким змістом отримують близькі вектори, а далекі за змістом — далекі.

Уявіть простір, де «кіт» і «кошеня» стоять поруч, а «екскаватор» — десь на іншому кінці. Тільки замість 3 вимірів, які можна намалювати, — їх 384. Кожен вимір кодує якусь приховану рису змісту, яку модель витягла з мільярдів речень.

Близькість двох векторів міряють косинусною подібністю — косинусом кута між ними. Значення від −1 (протилежні) до 1 (ідентичні за напрямком). На практиці для коротких текстів хороший збіг — це десь 0.4–0.7, а не 0.99, як багато хто очікує.

Чому самих ембедингів недостатньо
Ембединги чудово ловлять зміст, але програють на точних збігах: номери деталей, рідкісні назви бібліотек, абревіатури, імена. Якщо шукаєте «gRPC», лексичний пошук знайде точне «gRPC» миттєво, а семантичний може «розмазати» його між схожими поняттями.

Тому в продакшені працює гібрид: поряд із семантикою тримають класичний лексичний пошук BM25 (це покращений TF-IDF, вбудований, наприклад, у SQLite FTS5). BM25 ловить точні терміни, ембединги — зміст. Разом вони закривають слабкості одне одного.

Як зливати два рейтинги: RRF
Виникає питання: BM25 дав свій топ-100, ембединги — свій. Як їх об'єднати в один список?

Найочевидніше — зважена сума оцінок. Але є пастка: оцінки BM25 і косинус живуть у різних шкалах. BM25 може давати 12.5, косинус — 0.55. Складати їх «у лоб» — порівнювати кілометри з кілограмами.

Елегантне рішення — Reciprocal Rank Fusion (RRF). Воно ігнорує сирі оцінки і дивиться лише на позицію документа в кожному списку:


RRF(d) = Σ  1 / (k + rank_i(d))
де k — згладжувальна константа (зазвичай 60), а rank_i — позиція документа в списку i. Документ, що стоїть високо в обох списках, набирає найбільше.

Важлива деталь, яка лякає новачків: RRF-оцінки крихітні. Топовий документ отримує приблизно 1/61 + 1/61 ≈ 0.033. Коли бачите в результатах «0.033», це не «3% збігу» — це найвища можлива RRF-оцінка. Абсолютне число тут не означає нічого; важливий лише порядок. Це класичне джерело паніки: «чому в мене всі результати по 3%?». Тому що ви дивитесь на RRF, а не на відсоток.

MMR: коли діверсифікація шкодить
Часто поверх результатів ставлять MMR (Maximal Marginal Relevance) — алгоритм, який балансує релевантність і різноманіття:


MMR = λ · sim(d, query) − (1−λ) · max sim(d, вже_вибрані)
При λ=1 — чиста релевантність. Менше — система карає документи, схожі на ті, що вже в списку, щоб уникнути десяти варіантів однієї новини.

Для стрічки новин це чудово. Але я наштовхнувся на контрінтуїтивний випадок. У задачі пошуку кандидатів (резюме під вакансію) MMR із λ=0.5 псував якість: він виштовхував униз релевантних кандидатів тієї самої ролі, бо вони «схожі один на одного». А рекрутеру потрібні якраз усі схожі — усі сім Backend-інженерів, а не один Backend + сім різних для «різноманіття».

Вимкнення діверсифікації (λ=1.0) підняло якість драматично — про числа нижче. Урок: той самий алгоритм, що допомагає одній задачі, ламає іншу. Немає «правильних» налаштувань у вакуумі — є правильні для конкретної задачі.

HyDE: розширення запиту
Ще один трюк — HyDE (Hypothetical Document Embeddings). Замість того, щоб ембедити короткий запит, ми просимо LLM написати гіпотетичну ідеальну відповідь, і ембедимо її. Логіка: повноцінний документ-відповідь ближчий за змістом до реальних документів, ніж сухий запит із трьох слів. Коштує один виклик LLM, але часто відчутно покращує семантичний збіг на коротких запитах.

Реранкінг: м'який і жорсткий суддя
Усе вище — це bi-encoder підхід: запит і документи ембедяться окремо, а потім порівнюються косинусом. Швидко (вектори рахуються заздалегідь), але «м'яко».

Поверх можна поставити реранкер — cross-encoder або LLM, який дивиться на пару (запит, документ) разом і виносить точніше судження. Це повільніше (рахується на льоту для кожної пари), тому застосовують лише до топ-N кандидатів.

Гарна аналогія з мого досвіду — два судді:

Семантичний пошук — м'який суддя: ранжує всіх за близькістю. Backend-запит підніме і Full-Stack розробників, бо вони «поруч».
Реранкер — жорсткий суддя: «запит просив саме Go/gRPC/Kafka — Full-Stack цього не має → 0%». Він дає чистий короткий список із оцінкою впевненості й чесно відсікає решту.
Робочий конвеєр: семантика дає ~20 близьких → реранкер залишає 7 справжніх із відсотком впевненості.

Чанкінг: документ не лізе у вектор цілком
Один вектор погано описує довгий документ — зміст «усереднюється». Тому документи ріжуть на чанки (абзаци, секції) і ембедять кожен окремо. Пошук іде по чанках, а потім результати групуються за батьківським документом (беремо найкращий чанк як представника).

Тонкість: для резюме інколи один чанк на документ — нормально (порівнюємо CV цілком). А для пошуку «досвід саме з Kafka» потрібна гранулярність на рівні секцій. Стратегія чанкінгу — це теж ручка, яку треба підбирати під задачу.

Найважливіше: ви не покращите те, чого не міряєте
Тут більшість зупиняється — «начебто працює». Це найдорожча помилка. Усі описані ручки (поріг косинуса, λ MMR, RRF чи зважена сума, HyDE, реранкер, розмір чанка) ви крутите наосліп, поки не міряєте якість числом.

Як міряти? Потрібен golden set — набір запитів із відомими правильними відповідями. Тоді рахуєте стандартні метрики пошуку:

Precision@K — із топ-K скільки реально релевантні («з 10 кандидатів скільки справді підходять»).
Recall@K — скільки з усіх релевантних потрапили в топ-K («чи не пропустили хорошого»).
MRR — наскільки високо стоїть перший правильний результат.
nDCG@K — найкомплексніша: винагороджує релевантних вище в списку (враховує позицію через логарифмічне згасання).
Тепер реальна історія. У моєму рушії дефолтні налаштування були: поріг косинуса 0.65, MMR 0.5. Виглядало «ок». Я зібрав golden set із синтетичних резюме з відомими ролями і прогнав eval:

Конфіг	nDCG@10	Recall@10
Дефолт (поріг 0.65, MMR 0.5)	0.72	0.73
Виміряний оптимум (поріг 0.3, MMR 1.0)	0.98	0.98
Продукт наосліп працював на 72% якості замість 98%. Дві ручки тихо різали чверть якості. Поріг 0.65 був зависокий для MiniLM (відсікав валідні збіги), а MMR-діверсифікація виштовхувала релевантних кандидатів. Eval викрив це за хвилини.

Висновок
Семантичний пошук — це не «під'єднати ембединги і готово». Це конвеєр: чанкінг → ретрив (BM25 + ембединги) → злиття (RRF) → діверсифікація (MMR) → реранкінг. На кожному кроці — ручка. І жодна з них не має «правильного» значення у вакуумі — лише виміряне правильне для вашої задачі.

Тому головна порада не про алгоритми, а про дисципліну: зберіть golden set і міряйте. Інакше ви роками возите продукт на 72%, думаючи, що це 100%.

LINKEDIN POSTS (EN)
Post 1 — Embeddings 101

What is an embedding, really?

It's a piece of text turned into a list of numbers — e.g. 384 of them for all-MiniLM-L6-v2.

The trick: the model is trained so that text with similar meaning lands close together in that 384-dimensional space, and unrelated text lands far apart.

"cat" and "kitten" → neighbors.
"cat" and "excavator" → opposite ends.

You measure closeness with cosine similarity (the cosine of the angle between two vectors). And a reality check: a good match for short text is usually 0.4–0.7, not 0.99. If you expect 99%, you'll think your system is broken when it's actually working.

This is the whole foundation of semantic search — finding by meaning, not by exact words.

#MachineLearning #NLP #SemanticSearch #Embeddings

Post 2 — Why vectors alone aren't enough

Hot take: pure vector search is a downgrade for half your queries.

Embeddings are great at meaning. They're worse at exact tokens — part numbers, rare library names, acronyms, proper nouns.

Search for "gRPC" and a lexical engine (BM25 / TF-IDF) nails the exact term instantly. A vector model might smear it across "similar" concepts.

So production search is almost always hybrid:
→ BM25 catches exact terms
→ embeddings catch meaning
→ together they cover each other's blind spots

Don't pick one. Run both and fuse the results. (How to fuse them is the next post.)

#InformationRetrieval #SearchEngineering #RAG

Post 3 — RRF and the "everything is 3%" panic

You ran BM25 and vector search. Now you have two ranked lists. How do you merge them?

Don't sum the raw scores. BM25 gives you ~12.5, cosine gives you ~0.55 — different scales. Adding them is comparing kilometers to kilograms.

Use Reciprocal Rank Fusion (RRF). It ignores raw scores and looks only at position:

RRF(d) = Σ 1 / (k + rank_in_list_i)   (k usually 60)

Rank high in both lists → win.

The gotcha that scares everyone: RRF scores are tiny. Your top result scores ~1/61 + 1/61 ≈ 0.033.

That's NOT "3% relevance." It's the highest possible RRF score. The absolute number is meaningless — only the order matters. I've watched people "debug" a perfectly working system because the scores looked low.

#InformationRetrieval #SearchEngineering #RAG

Post 4 — The day diversity hurt my search

A counterintuitive lesson from building a candidate-matching engine.

MMR (Maximal Marginal Relevance) re-ranks results to balance relevance with diversity — so you don't get ten copies of the same news story. Standard, sensible, widely used.

I had it on at λ=0.5. It was quietly destroying quality.

Why? In candidate search, a recruiter querying for a backend role wants ALL seven backend engineers. MMR saw them as "too similar to each other" and pushed relevant candidates DOWN to make room for variety.

The exact behavior that helps a news feed breaks a matching engine.

Turning diversity off (λ=1.0) was a massive jump (numbers in the next post).

Takeaway: no knob has a "correct" value in a vacuum — only correct for your task.

#MachineLearning #SearchEngineering #InformationRetrieval

Post 5 — Two judges: retriever vs reranker

Semantic search and a reranker are two different kinds of judge.

The retriever (bi-encoder) embeds the query and documents separately, then compares with cosine. Fast — vectors are precomputed. But "soft": a backend query will also surface full-stack devs because they're nearby in vector space.

The reranker (cross-encoder / LLM) looks at the (query, document) pair together and judges them jointly. Slower — computed on the fly — so you only run it on the top ~20.

Soft judge: "who's close?"
Hard judge: "who actually fits? The query asked for Go/gRPC/Kafka — full-stack doesn't have that → 0%."

The pipeline: retriever gives you ~20 close candidates, reranker returns the 7 real ones with a confidence score and honestly rejects the rest.

#RAG #LLM #SearchEngineering

Post 6 — You can't improve what you don't measure

The most expensive mistake in search: shipping on "seems to work."

Every knob — cosine threshold, MMR λ, RRF vs weighted sum, HyDE, reranking, chunk size — is tuned BLIND until you put a number on quality.

So build a golden set (queries with known correct answers) and measure:
→ Precision@K — of the top K, how many are relevant
→ Recall@K — how many of all relevant ones you found
→ MRR — how high is the first correct hit
→ nDCG@K — rewards relevant results ranked higher

A real result from my own engine. Defaults: cosine threshold 0.65, MMR 0.5. Looked fine.

Default:           nDCG@10 = 0.72
Measured optimum:  nDCG@10 = 0.98

The product was running blind at 72% of its quality instead of 98%. Two knobs were silently cutting a quarter of the quality. The eval exposed it in minutes.

Measure your retrieval. Or drive at 72% for years thinking it's 100%.

#MachineLearning #InformationRetrieval #MLOps #DataScience

Зробив 1 статтю + 6 постів (кожен — окремий кут зі статті, можна постити через день як серію; разом складаються в наратив від «що таке ембединг» до «міряй якість»).

Хочеш — можу:

зберегти все у .md-файли (наприклад content/, поза репо чи в нього);
скоротити статтю до формату Medium/DOU (зараз ~1800 слів — повноцінний лонгрід);
додати схему-діаграму конвеєра (ASCII або опис для Figma) під обкладинку статті.