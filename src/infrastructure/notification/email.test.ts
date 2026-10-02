import * as core from "@actions/core";
import nodemailer from "nodemailer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type EmailConfig, getEmailConfig, sendEmail } from "./email";

vi.mock("@actions/core", () => ({
	getInput: vi.fn(() => ""),
	info: vi.fn(),
	warning: vi.fn(),
	setSecret: vi.fn(),
}));

vi.mock("nodemailer", () => {
	const mockSendMail = vi.fn(async () => ({ messageId: "test-id" }));

	return {
		default: {
			createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
		},
	};
});

describe("getEmailConfig", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("returns null when smtp-host is not provided", () => {
		vi.mocked(core.getInput).mockReturnValue("");
		expect(getEmailConfig("en")).toBeNull();
	});

	it("returns config when smtp-host is provided", () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			const map: Record<string, string> = {
				"smtp-host": "smtp.example.com",
				"smtp-port": "465",
				"smtp-username": "user",
				"smtp-password": "pass",
				"email-to": "recipient@example.com",
				"email-from": "Star Tracker",
			};

			return map[name] || "";
		});

		const config = getEmailConfig("en");

		expect(config).toEqual({
			host: "smtp.example.com",
			port: 465,
			username: "user",
			password: "pass",
			to: "recipient@example.com",
			from: "Star Tracker",
		});
	});

	it("uses default from address when not provided", () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "smtp-host") return "smtp.example.com";
			if (name === "email-from") return "";
			return "test";
		});

		const config = getEmailConfig("en");

		expect(config?.from).toBe("GitHub Star Tracker");
	});

	it("falls back to 587 and warns when smtp-port is not a usable port", () => {
		vi.mocked(core.getInput).mockImplementation((name: string) =>
			name === "smtp-host" ? "smtp.test.com" : name === "smtp-port" ? "not-a-port" : "",
		);

		expect(getEmailConfig("en")?.port).toBe(587);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Invalid smtp-port"));
	});

	it.each(["0", "-25", "65536", "70000"])("falls back to 587 for the out-of-range smtp-port %s", (port) => {
		vi.mocked(core.getInput).mockImplementation((name: string) =>
			name === "smtp-host" ? "smtp.test.com" : name === "smtp-port" ? port : "",
		);

		expect(getEmailConfig("en")?.port).toBe(587);
		expect(core.warning).toHaveBeenCalledWith(`Invalid smtp-port "${port}". Falling back to 587.`);
	});

	it("reads the leading integer of an smtp-port, as parseInt does", () => {
		vi.mocked(core.getInput).mockImplementation((name: string) =>
			name === "smtp-host" ? "smtp.test.com" : name === "smtp-port" ? "465abc" : "",
		);

		expect(getEmailConfig("en")?.port).toBe(465);
	});

	it("masks the SMTP password so it cannot leak through error text", () => {
		vi.mocked(core.getInput).mockImplementation((name: string) =>
			name === "smtp-host" ? "smtp.test.com" : name === "smtp-password" ? "hunter2" : "",
		);

		getEmailConfig("en");

		expect(core.setSecret).toHaveBeenCalledWith("hunter2");
	});
});

describe("sendEmail", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	const emailConfig: EmailConfig = {
		host: "smtp.example.com",
		port: 587,
		username: "user",
		password: "pass",
		to: "recipient@example.com",
		from: "Star Tracker",
	};

	it("returns false when emailConfig is null", async () => {
		const result = await sendEmail({
			emailConfig: null,
			subject: "Subject",
			htmlBody: "<p>Body</p>",
		});

		expect(result).toBe(false);
		expect(nodemailer.createTransport).not.toHaveBeenCalled();
	});

	it("returns false when email-to is empty", async () => {
		const result = await sendEmail({
			emailConfig: { ...emailConfig, to: "" },
			subject: "Subject",
			htmlBody: "<p>Body</p>",
		});

		expect(result).toBe(false);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("no email-to"));
	});

	it("sends email with correct parameters", async () => {
		const result = await sendEmail({
			emailConfig,
			subject: "Test Subject",
			htmlBody: "<p>Test</p>",
		});

		const mockSendMail = vi.mocked(nodemailer.createTransport).mock.results[0]?.value?.sendMail;

		expect(result).toBe(true);
		expect(nodemailer.createTransport).toHaveBeenCalledWith({
			host: "smtp.example.com",
			port: 587,
			secure: false,
			auth: { user: "user", pass: "pass" },
		});
		expect(mockSendMail).toHaveBeenCalledWith({
			from: "Star Tracker",
			to: "recipient@example.com",
			subject: "Test Subject",
			html: "<p>Test</p>",
		});
	});

	it("logs the recipient address alongside the message ID", async () => {
		await sendEmail({
			emailConfig,
			subject: "Subject",
			htmlBody: "<p>Body</p>",
		});

		expect(core.info).toHaveBeenCalledWith("Email sent to recipient@example.com (message ID: test-id)");
	});

	it("warns when recipients are rejected", async () => {
		const transport = vi.mocked(nodemailer.createTransport)({});
		vi.mocked(transport.sendMail).mockResolvedValueOnce({
			messageId: "id",
			rejected: ["bad@example.com"],
		} as never);

		await sendEmail({
			emailConfig,
			subject: "Subject",
			htmlBody: "<p>Body</p>",
		});

		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("bad@example.com"));
	});

	it("names a rejected recipient that nodemailer reports as an address object", async () => {
		const transport = vi.mocked(nodemailer.createTransport)({});
		vi.mocked(transport.sendMail).mockResolvedValueOnce({
			messageId: "id",
			rejected: [{ name: "Bad", address: "bad@example.com" }, "worse@example.com"],
		} as never);

		await sendEmail({ emailConfig, subject: "Subject", htmlBody: "<p>Body</p>" });

		expect(core.warning).toHaveBeenCalledWith("Email rejected for: bad@example.com, worse@example.com");
	});

	it("does not warn when the rejected list is not a list", async () => {
		const transport = vi.mocked(nodemailer.createTransport)({});
		vi.mocked(transport.sendMail).mockResolvedValueOnce({ messageId: "id", rejected: "bad@example.com" } as never);

		await sendEmail({ emailConfig, subject: "Subject", htmlBody: "<p>Body</p>" });

		expect(core.warning).not.toHaveBeenCalled();
	});

	it("keeps the from address as-is when it already contains an email", async () => {
		await sendEmail({
			emailConfig: { ...emailConfig, from: "Star Tracker <noreply@example.com>" },
			subject: "Subject",
			htmlBody: "<p>Body</p>",
		});

		const mockSendMail = vi.mocked(nodemailer.createTransport).mock.results[0]?.value?.sendMail;

		expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ from: "Star Tracker <noreply@example.com>" }));
	});

	it("combines a name-only from with the SMTP username as the address", async () => {
		await sendEmail({
			emailConfig: { ...emailConfig, from: "Star Tracker", username: "user@example.com" },
			subject: "Subject",
			htmlBody: "<p>Body</p>",
		});

		const mockSendMail = vi.mocked(nodemailer.createTransport).mock.results[0]?.value?.sendMail;

		expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ from: "Star Tracker <user@example.com>" }));
	});

	it("uses secure=true for port 465", async () => {
		await sendEmail({
			emailConfig: { ...emailConfig, port: 465 },
			subject: "Subject",
			htmlBody: "<p>Body</p>",
		});

		expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: true }));
	});

	it("omits auth when credentials are missing", async () => {
		await sendEmail({
			emailConfig: { ...emailConfig, username: "", password: "" },
			subject: "Subject",
			htmlBody: "<p>Body</p>",
		});

		expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ auth: undefined }));
	});
});
