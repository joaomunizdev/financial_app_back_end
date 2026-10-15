import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export type AuthCodePurpose = 'email_verification' | 'login';

/** One-time code sent by e-mail (sign-up confirmation or login second factor). */
@Entity({ name: 'auth_codes' })
@Index('auth_codes_user_purpose_idx', ['userId', 'purpose'])
export class AuthCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 30 })
  purpose!: AuthCodePurpose;

  /** SHA-256 of the code; the plain code is only ever sent by e-mail. */
  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt: Date | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
