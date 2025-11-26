#!/usr/bin/env node

/**
 * PDF Generator 白皮书生成测试脚本
 * 测试两种不同模板生成信息安全管理白皮书
 */

const path = require('path');
const fs = require('fs');
const PDFGenerator = require('../../operators/document/pdf-generator/PDFGenerator');

// 创建 PDFGenerator 实例（使用本地存储）
const pdfGenerator = new PDFGenerator({
  tempDir: path.join(__dirname, '../temp'),
  outputDir: path.resolve(__dirname, '../../outputs/pdf-generator')
});

// 共享的模板数据
const templateData = {
  // 必填变量
  companyName: '示例科技有限公司',
  version: 'v2.0',
  releaseDate: '2025年1月24日',
  lastUpdateDate: '2025年1月24日',
  companyAddress: '北京市朝阳区示例大厦 1001 室',
  securityHotline: '400-123-4567',
  securityEmail: 'security@example.com',
  incidentHotline: '400-123-4568',
  incidentEmail: 'incident@example.com',
  
  // 扩展变量（可选）
  companyIndustry: '金融科技',
  companyScale: '500-1000人',
  establishedDate: '2010年1月',
  mainBusiness: '金融科技、云计算服务、人工智能',
  companyWebsite: 'https://www.example.com',
  companyPhone: '010-12345678',
  securityOfficer: '张安全（首席信息安全官）',
  securityDepartment: '信息安全部',
  department: '信息安全部',
  reviewer: '张安全（首席信息安全官）',
  certifications: 'ISO 27001:2013、等保三级',
  certificationDetails: 'ISO 27001:2013认证（证书号：ISO-2024-001），有效期至2026年12月',
  dataCenterLocation: '北京市、上海市（双活数据中心）',
  additionalAssets: '云服务配置信息、API密钥',
  additionalSecurityGroups: '安全研发组、威胁情报组',
  additionalPhysicalSecurity: '24小时安保巡逻、视频监控全覆盖',
  additionalRegulations: '《金融行业网络安全标准》、《个人信息保护法实施条例》'
};

// PDF 选项
const pdfOptions = {
  format: 'A4',
  margin: {
    top: '1cm',
    right: '1cm',
    bottom: '1cm',
    left: '1cm'
  },
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: false
};

// 样式配置 - 使用 !important 确保中文字体优先级
const cssStyles = `
  body, p, div, span, td, th, li { 
    font-family: 'Noto Sans CJK SC', 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'WenQuanYi Micro Hei', sans-serif !important;
    line-height: 1.6;
    color: #333;
  }
  body {
    max-width: 100%;
    margin: 0;
    padding: 20px;
    font-size: 14px;
  }
  h1, h2, h3, h4, h5, h6 { 
    color: #1a5490;
    margin-top: 2em;
    margin-bottom: 1em;
    font-weight: 600;
    font-family: 'Noto Sans CJK SC', 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'WenQuanYi Micro Hei', sans-serif !important;
  }
  h1 { 
    font-size: 2.5em; 
    border-bottom: 3px solid #1a5490; 
    padding-bottom: 0.5em; 
  }
  h2 { 
    font-size: 2em; 
    border-bottom: 2px solid #2c5aa0; 
    padding-bottom: 0.3em; 
  }
  h3 { font-size: 1.5em; }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
  }
  table th, table td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
  }
  table th {
    background-color: #1a5490;
    color: white;
  }
  ul, ol {
    margin: 1em 0;
    padding-left: 2em;
  }
`;

/**
 * 确保 HTML 包含中文字体设置和字符编码
 * 这个函数会在 Mustache 渲染之前调用，确保模板包含字体设置
 */
function ensureChineseFontSupport(htmlContent) {
  // 检查是否已经是完整的 HTML 文档
  const isCompleteDoc = htmlContent.toLowerCase().includes('<!doctype') || 
                       htmlContent.toLowerCase().includes('<html');
  
  if (isCompleteDoc) {
    // 确保有 charset meta 标签
    if (!htmlContent.includes('charset="UTF-8"') && !htmlContent.includes("charset='UTF-8'") && !htmlContent.includes('charset=UTF-8')) {
      if (htmlContent.includes('<head>')) {
        htmlContent = htmlContent.replace('<head>', '<head>\n  <meta charset="UTF-8">');
      } else if (htmlContent.includes('<html')) {
        htmlContent = htmlContent.replace('<html', '<html>\n<head>\n  <meta charset="UTF-8">\n</head>');
      }
    }
    
    // 确保有中文字体样式 - 使用更具体的选择器确保优先级
    const chineseFontStyle = `<style>
      * {
        font-family: 'Noto Sans CJK SC', 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'WenQuanYi Micro Hei', sans-serif !important;
      }
      body, p, div, span, td, th, li, a, strong, em, b, i, u {
        font-family: 'Noto Sans CJK SC', 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'WenQuanYi Micro Hei', sans-serif !important;
      }
      h1, h2, h3, h4, h5, h6 {
        font-family: 'Noto Sans CJK SC', 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'WenQuanYi Micro Hei', sans-serif !important;
      }
    </style>`;
    
    // 检查是否已经有中文字体设置
    const hasChineseFont = htmlContent.includes('Noto Sans CJK SC') || 
                           htmlContent.includes('Microsoft YaHei') || 
                           htmlContent.includes('PingFang SC') ||
                           htmlContent.includes('Hiragino Sans GB');
    
    if (!hasChineseFont) {
      // 尝试在 </head> 之前插入
      if (htmlContent.includes('</head>')) {
        htmlContent = htmlContent.replace('</head>', `  ${chineseFontStyle}\n</head>`);
      } 
      // 如果没有 </head>，尝试在 <head> 之后插入
      else if (htmlContent.includes('<head>')) {
        htmlContent = htmlContent.replace('<head>', `<head>\n  ${chineseFontStyle}`);
      } 
      // 如果连 <head> 都没有，在 <body> 之前插入
      else if (htmlContent.includes('<body>')) {
        htmlContent = htmlContent.replace('<body>', `<head>\n  <meta charset="UTF-8">\n  ${chineseFontStyle}\n</head>\n<body>`);
      }
      // 如果都没有，在开头插入
      else {
        htmlContent = `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  ${chineseFontStyle}\n</head>\n<body>\n${htmlContent}\n</body>\n</html>`;
      }
    }
    
    return htmlContent;
  }
  
  // 如果不是完整文档，构建完整的 HTML 文档
  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Generated PDF</title>
      <style>
        * {
          font-family: 'Noto Sans CJK SC', 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'WenQuanYi Micro Hei', sans-serif !important;
        }
        ${cssStyles}
      </style>
    </head>
    <body>
      ${htmlContent}
    </body>
    </html>
  `;
}

/**
 * 测试1: 使用 HTML 模板生成白皮书
 */
async function testGenerateWhitePaperFromHTML() {
  console.log('📄 测试1: 使用 HTML 模板生成信息安全管理白皮书...\n');

  try {
    const htmlTemplatePath = path.join(__dirname, 'templates', 'security-white-paper.html');
    let htmlTemplate = fs.readFileSync(htmlTemplatePath, 'utf-8');
    
    // 确保 HTML 模板包含中文字体支持（在 Mustache 渲染之前）
    htmlTemplate = ensureChineseFontSupport(htmlTemplate);
    
    // 由于 generatePDFFromHTML 内部会进行 Mustache 渲染，我们需要确保渲染后的 HTML 也包含字体设置
    // 所以我们在模板的 style 标签中使用 !important 来确保优先级

    const pdfPath = await pdfGenerator.generatePDFFromHTML(
      htmlTemplate,
      templateData,
      '企业信息安全管理白皮书-HTML模板',
      pdfOptions
    );

    const pdfURL = await pdfGenerator.uploadToCloud(pdfPath, '企业信息安全管理白皮书-HTML模板');
    const fileStats = fs.statSync(pdfPath);
    const pageCount = await pdfGenerator.getPDFPageCount(pdfPath);

    console.log('✅ HTML 模板生成成功！');
    console.log(`   - 文件名: 企业信息安全管理白皮书-HTML模板.pdf`);
    console.log(`   - 文件大小: ${(fileStats.size / 1024).toFixed(2)} KB`);
    console.log(`   - 页数: ${pageCount}`);
    console.log(`   - 文件路径: ${pdfURL}\n`);

  } catch (error) {
    console.error('❌ HTML 模板生成失败:', error.message);
    console.error('错误详情:', error.stack);
    throw error;
  }
}

/**
 * 测试2: 使用 Markdown 模板生成白皮书
 */
async function testGenerateWhitePaperFromMarkdown() {
  console.log('📄 测试2: 使用 Markdown 模板生成信息安全管理白皮书...\n');

  try {
    const markdownTemplatePath = path.join(__dirname, 'templates', 'security-white-paper.md');
    const markdownTemplate = fs.readFileSync(markdownTemplatePath, 'utf-8');

    const result = await pdfGenerator.generatePDF({
      markdownTemplate,
      templateData,
      fileName: '企业信息安全管理白皮书-Markdown模板',
      pdfOptions: pdfOptions,
      cssStyles: cssStyles
    });

    console.log('✅ Markdown 模板生成成功！');
    console.log(`   - 文件名: ${result.fileName}`);
    console.log(`   - 文件大小: ${(result.fileSize / 1024).toFixed(2)} KB`);
    console.log(`   - 页数: ${result.pageCount}`);
    console.log(`   - 文件路径: ${result.pdfURL}\n`);

  } catch (error) {
    console.error('❌ Markdown 模板生成失败:', error.message);
    console.error('错误详情:', error.stack);
    throw error;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('🚀 PDF Generator 白皮书生成测试');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 测试1: HTML 模板
    await testGenerateWhitePaperFromHTML();

    // 测试2: Markdown 模板
    await testGenerateWhitePaperFromMarkdown();

    console.log('='.repeat(60));
    console.log('✨ 所有测试完成！');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ 测试执行失败:', error.message);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  main().catch(error => {
    console.error('程序执行失败:', error);
    process.exit(1);
  });
}

module.exports = { testGenerateWhitePaperFromHTML, testGenerateWhitePaperFromMarkdown };

