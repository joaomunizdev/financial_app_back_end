import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { User } from "./user.entity";

/**
 * Expense category. Rows without owner are the defaults shared by every account;
 * names are unique per owner, case-insensitive (index `categories_owner_name_uq`).
 */
@Entity({ name: "categories" })
export class Category {
  @ApiProperty({ format: "uuid" })
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty({ maxLength: 60, example: "Alimentação" })
  @Column({ type: "varchar", length: 60 })
  name!: string;

  @ApiProperty({ maxLength: 60, example: "mdi-silverware-fork-knife" })
  @Column({ type: "varchar", length: 60, default: "mdi-tag-outline" })
  icon!: string;

  @ApiProperty({ format: "uuid", nullable: true, description: "Null for default categories" })
  @Column({ name: "created_by_user_id", type: "uuid", nullable: true })
  createdByUserId: string | null = null;

  @ManyToOne(() => User, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser!: User | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
