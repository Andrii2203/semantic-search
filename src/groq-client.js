'use strict';

const Groq = require('groq-sdk');
const config = require('./config');
const logger = require('./logger');

class GroqClient {
  constructor(options = {}) {
    this.client = new Groq({ apiKey: options.apiKey || config.groq.apiKey });
    this.maxPerMinute = options.rateLimit || config.groq.rateLimit;
    this.timestamps = [];
  }

  async waitForSlot() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < 60_000);

    if (this.timestamps.length >= this.maxPerMinute) {
      const oldest = this.timestamps[0];
      const waitMs = 60_000 - (now - oldest) + 100;
      logger.info({ waitMs }, 'Groq rate limiter: waiting for slot');
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return this.waitForSlot();
    }

    this.timestamps.push(Date.now());
  }

  async chat(messages, options = {}) {
    await this.waitForSlot();

    try {
      const response = await this.client.chat.completions.create({
        model: options.model || config.live('groqModel'),
        messages,
        max_tokens: options.maxTokens || config.groq.maxTokens,
        temperature: options.temperature ?? 0.3,
      });

      return response.choices[0]?.message?.content || '';
    } catch (err) {
      logger.error({ err }, 'Groq API call failed');
      throw err;
    }
  }
}

let instance = null;

function getGroqClient() {
  if (!instance) {
    instance = new GroqClient();
  }
  return instance;
}

function resetGroqClient() {
  instance = null;
}

module.exports = { GroqClient, getGroqClient, resetGroqClient };
