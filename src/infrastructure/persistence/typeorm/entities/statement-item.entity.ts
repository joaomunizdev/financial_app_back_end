// src/infrastructure/persistence/typeorm/entities/statement-item.entity.ts
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

  @ApiProperty({ format: "uuid" })
  @Column({ name: "purchase_id", type: "uuid" })
  purchaseId!: string;

  @ManyToOne(() => Purchase, { onDelete: "CASCADE" })
  @JoinColumn({ name: "purchase_id" })
  purchase!: Purchase;

  @ApiProperty({ example: "Parcela 2/6" })
  @Column({ type: "varchar", length: 120 })
  label!: string;

  @ApiProperty({ example: "200.00" })
  @Column({ name: "amount", type: "numeric", precision: 14, scale: 2 })
  amount!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
