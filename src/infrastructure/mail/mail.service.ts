import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import * as nodemailer from 'nodemailer';

const RESEND_URL = 'https://api.resend.com/emails';

/** File on disk embedded in the message and referenced in the HTML as `cid:<cid>`. */
export type MailAttachment = { filename: string; path: string; cid: string };

/**
 * Sends e-mail through the Resend HTTP API (RESEND_API_KEY) or any SMTP
 * server (SMTP_*). The API wins when both are set: free hosts such as Render
 * block outbound SMTP ports. Without either (allowed only outside production)
 * the message is logged instead, so local development works with no mail server.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resendApiKey: string | undefined;
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.resendApiKey = config.get<string>('RESEND_API_KEY')?.trim() || undefined;
    const host = config.get<string>('SMTP_HOST');
    this.from =
      config.get<string>('MAIL_FROM') ||
      config.get<string>('SMTP_FROM') ||
      'Financial App <no-reply@localhost>';
    const user = config.get<string>('SMTP_USER');
    this.transporter =
      !this.resendApiKey && host
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
}
