import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { User } from "./user.entity";
import { DecimalAsStringTransformer } from "../transformers/decimal.transformer";

export const INVESTMENT_TYPES = [
  "fixed_income",
  "stocks",
  "real_estate_funds",
  "funds",
  "crypto",
  "pension",
  "other",
] as const;
export type InvestmentType = (typeof INVESTMENT_TYPES)[number];

/** contribution/withdrawal move money; balance records the value reported on a date. */
export const MOVEMENT_KINDS = ["contribution", "withdrawal", "balance"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

@Entity({ name: "investments" })
@Index("investments_owner_idx", ["createdByUserId"])
export class Investment {
  @ApiProperty({ format: "uuid" })
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty({ maxLength: 120, example: "CDB Banco X 110% CDI" })
  @Column({ type: "varchar", length: 120 })
  name!: string;

  @ApiProperty({ enum: INVESTMENT_TYPES })
  @Column({ type: "varchar", length: 20 })
  type!: InvestmentType;

  @ApiProperty({ maxLength: 80, nullable: true, example: "Nubank" })
  @Column({ type: "varchar", length: 80, nullable: true })
  institution: string | null = null;

  @Column({ name: "created_by_user_id", type: "uuid" })
  createdByUserId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser!: User;

  @OneToMany(() => InvestmentMovement, (m) => m.investment)
  movements!: InvestmentMovement[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

@Entity({ name: "investment_movements" })
@Index("investment_movements_investment_date_idx", ["investmentId", "date"])
export class InvestmentMovement {
  @ApiProperty({ format: "uuid" })
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty({ format: "uuid" })
  @Column({ name: "investment_id", type: "uuid" })
  investmentId!: string;

  @ManyToOne(() => Investment, (i) => i.movements, { onDelete: "CASCADE" })
  @JoinColumn({ name: "investment_id" })
  investment!: Investment;

  @ApiProperty({ enum: MOVEMENT_KINDS })
  @Column({ type: "varchar", length: 20 })
  kind!: MovementKind;

  @ApiProperty({ example: "1000.00" })
  @Column({
    type: "numeric",
    precision: 14,
    scale: 2,
    transformer: DecimalAsStringTransformer,
  })
  amount!: string;

  @ApiProperty({ example: "2026-10-01", description: "YYYY-MM-DD" })
  @Column({ type: "date" })
  date!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
