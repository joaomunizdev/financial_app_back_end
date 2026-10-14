import "reflect-metadata";
import * as bcrypt from "bcrypt";
import { AppDataSource } from "../typeorm.config";
import { User } from "../infrastructure/persistence/typeorm/entities/user.entity";
import { Tenant } from "../infrastructure/persistence/typeorm/entities/tenant.entity";
import { CreditCard } from "../infrastructure/persistence/typeorm/entities/credit-card.entity";
import { Purchase } from "../infrastructure/persistence/typeorm/entities/purchase.entity";

async function run() {
  // Creates a user with a well-known password: development only.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run the development seed in production");
  }

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

  // Idempotent: reuse rows from a previous run instead of violating unique constraints.
  const tenantNamed = async (name: string) =>
    (await tenantRepo.findOne({ where: { name, createdByUserId: admin!.id } })) ??
    (await tenantRepo.save(tenantRepo.create({ name, createdByUserId: admin!.id })));
  const john = await tenantNamed("John Doe");
  const jane = await tenantNamed("Jane Doe");

  const existingCard = await cardRepo.findOne({
    where: { nickname: "Main Visa", createdByUserId: admin.id },
  });
  if (existingCard) {
    console.log("Seed data already present, nothing to do.");
    await AppDataSource.destroy();
    return;
  }

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
