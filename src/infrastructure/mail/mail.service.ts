import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import * as path from 'path';
import * as nodemailer from 'nodemailer';

const RESEND_URL = 'https://api.resend.com/emails';
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
/** Public route of src/assets/mail (main.ts), for providers without inline (CID) images. */
export const MAIL_ASSETS_ROUTE = '/api/mail-assets';

/** File on disk embedded in the message and referenced in the HTML as `cid:<cid>`. */
export type MailAttachment = { filename: string; path: string; cid: string };

/**
 * Sends e-mail through the Resend HTTP API (RESEND_API_KEY), the Brevo HTTP
 * API (BREVO_API_KEY) or any SMTP server (SMTP_*), in that order of
 * precedence: free hosts such as Render block outbound SMTP ports. Brevo has
 * no inline images, so its HTML points to the images served by the API itself
 * (PUBLIC_URL, or RENDER_EXTERNAL_URL set by Render). Without any provider
 * (allowed only outside production) the message is logged instead, so local
 * development works with no mail server.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resendApiKey: string | undefined;
  private readonly brevoApiKey: string | undefined;
  private readonly publicUrl: string | undefined;
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.resendApiKey = config.get<string>('RESEND_API_KEY')?.trim() || undefined;
    this.brevoApiKey = config.get<string>('BREVO_API_KEY')?.trim() || undefined;
    this.publicUrl =
      (config.get<string>('PUBLIC_URL') || config.get<string>('RENDER_EXTERNAL_URL'))?.trim().replace(/\/+$/, '') ||
      undefined;
    const host = config.get<string>('SMTP_HOST');
    this.from =
      config.get<string>('MAIL_FROM') ||
      config.get<string>('SMTP_FROM') ||
      'Financial App <no-reply@localhost>';
    const user = config.get<string>('SMTP_USER');
    this.transporter =
      !this.resendApiKey && !this.brevoApiKey && host
        ? nodemailer.createTransport({
            host,
            port: Number(config.get<string>('SMTP_PORT') || 587),
            secure: config.get<string>('SMTP_SECURE') === 'true',
            auth: user ? { user, pass: config.get<string>('SMTP_PASS') } : undefined,
          })
        : null;
  }

  async send(to: string, subject: string, text: string, html: string, attachments: MailAttachment[] = []) {
    if (this.resendApiKey) {
      await this.sendWithResend(to, subject, text, html, attachments);
      return;
    }
    if (this.brevoApiKey) {
      await this.sendWithBrevo(to, subject, text, html, attachments);
      return;
    }
    if (!this.transporter) {
      // Development fallback only (env validation requires a mail provider in production).
      this.logger.warn(`E-mail not configured; e-mail to ${to} not sent: ${subject}\n${text}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, to, subject, text, html, attachments });
  }

  private async sendWithResend(
    to: string,
    subject: string,
    text: string,
    html: string,
    attachments: MailAttachment[],
  ) {
    const files = await Promise.all(
      attachments.map(async (a) => ({
        filename: a.filename,
        content: (await readFile(a.path)).toString('base64'),
        content_id: a.cid,
      })),
    );
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [to], subject, text, html, attachments: files }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend rejected the e-mail (${res.status}): ${detail.slice(0, 300)}`);
    }
  }

  private async sendWithBrevo(
    to: string,
    subject: string,
    text: string,
    html: string,
    attachments: MailAttachment[],
  ) {
    let htmlContent = html;
    if (this.publicUrl) {
      for (const a of attachments) {
        const url = `${this.publicUrl}${MAIL_ASSETS_ROUTE}/${path.basename(a.path)}`;
        htmlContent = htmlContent.split(`cid:${a.cid}`).join(url);
      }
    } else if (attachments.length) {
      this.logger.warn('PUBLIC_URL not set; images of e-mails sent through Brevo will not load');
    }
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': this.brevoApiKey as string, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: parseAddress(this.from), to: [{ email: to }], subject, textContent: text, htmlContent }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Brevo rejected the e-mail (${res.status}): ${detail.slice(0, 300)}`);
    }
  }
}

/** "Name <email>" or a bare address -> Brevo's { name?, email }. */
export function parseAddress(value: string): { name?: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
  return m ? { ...(m[1] ? { name: m[1] } : {}), email: m[2].trim() } : { email: value.trim() };
}
