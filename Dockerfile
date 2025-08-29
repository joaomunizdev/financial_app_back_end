FROM node:24-bookworm-slim

WORKDIR /usr/src/app
ENV NODE_ENV=development

# instala utilitários necessários para watch/hot-reload
RUN apt-get update && apt-get install -y \
    procps \
    git \
    bash \
    nano \
    && rm -rf /var/lib/apt/lists/*

# Só instala deps (produção + dev) uma vez na imagem
COPY package*.json ./
RUN npm ci

# portas: app e debug (opcional)
EXPOSE 3000

# Em dev vamos montar o código via volume e rodar em modo watch
CMD ["npm", "run", "start:dev"]
