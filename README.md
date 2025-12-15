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

### 3. Test Operators

Visit the [API Documentation](http://localhost:8080/api/docs) to explore all available operators and their endpoints. Each operator includes detailed documentation with examples:

- **PDF Generator**: See [PDF Generator Documentation](operators/document/pdf-generator/README.md)
- **Word Generator**: See [Word Generator Documentation](operators/document/word-generator/README.md)
- **GeniSpace Info**: See [GeniSpace Info Documentation](operators/platform/genispace-info/README.md)

### 4. GeniSpace Platform Integration

**🎉 No manual import required!** 

The **GeniSpace Dev Team** automatically updates this Enterprise Operators Library to the GeniSpace platform. All operators in this package are available directly in the platform without manual import.

## 📦 Available Operators

This enterprise operators library contains production-ready operators for common enterprise scenarios. Each operator includes comprehensive documentation and examples.

### 📄 Document Processing Operators

| Operator | Description | Documentation |
|----------|-------------|---------------|
| **PDF Generator** | Generate high-quality PDFs from HTML/Markdown templates with Mustache syntax support | [📖 PDF Generator Docs](operators/document/pdf-generator/README.md) |
| **Word Generator** | Generate Word documents from HTML/Markdown templates with cover pages and table of contents | [📖 Word Generator Docs](operators/document/word-generator/README.md) |

### 🏢 Platform Operators

| Operator | Description | Documentation |
|----------|-------------|---------------|
| **GeniSpace Info** | Get GeniSpace platform information including user profiles, teams, and agents | [📖 GeniSpace Info Docs](operators/platform/genispace-info/README.md) |

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
# Note: Files are automatically uploaded to GeniSpace platform storage via SDK

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
- ✅ Files are automatically uploaded to GeniSpace platform storage via SDK
- ✅ Monitor temporary directory disk usage

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