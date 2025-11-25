# GeniSpace Enterprise Operators Library

**🌐 Language**: [中文](README_CN.md) | **English**

> Enterprise-grade operators collection for AI agents and workflows

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)

## 💡 About This Project

**GeniSpace Enterprise Operators Library** is a curated collection of production-ready operators designed for enterprise use. Forked from [GeniSpace Custom Operators Library](https://github.com/genispace/operators-custom), this package focuses on providing stable, high-quality operators for common enterprise scenarios.

## 🎯 Key Features

- 📄 **PDF Generator**: Advanced PDF generation from HTML/Markdown templates
- 🏢 **Enterprise Ready**: Production-tested operators with comprehensive documentation
- 🔧 **Auto-Updated**: GeniSpace Dev Team automatically updates operators to platform
- 🤝 **Community Driven**: Welcome enterprise operator contributions and proposals
- 📦 **Enterprise Toolkit**: Curated collection of business-critical operators

## 🚀 Quick Start

### 1. Clone and Start

```bash
git clone https://github.com/genispace/operators-enterprise.git
cd operators-enterprise
npm install
npm start
```

### 2. Access Services

- 🏠 **Homepage**: http://localhost:8080
- 📚 **API Documentation**: http://localhost:8080/api/docs  
- 🔍 **Health Check**: http://localhost:8080/health

### 3. Test PDF Generator

```bash
# Test HTML to PDF
curl -X POST http://localhost:8080/api/document/pdf-generator/generate-from-html \
  -H "Content-Type: application/json" \
  -d '{
    "htmlContent": "<h1>Hello Enterprise</h1><p>PDF Generation Test</p>",
    "fileName": "test-document"
  }'

# Test Markdown to PDF with template data
curl -X POST http://localhost:8080/api/document/pdf-generator/generate-from-markdown \
  -H "Content-Type: application/json" \
  -d '{
    "markdownTemplate": "# {{title}}\n\n**Author**: {{author}}\n\n{{content}}",
    "templateData": {
      "title": "Enterprise Report", 
      "author": "GeniSpace", 
      "content": "This is a template example."
    },
    "fileName": "enterprise-report"
  }'
```

### 4. GeniSpace Platform Integration

**🎉 No manual import required!** 

The **GeniSpace Dev Team** automatically updates this Enterprise Operators Library to the GeniSpace platform. All operators in this package are available directly in the platform without manual import.

## 📦 Available Operators

### 📄 PDF Generator

**Document processing operator for enterprise PDF generation needs**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/document/pdf-generator/generate-from-html` | POST | Generate PDF from HTML content |
| `/api/document/pdf-generator/generate-from-markdown` | POST | Generate PDF from Markdown template |
| `/api/document/pdf-generator/download/{fileName}` | GET | Download generated PDF file |

**Key Features:**
- ✅ HTML to PDF conversion with CSS styling
- ✅ Markdown template support with Mustache syntax
- ✅ Template data substitution (`{{variable}}`)
- ✅ Multiple storage options (Local/Aliyun OSS/Tencent COS)
- ✅ Chinese font support (Noto CJK)
- ✅ Docker deployment ready
- ✅ Configurable page formats and margins

**Example Usage:**
```javascript
// HTML with template variables
{
  "htmlContent": "<h1>{{title}}</h1><p>Author: {{author}}</p>",
  "templateData": {
    "title": "Enterprise Report",
    "author": "GeniSpace Team"
  },
  "fileName": "enterprise-report"
}
```

### 🚀 Future Operators

More enterprise operators coming soon:
- 📧 **Email Service**: Enterprise email sending and templating
- 📊 **Excel Processor**: Excel file generation and data processing  
- 🔐 **Authentication**: SSO and enterprise authentication services
- 🗄️ **Database Connector**: Enterprise database integration
- 📈 **Chart Generator**: Business chart and report generation

## 🏗️ Project Structure

```
genispace-operators-enterprise/
├── operators/              # Enterprise operators collection
│   ├── document/          # Document processing operators
│   │   └── pdf-generator/ # PDF generator operator
│   │       ├── pdf-generator.operator.js  # PDF generator configuration
│   │       ├── pdf-generator.routes.js    # PDF generator business logic
│   │       ├── PDFGenerator.js            # Core PDF generation service
│   │       └── README.md                  # Detailed documentation
│   └── platform/          # Platform operators
│       └── genispace-info/ # GeniSpace platform info operator
│           ├── genispace-info.operator.js  # Operator configuration
│           ├── genispace-info.routes.js    # Business logic
│           └── README.md                   # Documentation
├── src/                   # Core framework
│   ├── config/            # Configuration management
│   ├── core/              # Core services (discovery, registry, routing)
│   ├── middleware/        # Middleware (auth, logging, error handling)
│   ├── routes/            # Route management
│   ├── services/          # Business services
│   └── utils/             # Utility functions
├── outputs/               # Generated PDF files storage
├── env.example           # Environment configuration template
├── Dockerfile            # Container deployment configuration
└── README.md             # Project documentation
```

## 🔧 Configuration

### Basic Configuration

Copy `env.example` to `.env` and configure as needed:

```bash
# Server Configuration
PORT=8080
NODE_ENV=production

# PDF Generator Configuration  
STORAGE_PROVIDER=LOCAL
PDF_FILE_SERVER_URL=http://localhost:8080/api/document/pdf-generator/download

# GeniSpace Authentication (Optional)
GENISPACE_AUTH_ENABLED=false
GENISPACE_API_BASE_URL=https://api.genispace.com
```

### Docker Deployment

```bash
# Build and run with Docker
docker build -t genispace-operators-enterprise .
docker run -p 8080:8080 -e NODE_ENV=production genispace-operators-enterprise

# Or use docker-compose
docker-compose up -d
```

### Production Considerations

- ✅ Enable `GENISPACE_AUTH_ENABLED=true` for security
- ✅ Configure cloud storage (Aliyun OSS/Tencent COS) for scalability  
- ✅ Set appropriate `PDF_FILE_SERVER_URL` for external access
- ✅ Monitor `outputs/` directory disk usage

## 🤝 Contributing to Enterprise Operators

**We welcome contributions!** Help us expand this enterprise toolkit by submitting new operators and tools.

### 🎯 What We're Looking For

This enterprise service package focuses on **enterprise-grade tools and services**:

- 📊 **Business Intelligence**: Reports, charts, analytics operators
- 📧 **Communication**: Email, SMS, notification services  
- 🗄️ **Data Processing**: Database connectors, ETL tools, data transformers
- 🔐 **Security & Auth**: SSO, authentication, encryption services
- 📈 **Automation**: Workflow tools, scheduling, monitoring operators
- 💼 **Enterprise Integration**: CRM, ERP, HRM system connectors

### 🚀 How to Contribute

1. **💡 Submit Ideas**: Open an issue with your operator proposal
2. **🔧 Develop**: Create operators following our enterprise standards
3. **📤 Submit PR**: We review and integrate quality contributions
4. **🎉 Auto-Deploy**: Approved operators are automatically updated to GeniSpace platform

### 📋 Enterprise Standards

- ✅ Production-ready code with comprehensive error handling
- ✅ Complete OpenAPI documentation and examples
- ✅ Docker compatibility and scalability considerations
- ✅ Security best practices and authentication support

## 🔗 Custom Development

Need custom operators? Fork from [**GeniSpace Custom Operators Library**](https://github.com/genispace/operators-custom) 🌟 for full development flexibility and documentation.

## 📞 Technical Support

- **Official Website**: [https://genispace.com](https://genispace.com)
- **Documentation**: [https://docs.genispace.com](https://docs.genispace.com)  
- **Enterprise Contributions**: Submit PRs to this repository
- **Custom Development**: [GeniSpace Custom Operators Library](https://github.com/genispace/operators-custom)

## 📄 License

This project is open source under the [MIT License](LICENSE).

---

**Developed by the GeniSpace Team**  
*Empowering AI with enterprise-grade operators*