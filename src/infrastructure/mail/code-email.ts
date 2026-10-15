import * as path from 'path';
import type { AuthCodePurpose } from '../persistence/typeorm/entities/auth-code.entity';
import type { MailAttachment } from './mail.service';

// Resolves to src/assets (ts-node) or dist/assets (build copies assets, see nest-cli.json)
export const MAIL_ASSETS_DIR = path.join(__dirname, '..', '..', 'assets', 'mail');

/** Embedded images (CID): render in Gmail/Outlook/Apple Mail without public hosting. */
const ATTACHMENTS: MailAttachment[] = [
  { filename: 'logo.png', path: path.join(MAIL_ASSETS_DIR, 'logo-mark.png'), cid: 'logo@financial-app' },
  {
    filename: 'ilustracao.png',
    path: path.join(MAIL_ASSETS_DIR, 'code-illustration.png'),
    cid: 'illustration@financial-app',
  },
];

const COPY: Record<AuthCodePurpose, { subject: string; title: string; intro: string }> = {
  email_verification: {
    subject: 'Seu código de confirmação',
    title: 'Confirme seu cadastro',
    intro: 'Falta só um passo. Digite o código abaixo para confirmar seu e-mail e começar a usar o Financial App.',
  },
  login: {
    subject: 'Seu código de acesso',
    title: 'Seu código de acesso',
    intro: 'Digite o código abaixo para concluir a entrada na sua conta.',
  },
};

// Design-system tokens (see the frontend .superdesign/design-system.md).
const C = {
  canvas: '#FAFAFA',
  surface: '#FFFFFF',
  border: '#E4E4E7',
  text: '#18181B',
  textSecondary: '#52525B',
  muted: '#71717A',
  primarySubtle: '#EEF2FF',
  primaryText: '#4338CA',
};
const FONT = "Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function codeEmail(purpose: AuthCodePurpose, code: string) {
  const { subject, title, intro } = COPY[purpose];
  const validity = 'O código vale por 10 minutos.';
  const ignore = 'Se você não fez esse pedido, ignore este e-mail. Sua conta continua protegida.';

  const text = `${title}\n\n${intro}\n\n${code}\n\n${validity}\n${ignore}\n\nFinancial App`;
  // Non-breaking hyphen so "e-mail" never splits across lines in the HTML version.
  const nb = (s: string) => s.replace(/e-mail/g, 'e&#8209;mail');

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${C.canvas};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Seu código é ${code}. ${validity}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="padding:0 4px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;"><img src="cid:logo@financial-app" width="32" height="32" alt="" style="display:block;border:0;"></td>
          <td style="vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:15px;font-weight:600;color:${C.text};">Financial App</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:${C.surface};border:1px solid ${C.border};border-radius:12px;padding:32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center" style="padding-bottom:16px;">
            <img src="cid:illustration@financial-app" width="175" height="180" alt="" style="display:block;border:0;">
          </td></tr>
          <tr><td align="center" style="font-family:${FONT};font-size:22px;line-height:30px;font-weight:600;color:${C.text};">${title}</td></tr>
          <tr><td align="center" style="padding:8px 8px 24px;font-family:${FONT};font-size:15px;line-height:22px;color:${C.textSecondary};">${nb(intro)}</td></tr>
          <tr><td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="background:${C.primarySubtle};border-radius:12px;padding:16px 20px 16px 28px;font-family:${FONT};font-size:32px;line-height:40px;font-weight:600;letter-spacing:8px;color:${C.primaryText};">${code}</td>
            </tr></table>
          </td></tr>
          <tr><td align="center" style="padding-top:16px;font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted};">${validity}</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};text-align:center;">
        ${nb(ignore)}<br>Financial App · Controle financeiro pessoal
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  return { subject: `${subject}: ${code}`, text, html, attachments: ATTACHMENTS };
}
