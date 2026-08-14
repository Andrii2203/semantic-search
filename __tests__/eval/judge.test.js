'use strict';

const groqFake = require('../support/groq-fake');
const anthropicFake = require('../support/anthropic-fake');

jest.mock('../../src/groq-client', () => require('../support/groq-fake'));
jest.mock('../../src/anthropic-client', () => require('../support/anthropic-fake'));
jest.mock('../../src/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const { judgePair, judgeAll, PROMPT_VERSION } = require('../../src/eval/judge');
const constants = require('../../src/search-constants');

const intent = { id: 'intent-1', content: 'Twitch is training Amazon AI on streams without asking' };
const article = { id: 'article-1', content: 'Twitch content has trained Amazon AI for years, and the opt out is hidden.' };

beforeEach(() => {
  groqFake.reset();
  anthropicFake.reset();
});

describe('src/eval/judge.js', () => {
  test('the judge returns a grade and a reason for one intent and article pair', async () => {
    anthropicFake.replyWith({ grade: 3, reason: 'Same subject, directly addressed.' });

    const judgment = await judgePair(intent, article);

    expect(judgment.grade).toBe(3);
    expect(judgment.reason.length).toBeGreaterThan(0);
    expect(judgment.intentId).toBe('intent-1');
    expect(judgment.articleId).toBe('article-1');
  });

  test('the judge records the model identifier and the prompt version on the judgment', async () => {
    anthropicFake.replyWith({ grade: 2, reason: 'Same subject from another angle.' });

    const judgment = await judgePair(intent, article);

    expect(judgment.model).toBe(constants.judgeModel);
    expect(judgment.promptVersion).toBe(PROMPT_VERSION);
  });

  test('the judge asks with temperature zero so a rerun reproduces the answer key', async () => {
    groqFake.replyWith({ grade: 0, reason: 'Different subject.' });

    await judgePair(intent, article, { provider: 'groq', model: 'some-groq-model' });

    expect(groqFake.calls[0].options.temperature).toBe(0);
    expect(constants.judgeTemperature).toBe(0);
  });

  test('the judge never sees a ranking position or the configuration that retrieved the article', async () => {
    anthropicFake.replyWith({ grade: 1, reason: 'Related but not addressed.' });

    await judgePair(intent, article, { rank: 3, configuration: 'parallel-rrf' });

    const sent = JSON.stringify(anthropicFake.calls[0]);
    expect(sent).not.toContain('parallel-rrf');
    expect(sent).not.toMatch(/\brank\b/i);
  });

  test('a grade outside zero to three is rejected rather than stored', async () => {
    anthropicFake.replyWith({ grade: 7, reason: 'Nonsense.' });

    await expect(judgePair(intent, article)).rejects.toThrow(/grade/i);
  });

  test('a transport failure raises rather than returning a default grade', async () => {
    anthropicFake.failWith(new Error('429 rate limit reached'));

    await expect(judgePair(intent, article)).rejects.toThrow(/judge call failed/i);
  });

  test('an unparseable response raises rather than returning a default grade', async () => {
    anthropicFake.replyWith('not json at all');

    await expect(judgePair(intent, article)).rejects.toThrow(/parseable/i);
  });

  test('the judge is not called for a pair that already carries a judgment from the same model and prompt version', async () => {
    anthropicFake.replyWith({ grade: 3, reason: 'Same subject.' });

    const existing = [
      {
        intentId: 'intent-1',
        articleId: 'article-1',
        grade: 3,
        reason: 'Already judged.',
        model: constants.judgeModel,
        promptVersion: PROMPT_VERSION,
      },
    ];

    const judgments = await judgeAll([{ intent, article }], existing);

    expect(anthropicFake.calls).toHaveLength(0);
    expect(judgments).toHaveLength(1);
    expect(judgments[0].reason).toBe('Already judged.');
  });

  test('a pair judged under an older prompt version is judged again', async () => {
    anthropicFake.replyWith({ grade: 2, reason: 'Regraded under the current prompt.' });

    const existing = [
      {
        intentId: 'intent-1',
        articleId: 'article-1',
        grade: 3,
        reason: 'Judged under an older prompt.',
        model: constants.judgeModel,
        promptVersion: PROMPT_VERSION - 1,
      },
    ];

    const judgments = await judgeAll([{ intent, article }], existing);

    expect(anthropicFake.calls).toHaveLength(1);
    expect(judgments[0].reason).toBe('Regraded under the current prompt.');
  });
});
