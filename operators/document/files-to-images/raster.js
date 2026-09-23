/**
 * Rasterize attachments to PNG data URLs the agent vision path accepts.
 * Long edge is capped at 1024px. Output is data:image/png;base64,...
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const sharp = require('sharp');
const puppeteer = require('puppeteer');

const execFileAsync = promisify(execFile);

const MAX_EDGE = 1024;
const CMAP_ORIGIN = 'https://files-to-images.local';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);

function extensionFromName(fileName) {
  const ext = path.extname(fileName || '').toLowerCase().replace('.', '');
  return ext;
}

function extensionFromMime(mime) {
  const value = String(mime || '').toLowerCase().split(';')[0].trim();
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  };
  return map[value] || '';
}

function toDataUrl(pngBuffer) {
  return `data:image/png;base64,${pngBuffer.toString('base64')}`;
}

async function imageBufferToDataUrl(buffer) {
  const png = await sharp(buffer, { animated: false, pages: 1 })
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  return toDataUrl(png);
}

function findChrome() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function pdfjsAssetDir(kind) {
  return path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), kind);
}

async function launchBrowser() {
  const executablePath = findChrome();
  return puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

function attachAssetRoutes(page) {
  const roots = {
    '/cmaps/': pdfjsAssetDir('cmaps'),
    '/standard_fonts/': pdfjsAssetDir('standard_fonts'),
  };
  return page.setRequestInterception(true).then(() => {
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(CMAP_ORIGIN)) {
        request.continue().catch(() => {});
        return;
      }
      const pathname = url.slice(CMAP_ORIGIN.length);
      if (pathname === '/pdf.worker.js') {
        const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
        request.respond({
          status: 200,
          contentType: 'application/javascript',
          body: fs.readFileSync(workerPath),
        }).catch(() => {});
        return;
      }
      const prefix = Object.keys(roots).find((key) => pathname.startsWith(key));
      if (!prefix) {
        request.abort().catch(() => {});
        return;
      }
      const filePath = path.join(roots[prefix], pathname.slice(prefix.length));
      if (!filePath.startsWith(roots[prefix]) || !fs.existsSync(filePath)) {
        request.abort().catch(() => {});
        return;
      }
      request.respond({
        status: 200,
        contentType: 'application/octet-stream',
        body: fs.readFileSync(filePath),
      }).catch(() => {});
    });
  });
}

async function renderPdfBuffer(pdfBuffer, maxPages) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await attachAssetRoutes(page);
    await page.setContent('<!DOCTYPE html><html><body><canvas id="c"></canvas></body></html>', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.addScriptTag({
      path: require.resolve('pdfjs-dist/legacy/build/pdf.js'),
    });
    const rendered = await page.evaluate(async (base64, pageLimit, origin) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `${origin}/pdf.worker.js`;
      const binary = atob(base64);
      const data = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) data[i] = binary.charCodeAt(i);
      const loadingTask = pdfjsLib.getDocument({
        data,
        cMapUrl: `${origin}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${origin}/standard_fonts/`,
        disableWorker: true,
      });
      const pdf = await loadingTask.promise;
      const count = Math.min(pdf.numPages, pageLimit);
      const images = [];
      const canvas = document.getElementById('c');
      const context = canvas.getContext('2d');
      for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
        const pdfPage = await pdf.getPage(pageNumber);
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(2, 1024 / Math.max(base.width, base.height));
        const viewport = pdfPage.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await pdfPage.render({ canvasContext: context, viewport }).promise;
        images.push(canvas.toDataURL('image/png'));
      }
      return { pageCount: pdf.numPages, images };
    }, pdfBuffer.toString('base64'), maxPages, CMAP_ORIGIN);
    return rendered;
  } finally {
    await browser.close();
  }
}

async function officeToPdfBuffer(sourceBuffer, extension) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'files-to-images-'));
  const inputPath = path.join(dir, `input.${extension}`);
  fs.writeFileSync(inputPath, sourceBuffer);
  try {
    await execFileAsync('soffice', [
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
      dir,
      inputPath,
    ], { timeout: 120000 });
    const pdfPath = path.join(dir, 'input.pdf');
    if (!fs.existsSync(pdfPath)) {
      throw new Error('LibreOffice did not produce a PDF');
    }
    return fs.readFileSync(pdfPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function sofficeAvailable() {
  const pathEnv = process.env.PATH || '';
  const names = ['soffice', 'libreoffice'];
  for (const dir of pathEnv.split(path.delimiter)) {
    for (const name of names) {
      if (dir && fs.existsSync(path.join(dir, name))) return true;
    }
  }
  return fs.existsSync('/Applications/LibreOffice.app/Contents/MacOS/soffice');
}

module.exports = {
  MAX_EDGE,
  IMAGE_EXTENSIONS,
  OFFICE_EXTENSIONS,
  extensionFromName,
  extensionFromMime,
  imageBufferToDataUrl,
  renderPdfBuffer,
  officeToPdfBuffer,
  sofficeAvailable,
};
