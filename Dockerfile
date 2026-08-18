# GeniSpace Custom Operators Docker 镜像

FROM node:22-alpine AS builder

ARG ENABLE_OBFUSCATION=false

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

COPY package*.json ./

RUN set -eu; \
    if [ "$ENABLE_OBFUSCATION" = "true" ]; then \
      npm ci; \
    elif [ "$ENABLE_OBFUSCATION" = "false" ]; then \
      npm ci --omit=dev; \
    else \
      echo "ENABLE_OBFUSCATION must be true or false" >&2; \
      exit 1; \
    fi

COPY . .

RUN set -eu; \
    mkdir -p /app/runtime; \
    if [ "$ENABLE_OBFUSCATION" = "true" ]; then \
      echo "Building code-protected image"; \
      npm run obfuscate; \
      test -s dist/src/index.js; \
      cp -R dist/. /app/runtime/; \
      npm prune --omit=dev; \
    elif [ "$ENABLE_OBFUSCATION" = "false" ]; then \
      echo "Building normal source image"; \
      cp -R src operators /app/runtime/; \
    fi

FROM node:22-alpine AS runner

ARG CODE_PROTECTION=source
ARG GIT_TAG=""
ARG COMMIT_SHA=""

LABEL com.genispace.code-protection=$CODE_PROTECTION \
      org.opencontainers.image.version=$GIT_TAG \
      org.opencontainers.image.revision=$COMMIT_SHA \
      maintainer="genispace.com Dev Team <dev@genispace.com>" \
      description="GeniSpace Enterprise Operators" \
      org.opencontainers.image.title="GeniSpace Enterprise Operators" \
      org.opencontainers.image.description="GeniSpace AI Platform Enterprise Operators Collection" \
      org.opencontainers.image.source="https://github.com/genispace/operator-enterprise" \
      org.opencontainers.image.url="https://genispace.com" \
      org.opencontainers.image.vendor="genispace.com" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

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
    wget \
    python3 \
    py3-pip

RUN addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/runtime/ ./

RUN python3 -m venv /app/venv \
    && /app/venv/bin/pip install --no-cache-dir -r /app/operators/document/pdf-table-extractor/requirements.txt
ENV PATH="/app/venv/bin:$PATH"

RUN mkdir -p logs outputs uploads tmp \
    && chown -R nodejs:nodejs /app

RUN fc-cache -fv \
    && fc-list | grep -i "noto\|cjk" || echo "字体检查完成"

ENV NODE_ENV=production
ENV PORT=8080
ENV LOG_LEVEL=info
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROME_PATH=/usr/bin/chromium-browser

USER nodejs

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
