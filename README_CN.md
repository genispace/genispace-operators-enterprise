# GeniSpace 企业算子库

**🌐 语言**: 中文 | [**English**](README.md)

> 面向AI智能体和工作流的企业级算子集合

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)

## 💡 项目介绍

**GeniSpace 企业算子库**是一个精选的生产就绪算子集合，专为企业用户设计。该项目从 [GeniSpace Custom Operators Library](https://github.com/genispace/operators-custom) Fork而来，专注于为常见企业场景提供稳定、高质量的算子服务。

## 🎯 核心特性

- 📄 **PDF生成器**: 基于HTML/Markdown模板的高级PDF生成功能
- 🏢 **企业就绪**: 生产环境测试验证的算子，配备完整文档
- 🔧 **自动更新**: GeniSpace开发团队自动更新算子到平台
- 🤝 **社区驱动**: 欢迎企业算子贡献和功能建议
- 📦 **企业工具套件**: 精选的业务关键算子集合

## 🚀 快速开始

### 1. 克隆并启动

```bash
git clone https://github.com/genispace/operators-enterprise.git
cd operators-enterprise
npm install
npm start
```

### 2. 访问服务

- 🏠 **主页**: http://localhost:8080
- 📚 **API文档**: http://localhost:8080/api/docs  
- 🔍 **健康检查**: http://localhost:8080/health

### 3. 测试PDF生成器

```bash
# 测试HTML转PDF
curl -X POST http://localhost:8080/api/document/pdf-generator/generate-from-html \
  -H "Content-Type: application/json" \
  -d '{
    "htmlContent": "<h1>企业级服务</h1><p>PDF生成测试</p>",
    "fileName": "test-document"
  }'

# 测试Markdown模板转PDF（带数据）
curl -X POST http://localhost:8080/api/document/pdf-generator/generate-from-markdown \
  -H "Content-Type: application/json" \
  -d '{
    "markdownTemplate": "# {{title}}\n\n**作者**: {{author}}\n\n{{content}}",
    "templateData": {
      "title": "企业报告", 
      "author": "GeniSpace", 
      "content": "这是一个模板示例。"
    },
    "fileName": "enterprise-report"
  }'
```

### 4. GeniSpace平台集成

**🎉 无需手动导入！** 

**GeniSpace开发团队**会自动将该企业算子库更新到GeniSpace平台。该包中的所有算子可直接在平台中使用，无需任何手动导入操作。

## 📦 可用算子

### 📄 PDF生成器

**面向企业PDF生成需求的文档处理算子**

| 接口端点 | 方法 | 描述 |
|----------|--------|-------------|
| `/api/document/pdf-generator/generate-from-html` | POST | 从HTML内容生成PDF |
| `/api/document/pdf-generator/generate-from-markdown` | POST | 从Markdown模板生成PDF |
| `/api/document/pdf-generator/download/{fileName}` | GET | 下载生成的PDF文件 |

**核心功能：**
- ✅ HTML转PDF，支持CSS样式
- ✅ Markdown模板支持，使用Mustache语法
- ✅ 模板数据替换（`{{变量}}`）
- ✅ 多种存储选项（本地/阿里云OSS/腾讯云COS）
- ✅ 中文字体支持（Noto CJK）
- ✅ Docker部署就绪
- ✅ 可配置页面格式和边距

**使用示例：**
```javascript
// 带模板变量的HTML
{
  "htmlContent": "<h1>{{title}}</h1><p>作者: {{author}}</p>",
  "templateData": {
    "title": "企业报告",
    "author": "GeniSpace团队"
  },
  "fileName": "enterprise-report"
}
```

### 🚀 未来算子

更多企业算子即将推出：
- 📧 **邮件服务**: 企业邮件发送和模板服务
- 📊 **Excel处理器**: Excel文件生成和数据处理  
- 🔐 **身份认证**: SSO和企业认证服务
- 🗄️ **数据库连接器**: 企业数据库集成
- 📈 **图表生成器**: 商业图表和报表生成

## 🏗️ 项目结构

```
genispace-operators-enterprise/
├── operators/              # 企业算子集合
│   ├── document/          # 文档处理算子
│   │   └── pdf-generator/ # PDF生成器算子
│   │       ├── pdf-generator.operator.js  # PDF生成器配置
│   │       ├── pdf-generator.routes.js    # PDF生成器业务逻辑
│   │       ├── PDFGenerator.js            # 核心PDF生成服务
│   │       └── README.md                  # 详细文档
│   └── platform/          # 平台算子
│       └── genispace-info/ # GeniSpace平台信息算子
│           ├── genispace-info.operator.js  # 算子配置
│           ├── genispace-info.routes.js    # 业务逻辑
│           └── README.md                   # 文档
├── src/                   # 核心框架
│   ├── config/            # 配置管理
│   ├── core/              # 核心服务（发现、注册、路由）
│   ├── middleware/        # 中间件（认证、日志、错误处理）
│   ├── routes/            # 路由管理
│   ├── services/          # 业务服务
│   └── utils/             # 工具函数
├── outputs/               # 生成的PDF文件存储
├── env.example           # 环境配置模板
├── Dockerfile            # 容器部署配置
└── README.md             # 项目文档
```

## 🔧 配置说明

### 基础配置

复制 `env.example` 为 `.env` 并根据需要配置：

```bash
# 服务器配置
PORT=8080
NODE_ENV=production

# PDF生成器配置  
STORAGE_PROVIDER=LOCAL
PDF_FILE_SERVER_URL=http://localhost:8080/api/document/pdf-generator/download

# GeniSpace认证（可选）
GENISPACE_AUTH_ENABLED=false
GENISPACE_API_BASE_URL=https://api.genispace.com
```

### Docker部署

```bash
# 使用Docker构建和运行
docker build -t genispace-operators-enterprise .
docker run -p 8080:8080 -e NODE_ENV=production genispace-operators-enterprise

# 或使用docker-compose
docker-compose up -d
```

### 生产环境注意事项

- ✅ 启用 `GENISPACE_AUTH_ENABLED=true` 确保安全性
- ✅ 配置云存储（阿里云OSS/腾讯云COS）提高可扩展性  
- ✅ 设置合适的 `PDF_FILE_SERVER_URL` 用于外部访问
- ✅ 监控 `outputs/` 目录磁盘使用情况

## 🤝 贡献企业算子

**欢迎贡献！** 通过提交新的算子和工具帮助我们扩展这个企业工具套件。

### 🎯 我们需要什么

该企业服务包专注于**企业级工具和服务**：

- 📊 **商业智能**: 报告、图表、分析算子
- 📧 **通信服务**: 邮件、短信、通知服务  
- 🗄️ **数据处理**: 数据库连接器、ETL工具、数据转换器
- 🔐 **安全认证**: SSO、身份认证、加密服务
- 📈 **自动化工具**: 工作流工具、调度、监控算子
- 💼 **企业集成**: CRM、ERP、HRM系统连接器

### 🚀 如何贡献

1. **💡 提交想法**: 开启issue提出你的算子建议
2. **🔧 开发算子**: 按照我们的企业标准创建算子
3. **📤 提交PR**: 我们会审核并集成优质贡献
4. **🎉 自动部署**: 通过审核的算子会自动更新到GeniSpace平台

### 📋 企业标准

- ✅ 生产就绪代码，包含完善的错误处理
- ✅ 完整的OpenAPI文档和示例
- ✅ Docker兼容性和可扩展性考虑
- ✅ 安全最佳实践和认证支持

## 🔗 自定义开发

需要自定义算子？从 [**GeniSpace Custom Operators Library**](https://github.com/genispace/operators-custom) 🌟 Fork获得完整的开发灵活性和文档。

## 📞 技术支持

- **官方网站**: [https://genispace.com](https://genispace.com)
- **技术文档**: [https://docs.genispace.com](https://docs.genispace.com)  
- **企业贡献**: 向本仓库提交PR
- **自定义开发**: [GeniSpace Custom Operators Library](https://github.com/genispace/operators-custom)

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。

---

**由 GeniSpace 团队开发**  
*为AI赋能企业级算子*