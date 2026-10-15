# Financial App Backend

REST API for personal financial management focused on credit cards, purchases, installments, monthly statements, recurring subscriptions, fixed expenses, income sources, and financial reporting.

## Overview

Financial App Backend is the server-side application of a personal finance management platform.

The API was designed primarily around credit card expense tracking, but also includes broader financial management features such as recurring expenses, income sources, monthly reports, installment projections, and PDF report generation.

The project is built with NestJS, TypeScript, TypeORM, and PostgreSQL and follows a layered architecture that separates HTTP concerns, business rules, and persistence.

## Main Features

- User registration and authentication
- JWT-based authorization
- User-scoped financial data
- Credit card management
- Purchase management
- Support for one-time and installment purchases
- Installment payment tracking
- Monthly credit card statement generation
- Credit card statement payment processing
- Recurring subscription management
- Fixed expense management
- Income source management
- Financial grouping through tenants
- Financial reports by tenant
- Global financial reports
- Future installment projections
- Monthly PDF report generation
- DTO-based request validation
- Swagger/OpenAPI documentation
- Database migrations with TypeORM
- Docker-based development environment

## Tech Stack

| Category | Technology |
| --- | --- |
| Language | TypeScript |
| Framework | NestJS |
| ORM | TypeORM |
| Database | PostgreSQL |
| Authentication | JWT / Passport |
| Password Hashing | bcrypt |
| Validation | class-validator / class-transformer |
| API Documentation | Swagger / OpenAPI |
| PDF Generation | PDFKit |
| Testing | Jest |
| Containers | Docker / Docker Compose |

## Architecture

The project follows a layered architecture inspired by Clean Architecture principles.

```text
src/
├── application/
│   └── services/
│       ├── auth.service.ts
│       ├── credit-cards.service.ts
│       ├── fixed-expenses.service.ts
│       ├── income-sources.service.ts
│       ├── purchases.service.ts
│       ├── reports-pdf.service.ts
│       ├── reports.service.ts
│       ├── statements.service.ts
│       ├── subscriptions.service.ts
│       └── tenants.service.ts
│
├── infrastructure/
│   └── persistence/
│       └── typeorm/
│           ├── entities/
│           ├── migrations/
│           └── transformers/
│
├── presentation/
│   ├── controllers/
│   ├── dtos/
│   └── security/
│
├── docs/
├── seeds/
├── app.module.ts
├── main.ts
└── typeorm.config.ts
```

The standard request flow is:

```text
HTTP Request
      ↓
Controller
      ↓
DTO Validation
      ↓
Application Service
      ↓
TypeORM Repository
      ↓
PostgreSQL
```

## Core Domain

The main entities are:

```text
User
Tenant
CreditCard
Purchase
Statement
StatementItem
Subscription
FixedExpense
IncomeSource
```

A simplified relationship diagram:

```text
User
 │
 ├── Tenant
 │    │
 │    ├── Purchase
 │    ├── Subscription
 │    ├── FixedExpense
 │    └── IncomeSource
 │
 └── CreditCard
      │
      ├── Purchase
      ├── Subscription
      └── Statement
            │
            └── StatementItem
                  │
                  └── Purchase
```

## Tenants

In this project, a `Tenant` works primarily as a financial grouping or responsible entity.

It can be used to organize expenses and income by person, household, company, department, or any other financial context.

Examples:

```text
Personal
Family
Home
Company
John
Mary
```

Purchases, subscriptions, fixed expenses, and income sources can be associated with a tenant, allowing reports to separate financial data by responsible entity.

## Credit Cards

Credit cards contain information such as:

```text
nickname
brand
last4
limitAmount
cardType
active
createdByUserId
```

Example:

```json
{
  "nickname": "Nubank",
  "brand": "Mastercard",
  "last4": "1234",
  "limitAmount": "10000.00",
  "cardType": "credit"
}
```

`cardType` is `credit` (default) or `debit`. Debit cards only accept one-time purchases: an installment purchase on a debit card returns 400. Changing a credit card to debit (`PATCH {"cardType": "debit"}`) converts each of its installment purchases into one one-time purchase per installment, with the original description, dated in that installment's month (day clamped to the month's end). Amounts use the same installment split as statements, statement items are re-pointed to the new purchases (labeled `Compra à vista`, also in closed statements), and statement totals do not change.

A card can be deactivated with `PATCH /api/credit-cards/:id` (`{"active": false}`); inactive cards and their data are hidden from every endpoint. Cards with purchases or statements cannot be deleted — deactivate them instead.

## Purchases

Purchases can be registered as either one-time or installment-based transactions.

The purchase model contains information such as:

```text
creditCardId
tenantId
description
purchaseDate
totalAmount
isInstallment
installmentsTotal
installmentsPaid
```

Example of an installment purchase:

```text
Notebook
Total: R$ 6,000.00
Installments: 10
```

The system stores this as a single purchase instead of creating one database record for each installment.

Installment distribution is calculated later when monthly statements are generated.

## Credit Card Statements

A `Statement` represents the invoice for a credit card in a given month and year.

Typical fields include:

```text
creditCardId
year
month
closingDate
dueDate
totalAmount
adjustmentAmount
locked
paidAt
paidAmount
```

The statement generation process analyzes the card's purchases and determines which transactions and installments belong to the requested period (by the calendar month of the purchase date), and snapshots the card's active subscriptions as statement items.

- `totalAmount = sum(items) + adjustmentAmount`. The adjustment is a manual signed amount (interest, fees, credits).
- Regenerating an **open** statement rebuilds it in place and resets the adjustment.
- Locked or paid statements cannot be regenerated, and purchases that appear in them cannot be edited or deleted (HTTP 409).
- Open statements are updated automatically whenever purchases or subscriptions of the card change.

Example:

```text
Notebook
Total: R$ 6,000
6 installments
Purchased in June

June      → Installment 1/6
July      → Installment 2/6
August    → Installment 3/6
September → Installment 4/6
...
```

## Statement Items

`StatementItem` represents an individual line inside a statement.

It connects a statement with the purchase that originated the financial charge.

Example:

```text
Statement
  ├── Grocery Store - R$ 350.00
  ├── Notebook - Installment 3/6 - R$ 1,000.00
  └── Smartphone - Installment 2/10 - R$ 300.00
```

This approach keeps the original purchase separated from its monthly financial impact.

## Statement Payment

The API includes a statement payment flow.

A statement must be locked before it can be paid. Payment runs in a database transaction with a row lock and:

1. Sets `installmentsPaid` of each installment purchase to at least the installment number paid in that statement (idempotent, never decreases, safe for out-of-order payments).
2. Registers the paid amount and payment date.

Paying an already-paid statement again only updates amount and date. A paid statement cannot be unlocked.

## Subscriptions

Subscriptions represent recurring credit card expenses.

Examples:

```text
Netflix
Spotify
Google One
Cloud Hosting
```

Each subscription can contain:

```text
creditCardId
tenantId
description
amount
active
createdByUserId
```

Active subscriptions are considered when generating monthly financial data.

## Fixed Expenses

Fixed expenses represent recurring costs that are not necessarily tied to a credit card.

Examples:

```text
Rent
Internet
Condominium
Electricity
Insurance
```

Fixed expenses can be associated with a tenant and are used in financial reports. Optional `startDate`/`endDate` limit the months in which they count (empty = every month).

## Income Sources

Income sources represent recurring or expected income.

Examples:

```text
Salary
Freelance
Rental income
Consulting
```

They can also be associated with a tenant and are used to calculate available financial balance. `fixed` incomes count in every month within their optional `startDate`/`endDate`; `one_time` incomes count in the month of their `startDate` (defaults to the creation day, Brazil time).

## Financial Reports

The API provides multiple reporting endpoints.

### Reports by Tenant

```http
GET /api/reports/by-tenant
```

Provides financial information grouped by tenant.

The calculation considers values such as:

```text
Purchases
Subscriptions
Fixed Expenses
Income Sources
```

A simplified balance calculation is:

```text
Available Balance =
Income
- Fixed Expenses
- Purchases
- Subscriptions
```

### Global Report

```http
GET /api/reports/global
```

Provides a consolidated financial overview.

### Future Installments

```http
GET /api/reports/installments-total
```

Calculates the amount already committed to future installment payments.

### Monthly PDF Report

```http
GET /api/reports/tenants/:tenantId/monthly-pdf
```

Generates a monthly financial report using PDFKit.

## Authentication

Authentication is implemented using JWT and Passport.

Sign-up (name, e-mail, password, CPF, phone, birth date):

```text
POST /auth/register  → account created unconfirmed, 6-digit code e-mailed
POST /auth/verify-email {email, code} → e-mail confirmed → { accessToken }
```

Login:

```text
POST /auth/login {email, password}
  → { accessToken }                                  (no second factor)
  → { twoFactorRequired, challengeToken } + code e-mailed  (two-factor enabled in the profile)
  → { emailVerificationRequired, email } + code e-mailed   (account not confirmed yet)
POST /auth/login/verify {challengeToken, code} → { accessToken }
```

Fictitious/test e-mail domains (e.g. `teste.com`, `exemplo.com`, `example.com`, `*.test`) are refused at sign-up. Codes are 6 digits, stored only as SHA-256 hashes, valid for 10 minutes, accept 5 attempts and can be re-sent after 60 seconds. The `challengeToken` lasts 10 minutes and is rejected as an access token. Accounts created before e-mail confirmation existed were marked as confirmed by the migration.

E-mail goes through any SMTP server (`SMTP_*` variables). In development `docker compose up` starts **Mailpit**, which captures every message: open `http://localhost:8025` to read the codes. Without `SMTP_HOST` (not allowed in production) the e-mail is written to the API log.

Protected endpoints require:

```http
Authorization: Bearer <token>
```

## Request Validation

The API uses a global NestJS `ValidationPipe` configured with:

```text
whitelist: true
forbidNonWhitelisted: true
transform: true
enableImplicitConversion: true
```

This means unknown fields are rejected and request payloads are validated against DTO definitions.

## Environment Variables

Create the environment file:

```bash
cp .env.example .env
```

Example:

```env
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=cardsdb

JWT_SECRET=supersecret
FRONTEND_ORIGIN=http://localhost:5173
```

Generate a secure JWT secret:

```bash
openssl rand -hex 32
```

## Requirements

For local execution:

- Node.js
- npm
- PostgreSQL

For containerized execution:

- Docker
- Docker Compose
- A PostgreSQL instance reachable from the application container

## Installation

Clone the repository:

```bash
git clone https://github.com/joaomunizdev/financial_app_back_end.git
cd financial_app_back_end
```

Install dependencies:

```bash
npm install
```

Create the environment file:

```bash
cp .env.example .env
```

## Database Configuration

The application uses PostgreSQL.

Example local database configuration:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=cardsdb
```

When running the backend inside Docker while PostgreSQL is running on the host machine, you may use:

```env
DB_HOST=host.docker.internal
```

## Database Migrations

Run pending migrations (the CLI reads `.env`; when `DB_HOST` points to `host.docker.internal`, override it on the host):

```bash
npm run typeorm:run
DB_HOST=localhost npm run typeorm:run
```

Generate a new migration:

```bash
npm run typeorm:gen
```

Revert the latest migration:

```bash
npm run typeorm:revert
```

The project disables TypeORM automatic synchronization:

```text
synchronize: false
```

Database schema changes should therefore be managed through migrations.

## Database Seed

Run the seed script with:

```bash
npm run seed
```

## Running Locally

Start the application in development mode:

```bash
npm run start:dev
```

The API will be available at:

```text
http://localhost:3000/api
```

## Running with Docker

Build and start the application (`-V` refreshes the `node_modules` volume after dependency changes):

```bash
docker compose up -d --build -V
```

Optional PostgreSQL container (set `DB_HOST=db` in `.env`):

```bash
docker compose --profile db up -d
```

Production image (non-root, health check on `/api/health`, Swagger disabled):

```bash
docker build --target prod -t financial-app .
```

View logs:

```bash
docker compose logs -f app
```

Stop the application:

```bash
docker compose down
```

## Production Build

Build the project:

```bash
npm run build
```

## API Documentation

Swagger UI is available (when `NODE_ENV` is not `production`) at:

```text
http://localhost:3000/api/docs
```

## Exporting OpenAPI Specification

Generate the OpenAPI files with:

```bash
npm run docs:openapi
```

This generates:

```text
openapi/swagger.json
openapi/swagger.yaml
```

## Main API Endpoints

### Health

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/health` | API and database status (public) |

### Authentication

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Register a user (password 8–72 chars, valid CPF, phone, birth date); e-mails a confirmation code |
| POST | `/api/auth/verify-email` | Confirm the e-mail with the code and sign in |
| POST | `/api/auth/resend-verification` | Re-send the confirmation code (same answer for unknown e-mails) |
| POST | `/api/auth/login` | Password step (token, or the next code step) |
| POST | `/api/auth/login/verify` | Second-factor code step |
| POST | `/api/auth/login/resend` | Re-send the login code |

### Users

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/users/me` | Signed-in user profile |
| PATCH | `/api/users/me` | Update name, phone, birth date; CPF only if not set yet (it can't be changed) |
| POST | `/api/users/me/password` | Change password (requires the current one) |
| PATCH | `/api/users/me/two-factor` | Turn the login second factor on/off (requires the password) |

Authentication endpoints are rate-limited to 10 requests per minute per IP (120 per minute for the rest of the API).

### Credit Cards

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/credit-cards` | Create a credit card |
| GET | `/api/credit-cards` | List credit cards |
| PATCH | `/api/credit-cards/:id` | Update a credit card |
| DELETE | `/api/credit-cards/:id` | Delete a credit card |

### Tenants

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/tenants` | Create a tenant |
| GET | `/api/tenants` | List tenants |
| PATCH | `/api/tenants/:id` | Update a tenant |
| DELETE | `/api/tenants/:id` | Delete a tenant |

### Categories

Default categories (shared, read-only) plus each user's own.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/categories` | List default and own categories (`isDefault` flag) |
| POST | `/api/categories` | Create an own category (`name`, optional `icon`) |
| PATCH | `/api/categories/:id` | Update an own category |
| DELETE | `/api/categories/:id` | Delete an own category (records become uncategorized) |

### Purchases

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/purchases` | Create a purchase |
| GET | `/api/purchases` | List purchases |
| PATCH | `/api/purchases/:id` | Update a purchase |
| POST | `/api/purchases/:id/installments-paid` | Update paid installments |
| DELETE | `/api/purchases/:id` | Delete a purchase |

### Statements

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/statements` | Generate a statement |
| GET | `/api/statements` | List statements |
| GET | `/api/statements/:id` | Retrieve a statement |
| PATCH | `/api/statements/:id` | Update a statement |
| POST | `/api/statements/:id/pay` | Pay a statement |

### Subscriptions

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/subscriptions` | Create a subscription |
| GET | `/api/subscriptions` | List subscriptions |
| GET | `/api/subscriptions/:id` | Retrieve a subscription |
| PATCH | `/api/subscriptions/:id` | Update a subscription |
| DELETE | `/api/subscriptions/:id` | Delete a subscription |

### Fixed Expenses

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/fixed-expenses` | Create a fixed expense |
| GET | `/api/fixed-expenses` | List fixed expenses |
| GET | `/api/fixed-expenses/:id` | Retrieve a fixed expense |
| PATCH | `/api/fixed-expenses/:id` | Update a fixed expense |
| DELETE | `/api/fixed-expenses/:id` | Delete a fixed expense |

### Income Sources

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/income-sources` | Create an income source |
| GET | `/api/income-sources` | List income sources |
| GET | `/api/income-sources/:id` | Retrieve an income source |
| PATCH | `/api/income-sources/:id` | Update an income source |
| DELETE | `/api/income-sources/:id` | Delete an income source |

### Reports

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/reports/by-tenant` | Generate financial report by tenant |
| GET | `/api/reports/by-category` | Month's statement items per category (`year`, `month`) |
| GET | `/api/reports/global` | Generate global financial report |
| GET | `/api/reports/installments-total` | Calculate future installment commitments |
| GET | `/api/reports/tenants/:tenantId/monthly-pdf` | Generate monthly PDF report |

## Testing

Run the unit tests (no database needed):

```bash
npm test
```

CI (`.github/workflows/ci.yml`) runs type checking, tests and the build on every push and pull request.

## Related Repository

Frontend application:

```text
https://github.com/joaomunizdev/financial_app_front_end
```

## Security Notes

Before deploying to production:

- Replace the default JWT secret.
- Restrict `FRONTEND_ORIGIN` to the trusted frontend URL.
- Use HTTPS.
- Use secure PostgreSQL credentials.
- Do not commit `.env` files.
- Keep database ports private whenever possible.
- Store secrets in a proper secret management service.
- Review user ownership checks for every new financial resource.

## License

No explicit license file is currently included in this repository.
