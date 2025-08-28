import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./infrastructure/persistence/typeorm/entities/user.entity";
import { Tenant } from "./infrastructure/persistence/typeorm/entities/tenant.entity";
import { CreditCard } from "./infrastructure/persistence/typeorm/entities/credit-card.entity";
import { Purchase } from "./infrastructure/persistence/typeorm/entities/purchase.entity";
import { AuthController } from "./presentation/controllers/auth.controller";
import { TenantsController } from "./presentation/controllers/tenants.controller";
import { CreditCardsController } from "./presentation/controllers/credit-cards.controller";
import { PurchasesController } from "./presentation/controllers/purchases.controller";
import { ReportsController } from "./presentation/controllers/reports.controller";
import { AuthService } from "./application/services/auth.service";
import { TenantsService } from "./application/services/tenants.service";
import { CreditCardsService } from "./application/services/credit-cards.service";
import { PurchasesService } from "./application/services/purchases.service";
import { ReportsService } from "./application/services/reports.service";
import { SecurityModule } from "./presentation/security/security.module";
import { Statement } from "./infrastructure/persistence/typeorm/entities/statement.entity";
import { StatementItem } from "./infrastructure/persistence/typeorm/entities/statement-item.entity";
import { StatementsService } from "./application/services/statements.service";
import { StatementsController } from "./presentation/controllers/statements.controller";

@Module({
  imports: [
    SecurityModule,
    TypeOrmModule.forRoot({
      type: "postgres",
      host: process.env.DB_HOST || "postgres",
      port: Number(process.env.DB_PORT || 5432),
      username: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "postgres",
      database: process.env.DB_NAME || "cardsdb",
      entities: [User, Tenant, CreditCard, Purchase, Statement, StatementItem],
      synchronize: false,
    }),
    TypeOrmModule.forFeature([User, Tenant, CreditCard, Purchase, Statement, StatementItem]),
  ],
  controllers: [
    AuthController,
    TenantsController,
    CreditCardsController,
    PurchasesController,
    ReportsController,
    StatementsController,
  ],
  providers: [
    AuthService,
    TenantsService,
    CreditCardsService,
    PurchasesService,
    ReportsService,
    StatementsService,
  ],
})
export class AppModule {}
