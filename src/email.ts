import * as core from '@actions/core';
import nodemailer from 'nodemailer';
import type { EmailConfig } from './types';

export function getEmailConfig(): EmailConfig | null {
  const host = core.getInput('smtp-host');
  if (!host) return null;

  return {
    host,
    port: Number.parseInt(core.getInput('smtp-port') || '587', 10),
    username: core.getInput('smtp-username'),
    password: core.getInput('smtp-password'),
    to: core.getInput('email-to'),
    from: core.getInput('email-from') || 'GitHub Star Tracker',
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

  const secure = emailConfig.port === 465;

  const transporter = nodemailer.createTransport({
    host: emailConfig.host,
    port: emailConfig.port,
    secure,
    auth:
      emailConfig.username && emailConfig.password
        ? { user: emailConfig.username, pass: emailConfig.password }
        : undefined,
  });

  const info = await transporter.sendMail({
    from: emailConfig.from,
    to: emailConfig.to,
    subject,
    html: htmlBody,
  });

  core.info(`Email sent: ${info.messageId}`);
  return true;
}
