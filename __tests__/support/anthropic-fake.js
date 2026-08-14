'use strict';

const calls = [];
let nextReplies = [];
let failure = null;

function reset() {
  calls.length = 0;
  nextReplies = [];
  failure = null;
}

function replyWith(...replies) {
  nextReplies = replies.map((reply) =>
    typeof reply === 'string' ? reply : JSON.stringify(reply),
  );
}

function failWith(error) {
  failure = error instanceof Error ? error : new Error(String(error));
}

async function gradePair(request) {
  calls.push(request);
  if (failure) {
    throw failure;
  }
  const text = nextReplies.length > 1 ? nextReplies.shift() : (nextReplies[0] ?? '');
  return { text, cost: 0.0005, usage: { input_tokens: 500, output_tokens: 40 } };
}

module.exports = { gradePair, reset, replyWith, failWith, calls, getClient: () => ({}), resetClient: reset };
