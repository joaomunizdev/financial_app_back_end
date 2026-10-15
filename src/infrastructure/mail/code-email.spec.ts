import { existsSync } from 'fs';
import { codeEmail } from './code-email';

describe('codeEmail', () => {
  it.each(['email_verification', 'login'] as const)('builds the %s e-mail', (purpose) => {
    const mail = codeEmail(purpose, '482913');
    expect(mail.subject).toContain('482913');
    expect(mail.text).toContain('482913');
    expect(mail.html).toContain('482913');
    expect(mail.html).toContain('cid:logo@financial-app');
    expect(mail.html).toContain('cid:illustration@financial-app');
    for (const a of mail.attachments) {
      expect(existsSync(a.path)).toBe(true);
      expect(mail.html).toContain(`cid:${a.cid}`);
    }
  });

  it('uses a different title for login codes', () => {
    expect(codeEmail('email_verification', '1').html).toContain('Confirme seu cadastro');
    expect(codeEmail('login', '1').html).toContain('Seu código de acesso');
  });
});
