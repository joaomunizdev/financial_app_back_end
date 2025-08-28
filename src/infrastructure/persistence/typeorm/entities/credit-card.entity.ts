import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  Index,
  JoinColumn,
} from "typeorm";
import { User } from "./user.entity";
import { Purchase } from "./purchase.entity";
import { DecimalAsStringTransformer } from "../transformers/decimal.transformer";
import { ApiProperty } from "@nestjs/swagger";

@Entity({ name: "credit_cards" })
@Index("credit_cards_owner_nickname_idx", ["createdByUserId", "nickname"])
export class CreditCard {
  @ApiProperty({ format: "uuid" })
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty({ maxLength: 80 })
  @Column({ type: "varchar", length: 80 })
  nickname!: string;

  @ApiProperty({ example: "Visa" })
  @Column({ type: "varchar", length: 50 })
  brand!: string;

  @ApiProperty({ example: "1234", minLength: 4, maxLength: 4 })
  @Column({ type: "varchar", length: 4 })
  last4!: string;

  @ApiProperty({
    example: "5000.00",
    nullable: true,
    description: "BRL as string with 2 decimals",
  })
  @Column({
    name: "limit_amount",
    type: "numeric",
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: DecimalAsStringTransformer,
  })
  limitAmount: string | null = null;

  @ApiProperty({ format: "uuid" })
  @Column({ name: "created_by_user_id", type: "uuid" })
  createdByUserId!: string;

  @ManyToOne(() => User, (user) => user.creditCards, { onDelete: "CASCADE" })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser!: User;

  @OneToMany(() => Purchase, (purchase) => purchase.creditCard)
  purchases!: Purchase[];

  @ApiProperty({ type: String, format: "date-time" })
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @ApiProperty({ type: String, format: "date-time" })
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
