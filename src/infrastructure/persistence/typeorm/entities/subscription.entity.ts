import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { CreditCard } from './credit-card.entity';
import { Tenant } from './tenant.entity';
import { Category } from './category.entity';

@Entity({ name: 'subscriptions' })
@Index(['createdByUserId'])
export class Subscription {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'creditcardid' })
  creditCardId!: string;

  @ManyToOne(() => CreditCard, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creditcardid' })
  creditCard!: CreditCard;

  @Column({ type: 'varchar', length: 180, name: 'description' })
  description!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'amount' })
  amount!: string;

  @Column({ type: 'boolean', name: 'active', default: true })
  active!: boolean;

  @Column('uuid', { name: 'createdbyuserid' })
  createdByUserId!: string;

  @CreateDateColumn({ name: 'createdat', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updatedat', type: 'timestamptz' })
  updatedAt!: Date;

  @Column('uuid', { name: 'tenantid', nullable: true })
  tenantId?: string | null;

  @ManyToOne(() => Tenant, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'tenantid' })
  tenant?: Tenant | null;

  @Column('uuid', { name: 'categoryid', nullable: true })
  categoryId?: string | null;

  @ManyToOne(() => Category, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'categoryid' })
  category?: Category | null;
}
