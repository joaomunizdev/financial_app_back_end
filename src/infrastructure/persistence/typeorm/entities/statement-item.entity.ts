import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import { Purchase } from "./purchase.entity";
import { ApiProperty } from "@nestjs/swagger";
import { Statement } from "./statement.entity";
import { Subscription } from "./subscription.entity";
import { Tenant } from "./tenant.entity";
import { Category } from "./category.entity";

export type StatementItemKind = "purchase" | "subscription";

@Entity({ name: "statement_items" })
@Index("statement_items_statement_idx", ["statementId"])
export class StatementItem {
  @ApiProperty({ format: "uuid" })
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty({ format: "uuid" })
  @Column({ name: "statement_id", type: "uuid" })
  statementId!: string;

  @ManyToOne(() => Statement, (s) => s.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "statement_id" })
  statement!: Statement;

  @ApiProperty({ enum: ["purchase", "subscription"] })
  @Column({ type: "varchar", length: 20, default: "purchase" })
  kind!: StatementItemKind;

  @ApiProperty({ format: "uuid", nullable: true })
  @Column({ name: "purchase_id", type: "uuid", nullable: true })
  purchaseId: string | null = null;

  @ManyToOne(() => Purchase, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "purchase_id" })
  purchase!: Purchase | null;

  @ApiProperty({ format: "uuid", nullable: true })
  @Column({ name: "subscription_id", type: "uuid", nullable: true })
  subscriptionId: string | null = null;

  @ManyToOne(() => Subscription, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "subscription_id" })
  subscription!: Subscription | null;

  @ApiProperty({
    format: "uuid",
    nullable: true,
    description: "Tenant the amount is attributed to, snapshotted at generation",
  })
  @Column({ name: "tenant_id", type: "uuid", nullable: true })
  tenantId: string | null = null;

  @ManyToOne(() => Tenant, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant | null;

  @ApiProperty({
    format: "uuid",
    nullable: true,
    description: "Category of the purchase/subscription, kept in sync when it changes",
  })
  @Column({ name: "category_id", type: "uuid", nullable: true })
  categoryId: string | null = null;

  @ManyToOne(() => Category, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "category_id" })
  category!: Category | null;

  @ApiProperty({ example: "Parcela 2/6" })
  @Column({ type: "varchar", length: 120 })
  label!: string;

  @ApiProperty({
    example: 2,
    nullable: true,
    description: "Installment number (k of k/n); null for one-time purchases",
  })
  @Column({ name: "installment_number", type: "int", nullable: true })
  installmentNumber: number | null = null;

  @ApiProperty({ example: "200.00" })
  @Column({ name: "amount", type: "numeric", precision: 14, scale: 2 })
  amount!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
