# PDF 表格提取算子

基于 pdfplumber 从 PDF 文件中提取表格信息，支持结构化表格。

## 📋 算子信息

- **名称**: pdf-table-extractor
- **分类**: document
- **版本**: 1.0.0
- **作者**: GeniSpace AI Team

## 🚀 功能特性

- ✅ PDF 表格提取 - 基于 pdfplumber，依赖 PDF 中的线条识别表格
- ✅ 可配置列映射 - 支持 columnHeaders 排除表头、outputColumns 自定义输出字段
- ✅ 平台存储集成 - 通过 GeniSpace SDK 从平台获取 PDF 文件
- ✅ 认证支持 - 需提供 GeniSpace API Key

## 📦 依赖要求

### Python 环境

本算子通过 Node.js 调用 Python 脚本，需安装：

- **Python 3.8+**
- **pdfplumber**

```bash
# 安装依赖
pip install -r operators/document/pdf-table-extractor/requirements.txt

# 或直接安装
pip install pdfplumber
```

## 📡 API 接口

### 基础 URL

```
http://localhost:8080/api/document/pdf-table-extractor
```

### 提取表格

**POST** `/extract`

从平台存储获取 PDF 文件并提取表格数据。

**请求头**

```http
Authorization: GeniSpace <GeniSpace API Key>
Content-Type: application/json
```

或使用 `GeniSpace: <api_key>` 头。

**请求体**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| fileId | string | 是 | 文件在平台存储中的 ID |
| columnHeaders | string | 否 | 前三列列头名称，逗号分隔，用于排除表头行，如 `"年,月,日"` |
| outputColumns | string | 否 | 输出字段名，逗号分隔，按 PDF 列顺序映射，如 `"year,month,day,voucher_no,summary,counterparty,debit,credit,direction,balance"` |

```json
{
  "fileId": "文件在平台存储中的 ID",
  "columnHeaders": "年,月,日",
  "outputColumns": "year,month,day,voucher_no,summary,counterparty,debit,credit,direction,balance"
}
```

**请求示例**

```bash
curl -X POST http://localhost:8080/api/document/pdf-table-extractor/extract \
  -H "Content-Type: application/json" \
  -H "Authorization: GeniSpace YOUR_API_KEY" \
  -d '{"fileId": "file_1234567890abcdef"}'
```

**成功响应**

```json
{
  "success": true,
  "data": {
    "records": [
      {
        "year": "2024",
        "month": "1",
        "day": "15",
        "voucher_no": "001",
        "summary": "摘要",
        "counterparty": "对方科目",
        "debit": "1000",
        "credit": "",
        "direction": "借",
        "balance": "1000"
      }
    ],
    "fileId": "file_1234567890abcdef",
    "recordCount": 1,
    "extractedAt": "2025-02-27T12:00:00.000Z",
    "processingTimeMs": 500
  },
  "message": "表格提取成功"
}
```

`records` 中每条记录的字段由 `outputColumns` 决定；不传则使用默认字段：`year, month, day, voucher_no, summary, counterparty, debit, credit, direction, balance`。

## 🧪 测试

```bash
# 本地测试（使用内置测试 PDF）
node test/pdf-table-extractor/test-pdf-table-extractor.js --local test/pdf-table-extractor/test-bank-journal.pdf

# 本地测试（可选：指定列头排除、输出字段）
node test/pdf-table-extractor/test-pdf-table-extractor.js --local test/pdf-table-extractor/test-bank-journal.pdf --columnHeaders 年,月,日
node test/pdf-table-extractor/test-pdf-table-extractor.js --local test/pdf-table-extractor/test-bank-journal.pdf --outputColumns date,amount,desc

# 生成测试 PDF（需安装 fpdf2: pip install fpdf2）
python test/pdf-table-extractor/create-test-pdf.py

# API 测试（需先启动服务）
node test/pdf-table-extractor/test-pdf-table-extractor.js --api --fileId <文件ID> --apiKey <API密钥> [--columnHeaders 年,月,日] [--outputColumns ...]
```

## 📁 文件结构

```
pdf-table-extractor/
├── pdf-table-extractor.operator.js   # 算子配置
├── pdf-table-extractor.routes.js    # 路由定义
├── PdfTableExtractor.js             # Node.js 核心逻辑
├── pdf_table_extractor.py           # Python 提取脚本（pdfplumber）
├── requirements.txt                 # Python 依赖
└── README.md

test/pdf-table-extractor/            # 测试文件
├── test-pdf-table-extractor.js      # 测试脚本
├── create-test-pdf.py               # 生成测试 PDF（输出 test-bank-journal.pdf）
└── test-bank-journal.pdf            # 测试用 PDF（运行 create-test-pdf.py 生成）
```

## 🔗 相关链接

- **GeniSpace 算子平台**: http://localhost:8080
- **API 文档**: http://localhost:8080/api/docs
- **算子列表**: http://localhost:8080/api/operators

## 📞 技术支持

如有问题请联系 GeniSpace AI Team 或提交 Issue。
