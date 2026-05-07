'use strict';

module.exports = jest.fn((buffer) => {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return Promise.reject(new Error('Invalid PDF buffer'));
  }
  // Return mock text based on buffer content hint (for tests)
  const text = buffer._mockText || 'Mocked PDF text content';
  return Promise.resolve({ text });
});