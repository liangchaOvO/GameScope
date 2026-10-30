# GameScope — 一行启动见 README（本地模式，数据卷 /app/data）
# 构建：docker build -t gamescope .
# 运行：docker run -p 3100:3100 -v gamescope-data:/app/data gamescope

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    GAMESCOPE_LOCAL_MODE=on \
    PORT=3100
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
EXPOSE 3100
VOLUME ["/app/data"]
CMD ["npx", "next", "start", "-p", "3100"]
