import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import nodemailer from 'nodemailer';
import type { Logger } from './logger';

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

const toList = (to: string | string[]) => (Array.isArray(to) ? to : [to]);

/** Local: delivers to Mailpit (or any SMTP server). */
export class SmtpEmailSender implements EmailSender {
  private readonly transport;

  constructor(private readonly config: { host: string; port: number; from: string }) {
    this.transport = nodemailer.createTransport({ host: config.host, port: config.port, secure: false });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.config.from,
      to: toList(message.to).join(', '),
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });
  }
}

/** AWS: Amazon SES v2. */
export class SesEmailSender implements EmailSender {
  private readonly client: SESv2Client;

  constructor(private readonly config: { region: string; from: string; configurationSet?: string }) {
    this.client = new SESv2Client({ region: config.region });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.config.from,
        Destination: { ToAddresses: toList(message.to) },
        ...(message.replyTo ? { ReplyToAddresses: [message.replyTo] } : {}),
        ...(this.config.configurationSet ? { ConfigurationSetName: this.config.configurationSet } : {}),
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: 'UTF-8' },
            Body: { Html: { Data: message.html, Charset: 'UTF-8' }, Text: { Data: message.text, Charset: 'UTF-8' } },
          },
        },
      }),
    );
  }
}

/** Fallback when no email transport is configured: logs recipients and subject only. */
export class LogEmailSender implements EmailSender {
  constructor(private readonly log: Logger) {}

  async send(message: EmailMessage): Promise<void> {
    this.log.info('email.skipped', { recipients: toList(message.to).length, subject: message.subject });
  }
}
