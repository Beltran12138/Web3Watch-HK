# Alpha-Radar Dockerfile
# 多阶段构建，优化镜像大小

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps
WORKDIR /app

# 复制 package 文件
COPY package.json package-lock.json* ./

# 安装依赖
RUN npm ci --only=production

# ============================================
# Stage 2: Builder (用于构建)
# ============================================
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# ============================================
# Stage 3: Production
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 设置环境变量
ENV NODE_ENV=production \
    PORT=3001

# 复制生产依赖
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/*.js ./
COPY --from=builder /app/scrapers ./scrapers
COPY --from=builder /app/public ./public
COPY --from=builder /app/config.js ./
COPY --from=builder /app/prompts ./prompts
COPY --from=builder /app/monitoring ./monitoring

# 设置文件权限
RUN chown -R nodejs:nodejs /app

# 切换到非 root 用户
USER nodejs

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# 启动命令
CMD ["npm", "start"]
