# ---------- base: dependências (produção + dev) ----------
FROM node:24-bookworm-slim AS deps
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci

# ---------- dev: código montado via volume, modo watch ----------
FROM deps AS dev
ENV NODE_ENV=development
# utilitários para watch/hot-reload e depuração
RUN apt-get update && apt-get install -y \
    procps \
    git \
    bash \
    nano \
    && rm -rf /var/lib/apt/lists/*
# roda como o usuário "node" (uid 1000) para que dist/ no volume não fique com dono root
RUN chown -R node:node /usr/src/app
USER node
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ---------- build: compila TypeScript ----------
FROM deps AS build
COPY . .
RUN npm run build

# ---------- prod: imagem enxuta, só dependências de produção ----------
FROM node:24-bookworm-slim AS prod
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /usr/src/app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "dist/main.js"]
