'use strict';

const state = {
  text: 'Default PDF text',
  failWith: null,
};

class PDFParse {
  constructor(options = {}) {
    this.data = options.data;
  }

  async getText() {
    if (state.failWith) {
      throw new Error(state.failWith);
    }
    if (!Buffer.isBuffer(this.data)) {
      throw new Error('Invalid PDF buffer');
    }
    return { text: this.data.pdfText || state.text };
  }

  async destroy() {}
}

function setPdfText(text) {
  state.text = text;
}

function failNextParse(message) {
  state.failWith = message;
}

function resetPdfFake() {
  state.text = 'Default PDF text';
  state.failWith = null;
}

module.exports = { PDFParse, setPdfText, failNextParse, resetPdfFake };
