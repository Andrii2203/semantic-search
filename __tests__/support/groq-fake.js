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

async function chat(messages, options = {}) {
  calls.push({ messages, options });
  if (failure) {
    throw failure;
  }
  return nextReplies.length > 1 ? nextReplies.shift() : (nextReplies[0] ?? '');
}

function getGroqClient() {
  return { chat };
}

module.exports = { getGroqClient, resetGroqClient: reset, reset, replyWith, failWith, calls };
