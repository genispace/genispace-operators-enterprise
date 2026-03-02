/**
 * PDF Table Extractor 服务
 *
 * 核心功能：
 * 1. 通过 GeniSpace SDK 从平台存储获取 PDF 文件
 * 2. 调用 Python pdfplumber 脚本提取表格数据
 * 3. 支持银行日记账等结构化表格
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const logger = require('../../../src/utils/logger');

class PdfTableExtractor {
  constructor(config = {}) {
    this.config = {
      tempDir: config.tempDir || path.join(os.tmpdir(), 'pdf-table-extractor'),
      timeout: config.timeout || 60000,
      maxFileSize: config.maxFileSize || 50 * 1024 * 1024,
      rejectUnauthorized: config.rejectUnauthorized !== undefined ? config.rejectUnauthorized : true,
      ...config
    };

    this.ensureDirectories();
    this.pythonScriptPath = path.join(__dirname, 'pdf_table_extractor.py');
  }

  ensureDirectories() {
    if (!fs.existsSync(this.config.tempDir)) {
      fs.mkdirSync(this.config.tempDir, { recursive: true });
    }
  }

  checkAuth(req) {
    if (!req || !req.genispace || !req.genispace.client) {
      throw new Error('缺少认证信息，请在请求头中提供 GeniSpace API Key');
    }
  }

  /**
   * 从平台存储提取 PDF 表格
   * @param {string} fileId - 文件 ID
   * @param {Object} req - Express 请求对象
   * @param {Object} options - 可选参数
   * @param {string} options.columnHeaders - 前三列列头名称，逗号分隔，用于排除表头行，如 "年,月,日"
   * @param {string} options.outputColumns - 输出字段名，逗号分隔，按列顺序映射，如 "year,month,day,voucher_no,summary,counterparty,debit,credit,direction,balance"
   * @returns {Promise<Array>} - 提取的记录列表
   */
  async extractTables(fileId, req, options = {}) {
    if (!fileId || typeof fileId !== 'string') {
      throw new Error('fileId 参数是必需的，且必须是字符串');
    }

    this.checkAuth(req);

    const client = req.genispace.client;
    let tempFilePath = null;

    try {
      const fileInfoResponse = await client.storage.getFile(fileId);
      const fileInfo = fileInfoResponse.data || fileInfoResponse;
      const fileName = fileInfo.name || fileInfo.fileName || '';
      const extension = this.getFileExtension(fileName);

      if (extension !== 'pdf') {
        throw new Error(`不支持的文件格式: ${extension}。仅支持 PDF 格式`);
      }

      logger.info('开始获取 PDF 文件', { fileId, fileName, extension });

      tempFilePath = await this.getFileFromStorage(fileId, client, extension);

      logger.info('开始提取表格', { fileId, fileName, tempFilePath });

      const records = await this.extractTablesFromFile(tempFilePath, options);

      logger.info('表格提取成功', { fileId, fileName, recordCount: records.length });

      return records;
    } catch (error) {
      logger.error('PDF 表格提取失败', { fileId, error: error.stack });
      throw new Error(`PDF 表格提取失败: ${error.message}`);
    } finally {
      if (tempFilePath) {
        this.cleanupFiles(tempFilePath);
      }
    }
  }

  getFileExtension(fileName) {
    try {
      const ext = path.extname(fileName).toLowerCase();
      return ext.replace('.', '') || '';
    } catch (error) {
      logger.warn('无法获取文件扩展名', { fileName, error: error.message });
      return '';
    }
  }

  async getFileFromStorage(fileId, client, extension) {
    try {
      logger.info('开始从平台存储获取文件', { fileId, extension });

      const fileBuffer = await client.storage.getFileContent(fileId);

      if (fileBuffer.length > this.config.maxFileSize) {
        throw new Error(`文件大小超过限制: ${this.config.maxFileSize} 字节`);
      }

      const tempFileName = `extract_${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;
      const tempFilePath = path.join(this.config.tempDir, tempFileName);

      fs.writeFileSync(tempFilePath, fileBuffer);

      logger.info('文件获取完成', {
        fileId,
        tempFilePath,
        fileSize: fileBuffer.length
      });

      return tempFilePath;
    } catch (error) {
      logger.error('从平台存储获取文件失败', {
        fileId,
        error: error.message,
        stack: error.stack
      });

      if (error.response) {
        throw new Error(`获取文件失败: HTTP ${error.response.status} - ${error.response.statusText}`);
      } else {
        throw new Error(`获取文件失败: ${error.message}`);
      }
    }
  }

  /**
   * 调用 Python pdfplumber 脚本提取表格
   * @param {string} filePath - PDF 文件路径
   * @param {Object} options - 可选参数
   * @param {string} options.columnHeaders - 前三列列头名称，逗号分隔，如 "年,月,日"
   * @param {string} options.outputColumns - 输出字段名，逗号分隔，按列顺序映射
   * @returns {Promise<Array>} - 记录列表
   */
  extractTablesFromFile(filePath, options = {}) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.pythonScriptPath)) {
        reject(new Error('Python 提取脚本不存在，请确保 pdf_table_extractor.py 已正确部署'));
        return;
      }

      const args = [this.pythonScriptPath, filePath];
      if (options.outputColumns && typeof options.outputColumns === 'string') {
        args.push(options.columnHeaders && typeof options.columnHeaders === 'string' ? options.columnHeaders : '');
        args.push(options.outputColumns);
      } else if (options.columnHeaders && typeof options.columnHeaders === 'string') {
        args.push(options.columnHeaders);
      }

      // Windows 优先使用 python，Linux/Mac 使用 python3
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const proc = spawn(pythonCmd, args, {
        cwd: path.dirname(this.pythonScriptPath),
        timeout: this.config.timeout,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0 && code !== null) {
          logger.error('Python 脚本执行失败', { code, stderr });
          reject(new Error(`Python 脚本执行失败 (code: ${code}): ${stderr || '未知错误'}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          if (result.error) {
            reject(new Error(result.error));
            return;
          }
          resolve(result.records || []);
        } catch (parseError) {
          logger.error('解析 Python 输出失败', { stdout: stdout.substring(0, 200), error: parseError.message });
          reject(new Error(`解析提取结果失败: ${parseError.message}`));
        }
      });

      proc.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error('未找到 Python 环境，请确保已安装 Python 3 和 pdfplumber (pip install pdfplumber)'));
        } else {
          reject(new Error(`执行 Python 脚本失败: ${err.message}`));
        }
      });
    });
  }

  cleanupFiles(...filePaths) {
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath) && filePath.includes(this.config.tempDir)) {
          fs.unlinkSync(filePath);
          logger.debug('已删除临时文件', { filePath });
        }
      } catch (error) {
        logger.warn('删除临时文件失败', { filePath, error: error.message });
      }
    }
  }
}

module.exports = PdfTableExtractor;
