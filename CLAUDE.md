# CLAUDE.md

Guidance for Claude Code when working in this repository. The README explains *what* the API does; this file explains *how to change it safely*. **The source code is the source of truth** — where this file or the README disagree with the code, trust the code and update this file.

## 1. Project Overview

NestJS REST API for personal finance: credit cards, purchases (one-time and installment), monthly card statements, subscriptions, fixed expenses, income sources, tenant-grouped reports, and a monthly PDF report. Single NestJS module, layered (presentation → application → TypeORM persistence), PostgreSQL. Domain labels and PDF content are in Brazilian Portuguese and amounts are BRL.

## 2. Technology Stack (verified in `package.json`)

- NestJS 10, TypeScript 5 (`strict: true`, target ES2021, CommonJS)
- TypeORM 0.3 + `pg` (PostgreSQL), hand-written SQL migrations
- `@nestjs/passport` + `passport-jwt` + `@nestjs/jwt`, `bcrypt` (cost 10)
- `class-validator` / `class-transformer` DTOs
- `@nestjs/swagger` (listed in **devDependencies** but imported at runtime by `main.ts`, entities, DTOs)
- `pdfkit` for PDF, `@nestjs/config` for `.env`
- Jest 29 + ts-jest installed, **but no Jest config exists** (see §11)
- Prettier: `singleQuote`, `trailingComma: all`. `eslint.config.mjs` exists but its packages (`eslint`, `typescript-eslint`, `globals`, `eslint-plugin-prettier`) are **not installed** and there is no lint script.

## 3. Architecture Overview

```
HTTP → main.ts (global prefix /api, CORS, global ValidationPipe)
     → Controller (presentation/controllers)   – routing, JwtAuthGuard, @ReqUser, DTO binding, Swagger decorators
     → Service    (application/services)       – business rules, ownership checks, Nest HTTP exceptions
     → Repository<Entity> via @InjectRepository / QueryBuilder / DataSource.transaction
     → PostgreSQL
```

- **One module**: `src/app.module.ts` registers every entity (`TypeOrmModule.forRoot` + `forFeature`), every controller, and every service. `SecurityModule` (`src/presentation/security/`) provides JWT. There are no feature modules — keep it that way unless asked.
- **No repository/domain layer abstraction**: services inject TypeORM `Repository<T>` directly. Entities double as response models (returned as-is from controllers). Do not add repository interfaces, mappers, or use-case classes.
- Services throw Nest exceptions (`NotFoundException`, `ForbiddenException`, `BadRequestException`, `ConflictException`). No custom exception filters or interceptors exist.
- Layer leaks that already exist (don't spread them further, don't "fix" them unprompted): `SubscriptionsService`, `FixedExpensesService`, `IncomeSourcesService` import DTO types from `presentation/dtos`; `ReportsPdfService` takes an Express `Response` and writes the PDF stream itself.
- `src/app.controller.ts` / `app.service.ts` are Nest scaffold leftovers and are **not registered** in `AppModule`.

## 4. Project Structure

```
src/
  main.ts                         bootstrap: /api prefix, CORS (FRONTEND_ORIGIN), ValidationPipe, Swagger at /api/docs
  app.module.ts                   the only module – register new entities/controllers/services here
  typeorm.config.ts               DataSource for CLI/seed – migrations are listed EXPLICITLY here
  application/services/*.service.ts
  presentation/controllers/*.controller.ts
  presentation/dtos/*.dto.ts      (report.dto.ts → ReportFiltersQueryDto is currently unused)
  presentation/security/          jwt.guard.ts (JwtAuthGuard + @ReqUser), jwt.strategy.ts, security.module.ts
  infrastructure/persistence/typeorm/
    entities/*.entity.ts
    migrations/<timestamp>_<name>.ts
    transformers/decimal.transformer.ts
  seeds/seed.ts                   dev seed (uses AppDataSource)
  docs/openapi.ts                 exports openapi/swagger.{json,yaml}
  assets/logo.png                 loaded by PDF service via relative path 'src/assets/logo.png'
```

## 5. Core Business Domain

| Entity (table) | Ownership | Key relations / notes |
| --- | --- | --- |
| `User` (`users`) | — | email unique, stored lowercased |
| `Tenant` (`tenants`) | `createdByUserId` | unique `(created_by_user_id, name)`; a financial grouping ("responsável"), not a multi-tenancy boundary |
| `CreditCard` (`credit_cards`) | `createdByUserId` | `active` flag (soft-hide); `limitAmount` numeric |
| `Purchase` (`purchases`) | `createdByUserId` | card FK **RESTRICT**, tenant FK **RESTRICT** (tenant required), installments fields |
| `Statement` (`statements`) | via card | unique `(credit_card_id, year, month)`; card FK CASCADE |
| `StatementItem` (`statement_items`) | via statement | FK to statement CASCADE and purchase CASCADE |
| `Subscription` (`subscriptions`) | `createdByUserId` | card FK CASCADE; tenant nullable, SET NULL |
| `FixedExpense` (`fixed_expenses`) | `createdByUserId` | tenant nullable, SET NULL; no date — counted every month |
| `IncomeSource` (`income_sources`) | `createdByUserId` | tenant nullable, SET NULL; `incomeType` enum `fixed` \| `one_time` |

## 6. Critical Business Rules (verified in code)

Change any of these only deliberately, and update tests/this file.

### Credit card `active` flag
- `CreditCardsService.list` returns only active cards; creating a card forces `active: true`. `UpdateCreditCardDto` has no `active` field, so the API currently cannot deactivate a card.
- Almost every read path filters `card.active = true` (purchase list, subscriptions, statements, reports, PDF). Resources on inactive cards are treated as **not found** (404), not forbidden. Preserve this filter in new queries.
- Deleting a card that has purchases fails at the DB (FK RESTRICT) — there is no service-level check, so it surfaces as a 500.

### Purchases & installments (`purchases.service.ts`)
- An installment purchase is **one row** (`totalAmount`, `installmentsTotal`, `installmentsPaid`); per-installment amounts are never stored on the purchase.
- `totalAmount` must be > 0; card must be owned **and active**. The `tenantId` is **not** ownership-checked on create/update (only UUID format is validated).
- `validateInstallments`: `isInstallment=false` ⇒ `installmentsTotal=null`, `installmentsPaid=0`; `isInstallment=true` ⇒ `installmentsTotal >= 1` and `0 <= installmentsPaid <= installmentsTotal`.
- `POST /purchases/:id/installments-paid` sets `installmentsPaid` directly (bounds-checked).

### Statement generation (`StatementsService.generate`)
- Card must be owned and active.
- **If a statement already exists for (card, year, month) it is DELETED and recreated** (items cascade). This happens even if it was `locked` or paid — `paidAt`, `paidAmount`, `adjustmentAmount` are lost. Not wrapped in a transaction.
- Installment allocation is by **calendar month of `purchaseDate`**: installment 1 falls in the purchase month, installment *k* in month + (k−1). `closingDate`/`dueDate` are stored only; they do **not** affect which purchases land in a statement.
- One-time purchase → item labelled `Compra à vista` if `purchaseDate` is in the target month.
- Installment amount: `per = round2(total / n)`; the **last** installment absorbs the remainder: `last = round2(total − per × (n − 1))`. Label `Parcela k/n`. Stored as `amount.toFixed(2)`.
- `installmentsPaid` is **ignored** during generation.
- `totalAmount = sum(items) + sum(active subscriptions on that card for the user) + adjustmentAmount(0)`. Subscriptions are added to the total but **do not create statement items**.

### Statement update & payment
- `update`: changing `adjustmentAmount` shifts `totalAmount` by the delta. There is an **empty `if (st.locked …) {}` block** — locked statements are currently editable.
- `pay` (`POST /statements/:id/pay`):
  - requires `locked = true` (else 400);
  - if the statement was not already paid, within `dataSource.transaction` increments `installmentsPaid` by 1 (capped at total) for each installment purchase that has an item in the statement;
  - always sets `paidAmount` (regex-validated string) and `paidAt` (`paidAt` date as UTC midnight, or now);
  - re-paying an already-paid statement only updates amount/date (no double increment). The "already paid" check happens **outside** the transaction with no row lock, so concurrent payments could double-increment.
  - `paidAmount` is not compared to `totalAmount`.

### Reports (`reports.service.ts`)
- `GET /reports/by-tenant?year&month` (`totalsByTenant`), per tenant of the user:
  - `purchasesTotal` = sum of **statement items** in statements of that year/month → reports depend on statements having been generated;
  - `subscriptionsTotal` = active subscriptions with a tenant, only on cards that **have a statement** that month;
  - `fixedExpensesTotal` = all of the tenant's fixed expenses (no date filter);
  - `incomeSourcesTotal` = all `fixed` incomes + `one_time` incomes whose `createdAt` is within the month;
  - `reportExpensesTotal = purchases + subscriptions`; `accumulatedAmount = income − fixed − reportExpenses`.
- `GET /reports/global` (`totalGlobal`): with `statementId` → that statement's `totalAmount`; otherwise all-time sum of `purchase.totalAmount` + active subscriptions (active cards only).
- `GET /reports/installments-total` (`installmentsTotalFromMonth`): for one card (optionally one tenant), remaining installment amount from the reference month on, computed by **calendar elapsed months** (`total − per × elapsed`), not by `installmentsPaid`.
- PDF `GET /reports/tenants/:tenantId/monthly-pdf?year&month`: same aggregation rules as by-tenant (statement items + subscriptions on cards with a statement that month + fixed expenses + income); 404 if the user has no statements that month.

### Monetary precision
- DB columns are `numeric(14,2)` (older tables) or `numeric(12,2)` (subscriptions, fixed expenses, income sources). Amounts travel as **strings** in entities and DTOs (`DecimalAsStringTransformer` is applied only to `CreditCard.limitAmount` and `Purchase.totalAmount`; other numeric columns come back as strings from `pg` anyway).
- Arithmetic is done in JS `Number` with `Math.round(x*100)/100` and `.toFixed(2)`; SQL aggregates use `SUM(CAST(x AS numeric))` then `Number(...)`. Keep this pattern consistent (round to cents at each stored value, format with `toFixed(2)`); do not introduce a decimal library without being asked.
- Amount validation is inconsistent: `IsNumberString` (subscriptions, fixed expenses, income), plain `IsString` (purchase `totalAmount`, card `limitAmount`), regex (`PayStatementDto.amount`), none (`adjustmentAmount`). Match the closest existing DTO when adding fields.

## 7. Authentication and Security

- `POST /api/auth/register` (bcrypt hash, email lowercased, 409 on duplicate) and `POST /api/auth/login` → `{ accessToken }`, JWT payload `{ sub, email }`, expiry `1d`.
- Every non-auth controller is decorated at class level with `@ApiBearerAuth('bearer')` + `@UseGuards(JwtAuthGuard)`. `@ReqUser()` yields `{ userId, email }`; services receive `user.userId`. Keep this on any new controller.
- **Ownership pattern** (must be preserved and replicated):
  - fetch by id → `NotFoundException` if missing → `ForbiddenException` if `createdByUserId !== userId`; or
  - query with `createdByUserId: userId` in the `where` (and `active: true` for cards) → `ForbiddenException('... not found or not owned by user')`.
  - Statements have no owner column — ownership is via `statement.creditCard.createdByUserId`.
  - When a request references another resource (card, tenant), verify it belongs to the user. Known gaps: `Purchase.tenantId` is not ownership-checked; `TenantsService.remove` only checks purchases (subscriptions/expenses/income get `tenantId` SET NULL).
- JWT secret: `process.env.JWT_SECRET || 'dev-secret'` in both `security.module.ts` and `jwt.strategy.ts`. Never hardcode secrets or extend the fallback.
- **Needs confirmation**: `SecurityModule`'s `JwtModule.register(...)` reads `process.env.JWT_SECRET` when `security.module.ts` is imported, which is before `ConfigModule.forRoot()` loads `.env`. When env vars are not already in the process environment (e.g. `npm run start:dev` outside Docker), signing may use `'dev-secret'` while `JwtStrategy` verifies with the `.env` value. Docker Compose injects `.env` via `env_file`, so it is not affected.
- CORS allows a single origin `FRONTEND_ORIGIN` (default `http://localhost:5173`), methods GET/POST/PATCH/DELETE/OPTIONS.
- Never log tokens, password hashes, or financial payloads. `User.passwordHash` has no `@Exclude` — never return a `User` entity directly (the auth service returns a hand-picked object; keep doing that).

## 8. Database and Persistence

- `synchronize: false` in both `app.module.ts` and `typeorm.config.ts`. **Never enable it.** All schema changes go through migrations.
- **Migrations are registered manually**: `typeorm.config.ts` imports each migration class and lists it in `migrations: [...]`. A new migration file is not picked up until it is added there. `npm run typeorm:gen` writes to `src/infrastructure/persistence/typeorm/migrations/auto-<timestamp>.ts` — rename it to the `<timestamp>_<snake_name>.ts` convention and register it.
- Existing migrations are hand-written raw SQL via `queryRunner.query(...)`, newer ones idempotent (`IF NOT EXISTS`, `DO $$ … $$` guards), each with a `down`. Class names `PascalCaseName<timestamp>` (note: `AddStatements1700000000001` lives in file `1710000000000_add_statements.ts` — don't "fix" historical names, TypeORM tracks them in the migrations table). Never edit an already-applied migration; add a new one.
- **Two column-naming styles coexist — check the entity before writing raw SQL**:
  - `users`, `tenants`, `credit_cards`, `purchases`, `statements`, `statement_items`: snake_case (`credit_card_id`, `created_by_user_id`, `total_amount`).
  - `subscriptions`, `fixed_expenses`, `income_sources`: unquoted camelCase in SQL, so Postgres stores them **lowercase** (`creditcardid`, `createdbyuserid`, `tenantid`, `createdat`, `incometype`). Entities map these with explicit `name:` options.
  - In QueryBuilder, prefer entity property paths (`sub.creditCardId`) so TypeORM resolves the column; raw column strings like `s."credit_card_id"` / `sub."creditcardid"` already appear in a few places.
- Entity conventions: `@PrimaryGeneratedColumn('uuid')`, explicit `name:` for multi-word columns, `timestamptz` `CreateDateColumn`/`UpdateDateColumn`, definite-assignment `!` on required fields, `@ApiProperty` on older entities (newer ones omit it).
- Repository usage: `find/findOne` with `where` objects for simple cases; `createQueryBuilder` with named parameters (`:userId`) for joins/aggregates — never interpolate values into SQL strings. `getRawMany` aliases must be double-quoted to keep camelCase (`AS "creditCardId"`).
- Transactions: only `StatementsService.pay` uses `this.dataSource.transaction(async (manager) => …)` with `manager.getRepository(...)`. Use the same pattern for any operation that modifies more than one financial record (statements + items + purchases).
- Seed (`npm run seed`) creates a dev admin user, two tenants, one card, two purchases. It is **not idempotent** (tenant unique constraint fails on a second run).

## 9. Coding Standards and Conventions

- Files: kebab-case with role suffix — `<plural>.service.ts`, `<plural>.controller.ts`, `<singular>.dto.ts`, `<singular>.entity.ts`. Classes: `CreditCardsService`, `CreditCardsController`, `CreditCard`, `CreateXDto` / `UpdateXDto` / `XIdParamDto` / `ListXQueryDto`.
- Imports are **relative** (`../../infrastructure/...`). One outlier uses `src/...` (`reports.service.ts`); don't copy it.
- Quote style is mixed (older files double quotes, newer files single quotes). Prettier config says single quotes — use single quotes in new files and keep the existing style when editing a file; don't reformat untouched code.
- Services: `@Injectable()`, constructor injection with `@InjectRepository(Entity) private readonly <plural>: Repository<Entity>`; async methods return entities or plain objects; amounts returned as 2-decimal strings.
- Controllers: thin — extract `user.userId`, pass DTO/params to one service call, no business logic. Swagger: `@ApiTags`, `@ApiOkResponse`/`@ApiCreatedResponse` per route, `@ApiQuery` for query params.
- Service method signatures are inconsistent between older (`create(dto, userId)`) and newer (`create(userId, dto)`) services — follow the convention of the service you are editing; newer services use `(userId, id, dto)`.
- DTOs: class-validator decorators + `@ApiProperty/@ApiPropertyOptional`; IDs via `@IsUUID()`, either in a `XIdParamDto` (`@Param() p`) or `@Param('id', new ParseUUIDPipe())`. Statements, subscriptions, and the PDF `tenantId` currently accept unvalidated `:id` strings — new routes should validate UUIDs.
- Global `ValidationPipe`: `whitelist`, `forbidNonWhitelisted`, `transform`, `enableImplicitConversion` — unknown fields are rejected (400), so every accepted field must be declared in the DTO.
- `any` is used for `@ReqUser() user: any`; follow that rather than inventing a user type unless asked.
- Delete responses differ: older services return `undefined` (documented as 204 but Nest sends 200), newer return `{ deleted: true }`. Match the service you touch.

## 10. API Development Guidelines

- All routes are under `/api` (global prefix). Swagger UI at `/api/docs`; keep decorators accurate when adding/changing endpoints, then optionally regenerate with `npm run docs:openapi`.
- REST style already in use: `POST` create, `GET` list (filters via query DTO), `GET :id`, `PATCH :id` partial update, `DELETE :id`, action sub-resources as `POST :id/<action>` (`installments-paid`, `pay`).
- Status codes come from Nest defaults (POST → 201, including `/auth/login` and `/statements/:id/pay`) and the exceptions above. Don't change existing codes or response shapes without being asked — the frontend (`financial_app_front_end`) depends on them.
- New user-scoped resources must: add `createdByUserId`, guard the controller, filter every query by user, ownership-check referenced cards/tenants, respect `card.active`.

## 11. Testing Guidelines

- Current state (verified): the only test is the scaffold `src/app.controller.spec.ts`. `npm test` runs bare `jest` with **no config**, so it (a) fails to parse the `.ts` spec with babel and (b) also picks up compiled specs in `dist/`. There are no tests for any business logic.
- Before writing tests, a Jest config (ts-jest transform, `rootDir: src`, ignore `dist`) must be added — this is a change to tooling; ask or call it out explicitly rather than doing it silently.
- When changing these areas, add focused unit tests (services with mocked repositories via `@nestjs/testing` `Test.createTestingModule` + `getRepositoryToken`) or state clearly that none could be run:
  installment split/last-installment remainder, statement generation month mapping, payment increments and idempotency, report aggregation, ownership/`active` checks.
- Minimum verification that works today without a database: `npx tsc --noEmit --incremental false` (the `dist/` folder may be root-owned from Docker, which breaks the incremental build-info write) and `npm run build`.

## 12. Development Commands (all defined in `package.json`)

```bash
npm install                 # install deps (Dockerfile uses npm ci)
npm run start:dev           # watch mode; API at http://localhost:3000/api
npm run start               # nest start
npm run build               # nest build → dist/
npm test                    # jest (currently broken, see §11)
npm run typeorm:run         # apply migrations   (uses src/typeorm.config.ts)
npm run typeorm:revert      # revert last migration
npm run typeorm:gen         # generate migration from entity diff → migrations/auto-<ts>.ts
npm run seed                # dev seed
npm run docs:openapi        # writes openapi/swagger.json + swagger.yaml (boots AppModule → needs DB)
docker compose up -d --build   # dev container (mounts source, runs start:dev, port 3000)
docker compose logs -f app
docker compose down
```

- `typeorm.config.ts`, the seed, and the migration scripts do **not** load `.env` themselves (no `dotenv`/`ConfigModule`). Export the `DB_*` variables in the shell or run the commands inside the app container.
- Docker Compose defines **only the app service** — PostgreSQL must run elsewhere (use `DB_HOST=host.docker.internal` for a host DB).

## 13. Environment and Configuration

| Var | Used by | Notes |
| --- | --- | --- |
| `PORT` | `main.ts` | default 3000 |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | `app.module.ts`, `typeorm.config.ts` | no defaults |
| `JWT_SECRET` | `security.module.ts`, `jwt.strategy.ts` | falls back to `'dev-secret'` |
| `FRONTEND_ORIGIN` | `main.ts` CORS | default `http://localhost:5173`; missing from `.env.example` |

`.env` is git-ignored; `.env.example` is the template. Never copy real values from `.env` into code, docs, or output.

## 14. Rules for Modifying Existing Code (mandatory)

1. Read the relevant existing code (controller, DTO, service, entity, migrations) before proposing or implementing changes.
2. Trace the full impact of a change across related rules — e.g. purchase changes affect statement generation, payments, all three reports, and the PDF.
3. Preserve existing architectural and naming conventions (§3, §9).
4. Search for reusable functionality before writing new code (ownership checks, period-boundary computation, installment split all already exist).
5. Never assume the README is more accurate than the implementation.
6. Never modify financial calculations (installment split, totals, report formulas) without understanding downstream effects; keep statement generation and `installmentsTotalFromMonth` consistent with each other.
7. Always preserve authentication, authorization, ownership, and `card.active` checks.
8. Never modify the schema without a new, registered migration and consideration of existing data; never enable `synchronize`; avoid destructive migrations unless explicitly requested.
9. Keep changes minimal, focused, and consistent with surrounding code.
10. Add or update tests when changing existing behavior (or state explicitly why none were run).
11. Do not introduce new dependencies without a clear technical justification.
12. Never silently change established business behavior — including the quirks listed in §6 and §15. Fixing them is a behavior change: call it out and get confirmation.
13. Document significant architectural decisions (update this file when conventions change).
14. Explicitly communicate uncertainties instead of inventing missing implementation details.
15. Do not modify unrelated files without justification.

## 15. Common Pitfalls and Important Constraints

- **Regenerating a statement wipes its payment state** (delete + recreate). Be very careful with any change touching `generate`.
- **Reports and the PDF depend on generated statements** for purchase totals; no statement → purchases (and that card's subscriptions) are missing from the month.
- `locked` is only enforced in `pay`; `update` has an empty locked-guard block.
- Payment "already paid" check is outside the transaction (no row lock).
- Statement `totalAmount` includes subscriptions, but `statement.items` does not — `sum(items) ≠ totalAmount` is expected.
- Lowercase column names on `subscriptions`/`fixed_expenses`/`income_sources` (§8).
- New migrations must be added to `typeorm.config.ts`.
- `subscriptions/fixed_expenses/income_sources.createdbyuserid` have no FK to `users` (unlike older tables).
- Deleting a card with purchases → FK RESTRICT DB error (500); deleting a tenant with purchases → 403 from the service.
- `one_time` incomes are bucketed by `createdAt` (insertion time), not a user-provided date.
- Fixed expenses and `fixed` incomes count in **every** month (no start/end dates).
- PDF logo path `'src/assets/logo.png'` is relative to the process CWD (works only when run from the repo root with `src/` present); `nest-cli.json` has no asset copying.
- `@nestjs/swagger` is a devDependency but required at runtime; a production `npm ci --omit=dev` install would break startup.
- README vs code: `GET /statements` with `creditCardId`+`year`+`month` returns a **single object** (404 if missing), not a list; README omits the `GET /purchases` filters and `statementId` on `/reports/global`; statement `closingDate`/`dueDate` do not affect billing periods despite the README's framing; Docker Compose has no database service. Swagger documents card/tenant/purchase DELETEs as 204 but they return 200.
- Unused code: `StatementsService.listByCard`, `ReportFiltersQueryDto`, `AppController`/`AppService`.
