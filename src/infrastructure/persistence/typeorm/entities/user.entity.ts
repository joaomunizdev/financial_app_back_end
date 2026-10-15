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
@Index("users_cpf_uq", ["cpf"], { unique: true, where: "cpf IS NOT NULL" })
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

  /** 11 digits, no mask. Null for accounts created before profile fields existed. */
  @ApiProperty({ example: "12345678909", nullable: true })
  @Column({ type: "varchar", length: 11, nullable: true })
  cpf: string | null = null;

  /** Brazilian phone, 10–11 digits with area code, no mask. */
  @ApiProperty({ example: "11987654321", nullable: true })
  @Column({ type: "varchar", length: 11, nullable: true })
  phone: string | null = null;

  @ApiProperty({ example: "1990-05-20", nullable: true })
  @Column({ name: "birth_date", type: "date", nullable: true })
  birthDate: string | null = null;

  /** Set when the e-mail confirmation code is accepted; login requires it. */
  @Column({ name: "email_verified_at", type: "timestamptz", nullable: true })
  emailVerifiedAt: Date | null = null;

  /** When true, login also requires a code sent by e-mail. */
  @Column({ name: "two_factor_enabled", type: "boolean", default: false })
  twoFactorEnabled!: boolean;

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
