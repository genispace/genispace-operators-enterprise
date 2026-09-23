/**
 * Convert an attachment list into PNG data URLs in one call.
 * The task graph does not loop; this operator walks the files internally.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const logger = require('../../../src/utils/logger');
const raster = require('./raster');

const DEFAULT_MAX_PAGES = 10;
const DEFAULT_MAX_IMAGES = 20;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

class FilesToImages {
  constructor(config = {}) {
    this.config = {
      tempDir: config.tempDir || path.join(os.tmpdir(), 'files-to-images'),
      maxFileSize: config.maxFileSize || MAX_FILE_BYTES,
      ...config,
    };
    if (!fs.existsSync(this.config.tempDir)) {
      fs.mkdirSync(this.config.tempDir, { recursive: true });
    }
  }

  checkAuth(req) {
    if (!req || !req.genispace || !req.genispace.client) {
      throw new Error('缺少认证信息，请在请求头中提供 GeniSpace API Key');
    }
  }

  async convert(attachments, req, options = {}) {
    const list = Array.isArray(attachments) ? attachments : [];
    const maxPagesPerFile = normalizeLimit(options.maxPagesPerFile, DEFAULT_MAX_PAGES);
    const maxImages = normalizeLimit(options.maxImages, DEFAULT_MAX_IMAGES);
    const images = [];
    const skipped = [];

    if (list.length === 0) {
      return { images, skipped };
    }

    const needsStorage = list.some((item) => item && item.fileId);
    if (needsStorage) {
      this.checkAuth(req);
    }

    for (const attachment of list) {
      if (images.length >= maxImages) {
        skipped.push({
          fileName: fileNameOf(attachment),
          reason: 'truncated_to_max_images',
        });
        continue;
      }
      if (!attachment || (!attachment.fileId && !attachment.url)) {
        skipped.push({
          fileName: fileNameOf(attachment),
          reason: 'missing_source',
        });
        continue;
      }

      try {
        const loaded = await this.loadAttachment(attachment, req);
        const produced = await this.rasterize(loaded, maxPagesPerFile);
        if (produced.truncated) {
          skipped.push({
            fileName: loaded.fileName,
            reason: 'truncated_to_max_pages',
          });
        }
        for (const dataUrl of produced.images) {
          if (images.length >= maxImages) {
            skipped.push({
              fileName: loaded.fileName,
              reason: 'truncated_to_max_images',
            });
            break;
          }
          images.push(dataUrl);
        }
      } catch (error) {
        logger.warn('附件转图跳过', {
          fileName: fileNameOf(attachment),
          reason: error.code || error.message,
        });
        skipped.push({
          fileName: fileNameOf(attachment),
          reason: error.code || 'convert_failed',
        });
      }
    }

    if (needsStorage) {
      logger.info('附件转图完成', { imageCount: images.length, skippedCount: skipped.length });
    }
    return { images, skipped };
  }

  async loadAttachment(attachment, req) {
    const hintedName = attachment.fileName || attachment.originalName || '';
    if (attachment.fileId) {
      const client = req.genispace.client;
      const fileInfoResponse = await client.storage.getFile(attachment.fileId);
      const fileInfo = fileInfoResponse.data || fileInfoResponse;
      const fileName = fileInfo.name || fileInfo.fileName || hintedName || attachment.fileId;
      const buffer = await client.storage.getFileContent(attachment.fileId);
      this.assertSize(buffer);
      return {
        buffer,
        fileName,
        extension: resolveExtension(fileName, attachment.fileType || fileInfo.mimeType),
      };
    }

    const response = await axios.get(attachment.url, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxContentLength: this.config.maxFileSize,
      maxBodyLength: this.config.maxFileSize,
    });
    const buffer = Buffer.from(response.data);
    this.assertSize(buffer);
    const fileName = hintedName || path.basename(new URL(attachment.url).pathname) || 'attachment';
    const headerType = response.headers && response.headers['content-type'];
    return {
      buffer,
      fileName,
      extension: resolveExtension(fileName, attachment.fileType || headerType),
    };
  }

  assertSize(buffer) {
    if (buffer.length > this.config.maxFileSize) {
      const error = new Error('文件超过大小限制');
      error.code = 'file_too_large';
      throw error;
    }
  }

  async rasterize(loaded, maxPagesPerFile) {
    const extension = loaded.extension;
    if (raster.IMAGE_EXTENSIONS.has(extension)) {
      return {
        images: [await raster.imageBufferToDataUrl(loaded.buffer)],
        truncated: false,
      };
    }

    let pdfBuffer = loaded.buffer;
    if (raster.OFFICE_EXTENSIONS.has(extension)) {
      if (!raster.sofficeAvailable()) {
        const error = new Error('未安装 LibreOffice，无法把 Office 文件转为 PDF');
        error.code = 'office_converter_unavailable';
        throw error;
      }
      pdfBuffer = await raster.officeToPdfBuffer(loaded.buffer, extension);
    } else if (extension !== 'pdf') {
      const error = new Error(`不支持的文件格式: ${extension || 'unknown'}`);
      error.code = 'unsupported_type';
      throw error;
    }

    const rendered = await raster.renderPdfBuffer(pdfBuffer, maxPagesPerFile);
    return {
      images: rendered.images,
      truncated: rendered.pageCount > rendered.images.length,
    };
  }
}

function normalizeLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function fileNameOf(attachment) {
  if (!attachment) return 'unknown';
  return attachment.fileName || attachment.originalName || attachment.fileId || 'unknown';
}

function resolveExtension(fileName, mime) {
  return raster.extensionFromName(fileName) || raster.extensionFromMime(mime);
}

module.exports = FilesToImages;
