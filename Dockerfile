# 台风实时监测 WebGIS —— 零 npm 依赖，构建极快
# 基础镜像可用 --build-arg NODE_IMAGE=... 覆盖（如本地已有 node:22-alpine）
ARG NODE_IMAGE=node:24-alpine
FROM ${NODE_IMAGE}

WORKDIR /app
COPY package.json server ./server/
COPY web ./web

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

VOLUME ["/app/data/cache/tiles"]

HEALTHCHECK --interval=60s --timeout=10s --start-period=20s \
  CMD wget -qO- http://localhost:8080/api/health || exit 1

CMD ["node", "server/index.js"]
