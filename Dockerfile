# iTab 网址导航 Docker 镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制应用代码
COPY server.js ./
COPY public ./public
COPY data ./data

# 创建数据目录（用于数据持久化）
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 3001
VOLUME ["/app/data"]

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/ || exit 1

# 启动应用
CMD ["node", "server.js"]
