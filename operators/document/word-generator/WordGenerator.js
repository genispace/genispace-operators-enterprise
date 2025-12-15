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
  WidthType
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
   * 检查认证（必须启用 GENISPACE_AUTH）
   * @param {Object} req - Express 请求对象
   * @throws {Error} 如果未启用认证或缺少认证头
   */
  checkAuth(req) {
    const authEnabled = process.env.GENISPACE_AUTH_ENABLED === 'true' || 
                       process.env.GENISPACE_AUTH === 'true';
    
    if (!authEnabled) {
      throw new Error('必须启用 GENISPACE_AUTH 才能使用此功能');
    }
    
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
      cssStyles = '',
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
      
      const templateContent = await this.resolveTemplateSource(markdownTemplate);
      const filledMarkdown = Mustache.render(templateContent, templateData);
      const htmlContent = this.convertMarkdownToHTML(filledMarkdown, cssStyles);
      const wordPath = await this.generateWordFromHTML(htmlContent, finalFileName, wordOptions);
      
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
   * 转换 Markdown 为 HTML
   * @param {string} markdown - Markdown 内容
   * @param {string} customCSS - 自定义 CSS 样式
   * @returns {string} - HTML 内容
   */
  convertMarkdownToHTML(markdown, customCSS = '') {
    marked.use({
      renderer: {
        code(code, language) {
          const lang = language || 'text';
          return `<pre><code class="language-${lang}">${this.options.sanitize ? marked.utils.escape(code) : code}</code></pre>`;
        },
        table(header, body) {
          return `<div class="table-container"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
        }
      },
      breaks: true,
      gfm: true
    });
    
    const htmlBody = marked.parse(markdown);
    const defaultCSS = `
      body { 
        font-family: 'Microsoft YaHei', 'SimSun', Arial, sans-serif;
        line-height: 1.6;
        color: #333;
        font-size: 12pt;
      }
      h1, h2, h3, h4, h5, h6 { 
        color: #2c3e50;
        margin-top: 1.5em;
        margin-bottom: 0.5em;
      }
      h1 { font-size: 24pt; }
      h2 { font-size: 18pt; }
      h3 { font-size: 14pt; }
      table { border-collapse: collapse; width: 100%; margin: 1em 0; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background-color: #f2f2f2; font-weight: bold; }
      code { background-color: #f4f4f4; padding: 2px 4px; }
      pre { background-color: #f4f4f4; padding: 1em; overflow-x: auto; }
      blockquote { border-left: 4px solid #3498db; margin: 1em 0; padding-left: 1em; color: #666; }
      img { max-width: 100%; height: auto; }
    `;
    
    const cssStyles = customCSS ? `${defaultCSS}\n${customCSS}` : defaultCSS;
    
    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Generated Word</title>
        <style>${cssStyles}</style>
      </head>
      <body>
        ${htmlBody}
      </body>
      </html>
    `;
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
    
    // 提取表头
    const theadMatch = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
    if (theadMatch) {
      const theadRows = theadMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      theadRows.forEach(trHtml => {
        const cells = this.extractTableCells(trHtml, true);
        if (cells.length > 0) {
          rows.push(new TableRow({ children: cells }));
        }
      });
    }
    
    // 提取表体
    const tbodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    if (tbodyMatch) {
      const tbodyRows = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      tbodyRows.forEach(trHtml => {
        const cells = this.extractTableCells(trHtml, false);
        if (cells.length > 0) {
          rows.push(new TableRow({ children: cells }));
        }
      });
    }
    
    // 如果没有thead和tbody，直接解析tr
    if (rows.length === 0) {
      const allRows = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      allRows.forEach((trHtml, index) => {
        const isHeader = index === 0 || trHtml.includes('<th');
        const cells = this.extractTableCells(trHtml, isHeader);
        if (cells.length > 0) {
          rows.push(new TableRow({ children: cells }));
        }
      });
    }
    
    if (rows.length === 0) {
      return null;
    }
    
    const columnCount = rows[0]?.children?.length || 0;
    
    return new Table({
      rows: rows,
      width: {
        size: 100,
        type: WidthType.PERCENTAGE
      },
      columnWidths: Array(columnCount).fill(100 / columnCount).map(w => ({
        size: w,
        type: WidthType.PERCENTAGE
      }))
    });
  }

  /**
   * 提取表格单元格
   * @param {string} trHtml - 行HTML
   * @param {boolean} isHeader - 是否为表头
   * @returns {Array} - 单元格数组
   */
  extractTableCells(trHtml, isHeader = false) {
    const cells = [];
    const cellMatches = trHtml.match(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi) || [];
    
    cellMatches.forEach(cellHtml => {
      let cellText = cellHtml.replace(/<[^>]*>/g, '');
      cellText = this.decodeHTMLEntities(cellText).trim();
      
      cells.push(new TableCell({
        children: [new Paragraph({
          children: [new TextRun({
            text: cellText,
            bold: isHeader
          })]
        })],
        shading: isHeader ? {
          type: ShadingType.SOLID,
          color: 'F2F2F2',
          fill: 'F2F2F2'
        } : undefined
      }));
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
    
    // 匹配被div包裹的表格
    const wrappedTableRegex = /<div[^>]*class=["']table-container["'][^>]*>[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>[\s\S]*?<\/div>/gi;
    let wrappedMatch;
    
    while ((wrappedMatch = wrappedTableRegex.exec(htmlContent)) !== null) {
      const tableMatch = wrappedMatch[0].match(/<table[^>]*>([\s\S]*?)<\/table>/is);
      if (tableMatch) {
        const placeholder = `__TABLE_PLACEHOLDER_${tableIndex}__`;
        tablePlaceholders.push({
          placeholder,
          tableHtml: tableMatch[0]
        });
        replacements.push({
          original: wrappedMatch[0],
          placeholder: placeholder,
          start: wrappedMatch.index,
          end: wrappedMatch.index + wrappedMatch[0].length
        });
        processedRanges.push({
          start: wrappedMatch.index,
          end: wrappedMatch.index + wrappedMatch[0].length
        });
        tableIndex++;
      }
    }
    
    // 匹配直接的表格式
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
      context.bookmarkCounter++;
      context.linkIdCounter++;
      
      const bookmarkId = `_Toc${context.bookmarkCounter.toString().padStart(5, '0')}`;
      
      context.headings.push({
        level,
        text: content,
        bookmark: bookmarkId
      });
      
      return new Paragraph({
        children: [
          new BookmarkStart(bookmarkId, context.linkIdCounter),
          new TextRun({
            text: content,
            bold: true
          }),
          new BookmarkEnd(bookmarkId)
        ],
        heading: level === 1 ? HeadingLevel.HEADING_1 : 
                level === 2 ? HeadingLevel.HEADING_2 :
                level === 3 ? HeadingLevel.HEADING_3 :
                level === 4 ? HeadingLevel.HEADING_4 :
                level === 5 ? HeadingLevel.HEADING_5 :
                HeadingLevel.HEADING_6,
        spacing: { before: 400, after: 200 }
      });
    }
    
    if (tagName === 'p' || tagName === 'div') {
      return new Paragraph({
        children: [new TextRun(content)],
        spacing: { after: 200 }
      });
    }
    
    if (tagName === 'pre') {
      return new Paragraph({
        children: [new TextRun({
          text: content,
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
      return new Paragraph({
        children: [new TextRun(`• ${content}`)],
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
    const elements = [];
    const headings = [];
    const context = {
      bookmarkCounter: 0,
      linkIdCounter: 0,
      headings
    };
    
    // 清理HTML
    let cleanHtml = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    cleanHtml = cleanHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    const bodyMatch = cleanHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : cleanHtml;
    
    // 提取并替换表格
    const { processedHtml, tablePlaceholders } = this.extractAndReplaceTables(bodyContent);
    
    // 解析块级元素
    const blockRegex = /<(h[1-6]|p|div|li|ul|ol|blockquote|pre|hr)[^>]*>([\s\S]*?)<\/\1>|__TABLE_MARKER_\d+__/gi;
    let match;
    let lastIndex = 0;
    
    while ((match = blockRegex.exec(processedHtml)) !== null) {
      // 处理匹配前的文本
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
      
      // 处理表格标记
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
      
      // 处理其他块级元素
      const tagMatch = matchedContent.match(/<(\w+)[^>]*>/);
      if (tagMatch) {
        const tagName = tagMatch[1].toLowerCase();
        const contentMatch = matchedContent.match(/<[^>]*>([\s\S]*?)<\/[^>]+>/);
        const content = contentMatch ? contentMatch[1].replace(/<[^>]*>/g, '').trim() : '';
        
        const paragraph = this.parseBlockElement(tagName, content, context);
        if (paragraph) {
          elements.push(paragraph);
        }
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    // 处理剩余文本
    const remainingText = processedHtml.substring(lastIndex).trim();
    if (remainingText && !remainingText.match(/^__TABLE_PLACEHOLDER_\d+__$/)) {
      const text = remainingText.replace(/<[^>]*>/g, '').replace(/__TABLE_PLACEHOLDER_\d+__/g, '').trim();
      if (text) {
        elements.push(new Paragraph({
          children: [new TextRun(text)],
          spacing: { after: 200 }
        }));
      }
    }
    
    // 如果没有解析到任何元素，至少添加一个包含所有文本的段落
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
   * 从 HTML 模板生成 Word
   * @param {string} htmlTemplate - HTML 模板内容
   * @param {string} fileName - 文件名（不含扩展名）
   * @param {Object} options - Word 选项
   * @returns {Promise<string>} - Word 文件路径
   */
  async generateWordFromHTML(htmlTemplate, fileName, options = {}) {
    const outputPath = path.join(this.config.outputDir, `${fileName}.docx`);
    
    try {
      const wordOptions = {
        ...this.config.defaultWordOptions,
        ...options
      };
      
      const sections = [];
      const styleConfig = options.styleConfig || {};
      
      // 封面页
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
      
      // 解析 HTML 内容
      const { paragraphs, headings } = this.parseHTMLToParagraphs(htmlTemplate, true);
      
      // 目录和正文
      const contentChildren = [];
      if (options.includeTOC && headings.length > 0) {
        const tocParagraphs = this.createTableOfContents(headings, styleConfig);
        contentChildren.push(...tocParagraphs);
      }
      
      contentChildren.push(...paragraphs);
      
      // 正文部分
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
      const folderPath = `word-documents/${new Date().getFullYear()}/${new Date().getMonth() + 1}`;
      
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
