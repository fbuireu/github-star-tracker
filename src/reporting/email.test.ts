import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@actions/core', () => ({
  getInput: vi.fn().mockReturnValue(''),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('nodemailer', () => {
  const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' });
  return {
    default: {
      createTransport: vi.fn().mockReturnValue({ sendMail: mockSendMail }),
    },
  };
});

import * as core from '@actions/core';
import nodemailer from 'nodemailer';
import type { EmailConfig } from '../types';
import { getEmailConfig, sendEmail } from './email';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getEmailConfig', () => {
  it('returns null when smtp-host is not provided', () => {
    vi.mocked(core.getInput).mockReturnValue('');
    expect(getEmailConfig('en')).toBeNull();
  });

  it('returns config when smtp-host is provided', () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const map: Record<string, string> = {
        'smtp-host': 'smtp.example.com',
        'smtp-port': '465',
        'smtp-username': 'user',
        'smtp-password': 'pass',
        'email-to': 'recipient@example.com',
        'email-from': 'Star Tracker',
      };
      return map[name] || '';
    });

    const config = getEmailConfig('en');
    expect(config).toEqual({
      host: 'smtp.example.com',
      port: 465,
      username: 'user',
      password: 'pass',
      to: 'recipient@example.com',
      from: 'Star Tracker',
    });
  });

  it('uses default from address when not provided', () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'smtp-host') return 'smtp.example.com';
      if (name === 'email-from') return '';
      return 'test';
    });

    const config = getEmailConfig('en');
    expect(config?.from).toBe('GitHub Star Tracker');
  });
});

describe('sendEmail', () => {
  const emailConfig: EmailConfig = {
    host: 'smtp.example.com',
    port: 587,
    username: 'user',
    password: 'pass',
    to: 'recipient@example.com',
    from: 'Star Tracker',
  };

  it('returns false when emailConfig is null', async () => {
    const result = await sendEmail({
      emailConfig: null,
      subject: 'Subject',
      htmlBody: '<p>Body</p>',
    });
    expect(result).toBe(false);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('returns false when email-to is empty', async () => {
    const result = await sendEmail({
      emailConfig: { ...emailConfig, to: '' },
      subject: 'Subject',
      htmlBody: '<p>Body</p>',
    });
    expect(result).toBe(false);
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('no email-to'));
  });

  it('sends email with correct parameters', async () => {
    const result = await sendEmail({
      emailConfig,
      subject: 'Test Subject',
      htmlBody: '<p>Test</p>',
    });
    const mockSendMail = vi.mocked(nodemailer.createTransport).mock.results[0]?.value?.sendMail;

    expect(result).toBe(true);
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'user', pass: 'pass' },
    });
    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'Star Tracker',
      to: 'recipient@example.com',
      subject: 'Test Subject',
      html: '<p>Test</p>',
    });
  });

  it('uses secure=true for port 465', async () => {
    await sendEmail({
      emailConfig: { ...emailConfig, port: 465 },
      subject: 'Subject',
      htmlBody: '<p>Body</p>',
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true }),
    );
  });

  it('omits auth when credentials are missing', async () => {
    await sendEmail({
      emailConfig: { ...emailConfig, username: '', password: '' },
      subject: 'Subject',
      htmlBody: '<p>Body</p>',
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: undefined }),
    );
  });
});
