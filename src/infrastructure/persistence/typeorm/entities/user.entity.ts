import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { CreditCard } from "./credit-card.entity";
import { Purchase } from "./purchase.entity";
import { ApiProperty } from "@nestjs/swagger";

@Entity({ name: "users" })
@Index("users_email_uq", ["email"], { unique: true })
export class User {
  @ApiProperty({ format: "uuid" })
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty({ maxLength: 120 })
  @Column({ type: "varchar", length: 120 })
  name!: string;

  @ApiProperty({ maxLength: 180, example: "john@example.com" })
  @Column({ type: "varchar", length: 180 })
  email!: string;

  @Column({ name: "password_hash", type: "varchar", length: 255 })
  passwordHash!: string;

  @ApiProperty({ type: String, format: "date-time" })
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @ApiProperty({ type: String, format: "date-time" })
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @OneToMany(() => Tenant, (tenant) => tenant.createdByUser)
  tenants!: Tenant[];

  @OneToMany(() => CreditCard, (card) => card.createdByUser)
  creditCards!: CreditCard[];

  @OneToMany(() => Purchase, (purchase) => purchase.createdByUser)
  purchases!: Purchase[];
}
