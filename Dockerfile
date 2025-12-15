# GeniSpace Custom Operators Docker 镜像

FROM node:22-alpine

# 设置工作目录
WORKDIR /app

# 安装必要的系统依赖（包含PDF生成所需的Chromium和中文字体）
RUN apk add --no-cache \
    dumb-init \
    ca-certificates \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ttf-freefont \
    font-noto \
    font-noto-cjk \
    fontconfig \
    wget

# 创建非root用户
RUN addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001

# 复制package文件
COPY package*.json ./

# 安装Node.js依赖
RUN npm ci --only=production --silent \
    && npm cache clean --force

# 复制应用代码
COPY src/ ./src/
COPY operators/ ./operators/

# 创建必要的目录并设置权限（包含PDF生成outputs目录）
RUN mkdir -p logs outputs uploads tmp \
    && chown -R nodejs:nodejs /app

# 配置字体缓存和中文字体支持
RUN fc-cache -fv \
    && fc-list | grep -i "noto\|cjk" || echo "字体检查完成"

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=8080
ENV LOG_LEVEL=info

# PDF生成相关环境变量
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROME_PATH=/usr/bin/chromium-browser

# 切换到非root用户
USER nodejs

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# 启动命令
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]

# 标签信息
LABEL maintainer="genispace.com Dev Team <dev@genispace.com>"
LABEL version="1.1.0"
LABEL description="GeniSpace Enterprise Operators"
LABEL org.opencontainers.image.title="GeniSpace Enterprise Operators"
LABEL org.opencontainers.image.description="GeniSpace AI Platform Enterprise Operators Collection"
LABEL org.opencontainers.image.source="https://github.com/genispace/operator-enterprise"
LABEL org.opencontainers.image.url="https://genispace.com"
LABEL org.opencontainers.image.vendor="genispace.com"
LABEL org.opencontainers.image.version="1.1.0"
LABEL org.opencontainers.image.licenses="MIT"
