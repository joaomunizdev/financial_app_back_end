import "reflect-metadata";
import * as bcrypt from "bcrypt";
import { AppDataSource } from "../typeorm.config";
import { User } from "../infrastructure/persistence/typeorm/entities/user.entity";
import { Tenant } from "../infrastructure/persistence/typeorm/entities/tenant.entity";
import { CreditCard } from "../infrastructure/persistence/typeorm/entities/credit-card.entity";
import { Purchase } from "../infrastructure/persistence/typeorm/entities/purchase.entity";

async function run() {
  await AppDataSource.initialize();
  const userRepo = AppDataSource.getRepository(User);
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const cardRepo = AppDataSource.getRepository(CreditCard);
  const purchaseRepo = AppDataSource.getRepository(Purchase);

  const email = "admin@example.com";
  let admin = await userRepo.findOne({ where: { email } });
  if (!admin) {
    admin = userRepo.create({
      name: "Admin",
      email,
      passwordHash: await bcrypt.hash("Admin@123", 10),
    });
    await userRepo.save(admin);
  }

  const john = tenantRepo.create({
    name: "John Doe",
    createdByUserId: admin.id,
  });
  const jane = tenantRepo.create({
    name: "Jane Doe",
    createdByUserId: admin.id,
  });
  await tenantRepo.save([john, jane]);

  const visa = cardRepo.create({
    nickname: "Main Visa",
    brand: "Visa",
    last4: "1234",
    limitAmount: "5000.00",
    createdByUserId: admin.id,
  });
  await cardRepo.save(visa);

  const today = new Date().toISOString().slice(0, 10);
  const p1 = purchaseRepo.create({
    creditCardId: visa.id,
    tenantId: john.id,
    createdByUserId: admin.id,
    description: "Groceries",
    purchaseDate: today,
    totalAmount: "350.40",
    isInstallment: false,
    installmentsTotal: null,
    installmentsPaid: 0,
  });
  const p2 = purchaseRepo.create({
    creditCardId: visa.id,
    tenantId: jane.id,
    createdByUserId: admin.id,
    description: "Electronics",
    purchaseDate: today,
    totalAmount: "1200.00",
    isInstallment: true,
    installmentsTotal: 6,
    installmentsPaid: 1,
  });
  await purchaseRepo.save([p1, p2]);

  console.log("Seed finished.");
  await AppDataSource.destroy();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
