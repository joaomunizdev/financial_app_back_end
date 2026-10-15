import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  CODE_MAX_ATTEMPTS,
  CODE_RESEND_COOLDOWN_MS,
  CODE_TTL_MS,
  VerificationCodesService,
} from './verification-codes.service';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const user = { id: 'u1', email: 'ana@example.com' } as any;

function setup() {
  const saved: any[] = [];
  const codes = {
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    create: jest.fn((x: any) => ({ ...x })),
    save: jest.fn(async (x: any) => {
      saved.push({ ...x });
      return x;
    }),
  };
  const mail = { send: jest.fn() };
  const service = new VerificationCodesService(codes as any, mail as any);
  return { service, codes, mail, saved };
}

describe('VerificationCodesService', () => {
  it('stores only the hash and e-mails the 6-digit code', async () => {
    const { service, saved, mail, codes } = setup();
    const now = new Date('2026-10-14T12:00:00Z');
    expect(await service.issue(user, 'email_verification', now)).toBe(true);

    const [to, subject, text] = mail.send.mock.calls[0];
    const code = /(\d{6})/.exec(subject)![1];
    expect(to).toBe('ana@example.com');
    expect(text).toContain(code);
    expect(saved[0].codeHash).toBe(sha(code));
    expect(JSON.stringify(saved[0])).not.toContain(`"${code}"`);
    expect(saved[0].expiresAt.getTime()).toBe(now.getTime() + CODE_TTL_MS);
    // previous unused codes of the same purpose are invalidated
    expect(codes.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', purpose: 'email_verification' }),
      { consumedAt: now },
    );
  });

  it('does not resend within the cooldown', async () => {
    const { service, codes, mail } = setup();
    const now = new Date('2026-10-14T12:00:00Z');
    codes.findOne.mockResolvedValue({ createdAt: new Date(now.getTime() - CODE_RESEND_COOLDOWN_MS + 1000) });
    expect(await service.issue(user, 'login', now)).toBe(false);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('accepts the right code once', async () => {
    const { service, codes } = setup();
    const now = new Date('2026-10-14T12:00:00Z');
    const current = { codeHash: sha('123456'), expiresAt: new Date(now.getTime() + 1000), attempts: 0, consumedAt: null };
    codes.findOne.mockResolvedValue(current);
    await service.consume('u1', 'login', '123456', now);
    expect(current.consumedAt).toBe(now);
  });

  it('counts wrong attempts and rejects expired or exhausted codes', async () => {
    const { service, codes } = setup();
    const now = new Date('2026-10-14T12:00:00Z');
    const current = { codeHash: sha('123456'), expiresAt: new Date(now.getTime() + 1000), attempts: 0, consumedAt: null };
    codes.findOne.mockResolvedValue(current);
    await expect(service.consume('u1', 'login', '000000', now)).rejects.toBeInstanceOf(BadRequestException);
    expect(current.attempts).toBe(1);

    current.attempts = CODE_MAX_ATTEMPTS;
    await expect(service.consume('u1', 'login', '123456', now)).rejects.toBeInstanceOf(BadRequestException);

    codes.findOne.mockResolvedValue({ ...current, attempts: 0, expiresAt: new Date(now.getTime() - 1) });
    await expect(service.consume('u1', 'login', '123456', now)).rejects.toBeInstanceOf(BadRequestException);
  });
});
