Ось план підключення PDF-модуля в тому ж форматі, що й твій v4.

---

# PDF Resume Parser Module: PLAN v1.0

## 1. ЩО БУДУЄМО
Окремий модуль парсингу PDF-резюме, який:
- Приймає файли PDF через upload
- Витягує текст без зовнішніх API
- Розбиває на секції через словники маркерів
- Витягує навички, досвід, освіту, мови
- Повертає валідний IR об'єкт у загальну шину
- Працює офлайн, безкоштовно, без AI

Після підключення модуля система зможе:
- Прийняти пачку резюме від рекрутера
- Зробити keyword search по навичках
- Показати результати з поясненням

## 2. НАВІЩО
Версія 1.0: рекрутер завантажує 50 PDF, вводить «Node.js senior AWS» → бачить топ-10 кандидатів.
Версія 1.1: додається semantic search для смислової близькості.
Версія 2.0: AI-структурування для креативних резюме (fallback).

## 3. АРХІТЕКТУРА МОДУЛЯ

### 3.1 Структура файлів
```
/src
  /parsers
    index.js: реєстр парсерів, parseResume(fileBuffer, fileName)
    pdf-extractor.js: витягує сирий текст з PDF (pdf-parse)
    section-detector.js: словники маркерів + логіка розбиття на секції
    skills-extractor.js: KNOWN_TECH + парсинг списків через кому
    experience-parser.js: datePattern + підрахунок років
    ir-builder.js: складає фінальний IR об'єкт
  /sources
    file-upload.js: приймає файли, викликає parsers/index.js
```

### 3.2 Pipeline обробки
```
PDF файл (Buffer)
    ↓
pdf-extractor.js → сирий текст
    ↓
section-detector.js → { experience: [...], skills: [...], education: [...], ... }
    ↓
skills-extractor.js → масив навичок
experience-parser.js → масив місць роботи + totalYears
    ↓
ir-builder.js → валідний IR об'єкт
    ↓
Zod валідація → DB insert → SearchEngine
```

### 3.3 Інтерфейс модуля
```javascript
// parsers/index.js
async function parseResume(fileBuffer, fileName) {
  // 1. Extract
  const rawText = await extractTextFromPDF(fileBuffer)
  
  // 2. Clean
  const cleaned = cleanText(rawText)
  
  // 3. Structure
  const sections = detectSections(cleaned)
  
  // 4. Extract data
  const skills = extractSkills(sections.skills || [])
  const experience = parseExperience(sections.experience || [])
  const education = (sections.education || []).join(' ')
  const languages = (sections.languages || []).join(' ')
  const summary = (sections.summary || []).join(' ')
  
  // 5. Build IR
  return buildResumeIR({
    fileName,
    rawText: cleaned,
    skills,
    experience,
    education,
    languages,
    summary
  })
}
```

## 4. СЛОВНИКИ ТА ПАТЕРНИ

### 4.1 Маркери секцій (section-detector.js)
```javascript
const SECTION_MARKERS = {
  experience: [
    'experience', 'work experience', 'employment', 'work history',
    'professional experience', 'career', 'positions held',
    'досвід', 'досвід роботи', 'трудовий досвід', 'кар\'єра',
    'опыт', 'опыт работы', 'трудовой опыт',
  ],
  skills: [
    'skills', 'technical skills', 'technologies', 'tech stack',
    'competencies', 'expertise', 'tools', 'proficiencies',
    'навички', 'технічні навички', 'володіння', 'інструменти',
    'навыки', 'технические навыки', 'владение',
  ],
  education: [
    'education', 'academic', 'university', 'degree', 'studies',
    'освіта', 'навчання', 'університет', 'диплом',
    'образование', 'учеба', 'университет',
  ],
  languages: [
    'languages', 'language skills', 'spoken languages',
    'мови', 'володіння мовами', 'іноземні мови',
    'языки', 'владение языками', 'иностранные языки',
  ],
  summary: [
    'summary', 'about', 'profile', 'objective', 'about me',
    'коротко', 'про себе', 'мета', 'ціль',
    'кратко', 'о себе', 'цель',
  ],
  contacts: [
    'contact', 'contacts', 'email', 'phone', 'linkedin', 'github',
    'контакти', 'телефон', 'пошта',
    'контакты', 'телефон', 'почта',
  ]
}
```

### 4.2 Відомі технології (skills-extractor.js)
```javascript
const KNOWN_TECH = [
  // Backend
  'Node.js', 'Python', 'Java', 'Go', 'Rust', 'C#', '.NET', 'PHP',
  'Ruby', 'Django', 'Flask', 'Spring', 'Express', 'FastAPI',
  // Frontend
  'React', 'Angular', 'Vue', 'Svelte', 'Next.js', 'TypeScript',
  'JavaScript', 'HTML', 'CSS', 'Redux', 'GraphQL',
  // DevOps
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Terraform',
  'CI/CD', 'Jenkins', 'GitHub Actions', 'Ansible',
  // DB
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch',
  'SQL', 'NoSQL', 'DynamoDB',
  // Mobile
  'React Native', 'Flutter', 'Kotlin', 'Swift',
  // Other
  'Git', 'REST', 'gRPC', 'Microservices', 'Agile', 'Scrum',
  'Webpack', 'Vite', 'Jest', 'Cypress',
]
```

### 4.3 Патерн дат (experience-parser.js)
```javascript
const DATE_PATTERN = /(\d{4})\s*[-–, to]+\s*(present|тепер|настоящее|по настоящее)/i
const DATE_PATTERN_STATIC = /(\d{4})\s*[-–, ]+\s*(\d{4})/

// Витягує:
// "2020 - 2023" → { yearsFrom: 2020, yearsTo: 2023, duration: 3 }
// "2021 - present" → { yearsFrom: 2021, yearsTo: currentYear, duration: 5 }
```

## 5. IR ФОРМАТ ДЛЯ РЕЗЮМЕ

```javascript
{
  id: "hash123",                    // хеш від контенту
  content: "пошуковий текст...",    // все разом для embeddings
  type: "resume",                   // ← НОВИЙ ТИП
  source: "file-upload",
  metadata: {
    fileName: "resume.pdf",
    skills: ["Node.js", "AWS", "PostgreSQL"],
    totalYears: 7,
    experienceCount: 3,
    hasEnglish: true,
    education: "КНУ, 2015-2019",
    summary: "Senior developer with 7 years...",
    languages: ["English", "Ukrainian"],
    uploadedAt: "2026-04-26T..."
  }
}
```

## 6. ZOD ВАЛІДАЦІЯ

```javascript
const ResumeIRSchena = IRSchema.extend({
  type: z.literal('resume'),
  source: z.literal('file-upload'),
  metadata: z.object({
    fileName: z.string().min(1),
    skills: z.array(z.string()),
    totalYears: z.number().min(0),
    experienceCount: z.number().min(0),
    hasEnglish: z.boolean(),
    education: z.string(),
    summary: z.string(),
    languages: z.array(z.string()).default([]),
    uploadedAt: z.string(),
  })
})
```

## 7. ТЕСТИ

### pdf-extractor.test.js
- [ ] Коректний PDF → повертає текст
- [ ] Порожній PDF → повертає ''
- [ ] PDF із зображеннями → текст витягується (наскільки можливо)

### section-detector.test.js
- [ ] Стандартне англійське резюме → знаходить experience, skills, education
- [ ] Українське резюме → знаходить досвід, навички, освіта
- [ ] Резюме без секції skills → повертає порожній масив, не падає
- [ ] Креативне резюме (без стандартних маркерів) → повертає все в header

### skills-extractor.test.js
- [ ] "Node.js, React, AWS" → ["Node.js", "React", "AWS"]
- [ ] "Досвід роботи з PostgreSQL та MongoDB" → ["PostgreSQL", "MongoDB"]
- [ ] Порожній текст → []

### experience-parser.test.js
- [ ] "2020 - 2023" → { yearsFrom: 2020, yearsTo: 2023 }
- [ ] "2021 - present" → { yearsFrom: 2021, yearsTo: поточний рік }
- [ ] Не знайдено дат → порожній масив

### ir-builder.test.js
- [ ] Всі секції → повний IR об'єкт
- [ ] Мінімум даних (тільки сирий текст) → IR з порожніми метаданими
- [ ] IR проходить Zod валідацію

## 8. ACCEPTANCE CRITERIA

### Фаза 1: pdf-extractor
- [ ] `npm install pdf-parse`
- [ ] Модуль витягує текст з PDF без помилок
- [ ] Clean-функція прибирає зайві пробіли та символи
- [ ] Тест на 3 реальних резюме проходить

### Фаза 2: section-detector
- [ ] Словники маркерів покривають EN/UA/RU
- [ ] Розбиття на секції працює на стандартних резюме
- [ ] Якщо секція не знайдена: текст потрапляє в header
- [ ] Тести проходять

### Фаза 3: skills-extractor + experience-parser
- [ ] KNOWN_TECH покриває основні технології
- [ ] Навички витягуються з різних форматів (коми, списки, буліти)
- [ ] Досвід парситься з різними форматами дат
- [ ] Тести проходять

### Фаза 4: ir-builder + інтеграція
- [ ] IR об'єкт проходить Zod валідацію
- [ ] file-upload.js викликає parseResume() і отримує IR
- [ ] IR потрапляє в загальний pipeline (DB + SearchEngine)
- [ ] Інтеграційний тест: PDF → IR → DB → пошук

## 9. ЩО НЕ ВХОДИТЬ В v1.0
- AI-структурування для креативних резюме (буде в v2.0 як fallback)
- Парсинг таблиць у PDF
- Розпізнавання тексту з зображень (OCR)
- Підтримка DOCX (тільки PDF)
- Витягування фото

## 10. ПОРЯДОК ДІЙ

| # | Крок | Результат |
|---|------|-----------|
| 1 | `npm install pdf-parse` | Модуль готовий до роботи |
| 2 | Створити `/parsers/pdf-extractor.js` | Витягує текст |
| 3 | Створити `/parsers/section-detector.js` | Розбиває на секції |
| 4 | Створити `/parsers/skills-extractor.js` | Витягує навички |
| 5 | Створити `/parsers/experience-parser.js` | Парсить досвід |
| 6 | Створити `/parsers/ir-builder.js` | Будує IR |
| 7 | Створити `/parsers/index.js` | Єдина точка входу |
| 8 | Оновити `/sources/file-upload.js` | Викликає парсер |
| 9 | Додати Zod schema в `validation.js` | Валідація resume IR |
| 10 | Написати тести | Все проходить |
| 11 | Інтеграційний тест | PDF → IR → DB |
| 12 | Підключити UI (upload + пошук) | Демо готове |