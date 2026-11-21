const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const router = require('../../operators/document/text-extractor/text-extractor.routes');

const files = {
  slides: ['quarterly.PPTX', fs.readFileSync(path.join(__dirname, 'fixtures/quarterly.PPTX'))],
  unsupported: ['image.png', null],
  extensionless: ['untitled', null],
  invalid: ['broken.pptx', Buffer.from('An invalid presentation')],
  text: ['report.txt', Buffer.from('业务摘要')]
};
let server;
before(async () => {
  const app = express();
  app.use(express.json(), (req, res, next) => {
    req.genispace = { client: { storage: {
      getFile: async id => ({ data: { name: files[id][0] } }),
      getFileContent: async id => {
        assert.ok(files[id][1], 'An unsupported file must not be downloaded');
        return files[id][1];
      }
    } } };
    next();
  }, router);
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
});
after(() => new Promise(resolve => server.close(resolve)));

async function extract(fileId, status) {
  const response = await fetch('http://127.0.0.1:' + server.address().port + '/extract', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId })
  });
  assert.equal(response.status, status);
  return response.json();
}
test('extracts text runs and table cells in presentation order without speaker notes', async () => {
  const { data } = await extract('slides', 200);
  assert.equal(data.text, '按顺序提取 & QA\n\n项目\n金额\n经营简报\n220');
  assert.equal(data.textLength, data.text.length);
  assert.equal(data.isTruncated, false);
});
test('returns the supported formats to both REST and MCP for unknown and missing extensions', async () => {
  for (const id of ['unsupported', 'extensionless']) {
    const result = await extract(id, 415);
    assert.equal(result.code, 'UNSUPPORTED_FILE_FORMAT');
    assert.equal(result.error, result.message);
    assert.match(result.message, /PPTX/);
    assert.ok(result.message.includes(id === 'unsupported' ? 'png' : '无扩展名'));
  }
});
test('rejects an unreadable presentation without a server error', async () => {
  assert.equal((await extract('invalid', 422)).code, 'INVALID_PPTX');
});
test('retains the existing text and validation contracts', async () => {
  assert.equal((await extract('text', 200)).data.text, '业务摘要');
  assert.equal((await extract('', 400)).code, 'MISSING_FILE_ID');
});
test('keeps DOCX, XLSX and legacy XLS extraction working', async () => {
  const { Document, Packer, Paragraph } = require('docx');
  const xlsx = require('xlsx');
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([['经营简报', 220]]), 'QA');
  files.word = ['report.docx', await Packer.toBuffer(new Document({
    sections: [{ children: [new Paragraph('经营简报')] }]
  }))];
  assert.match((await extract('word', 200)).data.text, /经营简报/);
  for (const type of ['xls', 'xlsx']) {
    files[type] = ['report.' + type, xlsx.write(workbook, { type: 'buffer', bookType: type })];
    assert.equal((await extract(type, 200)).data.text, '经营简报\t220');
  }
});
