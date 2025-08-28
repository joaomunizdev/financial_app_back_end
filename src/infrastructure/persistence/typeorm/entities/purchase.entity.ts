import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { CreditCard } from "./credit-card.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";
import { DecimalAsStringTransformer } from "../transformers/decimal.transformer";
import { ApiProperty } from "@nestjs/swagger";

@Entity({ name: "purchases" })
@Index("purchases_credit_card_idx", ["creditCardId"])
@Index("purchases_tenant_idx", ["tenantId"])
@Index("purchases_owner_idx", ["createdByUserId"])
@Index("purchases_date_idx", ["purchaseDate"])
export class Purchase {
  @ApiProperty({ format: "uuid" })
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty({ format: "uuid" })
  @Column({ name: "credit_card_id", type: "uuid" })
  creditCardId!: string;

  @ManyToOne(() => CreditCard, (card) => card.purchases, {
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "credit_card_id" })
  creditCard!: CreditCard;

  @ApiProperty({ format: "uuid" })
  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.purchases, {
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ApiProperty({ format: "uuid" })
  @Column({ name: "created_by_user_id", type: "uuid" })
  createdByUserId!: string;

  @ManyToOne(() => User, (user) => user.purchases, { onDelete: "CASCADE" })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser!: User;

  @ApiProperty({ maxLength: 255 })
  @Column({ type: "varchar", length: 255 })
  description!: string;

  @ApiProperty({ example: "2025-08-01", description: "YYYY-MM-DD" })
  @Column({ name: "purchase_date", type: "date" })
  purchaseDate!: string;

  @ApiProperty({
    example: "350.40",
    description: "BRL as string with 2 decimals",
  })
  @Column({
    name: "total_amount",
    type: "numeric",
    precision: 14,
    scale: 2,
    transformer: DecimalAsStringTransformer,
  })
  totalAmount!: string;

  @ApiProperty({ example: false })
  @Column({ name: "is_installment", type: "boolean", default: false })
  isInstallment!: boolean;

  @ApiProperty({ nullable: true, example: 6 })
  @Column({ name: "installments_total", type: "int", nullable: true })
  installmentsTotal!: number | null;

  @ApiProperty({ example: 0 })
  @Column({ name: "installments_paid", type: "int", default: 0 })
  installmentsPaid!: number;

  @ApiProperty({ type: String, format: "date-time" })
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @ApiProperty({ type: String, format: "date-time" })
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
