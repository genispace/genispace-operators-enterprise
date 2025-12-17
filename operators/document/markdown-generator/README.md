# Markdown Generator

Markdown文件生成器，支持将Markdown文本转换为.md文件。

## 功能特性

- **模板支持**: 使用Mustache模板语法动态生成Markdown内容
- **多平台兼容**: 支持Unix(LF)、Windows(CRLF)、Mac(CR)换行符格式
- **智能处理**: 自动规范化换行符、去除行尾空格
- **平台集成**: 与GeniSpace平台存储无缝集成
- **语法验证**: 可选的Markdown语法检查功能

## API接口

### 生成Markdown文件

```http
POST /api/markdown-generator/generate
```

**请求体示例**:

```json
{
  "markdownContent": "# {{title}}\n\n**作者**: {{author}}\n\n{{content}}",
  "templateData": {
    "title": "项目文档",
    "author": "张三",
    "content": "这是文档的主要内容。"
  },
  "fileName": "project-doc",
  "lineEnding": "\n"
}
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "mdURL": "https://storage.example.com/markdown/doc.md",
    "fileName": "project-doc.md",
    "fileSize": 2048,
    "lineCount": 25,
    "storageProvider": "platform",
    "generatedAt": "2025-12-17T10:30:00.000Z",
    "processingTimeMs": 150
  }
}
```

### 验证Markdown语法

```http
POST /api/markdown-generator/validate
```

**请求体示例**:

```json
{
  "markdownContent": "# 标题\n\n这是内容"
}
```

## 配置说明

### 换行符类型

- `"\n"` - Unix/Linux (LF) - 默认
- `"\r\n"` - Windows (CRLF)
- `"\r"` - Mac Classic (CR)

### 文件命名

- 文件名会自动添加唯一标识符防止冲突
- 格式: `{fileName}_{timestamp}_{uuid}`
- 如果不提供fileName，默认使用: `markdown_{timestamp}_{uuid}`

## 依赖

- `mustache` - 模板引擎
- `uuid` - 唯一标识符生成
- `axios` - HTTP请求（用于下载远程模板）
- GeniSpace SDK - 平台存储集成

## 错误处理

- `MISSING_MARKDOWN_CONTENT` - 缺少必需的markdownContent参数
- `MARKDOWN_TOO_LARGE` - Markdown内容超过10MB限制
- `INVALID_TEMPLATE_DATA` - templateData格式不正确
- `INVALID_LINE_ENDING` - 换行符类型无效
- `MARKDOWN_GENERATION_FAILED` - Markdown生成失败

## 使用示例

### 基础使用

```javascript
const axios = require('axios');

const response = await axios.post('/api/markdown-generator/generate', {
  markdownContent: '# 我的文档\n\n这是一个测试文档。',
  fileName: 'my-document',
  lineEnding: '\n'
}, {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});

console.log(response.data);
// 输出: { success: true, data: { mdURL: '...', ... } }
```

### 模板使用

```javascript
const template = `
# {{projectName}}

## 概述
{{description}}

## 作者
{{author}}

## 创建时间
{{createdAt}}
`;

const response = await axios.post('/api/markdown-generator/generate', {
  markdownContent: template,
  templateData: {
    projectName: 'GeniSpace项目',
    description: '这是一个强大的AI开发平台',
    author: 'GeniSpace团队',
    createdAt: new Date().toLocaleDateString()
  },
  fileName: 'project-readme'
});
```

## 注意事项

1. 需要在请求头中提供有效的GeniSpace API Key
2. Markdown内容大小限制为10MB
3. 临时文件会自动清理
4. 生成的文件会上传到平台存储并返回访问URL
