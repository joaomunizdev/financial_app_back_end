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
import { ApiProperty } from "@nestjs/swagger";

@Entity({ name: "tenants" })
@Index("tenants_owner_name_uq", ["createdByUserId", "name"], { unique: true })
export class Tenant {
  @ApiProperty({ format: "uuid" })
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty({ maxLength: 120 })
  @Column({ type: "varchar", length: 120 })
  name!: string;

  @ApiProperty({ format: "uuid" })
  @Column({ name: "created_by_user_id", type: "uuid" })
  createdByUserId!: string;

  @ManyToOne(() => User, (user) => user.tenants, { onDelete: "CASCADE" })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser!: User;

  @OneToMany(() => Purchase, (purchase) => purchase.tenant)
  purchases!: Purchase[];

  @ApiProperty({ type: String, format: "date-time" })
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @ApiProperty({ type: String, format: "date-time" })
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
