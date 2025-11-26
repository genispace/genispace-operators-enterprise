# Word Generator API 测试 - 快速开始

## 🚀 快速开始（3 步）

### 步骤 1: 确保服务运行

```bash
# 启动 GeniSpace 服务（如果还没启动）
# 确保服务运行在 http://localhost:8080
```

### 步骤 2: 运行测试脚本

```bash
cd test
chmod +x word-generator-curl.sh
./word-generator-curl.sh
```

### 步骤 3: 查看结果

测试完成后，生成的文件会保存在 `outputs/word-generator/` 目录中。

## 📋 前置要求

- ✅ GeniSpace 服务已启动
- ✅ curl 已安装
- ✅ Node.js 已安装
- ✅ 模板文件存在（`test/templates/security-white-paper.html` 和 `.md`）

## 🔍 测试内容

脚本会自动执行 3 个测试：

1. **HTML 模板测试** - 使用 HTML 模板生成完整白皮书
2. **Markdown 模板测试** - 使用 Markdown 模板生成完整白皮书  
3. **简单 HTML 测试** - 测试基本功能

## 💡 常见问题

### Q: 如何修改 API 地址？

```bash
API_BASE_URL=http://your-server:port/api/document/word-generator ./word-generator-curl.sh
```

### Q: 测试失败怎么办？

1. 检查服务是否运行：`curl http://localhost:8080/api/document/word-generator/generate-from-html`
2. 查看错误信息：脚本会显示详细的错误
3. 检查模板文件是否存在

### Q: 如何只运行一个测试？

编辑脚本，注释掉不需要的测试函数调用。

## 📚 更多信息

- 详细文档：`word-generator-curl-README.md`
- API 文档：`../operators/document/word-generator/README.md`

