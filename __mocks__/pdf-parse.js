'use strict';

// Mock for pdf-parse v2 (class API: new PDFParse({ data }).getText()).
class PDFParse {
  constructor({ data } = {}) {
    this.data = data;
  }

  async getText() {
    if (!this.data || !Buffer.isBuffer(this.data)) {
      throw new Error('Invalid PDF buffer');
    }
    const text = this.data._mockText || 'Mocked PDF text content';
    return { text };
  }

  async destroy() {}
}

module.exports = { PDFParse };
