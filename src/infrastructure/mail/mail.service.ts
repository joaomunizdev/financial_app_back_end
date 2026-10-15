import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Sends e-mail through any SMTP server configured by SMTP_* variables.
 * Without SMTP_HOST (allowed only outside production) the message is logged
 * instead, so local development works with no mail server.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    this.from = config.get<string>('SMTP_FROM') || 'Financial App <no-reply@localhost>';
    const user = config.get<string>('SMTP_USER');
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: Number(config.get<string>('SMTP_PORT') || 587),
          secure: config.get<string>('SMTP_SECURE') === 'true',
          auth: user ? { user, pass: config.get<string>('SMTP_PASS') } : undefined,
        })
      : null;
  }

  async send(
    to: string,
    subject: string,
    text: string,
    html: string,
    attachments: nodemailer.SendMailOptions['attachments'] = [],
  ) {
    if (!this.transporter) {
      // Development fallback only (env validation requires SMTP_HOST in production).
      this.logger.warn(`SMTP not configured; e-mail to ${to} not sent: ${subject}\n${text}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, to, subject, text, html, attachments });
  }
}
