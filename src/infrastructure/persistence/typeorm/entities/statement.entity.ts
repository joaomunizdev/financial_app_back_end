import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn, Unique, JoinColumn
} from 'typeorm';
import { CreditCard } from './credit-card.entity';
import { StatementItem } from './statement-item.entity';
import { ApiProperty } from '@nestjs/swagger';

@Entity({ name: 'statements' })
@Unique('statements_card_month_uq', ['creditCardId', 'year', 'month'])
export class Statement {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'credit_card_id', type: 'uuid' })
  creditCardId!: string;

  @ManyToOne(() => CreditCard, (cc) => cc.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'credit_card_id' })
  creditCard!: CreditCard;

  @ApiProperty({ example: 2025 })
  @Column({ type: 'int' })
  year!: number;

  @ApiProperty({ example: 8, description: '1-12' })
  @Column({ type: 'int' })
  month!: number;

  @ApiProperty({ example: '2025-08-10' })
  @Column({ name: 'closing_date', type: 'date', nullable: true })
  closingDate: string | null = null;

  @ApiProperty({ example: '2025-08-17' })
  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null = null;

  @ApiProperty({ example: '0.00', description: 'Soma dos items + adjustmentAmount' })
  @Column({ name: 'total_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalAmount!: string;

  @ApiProperty({ example: '0.00' })
  @Column({ name: 'adjustment_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  adjustmentAmount!: string;

  @ApiProperty({ example: false })
  @Column({ name: 'locked', type: 'boolean', default: false })
  locked!: boolean;

  @ApiProperty({ example: '2025-08-20T12:00:00Z', nullable: true })
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null = null;

  @ApiProperty({ example: '0.00', nullable: true })
  @Column({ name: 'paid_amount', type: 'numeric', precision: 14, scale: 2, nullable: true })
  paidAmount: string | null = null;

  @OneToMany(() => StatementItem, (it) => it.statement, { cascade: true })
  items!: StatementItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
