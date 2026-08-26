/**
 * Word 生成服务
 * 
 * 核心功能：
 * 1. HTML 转 Word 文档生成（主要功能）
 * 2. Markdown 模板解析和 JSON 数据填充（辅助功能，通过转换为 HTML）
 * 3. 高质量 Word 文档生成（支持封面、目录、书签等）
 * 4. 平台存储上传（通过 GeniSpace SDK）
 * 5. 临时文件管理
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const marked = require('marked');
const Mustache = require('mustache');
const { v4: uuidv4 } = require('uuid');
const GeniSpace = require('genispace');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  SectionType,
  InternalHyperlink,
  BookmarkStart,
  BookmarkEnd,
  PageBreak,
  ShadingType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle
} = require('docx');
const logger = require('../../../src/utils/logger');
const config = require('../../../src/config/env');

class WordGenerator {
  constructor(config = {}) {
    this.config = {
      // 临时目录：使用系统临时目录，文件生成后立即上传并删除
      tempDir: config.tempDir || path.join(os.tmpdir(), 'word-generator'),
      outputDir: config.outputDir || path.join(os.tmpdir(), 'word-generator'),
      
      // Word 默认选项
      defaultWordOptions: {
        orientation: 'portrait',
        margins: {
          top: 1440,
          right: 1440,
          bottom: 1440,
          left: 1440
        },
        pageSize: {
          width: 12240,
          height: 15840
        },
        ...config.defaultWordOptions
      },
      
      ...config
    };
    
    this.ensureDirectories();
  }
  
  /**
   * 确保必要的目录存在
   */
  ensureDirectories() {
    [this.config.tempDir, this.config.outputDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  /**
   * 检查认证（必须提供 GeniSpace API Key）
   * @param {Object} req - Express 请求对象
   * @throws {Error} 如果缺少认证信息
   */
  checkAuth(req) {
    if (!req || !req.genispace || !req.genispace.client) {
      throw new Error('缺少认证信息，请在请求头中提供 GeniSpace API Key');
    }
  }
  
  /**
   * 生成 Word 文档
   * @param {Object} options - 生成选项
   * @param {string} options.markdownTemplate - Markdown 模板内容或 URL
   * @param {Object} options.templateData - 填充模板的 JSON 数据
   * @param {string} options.fileName - 输出文件名（可选）
   * @param {Object} options.wordOptions - Word 生成选项（可选）
   * @param {string} options.cssStyles - 自定义 CSS 样式（可选）
   * @param {Object} options.req - Express 请求对象（用于认证和 SDK 上传）
   * @returns {Promise<Object>} - 生成结果
   */
  async generateWord(options) {
    const {
      markdownTemplate,
      templateData = {},
      fileName,
      wordOptions = {},
      req
    } = options;
    
    // 检查认证
    this.checkAuth(req);
    
    logger.info('开始生成 Word', {
      hasTemplate: !!markdownTemplate,
      dataKeys: templateData ? Object.keys(templateData) : [],
      fileName
    });
    
    if (!markdownTemplate) {
      throw new Error('必须提供 Markdown 模板内容');
    }
    
    // 允许空对象，但不允许 null、undefined 或数组
    if (templateData === null || templateData === undefined || Array.isArray(templateData)) {
      throw new Error('templateData 必须是对象格式');
    }
    
    try {
      const uniqueId = uuidv4().substring(0, 8);
      const finalFileName = fileName ? 
        `${fileName}_${uniqueId}` : 
        `word_${Date.now()}_${uniqueId}`;
      
      const templateContent = this.normalizeMarkdownNewlines(
        await this.resolveTemplateSource(markdownTemplate)
      );
      const filledMarkdown = Mustache.render(templateContent, templateData);
      const { paragraphs, headings } = this.parseMarkdownToParagraphs(filledMarkdown);
      const wordPath = await this.writeWordDocument(finalFileName, wordOptions, paragraphs, headings);
      
      const fileStats = fs.statSync(wordPath);
      
      // 使用 SDK 上传到平台存储
      const wordURL = await this.uploadToPlatformStorage(wordPath, finalFileName, req);
      
      this.cleanupFiles(wordPath);
      
      const result = {
        success: true,
        wordURL,
        fileSize: fileStats.size,
        fileName: `${finalFileName}.docx`,
        storageProvider: 'platform',
        generatedAt: new Date().toISOString()
      };
      
      logger.info('Word 生成成功', result);
      return result;
      
    } catch (error) {
      logger.error('Word 生成失败', { error: error.stack });
      throw new Error(`Word 生成失败: ${error.message}`);
    }
  }
  
  /**
   * 解析模板源（URL、文件路径或模板内容）
   * @param {string} source - 模板源（URL、文件路径或模板内容）
   * @returns {Promise<string>} - 模板内容
   */
  async resolveTemplateSource(source) {
    // 如果是 URL，下载内容
    if (source.startsWith('http://') || source.startsWith('https://')) {
      try {
        const response = await axios.get(source, { 
          responseType: 'text',
          timeout: 10000 
        });
        return response.data;
      } catch (error) {
        throw new Error(`无法下载模板文件: ${error.message}`);
      }
    }
    
    // 如果是文件路径（不包含换行符且包含路径分隔符），尝试读取文件
    if (!source.includes('\n') && (source.includes('/') || source.includes('\\'))) {
      try {
        if (fs.existsSync(source)) {
          return fs.readFileSync(source, 'utf8');
        }
      } catch (error) {
        logger.warn('文件读取失败，将作为模板内容处理', { 
          source: source.substring(0, 50) + '...' 
        });
      }
    }
    
    // 直接返回模板内容
    return source;
  }
  
  /**
   * HTML 转义函数
   * @param {string} text - 要转义的文本
   * @returns {string} - 转义后的文本
   */
  escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 解析 tokens 为 HTML 内容
   * @param {Array} tokens - token 数组
   * @returns {string} - HTML 内容
   */
  parseTokens(tokens) {
    if (!tokens || tokens.length === 0) {
      return '';
    }
    
    return tokens.map(token => {
      if (token.type === 'text') {
        return this.escapeHtml(token.text || '');
      } else if (token.type === 'strong') {
        const text = this.parseTokens(token.tokens || []);
        return `<strong>${text}</strong>`;
      } else if (token.type === 'em') {
        const text = this.parseTokens(token.tokens || []);
        return `<em>${text}</em>`;
      } else if (token.type === 'codespan') {
        return `<code>${this.escapeHtml(token.text || '')}</code>`;
      } else if (token.type === 'link') {
        const text = this.parseTokens(token.tokens || []);
        return `<a href="${this.escapeHtml(token.href || '')}">${text}</a>`;
      } else if (token.type === 'html') {
        return token.text || '';
      }
      return this.escapeHtml(token.text || '');
    }).join('');
  }

  /**
   * 转换 Markdown 为 HTML
   * @param {string} markdown - Markdown 内容
   * @param {string} customCSS - 自定义 CSS 样式
   * @returns {string} - HTML 内容
   */
  convertMarkdownToHTML(markdown, customCSS = '') {
 const normalizedMarkdown = this.normalizeMarkdownNewlines(markdown || '');
 // 创建自定义渲染器（兼容 marked v16+）
 const renderer = new marked.Renderer();
    
 // 自定义代码块渲染器
 renderer.code = (code, language) => {
       // 代码高亮处理
       const lang = language || 'text';
   return `<pre><code class="language-${lang}">${marked.escape(code)}</code></pre>`;
 };
 
 // 自定义表格渲染器 - marked v16+ API
 renderer.table = (header, body) => {
   // header现在是整个表格对象，body在rows中
   if (header && header.rows) {
     // 生成表头
     let thead = '<tr>';
     header.rows[0].forEach(cell => {
       const cellContent = this.parseTokens(cell.tokens);
       const align = cell.align ? `style="text-align: ${cell.align};"` : '';
       thead += `<th ${align}>${cellContent}</th>`;
     });
     thead += '</tr>';
     
     // 生成表体
     let tbody = '';
     for (let i = 1; i < header.rows.length; i++) {
       tbody += '<tr>';
       header.rows[i].forEach(cell => {
         const cellContent = this.parseTokens(cell.tokens);
         const align = cell.align ? `style="text-align: ${cell.align};"` : '';
         tbody += `<td ${align}>${cellContent}</td>`;
       });
       tbody += '</tr>';
     }
     
     return `<div class="table-container"><table><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
     }
   
   // 后备方案：使用默认渲染器
   return marked.Renderer.prototype.table.call(this, header, body);
 };
 
 // 配置 marked 选项 - 使用默认渲染器以确保兼容性
 const markedOptions = {
   breaks: true,
   gfm: true,
   // 暂时使用默认渲染器，确保表格功能正常
   // renderer: renderer
 };
 
 const htmlBody = marked.parse(normalizedMarkdown, markedOptions);
 const cssStyles = (this.config.defaultCssStyles || '') + '\n' + (customCSS || '');
 
 // 添加表格容器的CSS样式
 const tableCSS = `
   .table-container {
     overflow-x: auto;
     margin: 1em 0;
   }
   .table-container table {
     border-collapse: collapse;
     width: 100%;
     display: table;
   }
 `;
 
 return `
   <!DOCTYPE html>
   <html lang="zh-CN">
   <head>
     <meta charset="UTF-8">
     <meta name="viewport" content="width=device-width, initial-scale=1.0">
     <title>Generated PDF</title>
     <style>${cssStyles}\n${tableCSS}</style>
   </head>
   <body>
     ${htmlBody}
   </body>
   </html>
 `;
  }

  /**
   * 将字面量 \\n / \\t 还原为真实换行，避免整篇 Markdown 被当成一行解析
   * @param {string} text
   * @returns {string}
   */
  normalizeMarkdownNewlines(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    const literalNewlines = (text.match(/\\n/g) || []).length;
    const realNewlines = (text.match(/\n/g) || []).length;
    if (literalNewlines > 0 && realNewlines <= 1) {
      return text
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t');
    }

    return text;
  }

  /**
   * 将 marked 行内 tokens 转为 TextRun
   * @param {Array} tokens
   * @param {Object} options
   * @returns {Array}
   */
  inlineTokensToTextRuns(tokens = [], options = {}) {
    const runs = [];

    tokens.forEach((token) => {
      if (!token) return;

      switch (token.type) {
        case 'text':
          if (token.tokens && token.tokens.length > 0) {
            runs.push(...this.inlineTokensToTextRuns(token.tokens, options));
          } else {
            runs.push(new TextRun({
              text: token.text || '',
              bold: options.bold,
              italics: options.italics
            }));
          }
          break;
        case 'strong':
          runs.push(...this.inlineTokensToTextRuns(
            token.tokens && token.tokens.length ? token.tokens : [{ type: 'text', text: token.text || '' }],
            { ...options, bold: true }
          ));
          break;
        case 'em':
          runs.push(...this.inlineTokensToTextRuns(
            token.tokens && token.tokens.length ? token.tokens : [{ type: 'text', text: token.text || '' }],
            { ...options, italics: true }
          ));
          break;
        case 'codespan':
          runs.push(new TextRun({
            text: token.text || '',
            font: 'Courier New',
            bold: options.bold,
            italics: options.italics
          }));
          break;
        case 'link':
          runs.push(...this.inlineTokensToTextRuns(
            token.tokens && token.tokens.length ? token.tokens : [{ type: 'text', text: token.text || token.href || '' }],
            options
          ));
          break;
        case 'br':
          runs.push(new TextRun({ text: '', break: 1 }));
          break;
        case 'escape':
        case 'html':
          runs.push(new TextRun({
            text: token.text || '',
            bold: options.bold,
            italics: options.italics
          }));
          break;
        default:
          if (token.text) {
            runs.push(new TextRun({
              text: token.text,
              bold: options.bold,
              italics: options.italics
            }));
          }
      }
    });

    return runs.length > 0 ? runs : [new TextRun('')];
  }

  /**
   * 创建带书签的标题段落
   * @param {string} text
   * @param {number} level
   * @param {Object} context
   * @returns {Paragraph}
   */
  createHeadingParagraph(text, level, context) {
    context.bookmarkCounter++;
    context.linkIdCounter++;

    const bookmarkId = `_Toc${context.bookmarkCounter.toString().padStart(5, '0')}`;
    context.headings.push({
      level,
      text,
      bookmark: bookmarkId
    });

    const headingLevel = level === 1 ? HeadingLevel.HEADING_1 :
      level === 2 ? HeadingLevel.HEADING_2 :
      level === 3 ? HeadingLevel.HEADING_3 :
      level === 4 ? HeadingLevel.HEADING_4 :
      level === 5 ? HeadingLevel.HEADING_5 :
      HeadingLevel.HEADING_6;

    return new Paragraph({
      children: [
        new BookmarkStart(bookmarkId, context.linkIdCounter),
        new TextRun({
          text,
          bold: true
        }),
        new BookmarkEnd(bookmarkId)
      ],
      heading: headingLevel,
      spacing: { before: 400, after: 200 }
    });
  }

  /**
   * 创建 Word 表格（docx@8 的 columnWidths 必须是 DXA 数字数组）
   * @param {Array<Array<{runs: Array, isHeader?: boolean}>>} rows
   * @returns {Table|null}
   */
  createDocxTable(rows = []) {
    if (!rows.length) {
      return null;
    }

    const columnCount = Math.max(...rows.map((row) => row.length), 1);
    const contentWidth = 9360;
    const colWidth = Math.max(Math.floor(contentWidth / columnCount), 200);
    const borders = {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' }
    };

    const tableRows = rows.map((row) => {
      const cells = [];
      for (let i = 0; i < columnCount; i++) {
        const cell = row[i] || { runs: [new TextRun('')], isHeader: false };
        const runs = cell.runs && cell.runs.length > 0 ? cell.runs : [new TextRun('')];
        cells.push(new TableCell({
          children: [new Paragraph({ children: runs })],
          width: { size: colWidth, type: WidthType.DXA },
          shading: cell.isHeader ? {
            type: ShadingType.SOLID,
            color: 'F2F2F2',
            fill: 'F2F2F2'
          } : undefined,
          borders
        }));
      }
      return new TableRow({ children: cells });
    });

    return new Table({
      rows: tableRows,
      width: {
        size: colWidth * columnCount,
        type: WidthType.DXA
      },
      columnWidths: Array(columnCount).fill(colWidth)
    });
  }

  /**
   * 将 marked block tokens 转为 docx 元素
   * @param {Array} tokens
   * @param {Object} context
   * @returns {Array}
   */
  convertMarkdownTokensToElements(tokens = [], context) {
    const elements = [];

    tokens.forEach((token) => {
      if (!token || token.type === 'space') {
        return;
      }

      if (token.type === 'heading') {
        elements.push(this.createHeadingParagraph(token.text || '', token.depth || 1, context));
        return;
      }

      if (token.type === 'paragraph') {
        elements.push(new Paragraph({
          children: this.inlineTokensToTextRuns(token.tokens || [{ type: 'text', text: token.text || '' }]),
          spacing: { after: 200 }
        }));
        return;
      }

      if (token.type === 'list') {
        (token.items || []).forEach((item) => {
          const inlineTokens = [];
          (item.tokens || []).forEach((child) => {
            if (child.type === 'text' || child.type === 'paragraph') {
              if (child.tokens && child.tokens.length > 0) {
                inlineTokens.push(...child.tokens);
              } else {
                inlineTokens.push({ type: 'text', text: child.text || '' });
              }
            } else if (child.type !== 'space' && child.type !== 'list') {
              inlineTokens.push(child);
            }
          });

          const itemRuns = this.inlineTokensToTextRuns(
            inlineTokens.length > 0 ? inlineTokens : [{ type: 'text', text: item.text || '' }]
          );
          elements.push(new Paragraph({
            children: [new TextRun('• '), ...itemRuns],
            spacing: { after: 100 },
            indent: { left: 720 }
          }));

          const nestedLists = (item.tokens || []).filter((child) => child.type === 'list');
          if (nestedLists.length > 0) {
            elements.push(...this.convertMarkdownTokensToElements(nestedLists, context));
          }
        });
        return;
      }

      if (token.type === 'table') {
        const headerRow = (token.header || []).map((cell) => ({
          runs: this.inlineTokensToTextRuns(cell.tokens || [{ type: 'text', text: cell.text || '' }], { bold: true }),
          isHeader: true
        }));
        const bodyRows = (token.rows || []).map((row) => row.map((cell) => ({
          runs: this.inlineTokensToTextRuns(cell.tokens || [{ type: 'text', text: cell.text || '' }]),
          isHeader: false
        })));
        const table = this.createDocxTable([headerRow, ...bodyRows]);
        if (table) {
          elements.push(table);
          elements.push(new Paragraph({
            children: [new TextRun('')],
            spacing: { after: 200 }
          }));
        }
        return;
      }

      if (token.type === 'code') {
        elements.push(new Paragraph({
          children: [new TextRun({
            text: token.text || '',
            font: 'Courier New'
          })],
          spacing: { after: 200 }
        }));
        return;
      }

      if (token.type === 'hr') {
        elements.push(new Paragraph({
          children: [new TextRun('')],
          spacing: { before: 200, after: 200 }
        }));
        return;
      }

      if (token.type === 'blockquote') {
        elements.push(...this.convertMarkdownTokensToElements(token.tokens || [], context));
        return;
      }

      if (token.type === 'html') {
        const parsed = this.parseHTMLToParagraphs(token.text || '', true);
        elements.push(...parsed.paragraphs);
        parsed.headings.forEach((heading) => context.headings.push(heading));
        return;
      }

      if (token.text) {
        elements.push(new Paragraph({
          children: [new TextRun(token.text)],
          spacing: { after: 200 }
        }));
      }
    });

    return elements;
  }

  /**
   * 将 Markdown 直接解析为 docx 元素，避免 HTML 正则二次解析丢失列表/表格
   * @param {string} markdown
   * @returns {{paragraphs: Array, headings: Array}}
   */
  parseMarkdownToParagraphs(markdown) {
    const normalized = this.normalizeMarkdownNewlines(markdown || '');
    const headings = [];
    const context = {
      bookmarkCounter: 0,
      linkIdCounter: 0,
      headings
    };
    const tokens = marked.lexer(normalized, {
      gfm: true,
      breaks: true
    });
    const paragraphs = this.convertMarkdownTokensToElements(tokens, context);

    if (paragraphs.length === 0 && normalized.trim()) {
      paragraphs.push(new Paragraph({
        children: [new TextRun(normalized.trim())],
        spacing: { after: 200 }
      }));
    }

    return { paragraphs, headings };
  }

  /**
   * 生成封面页
   * @param {Object} coverData - 封面数据
   * @param {Object} styleConfig - 样式配置
   * @returns {Object} - 封面表格对象 {table: Table, isTable: true}
   */
  createCoverPage(coverData = {}, styleConfig = {}) {
    const {
      title = '文档标题',
      subtitle = '',
      companyName = '',
      version = '',
      date = new Date().toLocaleDateString('zh-CN'),
      author = '',
      department = ''
    } = coverData;

    const colors = {
      primary: styleConfig.primaryColor || '1a5490',
      background: styleConfig.coverBackgroundColor || styleConfig.primaryColor || '1a5490',
      text: styleConfig.coverTextColor || 'FFFFFF',
      textLight: styleConfig.coverTextLightColor || 'FFFFFF'
    };
    
    const fontFamily = styleConfig.fontFamily || 'Microsoft YaHei';
    const blueShading = {
      type: ShadingType.SOLID,
      color: colors.background,
      fill: colors.background
    };
    
    const pageHeight = 15840;
    const pageWidth = 12240;

    const coverTable = new Table({
      width: {
        size: pageWidth,
        type: WidthType.DXA
      },
      rows: [
        new TableRow({
          height: {
            value: pageHeight,
            rule: 'exact'
          },
          cantSplit: true,
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun('')],
                  spacing: { before: 0, after: 0 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: title,
                      bold: true,
                      size: 56,
                      color: colors.text,
                      font: fontFamily
                    })
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 3000, after: 600 }
                }),
                subtitle ? new Paragraph({
                  children: [
                    new TextRun({
                      text: subtitle,
                      size: 28,
                      color: colors.textLight,
                      italics: true,
                      font: fontFamily
                    })
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 0, after: 1800 }
                }) : new Paragraph({ children: [new TextRun('')] }),
                companyName ? new Paragraph({
                  children: [
                    new TextRun({
                      text: companyName,
                      size: 32,
                      bold: true,
                      color: colors.text,
                      font: fontFamily
                    })
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 0, after: 4000 }
                }) : new Paragraph({ children: [new TextRun('')] }),
                version ? new Paragraph({
                  children: [
                    new TextRun({
                      text: `版本：${version}`,
                      size: 22,
                      color: colors.text,
                      font: fontFamily
                    })
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 0, after: 200 }
                }) : new Paragraph({ children: [new TextRun('')] }),
                department ? new Paragraph({
                  children: [
                    new TextRun({
                      text: department,
                      size: 22,
                      color: colors.text,
                      font: fontFamily
                    })
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 0, after: 200 }
                }) : new Paragraph({ children: [new TextRun('')] }),
                author ? new Paragraph({
                  children: [
                    new TextRun({
                      text: `编制：${author}`,
                      size: 22,
                      color: colors.text,
                      font: fontFamily
                    })
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 0, after: 200 }
                }) : new Paragraph({ children: [new TextRun('')] }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: date,
                      size: 22,
                      color: colors.text,
                      font: fontFamily
                    })
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 0, after: 0 }
                })
              ],
              shading: blueShading,
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              verticalAlign: 'center'
            })
          ]
        })
      ],
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    return { table: coverTable, isTable: true };
  }

  /**
   * 生成目录（带超链接）
   * @param {Array} headings - 标题数组
   * @param {Object} styleConfig - 样式配置
   * @returns {Array} - 目录段落数组
   */
  createTableOfContents(headings = [], styleConfig = {}) {
    const colors = {
      primary: styleConfig.primaryColor || '1a5490',
      link: styleConfig.linkColor || '1a5490',
      text: styleConfig.textColor || '333333'
    };
    
    const tocParagraphs = [
      new Paragraph({
        children: [
          new TextRun({
            text: '目  录',
            bold: true,
            size: 36,
            color: colors.primary
          })
        ],
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 600 }
      }),
      new Paragraph({
        children: [new TextRun('')],
        spacing: { after: 300 }
      })
    ];

    headings.forEach((heading) => {
      const indent = (heading.level - 1) * 480;
      const levelPrefix = heading.level === 1 ? '' : '  '.repeat(heading.level - 1);
      
      tocParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: levelPrefix,
              size: 22
            }),
            new InternalHyperlink({
              children: [
                new TextRun({
                  text: heading.text,
                  color: colors.link,
                  size: heading.level === 1 ? 24 : heading.level === 2 ? 22 : 20,
                  bold: heading.level <= 2,
                  underline: {
                    type: 'single',
                    color: colors.link
                  }
                })
              ],
              anchor: heading.bookmark
            })
          ],
          spacing: { 
            before: heading.level === 1 ? 200 : 100, 
            after: heading.level === 1 ? 150 : 100 
          },
          indent: { left: indent },
          tabStops: [
            {
              type: 'right',
              position: 9000,
              leader: 'dot'
            }
          ]
        })
      );
    });

    tocParagraphs.push(
      new Paragraph({
        children: [new PageBreak()]
      })
    );

    return tocParagraphs;
  }

  /**
   * 解码HTML实体
   * @param {string} text - 包含HTML实体的文本
   * @returns {string} - 解码后的文本
   */
  decodeHTMLEntities(text) {
    const entities = {
      '&lt;': '<',
      '&gt;': '>',
      '&amp;': '&',
      '&quot;': '"',
      '&#39;': "'",
      '&nbsp;': ' ',
      '&apos;': "'"
    };
    
    text = text.replace(/&#(\d+);/g, (match, dec) => {
      return String.fromCharCode(dec);
    });
    
    text = text.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
    
    Object.keys(entities).forEach(entity => {
      text = text.replace(new RegExp(entity, 'g'), entities[entity]);
    });
    
    return text;
  }

  /**
   * 解析HTML表格并转换为docx Table对象
   * @param {string} tableHtml - 表格HTML内容
   * @returns {Table|null} - docx Table对象
   */
  parseHTMLTable(tableHtml) {
    const rows = [];

    const collectRows = (html, forceHeader) => {
      const trMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      trMatches.forEach((trHtml, index) => {
        const isHeader = forceHeader || (index === 0 && trHtml.includes('<th'));
        const cells = this.extractTableRowData(trHtml, isHeader);
        if (cells.length > 0) {
          rows.push(cells);
        }
      });
    };
    
    const theadMatch = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
    if (theadMatch) {
      collectRows(theadMatch[1], true);
    }
    
    const tbodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    if (tbodyMatch) {
      collectRows(tbodyMatch[1], false);
    }
    
    if (rows.length === 0) {
      collectRows(tableHtml, false);
    }
    
    return this.createDocxTable(rows);
  }

  /**
   * 提取表格单元格
   * @param {string} trHtml - 行HTML
   * @param {boolean} isHeader - 是否为表头
   * @returns {Array} - 单元格数组
   */
  extractTableRowData(trHtml, isHeader = false) {
    const cells = [];
    const cellMatches = trHtml.match(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi) || [];

    cellMatches.forEach((cellHtml) => {
      const contentMatch = cellHtml.match(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/i);
      const cellContent = contentMatch ? contentMatch[2] : '';
      const textRuns = this.parseHTMLContentToTextRuns(cellContent);
      cells.push({
        runs: textRuns.length > 0 ? textRuns : [new TextRun('')],
        isHeader
      });
    });

    return cells;
  }

  /**
   * 提取并替换HTML中的表格
   * @param {string} htmlContent - HTML内容
   * @returns {Object} - {processedHtml: string, tablePlaceholders: Array}
   */
  extractAndReplaceTables(htmlContent) {
    const tablePlaceholders = [];
    const replacements = [];
    const processedRanges = [];
    let tableIndex = 0;
    
    // 匹配被div包裹的表格（使用更精确的正则表达式）
    const wrappedTableRegex = /<div[^>]*class\s*=\s*["']table-container["'][^>]*>\s*<table[^>]*>([\s\S]*?)<\/table>\s*<\/div>/gi;
    let wrappedMatch;
    
    while ((wrappedMatch = wrappedTableRegex.exec(htmlContent)) !== null) {
      // 提取完整的table标签及其内容
      const fullMatch = wrappedMatch[0];
      const tableMatch = fullMatch.match(/<table[^>]*>([\s\S]*?)<\/table>/is);
      if (tableMatch) {
        const placeholder = `__TABLE_PLACEHOLDER_${tableIndex}__`;
        tablePlaceholders.push({
          placeholder,
          tableHtml: tableMatch[0]
        });
        replacements.push({
          original: fullMatch,
          placeholder: placeholder,
          start: wrappedMatch.index,
          end: wrappedMatch.index + fullMatch.length
        });
        processedRanges.push({
          start: wrappedMatch.index,
          end: wrappedMatch.index + fullMatch.length
        });
        tableIndex++;
      }
    }
    
    // 匹配直接的表格式（不在已处理范围内的）
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gis;
    let tableMatch;
    
    while ((tableMatch = tableRegex.exec(htmlContent)) !== null) {
      const isIncluded = processedRanges.some(range => {
        return tableMatch.index >= range.start && tableMatch.index < range.end;
      });
      
      if (!isIncluded) {
        const placeholder = `__TABLE_PLACEHOLDER_${tableIndex}__`;
        tablePlaceholders.push({
          placeholder,
          tableHtml: tableMatch[0]
        });
        replacements.push({
          original: tableMatch[0],
          placeholder: placeholder,
          start: tableMatch.index,
          end: tableMatch.index + tableMatch[0].length
        });
        processedRanges.push({
          start: tableMatch.index,
          end: tableMatch.index + tableMatch[0].length
        });
        tableIndex++;
      }
    }
    
    // 从后往前替换，避免位置偏移
    let processedHtml = htmlContent;
    replacements.sort((a, b) => b.start - a.start);
    replacements.forEach(rep => {
      processedHtml = processedHtml.substring(0, rep.start) + 
                      rep.placeholder + 
                      processedHtml.substring(rep.end);
    });
    
    // 将占位符替换为标记
    const placeholderPositions = [];
    const placeholderRegex = /__TABLE_PLACEHOLDER_(\d+)__/g;
    let phMatch;
    while ((phMatch = placeholderRegex.exec(processedHtml)) !== null) {
      placeholderPositions.push({
        index: phMatch.index,
        length: phMatch[0].length,
        placeholderIndex: parseInt(phMatch[1])
      });
    }
    
    placeholderPositions.sort((a, b) => b.index - a.index);
    placeholderPositions.forEach(pos => {
      processedHtml = processedHtml.substring(0, pos.index) + 
                     `\n__TABLE_MARKER_${pos.placeholderIndex}__\n` + 
                     processedHtml.substring(pos.index + pos.length);
    });
    
    return { processedHtml, tablePlaceholders };
  }

  /**
   * 解析HTML内容为TextRun数组（处理br、strong、em等标签）
   * @param {string} htmlContent - HTML内容
   * @returns {Array} - TextRun数组
   */
  parseHTMLContentToTextRuns(htmlContent) {
    if (!htmlContent) return [new TextRun('')];
    
    // 将 <br/> 和 <br> 标签替换为特殊标记
    let processed = htmlContent.replace(/<br\s*\/?>/gi, '\n__BR__\n');
    
    // 递归解析HTML节点，处理内联格式
    const parseInlineContent = (html, options = {}) => {
      if (!html) return [];
      
      const runs = [];
      let currentIndex = 0;
      
      // 按顺序查找所有内联标签（strong, em, code等）
      const inlineTagRegex = /<(strong|em|code|a)[^>]*>([\s\S]*?)<\/\1>/gi;
      let match;
      const matches = [];
      
      // 重置正则表达式的lastIndex，确保从头开始匹配
      inlineTagRegex.lastIndex = 0;
      while ((match = inlineTagRegex.exec(html)) !== null) {
        matches.push({
          index: match.index,
          length: match[0].length,
          tag: match[1].toLowerCase(),
          content: match[2],
          fullMatch: match[0]
        });
      }
      
      // 按索引排序
      matches.sort((a, b) => a.index - b.index);
      
      // 处理每个匹配
      matches.forEach(match => {
        // 处理匹配前的文本
        if (match.index > currentIndex) {
          const beforeText = html.substring(currentIndex, match.index);
          // 移除HTML标签，但保留文本内容
          const cleanText = beforeText.replace(/<[^>]*>/g, '');
          if (cleanText) {
            const decoded = this.decodeHTMLEntities(cleanText);
            // 不要使用 trim()，保留所有文本内容
            // 确保创建 TextRun，即使 decoded 是空字符串
            if (decoded !== undefined && decoded !== null) {
              runs.push(new TextRun({
                text: decoded,
                bold: options.bold,
                italics: options.italics
              }));
            } else if (cleanText) {
              runs.push(new TextRun({
                text: cleanText,
                bold: options.bold,
                italics: options.italics
              }));
            }
          }
        }
        
        // 处理匹配的标签内容
        const nestedOptions = { ...options };
        if (match.tag === 'strong') {
          nestedOptions.bold = true;
        } else if (match.tag === 'em') {
          nestedOptions.italics = true;
        }
        
        // 递归处理标签内的内容（纯文本，不包含HTML标签）
        const nestedContent = match.content;
        if (nestedContent) {
          // 移除可能的HTML标签（虽然理论上不应该有）
          const cleanNestedContent = nestedContent.replace(/<[^>]*>/g, '');
          const decodedNestedContent = this.decodeHTMLEntities(cleanNestedContent);
          if (decodedNestedContent !== undefined && decodedNestedContent !== null) {
            runs.push(new TextRun({
              text: decodedNestedContent,
              bold: nestedOptions.bold,
              italics: nestedOptions.italics
            }));
          } else if (cleanNestedContent) {
            runs.push(new TextRun({
              text: cleanNestedContent,
              bold: nestedOptions.bold,
              italics: nestedOptions.italics
            }));
          }
        }
        
        currentIndex = match.index + match.length;
      });
      
      // 处理剩余文本
      if (currentIndex < html.length) {
        const remainingText = html.substring(currentIndex);
        // 移除HTML标签，但保留文本内容
        const cleanText = remainingText.replace(/<[^>]*>/g, '');
        
        // 直接处理，不检查 cleanText 是否为空（因为可能包含空格等）
        const decoded = this.decodeHTMLEntities(cleanText);
        
        // 确保创建 TextRun，即使 decoded 是空字符串
        // 只有当 decoded 是 undefined 或 null 时，才考虑其他选项
        if (decoded !== undefined && decoded !== null) {
          // 对于非 undefined/null 的值（包括空字符串），直接使用 decoded
          runs.push(new TextRun({
            text: decoded,
            bold: options.bold,
            italics: options.italics
          }));
        } else if (cleanText) {
          // 如果 decoded 是 undefined 或 null，使用 cleanText
          runs.push(new TextRun({
            text: cleanText,
            bold: options.bold,
            italics: options.italics
          }));
        } else if (remainingText) {
          // 如果 cleanText 也是空的，尝试处理原始 remainingText
          const decodedRemaining = this.decodeHTMLEntities(remainingText);
          if (decodedRemaining !== undefined && decodedRemaining !== null) {
            runs.push(new TextRun({
              text: decodedRemaining,
              bold: options.bold,
              italics: options.italics
            }));
          } else if (remainingText) {
            runs.push(new TextRun({
              text: remainingText,
              bold: options.bold,
              italics: options.italics
            }));
          }
        } else {
          // 最后的保障，确保至少创建一个空的 TextRun
          runs.push(new TextRun({
            text: '',
            bold: options.bold,
            italics: options.italics
          }));
        }
      } else if (matches.length === 0) {
        // 如果没有匹配到任何标签，但有内容，直接处理整个html
        const cleanText = html.replace(/<[^>]*>/g, '');
        const decoded = this.decodeHTMLEntities(cleanText);
        if (decoded !== undefined && decoded !== null) {
          runs.push(new TextRun({
            text: decoded,
            bold: options.bold,
            italics: options.italics
          }));
        } else if (cleanText) {
          runs.push(new TextRun({
            text: cleanText,
            bold: options.bold,
            italics: options.italics
          }));
        }
      }
      
      // 如果没有匹配到任何标签，且没有生成任何runs，说明整个html就是纯文本
      // 这种情况可能发生在：html中没有内联标签，且currentIndex为0但上面的处理没有生成runs
      // 或者 cleanText 是空字符串导致上面的处理没有生成runs
      if (matches.length === 0 && runs.length === 0) {
        // 直接处理整个html作为纯文本
        const cleanText = html.replace(/<[^>]*>/g, '');
        const decoded = this.decodeHTMLEntities(cleanText);
        // 即使 decoded 是空字符串，也创建一个 TextRun，避免返回空数组
        if (decoded !== undefined && decoded !== null) {
          runs.push(new TextRun({
            text: decoded,
            bold: options.bold,
            italics: options.italics
          }));
        } else if (cleanText) {
          runs.push(new TextRun({
            text: cleanText,
            bold: options.bold,
            italics: options.italics
          }));
        }
      }
      
      // 如果仍然没有runs（理论上不应该到达这里，但作为最后的保障）
      if (runs.length === 0) {
        const cleanText = html.replace(/<[^>]*>/g, '');
        const decoded = this.decodeHTMLEntities(cleanText);
        if (decoded !== undefined && decoded !== null) {
          runs.push(new TextRun({
            text: decoded,
            bold: options.bold,
            italics: options.italics
          }));
        } else if (cleanText) {
          runs.push(new TextRun({
            text: cleanText,
            bold: options.bold,
            italics: options.italics
          }));
        } else {
          // 最后的保障，添加空字符串避免返回空数组
          runs.push(new TextRun({
            text: '',
            bold: options.bold,
            italics: options.italics
          }));
        }
      }
      
      return runs;
    };
    
    // 按换行标记分割内容
    const parts = processed.split('\n__BR__\n');
    const allRuns = [];
    
    parts.forEach((part, index) => {
      // 解析每个部分的内联内容
      const partRuns = parseInlineContent(part);
      allRuns.push(...partRuns);
      
      // 如果不是最后一部分，添加换行
      if (index < parts.length - 1) {
        allRuns.push(new TextRun({ text: '', break: 1 }));
      }
    });
    
    // 如果没有解析到任何内容，至少返回一个包含原始文本的 TextRun
    if (allRuns.length === 0) {
      let cleanText = processed.replace(/<[^>]*>/g, '');
      cleanText = this.decodeHTMLEntities(cleanText);
      // 移除换行标记
      cleanText = cleanText.replace(/\n__BR__\n/g, '\n');
      // 即使 cleanText 是空字符串，也返回一个 TextRun，避免返回空数组
      if (cleanText) {
        return [new TextRun(cleanText)];
      }
      // 如果 cleanText 是空字符串，尝试从原始 htmlContent 中提取
      const originalCleanText = htmlContent.replace(/<[^>]*>/g, '');
      const originalDecoded = this.decodeHTMLEntities(originalCleanText);
      return [new TextRun(originalDecoded || '')];
    }
    
    // 检查 allRuns 中是否有空的 TextRun，如果有，尝试填充内容
    const hasEmptyRuns = allRuns.some(run => !run.text || run.text.trim() === '');
    if (hasEmptyRuns && allRuns.length > 0) {
      // 如果所有 TextRun 都是空的，尝试从原始内容中提取
      const allEmpty = allRuns.every(run => !run.text || run.text.trim() === '');
      if (allEmpty) {
        let cleanText = processed.replace(/<[^>]*>/g, '');
        cleanText = this.decodeHTMLEntities(cleanText);
        cleanText = cleanText.replace(/\n__BR__\n/g, '\n');
        if (cleanText) {
          return [new TextRun(cleanText)];
        }
        // 如果 cleanText 还是空的，尝试从原始 htmlContent 中提取
        const originalCleanText = htmlContent.replace(/<[^>]*>/g, '');
        const originalDecoded = this.decodeHTMLEntities(originalCleanText);
        return [new TextRun(originalDecoded || '')];
      }
    }
    
    return allRuns;
  }

  /**
   * 解析HTML块级元素
   * @param {string} tagName - 标签名
   * @param {string} content - 内容
   * @param {Object} context - 上下文对象 {bookmarkCounter, linkIdCounter, headings}
   * @returns {Paragraph|null} - 段落对象
   */
  parseBlockElement(tagName, content, context) {
    if (!content) return null;
    
    if (tagName.startsWith('h')) {
      const level = parseInt(tagName.charAt(1));
      const textContent = content.replace(/<[^>]*>/g, '').trim();
      return this.createHeadingParagraph(textContent, level, context);
    }
    
    if (tagName === 'p' || tagName === 'div') {
      const textRuns = this.parseHTMLContentToTextRuns(content);
      return new Paragraph({
        children: textRuns,
        spacing: { after: 200 }
      });
    }
    
    if (tagName === 'pre') {
      const textContent = content.replace(/<[^>]*>/g, '').trim();
      return new Paragraph({
        children: [new TextRun({
          text: textContent,
          font: 'Courier New'
        })],
        spacing: { after: 200 }
      });
    }
    
    if (tagName === 'hr') {
      return new Paragraph({
        children: [new TextRun('')],
        spacing: { before: 200, after: 200 }
      });
    }
    
    if (tagName === 'li') {
      let textRuns = this.parseHTMLContentToTextRuns(content);
      if (textRuns.length === 0 || textRuns.every(run => !run.text || run.text.trim() === '')) {
        const cleanText = content.replace(/<[^>]*>/g, '');
        const decoded = this.decodeHTMLEntities(cleanText);
        textRuns = [new TextRun(decoded || '')];
      }
      textRuns.unshift(new TextRun('• '));
      return new Paragraph({
        children: textRuns,
        spacing: { after: 100 },
        indent: { left: 720 }
      });
    }
    
    return null;
  }

  /**
   * 解析 HTML 并转换为 docx 元素数组（支持书签和表格）
   * @param {string} html - HTML 内容
   * @param {boolean} addBookmarks - 是否为标题添加书签
   * @returns {Object} - {paragraphs: Array, headings: Array}
   */
  parseHTMLToParagraphs(html, addBookmarks = true) {
    const headings = [];
    const context = {
      bookmarkCounter: 0,
      linkIdCounter: 0,
      headings
    };
    
    let cleanHtml = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    cleanHtml = cleanHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    const bodyMatch = cleanHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : cleanHtml;
    
    const { processedHtml, tablePlaceholders } = this.extractAndReplaceTables(bodyContent);
    const elements = this.parseProcessedHtml(processedHtml, tablePlaceholders, context);
    
    if (elements.length === 0) {
      const text = bodyContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) {
        elements.push(new Paragraph({
          children: [new TextRun(text)],
          spacing: { after: 200 }
        }));
      }
    }
    
    return { paragraphs: elements, headings };
  }

  /**
   * 解析已替换表格占位符的 HTML 片段
   * @param {string} processedHtml
   * @param {Array} tablePlaceholders
   * @param {Object} context
   * @returns {Array}
   */
  parseProcessedHtml(processedHtml, tablePlaceholders, context) {
    const elements = [];
    const blockRegex = /<(h[1-6]|p|div|li|blockquote|pre|hr)[^>]*>([\s\S]*?)<\/\1>|__TABLE_MARKER_\d+__/gi;
    let match;
    let lastIndex = 0;
    
    while ((match = blockRegex.exec(processedHtml)) !== null) {
      const beforeText = processedHtml.substring(lastIndex, match.index).trim();
      if (beforeText && !beforeText.match(/^__TABLE_MARKER_\d+__$/)) {
        const text = beforeText.replace(/<[^>]*>/g, '').replace(/__TABLE_MARKER_\d+__/g, '').trim();
        if (text) {
          elements.push(new Paragraph({
            children: [new TextRun(text)],
            spacing: { after: 200 }
          }));
        }
      }
      
      const matchedContent = match[0];
      
      const tableMarkerMatch = matchedContent.match(/^__TABLE_MARKER_(\d+)__$/);
      if (tableMarkerMatch) {
        const placeholderIndex = parseInt(tableMarkerMatch[1]);
        if (placeholderIndex >= 0 && placeholderIndex < tablePlaceholders.length) {
          const placeholder = tablePlaceholders[placeholderIndex];
          if (placeholder?.tableHtml) {
            const table = this.parseHTMLTable(placeholder.tableHtml);
            if (table) {
              elements.push(table);
              elements.push(new Paragraph({
                children: [new TextRun('')],
                spacing: { after: 200 }
              }));
            }
          }
        }
        lastIndex = match.index + match[0].length;
        continue;
      }
      
      const tagMatch = matchedContent.match(/<(\w+)[^>]*>/);
      if (tagMatch) {
        const tagName = tagMatch[1].toLowerCase();
        const content = match[2] != null ? match[2] : '';

        const hasNestedBlocks = /<(h[1-6]|p|ul|ol|li|table|div|pre|blockquote)|__TABLE_MARKER_\d+__/i.test(content);
        if (tagName === 'div' && hasNestedBlocks) {
          elements.push(...this.parseProcessedHtml(content, tablePlaceholders, context));
          lastIndex = match.index + match[0].length;
          continue;
        }
        
        const paragraph = this.parseBlockElement(tagName, content, context);
        if (paragraph) {
          elements.push(paragraph);
        }
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    const remainingText = processedHtml.substring(lastIndex).trim();
    if (remainingText && !remainingText.match(/^__TABLE_(PLACEHOLDER|MARKER)_\d+__$/)) {
      const text = remainingText.replace(/<[^>]*>/g, '').replace(/__TABLE_(PLACEHOLDER|MARKER)_\d+__/g, '').trim();
      if (text) {
        elements.push(new Paragraph({
          children: [new TextRun(text)],
          spacing: { after: 200 }
        }));
      }
    }
    
    return elements;
  }
  
  /**
   * 从 HTML 模板生成 Word
   * @param {string} htmlTemplate - HTML 模板内容
   * @param {string} fileName - 文件名（不含扩展名）
   * @param {Object} options - Word 选项
   * @returns {Promise<string>} - Word 文件路径
   */
  async generateWordFromHTML(htmlTemplate, fileName, options = {}) {
    const { paragraphs, headings } = this.parseHTMLToParagraphs(htmlTemplate, true);
    return this.writeWordDocument(fileName, options, paragraphs, headings);
  }

  /**
   * 将已解析的段落写入 docx 文件
   * @param {string} fileName
   * @param {Object} options
   * @param {Array} paragraphs
   * @param {Array} headings
   * @returns {Promise<string>}
   */
  async writeWordDocument(fileName, options = {}, paragraphs = [], headings = []) {
    const outputPath = path.join(this.config.outputDir, `${fileName}.docx`);
    
    try {
      const wordOptions = {
        ...this.config.defaultWordOptions,
        ...options
      };
      
      const sections = [];
      const styleConfig = options.styleConfig || {};
      
      if (options.coverPage) {
        const coverResult = this.createCoverPage(options.coverPage, styleConfig);
        const coverChildren = coverResult.isTable ? [coverResult.table] : coverResult;
        
        sections.push({
          properties: {
            type: SectionType.NEXT_PAGE,
            page: {
              margin: {
                top: 0,
                right: 0,
                bottom: 0,
                left: 0
              },
              size: {
                width: wordOptions.pageSize?.width || 12240,
                height: wordOptions.pageSize?.height || 15840
              }
            }
          },
          children: coverChildren
        });
      }
      
      const contentChildren = [];
      if (options.includeTOC && headings.length > 0) {
        const tocParagraphs = this.createTableOfContents(headings, styleConfig);
        contentChildren.push(...tocParagraphs);
      }
      
      contentChildren.push(...paragraphs);
      
      sections.push({
        properties: {
          type: options.coverPage ? SectionType.NEXT_PAGE : SectionType.CONTINUOUS,
          page: {
            margin: {
              top: wordOptions.margins?.top || 1440,
              right: wordOptions.margins?.right || 1440,
              bottom: wordOptions.margins?.bottom || 1440,
              left: wordOptions.margins?.left || 1440
            },
            size: {
              width: wordOptions.pageSize?.width || 12240,
              height: wordOptions.pageSize?.height || 15840
            }
          }
        },
        children: contentChildren
      });
      
      const doc = new Document({
        sections: sections
      });
      
      const fileBuffer = await Packer.toBuffer(doc);
      fs.writeFileSync(outputPath, fileBuffer);
      
      logger.info('Word 文件生成完成', { outputPath, hasCover: !!options.coverPage, hasTOC: !!options.includeTOC });
      return outputPath;
      
    } catch (error) {
      logger.error('Word 生成失败', { error: error.stack });
      throw new Error(`Word 生成失败: ${error.message}`);
    }
  }
  
  /**
   * 上传文件到平台存储（通过 GeniSpace SDK）
   * @param {string} filePath - 文件路径
   * @param {string} fileName - 文件名（不含扩展名）
   * @param {Object} req - Express 请求对象（包含认证信息）
   * @returns {Promise<string>} - 文件 URL
   */
  async uploadToPlatformStorage(filePath, fileName, req) {
    if (!req || !req.genispace || !req.genispace.client) {
      throw new Error('缺少认证信息，无法上传文件到平台存储');
    }
    
    try {
      const client = req.genispace.client;
      const folderPath = `/tmp/operators/word-documents/${new Date().getFullYear()}/${new Date().getMonth() + 1}`;
      
      logger.info('上传文件到平台存储', {
        fileName,
        folderPath,
        filePath
      });
      
      // 使用 SDK 上传文件
      const file = {
        path: filePath,
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        originalname: `${fileName}.docx`
      };
      
      const uploadedFile = await client.storage.uploadFile(file, {
        folderPath,
        fileName: `${fileName}.docx`
      });
      
      // 返回文件的 publicUrl 或 url
      const fileUrl = uploadedFile.publicUrl || uploadedFile.url;
      
      logger.info('文件上传到平台存储成功', { 
        fileId: uploadedFile.id,
        url: fileUrl 
      });
      
      return fileUrl;
    } catch (error) {
      logger.error('平台存储上传失败', { error: error.stack });
      throw new Error(`平台存储上传失败: ${error.message}`);
    }
  }
  
  /**
   * 清理临时文件
   * @param {...string} filePaths - 文件路径
   */
  cleanupFiles(...filePaths) {
    for (const filePath of filePaths) {
      try {
        // 检查文件是否在临时目录中（安全措施：只删除临时目录中的文件）
        if (fs.existsSync(filePath) && 
            (filePath.includes(this.config.tempDir) || filePath.includes(this.config.outputDir))) {
          fs.unlinkSync(filePath);
          logger.debug('已删除临时文件', { filePath });
        }
      } catch (error) {
        logger.warn('删除临时文件失败', { filePath, error: error.message });
      }
    }
  }
}

module.exports = WordGenerator;
