# ADR-002: Dynamic Profiles замість статичних JSON

## Проблема
Статичні profiles/*.json потребують ручного створення для кожного юзкейса. Не масштабується.

## Альтернативи
- Зберегти статичні JSON → обмежена гнучкість
- Тільки embedding-based → втрата keyword контролю
- Dynamic Profile Generator з AI + fallback → максимальна гнучкість

## Рішення
Profile Generator який:
1. Приймає довільний текст (вакансія, запит, опис)
2. AI витягує keywords (з миттєвим TF-based fallback)
3. Генерує embedding вектор для semantic search
4. Зберігає профіль в БД для повторного використання

Людина бачить keywords в UI і може їх редагувати (human-in-the-loop).

## Trade-offs
+ Будь-який input → готовий профіль за секунди
+ Fallback працює без AI
+ Збережені профілі переіспользовуються
- Залежність від Groq API для якісних keywords
- AI keywords можуть бути неточними без людського контролю

## Коли переглянути
Якщо з'явиться fine-tuned модель для keyword extraction.
