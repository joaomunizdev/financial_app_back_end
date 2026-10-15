/**
 * Fictitious/test e-mail domains refused at sign-up. Subdomains are refused too.
 * Reserved by RFC 2606/6761 (example.*, .test, .example, .invalid, .localhost)
 * plus placeholders commonly typed in Portuguese and English forms.
 */
export const BLOCKED_EMAIL_DOMAINS = [
  'example.com',
  'example.org',
  'example.net',
  'exemplo.com',
  'exemplo.com.br',
  'teste.com',
  'teste.com.br',
  'testes.com',
  'test.com',
  'test.com.br',
  'fake.com',
  'fake.com.br',
  'dominio.com',
  'dominio.com.br',
  'seudominio.com',
  'seudominio.com.br',
];

const BLOCKED_TLDS = ['test', 'example', 'invalid', 'localhost', 'teste', 'exemplo'];

/** True when the e-mail uses a fictitious/test domain (case-insensitive). */
export function isBlockedEmailDomain(email: string): boolean {
  const domain = (email.split('@')[1] ?? '').trim().toLowerCase();
  if (!domain) return false;
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (BLOCKED_TLDS.includes(tld)) return true;
  return BLOCKED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}
