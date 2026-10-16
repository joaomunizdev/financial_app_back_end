# CLAUDE.md

Guidance for Claude Code when working in this repository. The README explains *what* the API does; this file explains *how to change it safely*. **The source code is the source of truth** — where this file or the README disagree with the code, trust the code and update this file.

## 1. Project Overview

NestJS REST API for personal finance: credit cards, purchases (one-time and installment), monthly card statements, subscriptions, fixed expenses, income sources, tenant-grouped reports, and a monthly PDF report. Single NestJS module, layered (presentation → application → TypeORM persistence), PostgreSQL. Domain labels and PDF content are in Brazilian Portuguese, amounts are BRL, and month boundaries are evaluated in Brazilian time (`America/Sao_Paulo`).

## 2. Technology Stack (verified in `package.json`)

- NestJS 10, TypeScript 5 (`strict: true`, target ES2021, CommonJS)
- TypeORM 0.3 + `pg` (PostgreSQL), hand-written SQL migrations
- `@nestjs/passport` + `passport-jwt` + `@nestjs/jwt`, `bcrypt` (cost 10)
- `class-validator` / `class-transformer` DTOs, `@nestjs/swagger`
- `@nestjs/config` (+ `dotenv` for CLI scripts), `@nestjs/throttler`, `helmet`, `pdfkit`
- Jest 29 + ts-jest, configured in the `jest` block of `package.json` (`rootDir: src`, `*.spec.ts`)
- Prettier: `singleQuote`, `trailingComma: all`. `eslint.config.mjs` exists but its packages are **not installed** and there is no lint script.

## 3. Architecture Overview

```
HTTP → main.ts (prefix /api, helmet, CORS, ValidationPipe, QueryFailedFilter, Swagger outside production)
     → ThrottlerGuard (global, APP_GUARD)
     → Controller (presentation/controllers)   – routing, JwtAuthGuard, @ReqUser, DTO binding, Swagger decorators
     → Service    (application/services)       – business rules, ownership checks, Nest HTTP exceptions
     → Repository<Entity> via @InjectRepository / QueryBuilder / DataSource.transaction
     → PostgreSQL
```

- **One module**: `src/app.module.ts` registers every entity, controller and service. `SecurityModule` (`src/presentation/security/`) provides JWT. No feature modules — keep it that way unless asked.
- **No repository/domain layer abstraction**: services inject TypeORM `Repository<T>` directly. Entities double as response models. Do not add repository interfaces, mappers, or use-case classes.
- Services throw Nest exceptions (`NotFoundException`, `ForbiddenException`, `BadRequestException`, `ConflictException`). `QueryFailedFilter` (`presentation/filters/`) maps Postgres errors: `23505`/`23503` → 409, `22P02`/`22003` → 400, anything else → generic 500 (logged, no SQL leaked). Prefer explicit service checks over relying on the filter.
- Services may depend on other services: `PurchasesService` and `SubscriptionsService` use `StatementsService` (see §6).
- Existing layer leaks (don't spread them): `SubscriptionsService`, `FixedExpensesService`, `IncomeSourcesService` import DTO types from `presentation/dtos`; `ReportsPdfService` writes to an Express `Response`.

## 4. Project Structure

```
src/
  main.ts                         bootstrap (see §3)
  app.module.ts                   the only module – register new entities/controllers/services here
  typeorm.config.ts               `dataSourceOptions` (used by AppModule) + `AppDataSource` (CLI/seed); loads .env via dotenv; migrations listed EXPLICITLY
  config/env.validation.ts        required env vars, validated at startup by ConfigModule
  application/services/*.service.ts
  application/utils/              money.ts (cents, installment split), dates.ts (Brazil-time months), report-periods.ts (SQL period predicates)
  presentation/controllers/*.controller.ts   (+ health.controller.ts → GET /api/health)
  presentation/dtos/*.dto.ts      money.validator.ts → @IsMoney()
  presentation/filters/           query-failed.filter.ts
  presentation/security/          jwt.guard.ts (JwtAuthGuard + @ReqUser), jwt.strategy.ts, security.module.ts
  infrastructure/persistence/typeorm/{entities,migrations,transformers}
  seeds/seed.ts                   idempotent dev seed (refuses NODE_ENV=production)
  docs/openapi.ts                 exports openapi/swagger.{json,yaml}
  assets/                         mail images, fonts (Inter, OFL) — copied to dist/assets by nest-cli.json; resolved from __dirname
```

## 5. Core Business Domain

| Entity (table) | Ownership | Key relations / notes |
| --- | --- | --- |
| `User` (`users`) | — | email unique, stored lowercased; `cpf` (11 digits, unique when set), `phone`, `birth_date` (nullable for older accounts); `email_verified_at`; `two_factor_enabled` |
| `AuthCode` (`auth_codes`) | via user | e-mail codes (`email_verification` \| `login`), SHA-256 hash, `expires_at`, `attempts`, `consumed_at`; user FK CASCADE |
| `Tenant` (`tenants`) | `createdByUserId` | unique `(created_by_user_id, name)`; a financial grouping ("responsável"), not a multi-tenancy boundary |
| `Category` (`categories`) | `createdByUserId` **nullable** | null owner = default category shared by all accounts (seeded by migration `1720000015000`, read-only); unique per owner on `lower(name)` (index `categories_owner_name_uq`, defaults share one bucket); `icon` = MDI class |
| `CreditCard` (`credit_cards`) | `createdByUserId` | `brand` ∈ `CARD_BRANDS` (Visa, Mastercard, Elo, American Express, Hipercard, Diners Club, Discover, JCB, Cabal — official names; DTO `IsIn` + CHECK `credit_cards_brand_chk`; migration `1720000017000` normalizes known spellings and aborts listing unknown ones); `active` flag (soft-hide, settable via PATCH); `limitAmount` numeric; `cardType` enum `credit_card_type` (`credit` default \| `debit`) |
| `Purchase` (`purchases`) | `createdByUserId` | `payment_method` `card`\|`pix`\|`cash` (default `card`); card FK **RESTRICT**, nullable — set iff `card` (CHECK `purchases_card_matches_method_chk`); Pix/cash are never installments (CHECK); tenant FK **RESTRICT** (tenant required), installment fields; `category_id` nullable, SET NULL |
| `Investment` (`investments`) | `createdByUserId` | `name` ≤ 120, `type` ∈ `INVESTMENT_TYPES` (fixed_income, stocks, real_estate_funds, funds, crypto, pension, other; CHECK), `institution` nullable ≤ 80 |
| `InvestmentMovement` (`investment_movements`) | via investment | `kind` contribution\|withdrawal\|balance, `amount` ≥ 0 (numeric), `date`; investment FK CASCADE |
| `Statement` (`statements`) | via card | unique `(credit_card_id, year, month)`; card FK CASCADE |
| `StatementItem` (`statement_items`) | via statement | `kind` `purchase`\|`subscription`; `purchase_id` (CASCADE, required for purchase items), `subscription_id` (SET NULL), `tenant_id` snapshot (SET NULL), `installment_number`; `category_id` (SET NULL) follows the source's category |
| `Subscription` (`subscriptions`) | `createdByUserId` | card FK CASCADE; tenant nullable, SET NULL; `categoryid` nullable, SET NULL |
| `FixedExpense` (`fixed_expenses`) | `createdByUserId` | tenant nullable; optional `startDate`/`endDate` validity |
| `IncomeSource` (`income_sources`) | `createdByUserId` | tenant nullable; `incomeType` `fixed`\|`one_time`; optional `startDate`/`endDate` |

## 6. Critical Business Rules (verified in code)

Change any of these only deliberately, and update tests/this file.

### Credit cards & tenants
- `list` returns only active cards; nearly every read path filters `card.active = true`. Resources on inactive cards are **not found** (404). Preserve this filter in new queries.
- `DELETE /credit-cards/:id` → 409 if the card has purchases or statements (deactivate with `PATCH {active:false}` instead).
- **Debit cards take no installments**: `PurchasesService` rejects `isInstallment=true` on a debit card (create and update, 400).
- `PATCH {cardType:'debit'}` on a credit card runs `CreditCardsService.convertInstallmentsToMonthly` in one transaction: each installment purchase becomes `installmentsTotal` one-time purchases with the original description (`addMonths`, `installmentAmountCents`), statement items are re-pointed by `installmentNumber` and relabeled `Compra à vista` (locked/paid statements keep their amounts; open ones are rebuilt), the original is deleted. Unmatched items abort the change (409). This deliberately bypasses `assertPurchaseEditable` because totals are preserved. Debit → credit converts nothing.
- `DELETE /tenants/:id` → 409 if any purchase, subscription, fixed expense, income source or statement item references it.

### Categories (`categories.service.ts`)
- `GET /categories` returns defaults + the user's own as `{ id, name, icon, isDefault }`, by name.
- Defaults can't be changed or deleted (403). Names are trimmed, 1–60 chars, unique per account ignoring case **including defaults** (409 `Category name already in use`).
- Deleting a category leaves purchases, subscriptions and statement items uncategorized (FK SET NULL).
- Purchases/subscriptions may only reference a default or an own category (`assertUsable`, 403).
- The category is not financial data: changing it on a purchase/subscription copies it to **all** its statement items (`StatementsService.syncItemsCategory`), locked/paid statements included.

### Pix and cash purchases
- `paymentMethod: "pix" | "cash"` purchases have `creditCardId = null`, are always one-time (`applyPaymentMethod`, 400 otherwise) and **never enter a statement**. Switching a card purchase to Pix/cash drops the card and rebuilds that card's open statements (still blocked if the purchase is in a locked/paid statement).
- Reports add them **by purchase date** (`utils/direct-purchases.ts`): `by-tenant` (in `purchasesTotal`), `by-category`, and the tenant PDF (rows labeled "(Pix)"/"(Dinheiro)"; the PDF 404s only when the month has neither statements nor such purchases). `GET /purchases` lists them regardless of cards (`creditCardId IS NULL OR card.active`) and filters by `paymentMethod`. `GET /reports/global` and `installments-total` still only see card purchases.

### Investments (`investments.service.ts`, `utils/investments.ts`)
- Value of an investment on a date (`valueAtCents`): the last **balance** movement up to that day plus contributions minus withdrawals dated **after** it (movements on the balance's own day are inside it; same-day balances: latest created wins). Without balances: contributions − withdrawals.
- Contributions/withdrawals need amount > 0, balances ≥ 0; a withdrawal can't exceed the value on its date (400).
- `GET /investments` (paged/filterable: `search` on name/institution, `type`; sort name/type/institution) adds `currentValue` (today, `todayInReportTimeZone`), `investedTotal` (contributions − withdrawals) and `lastMovementDate`. Movements: `GET/POST /investments/:id/movements`, `DELETE /investments/:id/movements/:movementId`. Deleting an investment deletes its movements.
- `GET /reports/investments?year&month` (dashboard): `totalValue` at the month's end, `contributions`/`withdrawals` dated in the month, `history` (value at the end of each of the last 6 months), `byType` (value per type at the month's end, fixed `INVESTMENT_TYPES` order, zero types omitted), `investmentsCount`.

### Statement / invoice import (`imports.service.ts`, `application/imports/`)
- `POST /imports/preview` (multipart `file` ≤ 5 MB, `kind` statement|invoice, optional `creditCardId`) parses in memory and **saves nothing**; the file is never stored. The parser is picked from the content (`detect.ts`): OFX (any bank, `BANKID` → bank), Nubank/Inter CSV, PDF statements (Itaú, Mercado Pago, Santander, Nubank) and PDF invoices (Itaú incl. Magalu/Luiza, Bradesco/Bradescard, Mercado Pago, Nubank). C6/Inter PDFs → 422 asking for OFX/CSV; unknown → 422 `Unrecognized file`. Errors are `ImportFormatError` → 422 with an English message the frontend maps.
- PDFs are read with pdf.js (`pdf-text.ts`: lines with item x positions; glued accent pieces merged). Parsers are layout-specific: two-column invoices split by x (`readingColumns`) and read by section; wrapped descriptions attach to the row holding date/amount (`anchoredRows`). Itaú/Bradesco/MP print installments at the **original purchase date**, Nubank at the **charge date** (dated back k−1 months). Year comes from the document date (`inferYear`).
- Lines: positive `amountCents` + `direction` (invoice: charge = debit; payments/refunds = credit). Suggestions (`suggestions.ts`): invoices import charges; statements import debits as Pix/cash purchases and credits as one-time income, except card payments, own transfers (profile name words in order, or "first name + 2 letters"), yields/investments, loans and Nubank "Pix no crédito" (the credit and the matching same-day Pix). Category: user's history by description signature, then keywords → default categories.
- Dedupe: `import_key` (migration `1720000019000`, unique per user, on purchases and income_sources) = sha1 of bank/kind/date/amount/description (or bank id) + occurrence; **installments exclude the installment number**, so next month's invoice recognizes the purchase. Preview flags `already_imported` and `possible_duplicate` (same date+amount, or same installment count and ≈ total).
- `POST /imports/confirm` creates everything in one transaction, skips existing keys, rebuilds the card's open statements once. Invoice lines → card purchases (installment k/n: `totalAmount = amount × n`, `installmentsPaid = k − 1`, date = original purchase); statement lines → Pix/cash purchases or one-time incomes. Installments only on credit-card invoices.
- Tests use synthetic fixtures only — never commit real statements/invoices.

### Purchases & installments (`purchases.service.ts`)
- An installment purchase is **one row** (`totalAmount`, `installmentsTotal`, `installmentsPaid`).
- `totalAmount` > 0; card owned **and active**; tenant owned by the user (create and update).
- `validateInstallments`: `isInstallment=false` ⇒ `installmentsTotal=null`, `installmentsPaid=0`; `isInstallment=true` ⇒ `installmentsTotal >= 1` and `0 <= installmentsPaid <= installmentsTotal`.
- **A purchase with an item in a locked or paid statement cannot be updated or deleted** (409, `StatementsService.assertPurchaseEditable`) — except an update that only changes `categoryId` (`changesBeyondCategory`; the frontend resends every field, so values are compared, not keys).
- Create/update/delete run in a transaction and call `StatementsService.rebuildOpenStatements` for the affected card(s), so open statements always reflect current purchases.

### Statements (`statements.service.ts`)
- "Open" statement = `locked = false` and `paidAt IS NULL`. Only open statements are ever rebuilt.
- `generate`: card owned and active; transaction + `pessimistic_write` lock on the existing row. Locked or paid → 409. Existing open statement is regenerated **in place** (same id) with request `closingDate`/`dueDate`/`locked` and `adjustmentAmount` **reset to 0.00** (product decision).
- `rebuildItems` (shared by generate and `rebuildOpenStatements`):
  - installment allocation by **calendar month of `purchaseDate`** (installment k in purchase month + k−1); `closingDate`/`dueDate` don't affect allocation;
  - one-time purchase → `Compra à vista` item if `purchaseDate` is in the month;
  - installment amounts from `splitInstallments` (cents): `per = round(total/n)`, **last absorbs the remainder**; label `Parcela k/n`, `installmentNumber = k`;
  - one `subscription` item per active subscription of the card (label = description truncated to 120, `tenantId` snapshot) — subscriptions are **snapshotted**, later changes don't alter closed statements;
  - every item stores `tenantId` and `categoryId` (purchase's or subscription's);
  - `totalAmount = sum(items) + adjustmentAmount`.
- `rebuildOpenStatements` keeps the existing adjustment (only explicit regeneration resets it). Subscription create/update/delete also triggers it.
- `update`: adjustment (signed, credits negative) shifts `totalAmount` by the delta. Locked → dates/adjustment changes rejected (409). Paid → cannot be unlocked (409).
- `pay`: transaction + row lock; requires `locked` (400); if not yet paid sets each installment purchase's `installmentsPaid = max(current, min(installmentNumber, installmentsTotal))` (idempotent, never decreases); always sets `paidAmount`/`paidAt` (date as UTC midnight, or now). `paidAmount` is not compared to `totalAmount`.

### Reports (`reports.service.ts`, `reports-pdf.service.ts`)
- Month periods come from `monthPeriod()`; recurring-record predicates from `application/utils/report-periods.ts` — reuse them, keep both reports consistent.
- `GET /reports/by-tenant?year&month`, per tenant:
  - `purchasesTotal` / `subscriptionsTotal` = statement items of that month by `kind`, grouped by the item's **snapshot `tenantId`** (items with null tenant, e.g. migrated "Assinaturas (histórico)", are excluded) → depends on generated statements;
  - `fixedExpensesTotal` = fixed expenses valid in the month (`startDate`/`endDate`, null = open-ended);
  - `incomeSourcesTotal` = `fixed` incomes valid in the month + `one_time` incomes whose `startDate` is in the month;
  - `accumulatedAmount = income − fixed − (purchases + subscriptions)`.
- `GET /reports/global`: with `statementId` → that statement's total; otherwise all-time sum of purchase totals + active subscriptions (semantics unchanged/undefined — confirm with the user before relying on it).
- `GET /reports/installments-total`: remaining installment amount from the reference month on, by **calendar elapsed months** using the same `splitInstallments` as statements (not `installmentsPaid`).
- `GET /reports/by-category?year&month[&tenantId]`: the month's statement items of active cards plus Pix/cash purchases dated in the month, summed per category, largest first, zero rows dropped: `[{ categoryId, name, icon, totalAmount }]` (`categoryId: null` = uncategorized). Adjustments have no category, so the sum can differ from the statement totals by the adjustments.
- PDF `GET /reports/tenants/:tenantId/monthly-pdf?year&month`: same rules as by-tenant; 404 if the user has no statements that month. Filename header uses an ASCII fallback + RFC 5987 `filename*`. The service only assembles the data; drawing lives in `infrastructure/pdf/tenant-report-pdf.ts` (`createTenantReportPdf`). Content and section order are the report's contract — keep them: header (Responsável, Mês), "Lançamentos do período" (Descrição / Origem = card, Pix or Dinheiro / Valor), "Total geral" (Compras, Assinaturas, Despesas fixas, Total), and, when there is income or fixed expenses, "Saldo do responsável" (Fontes de renda + total, Despesas fixas + total, Gastos no relatório, Total de despesas, Saldo restante). Only the look follows the app: Inter TTFs embedded from `assets/fonts` (OFL license alongside), zinc tokens, indigo period chip, tables with a light header row, rounded total boxes, signed balance in green/red, header repeated on page breaks, footer with page numbers (`bufferPages`). Check layout changes by rendering a sample (`pdftoppm`).

### Money and dates
- Columns `numeric(14,2)` (older tables) / `numeric(12,2)` (subscriptions, fixed expenses, income). Amounts travel as **strings**.
- Do arithmetic in integer cents with `toCents`/`fromCents`/`splitInstallments` (`application/utils/money.ts`). Don't add a decimal library unless asked.
- Every DTO money field uses `@IsMoney()` (≤ 10 integer digits, ≤ 2 decimals, non-negative); `@IsMoney({ allowNegative: true })` only for `adjustmentAmount`.
- "Today"/month logic uses `REPORT_TIME_ZONE = 'America/Sao_Paulo'` (`application/utils/dates.ts`). A `one_time` income without `startDate` defaults to today in Brazil time.

## 7. Authentication and Security

- `POST /api/auth/register` (password 8–72 chars, bcrypt, email lowercased, valid CPF via `application/utils/cpf.ts`, phone 10–11 digits, birth date 1900..today; 409 on duplicate e-mail or CPF) creates an **unconfirmed** account and e-mails a code. Fictitious/test e-mail domains are refused at sign-up (400 `Email domain not allowed`; list in `application/utils/email.ts`, mirrored in the frontend — keep both in sync); `POST /auth/verify-email` confirms and returns `{ accessToken }` (payload `{ sub, email }`, expiry `1d`). Login has no minimum length so older accounts still work.
- `POST /api/auth/login` returns `{ accessToken }`, or `{ emailVerificationRequired, email }` (unconfirmed account, code re-sent), or `{ twoFactorRequired, challengeToken }` when the user enabled the second factor; `POST /auth/login/verify` exchanges challenge + code for the access token.
- Codes: `VerificationCodesService` (6 digits, SHA-256 only, 10 min TTL, 5 attempts, 60 s resend cooldown, issuing a new code consumes older ones). The challenge is a JWT with `purpose: "2fa"` (10 min); **`JwtStrategy` rejects any token carrying `purpose`** — keep that if you add other purpose tokens. Resend endpoints never reveal whether an e-mail exists.
- Profile: `UsersController` (`/users/me`, `PATCH /users/me`, `POST /users/me/password`, `PATCH /users/me/two-factor`); responses use `toProfile()` (never the entity). Wrong current password is **400, not 401** (the frontend treats 401 as an expired session). **The CPF is permanent**: accounts without one may set it once; changing a set CPF → 400 `CPF cannot be changed`.
- E-mail: `MailService` (`infrastructure/mail`, nodemailer over `SMTP_*`). Without `SMTP_HOST` it logs the message (env validation requires `SMTP_HOST` in production).
- Code e-mail template: `infrastructure/mail/code-email.ts` (table-based HTML with inline styles, frontend design tokens, plain-text alternative). Images (`assets/mail/logo-mark.png`, `code-illustration.png`) are **embedded as CID attachments**, so they render without public hosting; keep them PNG (WebP/SVG don't render in Outlook) and small.
- Every non-auth controller has `@ApiBearerAuth('bearer')` + `@UseGuards(JwtAuthGuard)` at class level; `@ReqUser()` yields `{ userId, email }`. Keep this on new controllers (`HealthController` is the only intentionally public one besides auth).
- Rate limiting (`presentation/security/rate-limits.ts`, `RATE_LIMITS`), per client IP: throttlers `default` (120/min) and `hourly` (3000/h) on every route; `AuthController` 10/min + 30/h (`@Throttle(RATE_LIMITS.auth)`); routes that send e-mail (register, resend-verification, login/resend) 10/h (`RATE_LIMITS.sendsEmail`). The tracker reads `CLIENT_IP_HEADER` (Render: `cf-connecting-ip`, set by Cloudflare) and falls back to `req.ip`; IPv6 grouped by /64; logs the source once at the first request. `HealthController` uses `@SkipThrottle()`. New e-mail-sending routes need `RATE_LIMITS.sendsEmail`.
- **Ownership pattern** (preserve and replicate): fetch → 404 if missing → 403 if `createdByUserId !== userId`; or query with `createdByUserId: userId` (+ `active: true` for cards) → 403 `'... not found or not owned by user'`. Statements: ownership via `statement.creditCard.createdByUserId`. Always ownership-check referenced cards and tenants.
- JWT secret comes only from `ConfigService.getOrThrow('JWT_SECRET')` (`JwtModule.registerAsync` + `JwtStrategy`). No fallback secret — startup fails if missing (`config/env.validation.ts`).
- `helmet()` is applied globally; Swagger is disabled when `NODE_ENV=production`.
- Never log tokens, password hashes, or financial payloads. Never return a `User` entity directly.

## 8. Database and Persistence

- `synchronize: false`. **Never enable it.** All schema changes go through migrations.
- `migrationsRun` is on when `NODE_ENV=production`: the app applies pending migrations at boot (the prod image has no ts-node for the CLI). A failing migration stops the deploy, so test it on a DB copy first.
- Deployment: `render.yaml` (Render free Docker web service, health check `/api/health`) + Neon Postgres (`DB_SSL=true`) + Brevo (or Resend with a verified domain); see README "Deploying".
- **Migrations are registered manually** in `typeorm.config.ts` (`migrations: [...]`). `npm run typeorm:gen` writes `migrations/auto-<ts>.ts` — rename to `<timestamp>_<snake_name>.ts` and register it.
- Migrations are hand-written SQL with a `down`; newer ones idempotent where practical. Never edit an applied migration. Data backfills must keep existing financial totals unchanged (see `1720000010000_add_subscription_items_to_statements.ts`). Test new migrations on a restored copy of the DB (run → verify → revert → run) before the real one.
- **Two column-naming styles**:
  - `users`, `tenants`, `credit_cards`, `purchases`, `statements`, `statement_items`: snake_case.
  - `subscriptions`, `fixed_expenses`, `income_sources`: unquoted camelCase → stored **lowercase** (`creditcardid`, `tenantid`, `incometype`), except the newer `start_date`/`end_date`.
  - In QueryBuilder use entity property paths (`sub.creditCardId`); raw strings like `s.creditcardid` remain in a few places.
- Queries: named parameters only; `getRawMany` aliases double-quoted (`AS "creditCardId"`).
- Transactions: `this.dataSource.transaction(async (manager) => …)` + `manager.getRepository(...)` for anything touching more than one financial record; use `lock: { mode: 'pessimistic_write' }` when reading a row you are about to decide on.

## 9. Coding Standards and Conventions

- Files: kebab-case with role suffix (`<plural>.service.ts`, `<plural>.controller.ts`, `<singular>.dto.ts`, `<singular>.entity.ts`). Classes `CreditCardsService`, `CreateXDto` / `UpdateXDto` / `XIdParamDto` / `ListXQueryDto`.
- Imports are relative. Quote style is mixed (older files double quotes); keep the file's style, use single quotes in new files, don't reformat untouched code.
- Controllers: thin — `user.userId` + DTO to one service call.
- Service signatures: older `create(dto, userId)`, newer `create(userId, dto)` — follow the service you are editing.
- DTOs: class-validator + `@ApiProperty`. Strings get `Length`/`MaxLength` matching the column size; ids via `@IsUUID()` DTOs or `ParseUUIDPipe`; money via `@IsMoney()`; dates via `@IsDateString()`.
- Global `ValidationPipe` rejects unknown fields (`forbidNonWhitelisted`).
- Delete responses: older services return nothing (200), newer `{ deleted: true }`.

## 10. API Development Guidelines

- Routes under `/api`; Swagger at `/api/docs` (non-production). Keep decorators accurate; `npm run docs:openapi` to export.
- REST style: `POST` create, `GET` list, `GET :id`, `PATCH :id`, `DELETE :id`, actions as `POST :id/<action>`.
- Don't change status codes or response shapes without being asked — the frontend (`financial_app_front_end`) depends on them.
- **List paging is opt-in** (`PageQueryDto`, `application/utils/pagination.ts`): without `page` a list endpoint returns the full array (frontend selects, dashboard, PDF export rely on it); with `page` (1-based), `pageSize` (≤ 100, default 10), `sortBy`, `sortDir` it returns `{ items, total, page, pageSize }`. `paginate()` maps client sort keys to columns through a per-endpoint whitelist (unknown keys → default order; `id` always breaks ties) and uses offset/limit, so only to-one joins are allowed. Paged lists: credit-cards, tenants (`search`), categories (`scope=own|default`, `search`), purchases (+ `categoryId`, `search`), subscriptions (`search`, `creditCardId`, `categoryId`, `status=active|inactive`), fixed-expenses, income-sources, statements (card + year + month **without** `page` still returns the single statement or 404).
- New user-scoped resources: `createdByUserId`, guarded controller, user filter on every query, ownership checks on referenced cards/tenants, respect `card.active`.

## 11. Testing Guidelines

- Specs live next to the code. Pattern: construct the service directly with mocked repositories and a fake `DataSource.transaction`/`EntityManager` (see `statements.service.spec.ts`, `purchases.service.spec.ts`). Also: `utils.spec.ts`, `money.validator.spec.ts`, `env.validation.spec.ts`, `query-failed.filter.spec.ts`.
- No DB-backed integration tests exist. For changes to report SQL or migrations, also verify against a restored DB copy.
- Required when touching: installment split, statement month mapping, rebuild/regeneration rules, payment, report aggregation, ownership/`active` checks.
- Checks: `npm test`, `npx tsc --noEmit`, `npm run build`. CI (`.github/workflows/ci.yml`) runs the same.

## 12. Development Commands (all defined in `package.json`)

```bash
npm install
npm run start:dev           # watch mode; http://localhost:3000/api
npm run build               # nest build → dist/ (copies assets)
npm test
npm run typeorm:run         # apply migrations (loads .env; override DB_HOST=localhost when .env points to host.docker.internal)
npm run typeorm:revert
npm run typeorm:gen
npm run seed                # dev only
npm run docs:openapi        # needs DB
docker compose up -d --build -V      # dev container (target "dev", runs as uid 1000); -V refreshes the node_modules volume after dependency changes
docker compose --profile db up -d    # optional Postgres service "db"
# docker compose also starts Mailpit (SMTP on :1025, inbox UI on http://localhost:8025) for dev e-mail
docker build --target prod -t financial-app .   # production image (non-root, healthcheck on /api/health)
```

## 13. Environment and Configuration

| Var | Used by | Notes |
| --- | --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | `typeorm.config.ts` | required (validated at startup) |
| `JWT_SECRET` | `SecurityModule`, `JwtStrategy` | required, no fallback |
| `PORT` | `main.ts` | default 3000 |
| `FRONTEND_ORIGIN` | CORS | default `http://localhost:5173` |
| `NODE_ENV` | Swagger, seed | `production` disables Swagger and the seed |
| `DB_SSL` | `typeorm.config.ts` | `true` = TLS (hosted Postgres such as Neon) |
| `TRUST_PROXY` | `main.ts` | number of proxies in front of the app; makes `req.ip` the client IP; default 0 |
| `CLIENT_IP_HEADER` | `rate-limits.ts` | header with the visitor's IP for per-IP throttling (`cf-connecting-ip` on Render, set in `render.yaml`); empty = `req.ip` |
| `RESEND_API_KEY`, `BREVO_API_KEY`, `MAIL_FROM`, `PUBLIC_URL` | `MailService` | HTTP APIs, precedence Resend > Brevo > SMTP (needed where outbound SMTP is blocked, e.g. Render free); `MAIL_FROM` falls back to `SMTP_FROM`; Brevo has no inline images, so its HTML points to `/api/mail-assets` (static `src/assets/mail`, `main.ts`) on `PUBLIC_URL` or `RENDER_EXTERNAL_URL` (required in production with Brevo) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | `MailService` | optional in dev (logs instead); production requires `RESEND_API_KEY`, `BREVO_API_KEY` or `SMTP_HOST`; compose points the dev app at Mailpit |

`.env` is git-ignored; `.env.example` is the template. Never copy real values from `.env` into code, docs, or output.

## 14. Rules for Modifying Existing Code (mandatory)

1. Read the relevant existing code (controller, DTO, service, entity, migrations) before proposing or implementing changes.
2. Trace the full impact across related rules — purchase/subscription changes affect open statements, payments, all reports, and the PDF.
3. Preserve existing architectural and naming conventions (§3, §9).
4. Search for reusable functionality first (`application/utils`, `rebuildOpenStatements`, `assertPurchaseEditable`, `@IsMoney`, ownership checks).
5. Never assume the README is more accurate than the implementation.
6. Never modify financial calculations without understanding downstream effects; statements and `installmentsTotalFromMonth` must share `splitInstallments`.
7. Always preserve authentication, authorization, ownership, and `card.active` checks.
8. Never modify the schema without a new, registered migration and consideration of existing data; never enable `synchronize`; avoid destructive migrations unless explicitly requested.
9. Keep changes minimal, focused, and consistent with surrounding code.
10. Add or update tests when changing existing behavior (or state explicitly why none were run).
11. Do not introduce new dependencies without a clear technical justification.
12. Never silently change established business behavior. Fixing a quirk is a behavior change: call it out and get confirmation.
13. Document significant architectural decisions (update this file when conventions change).
14. Explicitly communicate uncertainties instead of inventing missing implementation details.
15. Do not modify unrelated files without justification.

## 15. Common Pitfalls and Important Constraints

- Reports and the PDF read purchases/subscriptions **only from statement items** — no generated statement for a card/month → nothing from that card in the report.
- Closed (locked/paid) statements are immutable history: no regeneration, no rebuild, purchases in them are frozen.
- 21 statements migrated with an unattributed `Assinaturas (histórico)` item (subscription gap that could not be matched to current subscriptions) — they count in statement totals but not in per-tenant reports.
- Lowercase column names on `subscriptions`/`fixed_expenses`/`income_sources` (§8); `subscriptions/fixed_expenses/income_sources.createdbyuserid` have no FK to `users`.
- New migrations must be added to `typeorm.config.ts`.
- `statement_items.label` is varchar(120) — truncate anything longer.
- README vs code: `GET /statements` with `creditCardId`+`year`+`month` returns a single object (404 if missing); Swagger documents card/tenant/purchase DELETEs as 204 but they return 200.
