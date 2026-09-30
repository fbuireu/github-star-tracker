import * as core from "@actions/core";
import { getTranslations, type Locale } from "@i18n";
import nodemailer from "nodemailer";
import * as z from "zod/mini";

const SECURE_SMTP_PORT = 465;
export const DEFAULT_SMTP_PORT = "587";
const MAX_TCP_PORT = 65_535;

function resolveFromAddress({ from, username }: { from: string; username: string }): string {
	if (from.includes("@")) {
		return from;
	}

	if (username.includes("@")) {
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

const PortSchema = z.pipe(
	z.pipe(
		z.string(),
		z.transform((raw) => Number.parseInt(raw, 10)),
	),
	z.int().check(z.minimum(1), z.maximum(MAX_TCP_PORT)),
);

const RecipientListSchema = z.array(
	z.union([
		z.string(),
		z.pipe(
			z.object({ address: z.string() }),
			z.transform(({ address }) => address),
		),
	]),
);

function resolvePort(raw: string): number {
	const port = PortSchema.safeParse(raw || DEFAULT_SMTP_PORT);

	if (port.success) return port.data;

	core.warning(`Invalid smtp-port "${raw}". Falling back to ${DEFAULT_SMTP_PORT}.`);

	return Number.parseInt(DEFAULT_SMTP_PORT, 10);
}

export function getEmailConfig(locale: Locale): EmailConfig | null {
	const host = core.getInput("smtp-host");
	if (!host) return null;

	const t = getTranslations(locale);
	const password = core.getInput("smtp-password");

	if (password) core.setSecret(password);

	return {
		host,
		port: resolvePort(core.getInput("smtp-port")),
		username: core.getInput("smtp-username"),
		password,
		to: core.getInput("email-to"),
		from: core.getInput("email-from") || t.email.defaultFrom,
	};
}

interface SendEmailParams {
	emailConfig: EmailConfig | null;
	subject: string;
	htmlBody: string;
}

export async function sendEmail({ emailConfig, subject, htmlBody }: SendEmailParams): Promise<boolean> {
	if (!emailConfig) {
		core.info("No SMTP configuration provided, skipping email");

		return false;
	}

	if (!emailConfig.to) {
		core.warning("SMTP configured but no email-to address provided, skipping email");

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

	const rejected = RecipientListSchema.safeParse(info.rejected).data ?? [];
	if (rejected.length > 0) {
		core.warning(`Email rejected for: ${rejected.join(", ")}`);
	}

	core.info(`Email sent to ${emailConfig.to} (message ID: ${info.messageId})`);

	return true;
}
