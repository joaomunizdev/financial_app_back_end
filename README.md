# Cards SaaS - Backend (NestJS + TypeORM + PostgreSQL) com OpenAPI

## Instalação

```bash
npm install
cp .env.example .env
```

## Banco (opcional via docker-compose no projeto raiz)

```bash
docker compose up -d --build
```

## Migrations

```bash
npm run typeorm:run
```

## Seed

```bash
npm run seed
```

## Rodar

```bash
npm run start:dev
# Docs: http://localhost:3000/api/docs
```

## Exportar OpenAPI

```bash
npm run docs:openapi
# Gera: openapi/swagger.json e openapi/swagger.yaml
```
