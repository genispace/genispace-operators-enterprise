const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const FilesToImages = require('./FilesToImages');

test('png attachment becomes a PNG data URL', async () => {
  const converter = new FilesToImages();
  const buffer = await sharp({
    create: { width: 8, height: 4, channels: 3, background: { r: 200, g: 10, b: 10 } },
  }).png().toBuffer();
  const result = await converter.rasterize({
    buffer,
    extension: 'png',
    fileName: 'evidence.png',
  }, 10);
  assert.equal(result.images.length, 1);
  assert.match(result.images[0], /^data:image\/png;base64,/);
});

test('empty attachments return an empty image list', async () => {
  const converter = new FilesToImages();
  const result = await converter.convert([], null);
  assert.deepEqual(result, { images: [], skipped: [] });
});

test('attachment without fileId or url is skipped and does not fail the batch', async () => {
  const converter = new FilesToImages();
  const result = await converter.convert([{ fileName: 'orphan.pdf' }], null);
  assert.deepEqual(result.images, []);
  assert.equal(result.skipped[0].reason, 'missing_source');
});

test('a one-page PDF renders to a PNG data URL', async () => {
  const puppeteer = require('puppeteer');
  const raster = require('./raster');
  const executablePath = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].find((candidate) => candidate && require('fs').existsSync(candidate));
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent('<html><body><p>条款附件</p></body></html>', { waitUntil: 'domcontentloaded' });
    const pdf = await page.pdf({ width: '200px', height: '200px', printBackground: true });
    await browser.close();
    const rendered = await raster.renderPdfBuffer(Buffer.from(pdf), 10);
    assert.equal(rendered.pageCount, 1);
    assert.match(rendered.images[0], /^data:image\/png;base64,/);
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
});
