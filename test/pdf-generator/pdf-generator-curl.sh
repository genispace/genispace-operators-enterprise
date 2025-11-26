#!/bin/bash

###############################################################################
# PDF Generator API 测试脚本（使用 curl）
# 
# 功能：
# 1. 测试 HTML 模板生成 PDF
# 2. 测试 Markdown 模板生成 PDF
# 3. 支持自定义样式和PDF选项
#
# 使用方法：
#   chmod +x pdf-generator-curl.sh
#   ./pdf-generator-curl.sh
#
# 环境变量：
#   API_BASE_URL - API 基础URL（默认: http://localhost:8080/api/document/pdf-generator）
###############################################################################

# 配置
API_BASE_URL="${API_BASE_URL:-http://localhost:8080/api/document/pdf-generator}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="${SCRIPT_DIR}/templates"
OUTPUT_DIR="${SCRIPT_DIR}/../../outputs/pdf-generator"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 打印函数
print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

print_step() {
    echo -e "${CYAN}→ $1${NC}"
}

# 检查依赖
check_dependencies() {
    local missing_deps=()
    
    if ! command -v curl &> /dev/null; then
        missing_deps+=("curl")
    fi
    
    if ! command -v node &> /dev/null; then
        missing_deps+=("node")
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        print_error "缺少依赖: ${missing_deps[*]}"
        print_info "请先安装缺少的依赖"
        exit 1
    fi
    
    # 检查 jq（可选）
    if ! command -v jq &> /dev/null; then
        print_info "jq 未安装，JSON 响应将无法格式化显示（可选，建议安装）"
    fi
    
    print_success "依赖检查通过"
}

# 检查 API 是否可用
check_api() {
    print_info "检查 API 服务是否可用..."
    
    local test_response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d '{"htmlContent":"<h1>Test</h1>"}' \
        "${API_BASE_URL}/generate-from-html" 2>&1)
    
    local http_code=$(echo "$test_response" | tail -n1)
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "400" ]; then
        print_success "API 服务可用 (HTTP $http_code)"
        return 0
    else
        print_error "API 服务不可用 (HTTP $http_code)"
        print_info "请确保服务已启动在 ${API_BASE_URL}"
        print_info "提示：请先启动 GeniSpace 服务"
        return 1
    fi
}

# 使用 Node.js 构建请求 JSON
build_request_json() {
    local template_type="$1"  # "html" 或 "markdown"
    local template_path="$2"
    local output_file="$3"
    
    node -e "
        const fs = require('fs');
        const path = require('path');
        
        // 读取模板文件
        const templateContent = fs.readFileSync('${template_path}', 'utf-8');
        
        // 模板数据
        const templateData = {
            companyName: '示例科技有限公司',
            version: 'v2.0',
            releaseDate: '2025年1月24日',
            lastUpdateDate: '2025年1月24日',
            companyAddress: '北京市朝阳区示例大厦 1001 室',
            securityHotline: '400-123-4567',
            securityEmail: 'security@example.com',
            incidentHotline: '400-123-4568',
            incidentEmail: 'incident@example.com',
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
        
        // CSS 样式 - 使用 !important 确保中文字体优先级
        const cssStyles = \`
          * {
            font-family: 'Noto Sans CJK SC', 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'WenQuanYi Micro Hei', sans-serif !important;
          }
          body, p, div, span, td, th, li, a, strong, em, b, i, u { 
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
        \`;
        
        // 构建请求对象
        const request = {
            templateData: templateData,
            fileName: '企业信息安全管理白皮书-' + ('${template_type}' === 'html' ? 'HTML模板' : 'Markdown模板'),
            pdfOptions: pdfOptions,
            cssStyles: cssStyles
        };
        
        if ('${template_type}' === 'html') {
            request.htmlContent = templateContent;
        } else {
            request.markdownTemplate = templateContent;
        }
        
        // 写入文件
        fs.writeFileSync('${output_file}', JSON.stringify(request, null, 2));
    "
}

# 测试1: 使用 HTML 模板生成 PDF
test_generate_from_html() {
    print_header "测试1: 使用 HTML 模板生成信息安全管理白皮书"
    
    local html_template_path="${TEMPLATES_DIR}/security-white-paper.html"
    
    if [ ! -f "$html_template_path" ]; then
        print_error "HTML 模板文件不存在: $html_template_path"
        return 1
    fi
    
    print_step "读取 HTML 模板文件..."
    local temp_json=$(mktemp)
    
    if ! build_request_json "html" "$html_template_path" "$temp_json"; then
        print_error "构建请求 JSON 失败"
        rm -f "$temp_json"
        return 1
    fi
    
    print_step "发送请求到 API..."
    local response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "@${temp_json}" \
        "${API_BASE_URL}/generate-from-html" 2>&1)
    
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    rm -f "$temp_json"
    
    if [ "$http_code" -eq 200 ]; then
        print_success "PDF 生成成功！"
        echo ""
        
        if command -v jq &> /dev/null; then
            local pdf_url=$(echo "$body" | jq -r '.data.pdfURL // empty')
            local file_name=$(echo "$body" | jq -r '.data.fileName // empty')
            local file_size=$(echo "$body" | jq -r '.data.fileSize // 0')
            local page_count=$(echo "$body" | jq -r '.data.pageCount // 0')
            local processing_time=$(echo "$body" | jq -r '.data.processingTimeMs // 0')
            local storage_provider=$(echo "$body" | jq -r '.data.storageProvider // empty')
            
            echo "  文件名: $file_name"
            echo "  文件大小: $(echo "scale=2; $file_size / 1024" | bc) KB"
            echo "  页数: $page_count"
            echo "  处理时间: ${processing_time}ms"
            echo "  存储提供商: $storage_provider"
            echo "  下载URL: $pdf_url"
            echo ""
            
            # 尝试下载文件
            if [ -n "$pdf_url" ] && [ "$pdf_url" != "null" ]; then
                print_step "尝试下载文件..."
                local file_name_only=$(basename "$pdf_url")
                local download_path="${OUTPUT_DIR}/${file_name_only}"
                
                mkdir -p "$OUTPUT_DIR"
                
                if curl -s -f -o "$download_path" "$pdf_url" 2>/dev/null; then
                    print_success "文件已下载到: $download_path"
                    local downloaded_size=$(stat -f%z "$download_path" 2>/dev/null || stat -c%s "$download_path" 2>/dev/null || echo "0")
                    echo "  下载文件大小: $(echo "scale=2; $downloaded_size / 1024" | bc) KB"
                else
                    print_info "文件下载失败，请手动访问: $pdf_url"
                fi
            fi
        else
            echo "$body"
            print_info "提示: 安装 jq 可以更好地格式化输出"
        fi
        
        return 0
    else
        print_error "PDF 生成失败 (HTTP $http_code)"
        if command -v jq &> /dev/null; then
            echo "$body" | jq '.' 2>/dev/null || echo "$body"
        else
            echo "$body" | head -30
        fi
        return 1
    fi
}

# 测试2: 使用 Markdown 模板生成 PDF
test_generate_from_markdown() {
    print_header "测试2: 使用 Markdown 模板生成信息安全管理白皮书"
    
    local markdown_template_path="${TEMPLATES_DIR}/security-white-paper.md"
    
    if [ ! -f "$markdown_template_path" ]; then
        print_error "Markdown 模板文件不存在: $markdown_template_path"
        return 1
    fi
    
    print_step "读取 Markdown 模板文件..."
    local temp_json=$(mktemp)
    
    if ! build_request_json "markdown" "$markdown_template_path" "$temp_json"; then
        print_error "构建请求 JSON 失败"
        rm -f "$temp_json"
        return 1
    fi
    
    print_step "发送请求到 API..."
    local response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "@${temp_json}" \
        "${API_BASE_URL}/generate-from-markdown" 2>&1)
    
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    rm -f "$temp_json"
    
    if [ "$http_code" -eq 200 ]; then
        print_success "PDF 生成成功！"
        echo ""
        
        if command -v jq &> /dev/null; then
            local pdf_url=$(echo "$body" | jq -r '.data.pdfURL // empty')
            local file_name=$(echo "$body" | jq -r '.data.fileName // empty')
            local file_size=$(echo "$body" | jq -r '.data.fileSize // 0')
            local page_count=$(echo "$body" | jq -r '.data.pageCount // 0')
            local processing_time=$(echo "$body" | jq -r '.data.processingTimeMs // 0')
            local storage_provider=$(echo "$body" | jq -r '.data.storageProvider // empty')
            
            echo "  文件名: $file_name"
            echo "  文件大小: $(echo "scale=2; $file_size / 1024" | bc) KB"
            echo "  页数: $page_count"
            echo "  处理时间: ${processing_time}ms"
            echo "  存储提供商: $storage_provider"
            echo "  下载URL: $pdf_url"
            echo ""
            
            # 尝试下载文件
            if [ -n "$pdf_url" ] && [ "$pdf_url" != "null" ]; then
                print_step "尝试下载文件..."
                local file_name_only=$(basename "$pdf_url")
                local download_path="${OUTPUT_DIR}/${file_name_only}"
                
                mkdir -p "$OUTPUT_DIR"
                
                if curl -s -f -o "$download_path" "$pdf_url" 2>/dev/null; then
                    print_success "文件已下载到: $download_path"
                    local downloaded_size=$(stat -f%z "$download_path" 2>/dev/null || stat -c%s "$download_path" 2>/dev/null || echo "0")
                    echo "  下载文件大小: $(echo "scale=2; $downloaded_size / 1024" | bc) KB"
                else
                    print_info "文件下载失败，请手动访问: $pdf_url"
                fi
            fi
        else
            echo "$body"
            print_info "提示: 安装 jq 可以更好地格式化输出"
        fi
        
        return 0
    else
        print_error "PDF 生成失败 (HTTP $http_code)"
        if command -v jq &> /dev/null; then
            echo "$body" | jq '.' 2>/dev/null || echo "$body"
        else
            echo "$body" | head -30
        fi
        return 1
    fi
}

# 测试3: 简单 HTML 测试（不带模板数据）
test_simple_html() {
    print_header "测试3: 简单 HTML 生成 PDF（不带模板数据）"
    
    local temp_json=$(mktemp)
    
    cat > "$temp_json" <<'EOF'
{
  "htmlContent": "<h1>测试文档</h1><p>这是一个简单的测试文档。</p><h2>第一章</h2><p>这是第一章的内容。</p><h2>第二章</h2><p>这是第二章的内容。</p>",
  "fileName": "simple-test",
  "cssStyles": "* { font-family: 'Noto Sans CJK SC', 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'WenQuanYi Micro Hei', sans-serif !important; } body, p, div, h1, h2 { font-family: 'Noto Sans CJK SC', 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'WenQuanYi Micro Hei', sans-serif !important; }",
  "pdfOptions": {
    "format": "A4",
    "margin": {
      "top": "1cm",
      "right": "1cm",
      "bottom": "1cm",
      "left": "1cm"
    },
    "printBackground": true
  }
}
EOF
    
    print_step "发送请求到 API..."
    local response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "@${temp_json}" \
        "${API_BASE_URL}/generate-from-html" 2>&1)
    
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    rm -f "$temp_json"
    
    if [ "$http_code" -eq 200 ]; then
        print_success "简单 HTML 测试成功！"
        echo ""
        
        if command -v jq &> /dev/null; then
            local pdf_url=$(echo "$body" | jq -r '.data.pdfURL // empty')
            local file_name=$(echo "$body" | jq -r '.data.fileName // empty')
            
            echo "  文件名: $file_name"
            echo "  下载URL: $pdf_url"
            echo ""
            echo "$body" | jq '.data'
        else
            echo "$body"
        fi
        
        return 0
    else
        print_error "简单 HTML 测试失败 (HTTP $http_code)"
        if command -v jq &> /dev/null; then
            echo "$body" | jq '.' 2>/dev/null || echo "$body"
        else
            echo "$body"
        fi
        return 1
    fi
}

# 主函数
main() {
    print_header "🚀 PDF Generator API 测试（使用 curl）"
    echo ""
    echo "  API URL: ${API_BASE_URL}"
    echo "  模板目录: ${TEMPLATES_DIR}"
    echo "  输出目录: ${OUTPUT_DIR}"
    echo ""
    
    if ! check_dependencies; then
        exit 1
    fi
    
    echo ""
    
    if ! check_api; then
        exit 1
    fi
    
    echo ""
    
    local success_count=0
    local total_tests=3
    
    # 测试1: HTML 模板
    if test_generate_from_html; then
        ((success_count++))
    fi
    echo ""
    
    # 测试2: Markdown 模板
    if test_generate_from_markdown; then
        ((success_count++))
    fi
    echo ""
    
    # 测试3: 简单 HTML
    if test_simple_html; then
        ((success_count++))
    fi
    echo ""
    
    # 总结
    print_header "测试总结"
    echo "  总测试数: $total_tests"
    echo "  成功: $success_count"
    echo "  失败: $((total_tests - success_count))"
    echo ""
    
    if [ $success_count -eq $total_tests ]; then
        print_success "所有测试通过！✨"
        echo ""
        print_info "生成的文件保存在: ${OUTPUT_DIR}"
        exit 0
    else
        print_error "部分测试失败"
        exit 1
    fi
}

# 运行主函数
main "$@"

