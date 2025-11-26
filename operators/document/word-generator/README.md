# Word 生成算子

GeniSpace Word Generator 算子，支持从 HTML 和 Markdown 模板生成高质量的 Word 文档。

## 📋 算子信息

- **名称**: word-generator
- **分类**: document
- **版本**: 1.0.0
- **作者**: GeniSpace AI Team

## 🚀 功能特性

### ✅ 核心功能
- ✅ HTML转Word - 支持复杂HTML结构和CSS样式
- ✅ Markdown模板转Word - 支持Mustache模板语法和JSON数据填充
- ✅ 封面页生成 - 支持自定义封面页（蓝色背景、标题、公司信息等）
- ✅ 自动目录生成 - 支持自动生成可点击的目录（Table of Contents）
- ✅ 云存储集成 - 支持阿里云OSS、腾讯云COS、本地存储
- ✅ 高质量渲染 - 基于docx库的标准Word文档输出
- ✅ 自定义样式 - 支持页面设置和格式选项
- ✅ 错误处理 - 完善的参数验证和异常处理

### 🆕 算子平台集成
- ✅ OpenAPI 规范 - 完整的API文档和类型定义
- ✅ 统一响应格式 - 符合GeniSpace平台标准
- ✅ 健康检查 - 服务状态监控
- ✅ 错误处理 - 标准化错误响应

## 📡 API 接口

### 基础URL
```
http://localhost:8080/api/document/word-generator
```

### 下载URL
```
http://localhost:8080/api/document/word-generator/download/{fileName}
```
> 注意：下载功能作为Word生成算子的配套服务，但不在OpenAPI规范中定义

### 1. HTML转Word
**POST** `/generate-from-html`

支持Mustache模板语法和静态HTML内容：

```bash
# 使用模板变量（推荐）
curl -X POST http://localhost:8080/api/document/word-generator/generate-from-html \
  -H "Content-Type: application/json" \
  -d '{
    "htmlContent": "<h1>{{title}}</h1><p>作者: {{author}}</p><p>时间: {{date}}</p>",
    "templateData": {
      "title": "测试报告",
      "author": "张三",
      "date": "2025年1月24日"
    },
    "fileName": "template-report"
  }'

# 带封面页和目录
curl -X POST http://localhost:8080/api/document/word-generator/generate-from-html \
  -H "Content-Type: application/json" \
  -d '{
    "htmlContent": "<h1>第一章</h1><p>内容...</p><h2>第二章</h2><p>内容...</p>",
    "fileName": "report-with-cover",
    "wordOptions": {
      "coverPage": {
        "title": "项目报告",
        "subtitle": "项目总结报告",
        "companyName": "示例公司",
        "version": "v1.0",
        "date": "2025年1月24日",
        "author": "张三",
        "department": "技术部"
      },
      "includeTOC": true,
      "styleConfig": {
        "primaryColor": "1a5490",
        "coverBackgroundColor": "1a5490",
        "coverTextColor": "FFFFFF",
        "fontFamily": "Microsoft YaHei"
      }
    }
  }'

# 静态HTML内容
curl -X POST http://localhost:8080/api/document/word-generator/generate-from-html \
  -H "Content-Type: application/json" \
  -d '{
    "htmlContent": "<h1>测试报告</h1><p>这是一个HTML转Word的测试。</p>",
    "cssStyles": "h1 { color: blue; }",
    "fileName": "static-report"
  }'
```

### 2. Markdown模板转Word
**POST** `/generate-from-markdown`

支持Mustache模板语法，templateData为可选参数：

```bash
# 使用模板变量
curl -X POST http://localhost:8080/api/document/word-generator/generate-from-markdown \
  -H "Content-Type: application/json" \
  -d '{
    "markdownTemplate": "# {{title}}\n\n作者: {{author}}\n\n{{content}}",
    "templateData": {
      "title": "项目报告",
      "author": "张三",
      "content": "这是报告的主要内容。"
    },
    "fileName": "project-report"
  }'

# 带封面页和目录
curl -X POST http://localhost:8080/api/document/word-generator/generate-from-markdown \
  -H "Content-Type: application/json" \
  -d '{
    "markdownTemplate": "# 第一章\n\n内容...\n\n## 1.1 小节\n\n内容...\n\n# 第二章\n\n内容...",
    "fileName": "markdown-report",
    "wordOptions": {
      "coverPage": {
        "title": "项目报告",
        "subtitle": "项目总结报告",
        "companyName": "示例公司",
        "version": "v1.0",
        "date": "2025年1月24日",
        "author": "张三",
        "department": "技术部"
      },
      "includeTOC": true
    }
  }'

# 静态Markdown内容
curl -X POST http://localhost:8080/api/document/word-generator/generate-from-markdown \
  -H "Content-Type: application/json" \
  -d '{
    "markdownTemplate": "# 静态报告\n\n这是静态Markdown内容。",
    "fileName": "static-markdown"
  }'
```

## 📝 请求参数说明

### HTML转Word参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| htmlContent | string | 是 | HTML内容，支持Mustache模板语法 |
| templateData | object | 否 | 填充HTML模板的JSON数据 |
| cssStyles | string | 否 | 自定义CSS样式 |
| fileName | string | 否 | 输出文件名（不含扩展名） |
| wordOptions | object | 否 | Word生成选项 |

### Word选项 (wordOptions)

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| orientation | string | 'portrait' | 页面方向：'portrait' 或 'landscape' |
| margins | object | 见下方 | 页面边距（单位：twips，1英寸=1440 twips） |
| pageSize | object | 见下方 | 页面尺寸（单位：twips） |
| coverPage | object | null | 封面页配置（可选） |
| includeTOC | boolean | false | 是否包含目录（Table of Contents） |
| styleConfig | object | {} | 样式配置（可选） |

**默认边距**:
```json
{
  "top": 1440,
  "right": 1440,
  "bottom": 1440,
  "left": 1440
}
```

**默认页面尺寸** (A4):
```json
{
  "width": 12240,
  "height": 15840
}
```

**封面页配置 (coverPage)**:
```json
{
  "title": "文档标题",
  "subtitle": "副标题（可选）",
  "companyName": "公司名称（可选）",
  "version": "版本号（可选）",
  "date": "日期",
  "author": "作者（可选）",
  "department": "部门（可选）"
}
```

**样式配置 (styleConfig)**:
```json
{
  "primaryColor": "1a5490",
  "secondaryColor": "2c5aa0",
  "backgroundColor": "FFFFFF",
  "coverBackgroundColor": "1a5490",
  "textColor": "333333",
  "textLightColor": "666666",
  "coverTextColor": "FFFFFF",
  "coverTextLightColor": "FFFFFF",
  "linkColor": "1a5490",
  "fontFamily": "Microsoft YaHei"
}
```

> 注意：颜色值使用十六进制格式（不含 # 号），例如 `1a5490` 表示 `#1a5490`

### Markdown转Word参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| markdownTemplate | string | 是 | Markdown模板内容，支持Mustache语法 |
| templateData | object | 否 | 填充模板的JSON数据 |
| fileName | string | 否 | 输出文件名（不含扩展名） |
| cssStyles | string | 否 | 自定义CSS样式 |
| wordOptions | object | 否 | Word生成选项 |

## 📤 响应格式

### 成功响应

```json
{
  "success": true,
  "data": {
    "wordURL": "http://localhost:8080/api/document/word-generator/download/report-2025.docx",
    "fileName": "report-2025.docx",
    "fileSize": 245760,
    "storageProvider": "local",
    "generatedAt": "2025-01-24T10:30:00.000Z",
    "processingTimeMs": 2500
  },
  "message": "Word生成成功"
}
```

### 错误响应

```json
{
  "success": false,
  "error": "缺少必需的HTML内容",
  "code": "MISSING_HTML_CONTENT",
  "statusCode": 400
}
```

## 🔧 配置说明

### 环境变量

Word生成算子支持以下环境变量配置：

#### 存储配置
- `STORAGE_PROVIDER`: 存储提供商，可选值：`LOCAL`、`ALIYUN_OSS`、`TENCENT_COS`（默认：`LOCAL`）
- `WORD_FILE_SERVER_URL`: Word文件服务器URL（可选，用于本地存储时生成下载链接）

#### 阿里云OSS配置
- `ALIYUN_OSS_REGION`: OSS区域
- `ALIYUN_ACCESS_KEY_ID`: Access Key ID
- `ALIYUN_ACCESS_KEY_SECRET`: Access Key Secret
- `ALIYUN_OSS_BUCKET`: OSS存储桶名称
- `ALIYUN_OSS_ENDPOINT`: OSS端点（可选）
- `ALIYUN_OSS_CUSTOM_DOMAIN`: 自定义域名（可选）

#### 腾讯云COS配置
- `TENCENT_SECRET_ID`: Secret ID
- `TENCENT_SECRET_KEY`: Secret Key
- `TENCENT_COS_BUCKET`: COS存储桶名称
- `TENCENT_COS_REGION`: COS区域
- `TENCENT_COS_CUSTOM_DOMAIN`: 自定义域名（可选）

#### 服务器配置
- `PROTOCOL`: 协议（默认：`http`）
- `HOST`: 主机地址（默认：`localhost`）
- `PORT`: 端口号（默认：`8080`）

## 📦 依赖项

Word生成算子需要以下依赖：

- `docx`: ^8.5.0 - Word文档生成库
- `marked`: ^16.3.0 - Markdown解析库
- `mustache`: ^4.2.0 - 模板引擎
- `ali-oss`: ^6.23.0 - 阿里云OSS SDK
- `cos-nodejs-sdk-v5`: ^2.15.4 - 腾讯云COS SDK

## 🎯 使用示例

### JavaScript示例

```javascript
const axios = require('axios');

// 基础示例：HTML转Word
async function generateWordFromHTML() {
  try {
    const response = await axios.post(
      'http://localhost:8080/api/document/word-generator/generate-from-html',
      {
        htmlContent: '<h1>{{title}}</h1><p>{{content}}</p>',
        templateData: {
          title: '我的报告',
          content: '这是报告内容。'
        },
        fileName: 'my-report',
        wordOptions: {
          orientation: 'portrait',
          margins: {
            top: 1440,
            right: 1440,
            bottom: 1440,
            left: 1440
          }
        }
      }
    );
    
    console.log('Word生成成功:', response.data);
    console.log('下载URL:', response.data.data.wordURL);
  } catch (error) {
    console.error('Word生成失败:', error.response?.data || error.message);
  }
}

// 完整示例：带封面页和目录
async function generateWordWithCoverAndTOC() {
  try {
    const response = await axios.post(
      'http://localhost:8080/api/document/word-generator/generate-from-html',
      {
        htmlContent: `
          <h1>第一章 概述</h1>
          <p>这是第一章的内容...</p>
          <h2>1.1 背景</h2>
          <p>背景介绍...</p>
          <h1>第二章 详细内容</h1>
          <p>这是第二章的内容...</p>
        `,
        fileName: 'complete-report',
        wordOptions: {
          coverPage: {
            title: '项目报告',
            subtitle: '项目总结报告',
            companyName: '示例科技有限公司',
            version: 'v1.0',
            date: '2025年1月24日',
            author: '张三',
            department: '技术部'
          },
          includeTOC: true,
          styleConfig: {
            primaryColor: '1a5490',
            coverBackgroundColor: '1a5490',
            coverTextColor: 'FFFFFF',
            coverTextLightColor: 'FFFFFF',
            linkColor: '1a5490',
            fontFamily: 'Microsoft YaHei'
          },
          margins: {
            top: 1440,
            right: 1440,
            bottom: 1440,
            left: 1800
          }
        }
      }
    );
    
    console.log('Word生成成功:', response.data);
    console.log('下载URL:', response.data.data.wordURL);
  } catch (error) {
    console.error('Word生成失败:', error.response?.data || error.message);
  }
}

generateWordFromHTML();
generateWordWithCoverAndTOC();
```

### Python示例

```python
import requests

# 基础示例：Markdown转Word
def generate_word_from_markdown():
    url = 'http://localhost:8080/api/document/word-generator/generate-from-markdown'
    data = {
        'markdownTemplate': '# {{title}}\n\n{{content}}',
        'templateData': {
            'title': '项目报告',
            'content': '这是报告内容。'
        },
        'fileName': 'project-report'
    }
    
    response = requests.post(url, json=data)
    
    if response.status_code == 200:
        result = response.json()
        print('Word生成成功:', result['data']['wordURL'])
    else:
        print('Word生成失败:', response.json())

# 完整示例：带封面页和目录
def generate_word_with_cover_and_toc():
    url = 'http://localhost:8080/api/document/word-generator/generate-from-markdown'
    data = {
        'markdownTemplate': '''
# 第一章 概述

这是第一章的内容。

## 1.1 背景

背景介绍...

# 第二章 详细内容

这是第二章的内容。
        ''',
        'fileName': 'complete-markdown-report',
        'wordOptions': {
            'coverPage': {
                'title': '项目报告',
                'subtitle': '项目总结报告',
                'companyName': '示例科技有限公司',
                'version': 'v1.0',
                'date': '2025年1月24日',
                'author': '张三',
                'department': '技术部'
            },
            'includeTOC': True,
            'styleConfig': {
                'primaryColor': '1a5490',
                'coverBackgroundColor': '1a5490',
                'coverTextColor': 'FFFFFF',
                'fontFamily': 'Microsoft YaHei'
            }
        }
    }
    
    response = requests.post(url, json=data)
    
    if response.status_code == 200:
        result = response.json()
        print('Word生成成功:', result['data']['wordURL'])
    else:
        print('Word生成失败:', response.json())

generate_word_from_markdown()
generate_word_with_cover_and_toc()
```

## 📋 模板语法说明

### Mustache 模板语法

Word生成算子支持使用 [Mustache](https://mustache.github.io/) 模板语法，允许在HTML和Markdown模板中使用变量进行动态内容填充。

#### 基础语法

- **变量替换**: `{{variableName}}` - 将变量值插入到模板中
- **条件渲染**: `{{#variable}}...{{/variable}}` - 当变量存在且为真值时显示内容
- **条件取反**: `{{^variable}}...{{/variable}}` - 当变量不存在或为假值时显示内容
- **HTML转义**: `{{{variable}}}` - 输出原始HTML（不转义）
- **注释**: `{{! 这是注释 }}` - 模板注释，不会输出到文档中

#### 使用示例

**HTML模板示例**:
```html
<h1>{{title}}</h1>
<p>作者: {{author}}</p>
<p>日期: {{date}}</p>

{{#hasContent}}
<div>
  <h2>内容</h2>
  <p>{{content}}</p>
</div>
{{/hasContent}}

{{^hasContent}}
<p>暂无内容</p>
{{/hasContent}}
```

**Markdown模板示例**:
```markdown
# {{title}}

作者: {{author}}  
日期: {{date}}

{{#sections}}
## {{sectionTitle}}

{{sectionContent}}
{{/sections}}
```

**对应的模板数据**:
```javascript
const templateData = {
  title: '项目报告',
  author: '张三',
  date: '2025年1月24日',
  hasContent: true,
  content: '这是报告的主要内容...',
  sections: [
    {
      sectionTitle: '第一章',
      sectionContent: '第一章内容...'
    },
    {
      sectionTitle: '第二章',
      sectionContent: '第二章内容...'
    }
  ]
};
```

#### 数组和对象处理

Mustache支持数组和对象的迭代：

```html
<!-- 数组迭代 -->
<ul>
{{#items}}
  <li>{{.}}</li>
{{/items}}
</ul>

<!-- 对象属性访问 -->
<p>姓名: {{user.name}}</p>
<p>邮箱: {{user.email}}</p>

<!-- 嵌套对象 -->
{{#company}}
  <h2>{{name}}</h2>
  <p>地址: {{address.city}}, {{address.street}}</p>
{{/company}}
```

#### 表格渲染

Word生成算子支持HTML表格的渲染，会自动识别 `<table>`、`<thead>`、`<tbody>`、`<tr>`、`<th>`、`<td>` 标签并转换为Word表格。

**HTML表格示例**:

```html
<h3>事件级别表</h3>
<table>
  <thead>
    <tr>
      <th>级别</th>
      <th>定义</th>
      <th>响应时间</th>
      <th>示例</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>严重</td>
      <td>对业务造成重大影响</td>
      <td>立即（< 1 小时）</td>
      <td>数据泄露、系统瘫痪</td>
    </tr>
    <tr>
      <td>高</td>
      <td>对业务造成较大影响</td>
      <td>1 小时内</td>
      <td>恶意软件感染、未授权访问</td>
    </tr>
    <tr>
      <td>中</td>
      <td>对业务造成一定影响</td>
      <td>4 小时内</td>
      <td>异常登录、配置错误</td>
    </tr>
    <tr>
      <td>低</td>
      <td>对业务影响较小</td>
      <td>24 小时内</td>
      <td>可疑活动、安全警告</td>
    </tr>
  </tbody>
</table>
```

**使用模板变量的表格**:

```html
<h3>{{tableTitle}}</h3>
<table>
  <thead>
    <tr>
      {{#headers}}
      <th>{{.}}</th>
      {{/headers}}
    </tr>
  </thead>
  <tbody>
    {{#rows}}
    <tr>
      {{#cells}}
      <td>{{.}}</td>
      {{/cells}}
    </tr>
    {{/rows}}
  </tbody>
</table>
```

**对应的模板数据**:

```javascript
const templateData = {
  tableTitle: '风险矩阵',
  headers: ['可能性 \\ 影响', '低', '中', '高', '严重'],
  rows: [
    { cells: ['极低', '低', '低', '中', '中'] },
    { cells: ['低', '低', '中', '中', '高'] },
    { cells: ['中', '中', '中', '高', '严重'] },
    { cells: ['高', '中', '高', '严重', '严重'] },
    { cells: ['极高', '高', '严重', '严重', '严重'] }
  ]
};
```

**Markdown表格示例**:

Markdown表格会被自动转换为HTML表格，然后渲染为Word表格：

```markdown
| 级别 | 定义 | 响应时间 | 示例 |
|------|------|----------|------|
| 严重 | 对业务造成重大影响 | 立即（< 1 小时） | 数据泄露、系统瘫痪 |
| 高 | 对业务造成较大影响 | 1 小时内 | 恶意软件感染、未授权访问 |
| 中 | 对业务造成一定影响 | 4 小时内 | 异常登录、配置错误 |
| 低 | 对业务影响较小 | 24 小时内 | 可疑活动、安全警告 |
```

**表格特性**:

- ✅ 自动识别表头（`<thead>` 或第一行的 `<th>` 标签）
- ✅ 表头自动加粗并设置灰色背景
- ✅ 支持多行多列表格
- ✅ 自动调整列宽以适应内容
- ✅ 支持HTML实体转义（如 `&lt;`、`&gt;`、`&amp;` 等）

#### 注意事项

1. **变量名区分大小写**: `{{Title}}` 和 `{{title}}` 是不同的变量
2. **未定义变量**: 如果变量未定义，将输出空字符串
3. **特殊字符**: 变量值中的HTML特殊字符会被自动转义（使用 `{{variable}}` 时）
4. **嵌套层级**: 支持多层嵌套的对象和数组访问
5. **条件判断**: `{{#variable}}` 会检查变量是否为真值（非空、非null、非false、非0、非空数组）

#### 模板最佳实践

1. **变量命名**: 使用有意义的变量名，如 `companyName` 而不是 `cn`
2. **默认值处理**: 使用条件渲染处理可选内容
3. **数据验证**: 在填充模板前验证数据完整性
4. **模板测试**: 使用示例数据测试模板渲染效果
5. **文档说明**: 为模板变量编写说明文档，方便其他开发者使用

## 🔍 注意事项

1. **文件大小限制**: HTML内容最大支持10MB，Markdown模板最大支持5MB
2. **模板语法**: 使用Mustache模板语法 `{{variable}}` 进行变量替换，支持条件渲染和循环
3. **HTML解析**: Word生成器会将HTML解析为Word文档结构，复杂HTML可能无法完全保留样式
4. **存储方式**: 默认使用本地存储，文件保存在项目的 `outputs/word-generator` 目录
5. **边距单位**: 边距使用twips单位（1英寸 = 1440 twips）
6. **封面页**: 封面页使用蓝色背景，文字为白色，确保良好的视觉效果
7. **目录生成**: 目录会自动从HTML/Markdown中的标题（h1-h6）提取，目录项可点击跳转
8. **目录位置**: 如果同时设置了封面页和目录，顺序为：封面页 → 目录页 → 正文内容
9. **模板变量**: 模板变量通过 `templateData` 参数传入，支持任意自定义变量名
10. **标题识别**: 确保HTML/Markdown中的标题使用标准的h1-h6标签，以便正确生成目录

## 🐛 故障排除

### 常见问题

1. **Word生成失败**
   - 检查HTML/Markdown内容格式是否正确
   - 确认模板数据格式是否符合要求
   - 查看服务器日志获取详细错误信息

2. **文件下载失败**
   - 确认文件已成功生成
   - 检查文件路径和权限
   - 验证下载URL是否正确

3. **云存储上传失败**
   - 检查云存储配置是否正确
   - 验证访问凭证是否有效
   - 确认存储桶权限设置

## 📄 许可证

MIT License

## 👥 贡献

欢迎提交Issue和Pull Request！

