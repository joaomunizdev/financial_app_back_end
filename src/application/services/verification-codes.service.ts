import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import {
  AuthCode,
  AuthCodePurpose,
} from '../../infrastructure/persistence/typeorm/entities/auth-code.entity';
import { User } from '../../infrastructure/persistence/typeorm/entities/user.entity';
import { MailService } from '../../infrastructure/mail/mail.service';
import { codeEmail } from '../../infrastructure/mail/code-email';

export const CODE_TTL_MS = 10 * 60_000;
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_RESEND_COOLDOWN_MS = 60_000;

const hash = (code: string) => createHash('sha256').update(code).digest('hex');
const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** 6-digit e-mail codes: stored hashed, valid 10 minutes, 5 attempts, 60 s resend cooldown. */
@Injectable()
export class VerificationCodesService {
  constructor(
    @InjectRepository(AuthCode) private readonly codes: Repository<AuthCode>,
    private readonly mail: MailService,
  ) {}

  /**
   * Issues and e-mails a new code, invalidating previous ones of the same purpose.
   * Returns false (and sends nothing) while the resend cooldown is running.
   */
  async issue(user: User, purpose: AuthCodePurpose, now = new Date()): Promise<boolean> {
    const last = await this.codes.findOne({
      where: { userId: user.id, purpose },
      order: { createdAt: 'DESC' },
    });
    if (last && now.getTime() - last.createdAt.getTime() < CODE_RESEND_COOLDOWN_MS) {
      return false;
    }
    await this.codes.update(
      { userId: user.id, purpose, consumedAt: IsNull() },
      { consumedAt: now },
    );
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.codes.save(
      this.codes.create({
        userId: user.id,
        purpose,
        codeHash: hash(code),
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        attempts: 0,
      }),
    );
    const mail = codeEmail(purpose, code);
    await this.mail.send(user.email, mail.subject, mail.text, mail.html, mail.attachments);
    return true;
  }

  /** Accepts the latest valid code once; wrong codes count toward the attempt limit. */
  async consume(userId: string, purpose: AuthCodePurpose, code: string, now = new Date()) {
    const invalid = new BadRequestException('Invalid or expired code');
    const current = await this.codes.findOne({
      where: { userId, purpose, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (!current || current.expiresAt <= now || current.attempts >= CODE_MAX_ATTEMPTS) {
      throw invalid;
    }
    if (!sameHash(current.codeHash, hash(code))) {
      current.attempts += 1;
      await this.codes.save(current);
      throw invalid;
    }
    current.consumedAt = now;
    await this.codes.save(current);
  }
}
