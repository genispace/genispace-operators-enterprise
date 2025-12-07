#!/usr/bin/env node

/**
 * Word Generator 白皮书生成测试脚本
 * 测试两种不同模板生成信息安全管理白皮书
 */

const path = require('path');
const fs = require('fs');
const WordGenerator = require('../../operators/document/word-generator/WordGenerator');
const Mustache = require('mustache');

// 创建 WordGenerator 实例（使用本地存储）
const wordGenerator = new WordGenerator({
  tempDir: path.resolve(__dirname, '../../temp'),
  outputDir: path.resolve(__dirname, '../../outputs/word-generator'),
  storageProvider: 'LOCAL'
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

// Word 选项
const wordOptions = {
  orientation: 'portrait',
  margins: {
    top: 1440,
    right: 1440,
    bottom: 1440,
    left: 1800
  },
  pageSize: {
    width: 12240,
    height: 15840
  }
};

// 样式配置
const styleConfig = {
  primaryColor: '1a5490',
  secondaryColor: '2c5aa0',
  backgroundColor: 'FFFFFF',
  coverBackgroundColor: '1a5490',
  textColor: '333333',
  textLightColor: '666666',
  infoBackgroundColor: 'FFFFFF',
  linkColor: '1a5490',
  coverTextColor: 'FFFFFF',
  coverTextLightColor: 'FFFFFF',
  fontFamily: 'Microsoft YaHei'
};

/**
 * 测试1: 使用 HTML 模板生成白皮书
 */
async function testGenerateWhitePaperFromHTML() {
  console.log('📄 测试1: 使用 HTML 模板生成信息安全管理白皮书...\n');

  try {
    const htmlTemplatePath = path.join(__dirname, 'templates', 'security-white-paper.html');
    const htmlTemplate = fs.readFileSync(htmlTemplatePath, 'utf-8');
    const htmlContent = Mustache.render(htmlTemplate, templateData);

    const wordPath = await wordGenerator.generateWordFromHTML(
      htmlContent,
      '企业信息安全管理白皮书-HTML模板',
      {
        ...wordOptions,
        coverPage: {
          title: '信息安全管理白皮书',
          subtitle: '企业信息安全体系建设指南',
          companyName: templateData.companyName,
          version: templateData.version,
          date: templateData.releaseDate,
          author: templateData.reviewer,
          department: templateData.department
        },
        includeTOC: true,
        styleConfig: styleConfig
      }
    );

    const wordURL = await wordGenerator.uploadToCloud(wordPath, '企业信息安全管理白皮书-HTML模板');
    const fileStats = fs.statSync(wordPath);

    console.log('✅ HTML 模板生成成功！');
    console.log(`   - 文件名: 企业信息安全管理白皮书-HTML模板.docx`);
    console.log(`   - 文件大小: ${(fileStats.size / 1024).toFixed(2)} KB`);
    console.log(`   - 文件路径: ${wordURL}\n`);

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

    const result = await wordGenerator.generateWord({
      markdownTemplate,
      templateData,
      fileName: '企业信息安全管理白皮书-Markdown模板',
      wordOptions: {
        ...wordOptions,
        coverPage: {
          title: '信息安全管理白皮书',
          subtitle: '企业信息安全体系建设指南',
          companyName: templateData.companyName,
          version: templateData.version,
          date: templateData.releaseDate,
          author: templateData.reviewer,
          department: templateData.department
        },
        includeTOC: true,
        styleConfig: styleConfig
      }
    });

    console.log('✅ Markdown 模板生成成功！');
    console.log(`   - 文件名: ${result.fileName}`);
    console.log(`   - 文件大小: ${(result.fileSize / 1024).toFixed(2)} KB`);
    console.log(`   - 文件路径: ${result.wordURL}\n`);

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
  console.log('🚀 Word Generator 白皮书生成测试');
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
