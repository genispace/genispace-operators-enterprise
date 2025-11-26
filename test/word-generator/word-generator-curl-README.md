# Word Generator API 测试脚本（curl 版本）

使用 curl 命令测试 Word Generator API 的 Shell 脚本。

## 📋 功能特性

- ✅ 测试 HTML 模板生成 Word
- ✅ 测试 Markdown 模板生成 Word  
- ✅ 支持带封面页和目录的完整文档生成
- ✅ 自动下载生成的文件
- ✅ 彩色输出，易于查看测试结果
- ✅ 详细的错误信息和测试总结

## 🚀 使用方法

### 1. 基本使用

```bash
# 进入测试目录
cd test

# 添加执行权限（首次运行）
chmod +x word-generator-curl.sh

# 运行测试
./word-generator-curl.sh
```

### 2. 自定义 API URL

```bash
# 使用环境变量指定 API 地址
API_BASE_URL=http://localhost:3000/api/document/word-generator ./word-generator-curl.sh
```

### 3. 前置条件

确保以下条件满足：

1. **GeniSpace 服务已启动**
   ```bash
   # 确保服务运行在 http://localhost:8080
   ```

2. **依赖工具已安装**
   - `curl` - HTTP 请求工具（必需）
   - `node` - Node.js 运行时（必需，用于构建 JSON）
   - `jq` - JSON 处理工具（可选，用于格式化输出）
   - `bc` - 计算工具（可选，用于文件大小计算）

3. **模板文件存在**
   - `test/templates/security-white-paper.html`
   - `test/templates/security-white-paper.md`

## 📝 测试内容

脚本会执行以下三个测试：

### 测试1: HTML 模板生成
- 读取 `security-white-paper.html` 模板
- 使用 Mustache 模板数据填充
- 生成带封面页和目录的 Word 文档

### 测试2: Markdown 模板生成
- 读取 `security-white-paper.md` 模板
- 使用 Mustache 模板数据填充
- 生成带封面页和目录的 Word 文档

### 测试3: 简单 HTML 测试
- 使用简单的 HTML 内容
- 不带模板数据
- 测试基本功能

## 📤 输出说明

### 成功输出示例

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Word 生成成功！

  文件名: 企业信息安全管理白皮书-HTML模板_abc12345.docx
  文件大小: 245.76 KB
  处理时间: 2500ms
  存储提供商: local
  下载URL: http://localhost:8080/api/document/word-generator/download/企业信息安全管理白皮书-HTML模板_abc12345.docx

→ 尝试下载文件...
✅ 文件已下载到: /path/to/outputs/企业信息安全管理白皮书-HTML模板_abc12345.docx
  下载文件大小: 245.76 KB
```

### 失败输出示例

```
❌ Word 生成失败 (HTTP 500)
{
  "success": false,
  "error": "Word生成失败: ...",
  "code": "WORD_GENERATION_FAILED"
}
```

## 🔧 故障排除

### 1. API 服务不可用

**错误信息**:
```
❌ API 服务不可用 (HTTP 000)
```

**解决方法**:
- 检查 GeniSpace 服务是否已启动
- 确认服务运行在正确的端口（默认 8080）
- 检查防火墙设置

### 2. 模板文件不存在

**错误信息**:
```
❌ HTML 模板文件不存在: /path/to/templates/security-white-paper.html
```

**解决方法**:
- 确认模板文件存在于 `test/templates/` 目录
- 检查文件路径是否正确

### 3. 依赖工具缺失

**错误信息**:
```
❌ 缺少依赖: curl node
```

**解决方法**:
- macOS: `brew install curl node`
- Ubuntu/Debian: `sudo apt-get install curl nodejs`
- CentOS/RHEL: `sudo yum install curl nodejs`

### 4. JSON 构建失败

**错误信息**:
```
❌ 构建请求 JSON 失败
```

**解决方法**:
- 检查 Node.js 版本（需要 Node.js 12+）
- 确认模板文件编码为 UTF-8
- 检查模板文件是否包含特殊字符

## 📊 测试结果

脚本运行完成后会显示测试总结：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
测试总结
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  总测试数: 3
  成功: 3
  失败: 0

✅ 所有测试通过！✨

ℹ️  生成的文件保存在: /path/to/outputs
```

## 🔍 手动测试示例

如果你想手动测试某个接口，可以使用以下 curl 命令：

### HTML 转 Word

```bash
curl -X POST http://localhost:8080/api/document/word-generator/generate-from-html \
  -H "Content-Type: application/json" \
  -d '{
    "htmlContent": "<h1>测试文档</h1><p>这是测试内容。</p>",
    "fileName": "test-document",
    "wordOptions": {
      "includeTOC": true
    }
  }'
```

### Markdown 转 Word

```bash
curl -X POST http://localhost:8080/api/document/word-generator/generate-from-markdown \
  -H "Content-Type: application/json" \
  -d '{
    "markdownTemplate": "# 测试文档\n\n这是测试内容。",
    "fileName": "test-markdown",
    "wordOptions": {
      "includeTOC": true
    }
  }'
```

## 📚 相关文档

- [Word Generator README](../operators/document/word-generator/README.md)
- [API 文档](../operators/document/word-generator/README.md#api-接口)

## 💡 提示

1. **安装 jq 以获得更好的输出格式**
   ```bash
   # macOS
   brew install jq
   
   # Ubuntu/Debian
   sudo apt-get install jq
   ```

2. **查看生成的 Word 文件**
   - 文件保存在 `outputs/word-generator/` 目录
   - 可以通过下载 URL 直接访问

3. **调试模式**
   - 如果测试失败，检查脚本输出的详细错误信息
   - 可以手动执行 curl 命令进行调试

4. **性能测试**
   - 脚本会显示每个请求的处理时间
   - 可以用于性能基准测试

## 📄 许可证

MIT License

