'use strict';

const {
  deriveCategory,
  lexicalOverlap,
  buildDocumentFrequency,
  CATEGORIES,
} = require('../../src/eval/categories');
const constants = require('../../src/search-constants');

const varied = [
  'Regulators opened an inquiry into how the company collected location data from handsets.',
  'Executives told the committee that retention periods had been shortened last spring.',
  'Campaigners argue the disclosure came too late to change anything for affected users.',
  'The department published a timetable for the remaining consultations before autumn.',
  'Analysts expect the ruling to shape similar cases across the sector next year.',
  'Shares moved little in early trading despite the size of the proposed penalty.',
].join(' ');

const longArticle = { id: 'a1', content: varied };

describe('src/eval/categories.js', () => {
  test('the eight categories of the evaluation standard are the only ones produced', () => {
    expect(CATEGORIES).toHaveLength(8);
    expect(CATEGORIES).toEqual(
      expect.arrayContaining([
        'relevant', 'semantic', 'partial', 'irrelevant', 'trap', 'spam', 'duplicate', 'thin',
      ]),
    );
  });

  test('a grade of three on a full article is relevant', () => {
    const category = deriveCategory({ grade: 3 }, longArticle, { overlap: 0.4, isDuplicate: false });
    expect(category).toBe('relevant');
  });

  test('a high grade with low lexical overlap is a semantic match', () => {
    const category = deriveCategory(
      { grade: 3 },
      longArticle,
      { overlap: constants.semanticOverlapThreshold - 0.01, isDuplicate: false },
    );
    expect(category).toBe('semantic');
  });

  test('a grade of zero with high lexical overlap is a trap', () => {
    const category = deriveCategory(
      { grade: 0 },
      longArticle,
      { overlap: constants.trapOverlapThreshold + 0.01, isDuplicate: false },
    );
    expect(category).toBe('trap');
  });

  test('a grade of zero with low lexical overlap is irrelevant', () => {
    const category = deriveCategory({ grade: 0 }, longArticle, { overlap: 0.01, isDuplicate: false });
    expect(category).toBe('irrelevant');
  });

  test('a grade of one is partial', () => {
    const category = deriveCategory({ grade: 1 }, longArticle, { overlap: 0.2, isDuplicate: false });
    expect(category).toBe('partial');
  });

  test('an article shorter than the thin threshold is thin whatever its grade', () => {
    const thin = { id: 'a2', content: 'Rust async. Read more on our site.' };
    const category = deriveCategory({ grade: 3 }, thin, { overlap: 0.5, isDuplicate: false });
    expect(category).toBe('thin');
  });

  test('a keyword stuffed article is spam whatever its grade', () => {
    const stuffed = { id: 'a3', content: 'rust async tokio rust async tokio '.repeat(20).trim() };
    const category = deriveCategory({ grade: 3 }, stuffed, { overlap: 0.6, isDuplicate: false });
    expect(category).toBe('spam');
  });

  test('an article near identical to another is a duplicate whatever its grade', () => {
    const category = deriveCategory({ grade: 3 }, longArticle, { overlap: 0.5, isDuplicate: true });
    expect(category).toBe('duplicate');
  });

  test('the category is derived rather than read from the judgment', () => {
    const category = deriveCategory(
      { grade: 0, category: 'relevant' },
      longArticle,
      { overlap: 0.01, isDuplicate: false },
    );
    expect(category).toBe('irrelevant');
  });

  test('lexical overlap is computed from the intent text and the article text, weighting each shared word by its inverse document frequency over the corpus', () => {
    const articles = [
      { content: 'quarterly earnings report from the retailer' },
      { content: 'quarterly earnings guidance from the airline' },
      { content: 'quarterly earnings and the tokamak confinement experiment' },
    ];
    const frequency = buildDocumentFrequency(articles);
    const article = articles[2].content;

    const sharedCommonWord = lexicalOverlap('quarterly results', article, frequency);
    const sharedRareWord = lexicalOverlap('tokamak results', article, frequency);

    expect(sharedRareWord).toBeGreaterThan(sharedCommonWord);
  });

  test('a pair whose intent and article share no content word has an overlap of zero, and a pair whose intent words all appear in the article has an overlap of one', () => {
    const article = 'sediment transport reshaped the northern shore over a decade';

    expect(lexicalOverlap('tokamak confinement plasma', article)).toBe(0);
    expect(lexicalOverlap('sediment transport shore', article)).toBe(1);
  });
});
