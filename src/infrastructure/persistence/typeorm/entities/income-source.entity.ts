import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

export enum IncomeSourceType {
  FIXED = 'fixed',
  ONE_TIME = 'one_time',
}

@Entity({ name: 'income_sources' })
@Index(['createdByUserId'])
export class IncomeSource {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'varchar', length: 180, name: 'description' })
  description!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'amount' })
  amount!: string;

  @Column({
    type: 'enum',
    enum: IncomeSourceType,
    enumName: 'income_source_type',
    default: IncomeSourceType.FIXED,
    name: 'incometype',
  })
  incomeType!: IncomeSourceType;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate?: string | null;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate?: string | null;

  @Column('uuid', { name: 'tenantid', nullable: true })
  tenantId?: string | null;

  @ManyToOne(() => Tenant, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'tenantid' })
  tenant?: Tenant | null;

  @Column('uuid', { name: 'createdbyuserid' })
  createdByUserId!: string;

  /** Key of the imported statement line this income came from. */
  @Column({ name: 'import_key', type: 'varchar', length: 200, nullable: true })
  importKey?: string | null;

  @CreateDateColumn({ name: 'createdat', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updatedat', type: 'timestamptz' })
  updatedAt!: Date;
}
