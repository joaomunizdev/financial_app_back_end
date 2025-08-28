import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "./infrastructure/persistence/typeorm/entities/user.entity";
import { Tenant } from "./infrastructure/persistence/typeorm/entities/tenant.entity";
import { CreditCard } from "./infrastructure/persistence/typeorm/entities/credit-card.entity";
import { Purchase } from "./infrastructure/persistence/typeorm/entities/purchase.entity";
import { Init1700000000000 } from "./infrastructure/persistence/typeorm/migrations/1700000000000_Init";
import { Statement } from "./infrastructure/persistence/typeorm/entities/statement.entity";
import { StatementItem } from "./infrastructure/persistence/typeorm/entities/statement-item.entity";
import { AddStatements1700000000001 } from "./infrastructure/persistence/typeorm/migrations/1710000000000_add_statements";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "cardsdb",
  entities: [User, Tenant, CreditCard, Purchase, Statement, StatementItem],
  migrations: [Init1700000000000, AddStatements1700000000001],
  synchronize: false,
});
