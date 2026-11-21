const path = require('node:path').posix;
const { promisify } = require('node:util');
const yauzl = require('yauzl');
const sax = require('sax');

const openZip = promisify(yauzl.open);
const maxParts = 12000;
const maxXmlBytes = 50 * 1024 * 1024;
const presentation = /^http:\/\/(schemas\.openxmlformats\.org\/presentationml\/2006|purl\.oclc\.org\/ooxml\/presentationml)\/main$/;
const drawing = /^http:\/\/(schemas\.openxmlformats\.org\/drawingml\/2006|purl\.oclc\.org\/ooxml\/drawingml)\/main$/;
const officeRels = /^http:\/\/(schemas\.openxmlformats\.org\/officeDocument\/2006|purl\.oclc\.org\/ooxml\/officeDocument)\/relationships$/;

class ExtractionInputError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function indexParts(zip) {
  if (zip.entryCount > maxParts) throw new Error('Too many parts');
  return new Promise((resolve, reject) => {
    const parts = new Map();
    zip.once('error', reject);
    zip.once('end', () => resolve(parts));
    zip.on('entry', entry => {
      if (parts.has(entry.fileName)) return reject(new Error('Duplicate part'));
      parts.set(entry.fileName, entry);
      zip.readEntry();
    });
    zip.readEntry();
  });
}

function parse(xml, handlers) {
  const parser = sax.parser(true, { xmlns: true });
  parser.ondoctype = () => { throw new Error('Unexpected document type'); };
  Object.assign(parser, handlers);
  parser.write(xml).close();
}

// Read the presentation's slide relationships in display order. Never load linked
// resources, speaker notes, layouts or media from a presentation.
async function extractPptx(filePath) {
  let zip;
  try {
    zip = await openZip(filePath, { lazyEntries: true, autoClose: false });
    const parts = await indexParts(zip);
    let bytesLeft = maxXmlBytes;
    async function readXml(name) {
      const entry = parts.get(name);
      if (!entry || entry.uncompressedSize > bytesLeft) throw new Error('Missing or oversized part');
      const stream = await promisify(zip.openReadStream.bind(zip))(entry);
      const chunks = [];
      for await (const chunk of stream) {
        bytesLeft -= chunk.length;
        if (bytesLeft < 0) throw new Error('XML limit exceeded');
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const bom = buffer.subarray(0, 2).toString('hex');
      const encoding = bom === 'fffe' ? 'utf-16le' : bom === 'feff' ? 'utf-16be' : 'utf-8';
      return new TextDecoder(encoding, { fatal: true }).decode(buffer);
    }
    const ids = [];
    parse(await readXml('ppt/presentation.xml'), {
      onopentag(n) {
        if (n.local === 'sldId' && presentation.test(n.uri)) {
          const ref = Object.values(n.attributes).find(a => a.local === 'id' && officeRels.test(a.uri));
          if (!ref) throw new Error('Missing slide relationship');
          ids.push(ref.value);
        }
      }
    });
    const slides = new Map();
    parse(await readXml('ppt/_rels/presentation.xml.rels'), {
      onopentag(n) {
        if (n.local !== 'Relationship') return;
        const { Type, Target, Id, TargetMode } = n.attributes;
        if (!Type?.value.endsWith('/slide') || TargetMode?.value === 'External') return;
        const name = path.resolve('/ppt', Target.value).slice(1);
        slides.set(Id.value, name);
      }
    });
    const pages = [];
    for (const id of ids) {
      const lines = [];
      let text = '', inRun = false;
      parse(await readXml(slides.get(id)), {
        onopentag(n) {
          if (!drawing.test(n.uri)) return;
          if (n.local === 't') inRun = true;
          if (n.local === 'br') text += '\n';
          if (n.local === 'tab') text += '\t';
        },
        ontext: appendText,
        oncdata: appendText,
        onclosetag() {
          const n = this.tag;
          if (!drawing.test(n.uri)) return;
          if (n.local === 't') inRun = false;
          if (n.local === 'p') {
            if (text.trim()) lines.push(text);
            text = '';
          }
        }
      });
      function appendText(value) {
        if (inRun) text += value;
      }
      if (lines.length) pages.push(lines.join('\n'));
    }
    return pages.join('\n\n');
  } catch (error) {
    if (['ENOENT', 'EACCES', 'EIO', 'EMFILE', 'ENFILE'].includes(error.code)) throw error;
    throw new ExtractionInputError(422, 'INVALID_PPTX', '无法读取 PPTX 内容，请检查文件是否完整、未加密，或缩小文件后重试。');
  } finally {
    zip?.close();
  }
}

module.exports = { extractPptx, ExtractionInputError };
