import * as core from '@actions/core';
import { getTranslations, type Locale } from '@i18n';
import nodemailer from 'nodemailer';

const SECURE_SMTP_PORT = 465;

function resolveFromAddress({ from, username }: { from: string; username: string }): string {
  if (from.includes('@')) {
    return from;
  }

  if (username.includes('@')) {
    return `${from} <${username}>`;
  }

  return from;
}

export interface EmailConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  to: string;
  from: string;
}

export function getEmailConfig(locale: Locale): EmailConfig | null {
  const host = core.getInput('smtp-host');
  if (!host) return null;

  const t = getTranslations(locale);

  return {
    host,
    port: Number.parseInt(core.getInput('smtp-port') || '587', 10),
    username: core.getInput('smtp-username'),
    password: core.getInput('smtp-password'),
    to: core.getInput('email-to'),
    from: core.getInput('email-from') || t.email.defaultFrom,
  };
}

interface SendEmailParams {
  emailConfig: EmailConfig | null;
  subject: string;
  htmlBody: string;
}

export async function sendEmail({
  emailConfig,
  subject,
  htmlBody,
}: SendEmailParams): Promise<boolean> {
  if (!emailConfig) {
    core.info('No SMTP configuration provided, skipping email');

    return false;
  }

  if (!emailConfig.to) {
    core.warning('SMTP configured but no email-to address provided, skipping email');

    return false;
  }

  const secure = emailConfig.port === SECURE_SMTP_PORT;

  const transporter = nodemailer.createTransport({
    host: emailConfig.host,
    port: emailConfig.port,
    secure,
    auth:
      emailConfig.username && emailConfig.password
        ? { user: emailConfig.username, pass: emailConfig.password }
        : undefined,
  });

  const from = resolveFromAddress({ from: emailConfig.from, username: emailConfig.username });

  const info = await transporter.sendMail({
    from,
    to: emailConfig.to,
    subject,
    html: htmlBody,
  });

  const rejected = (info.rejected ?? []) as string[];
  if (rejected.length > 0) {
    core.warning(`Email rejected for: ${rejected.join(', ')}`);
  }

  core.info(`Email sent to ${emailConfig.to} (message ID: ${info.messageId})`);

  return true;
}
