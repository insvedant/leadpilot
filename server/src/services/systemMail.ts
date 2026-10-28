import nodemailer from 'nodemailer';
import { env } from '../config/env';

/**
 * Account emails (password reset). Uses SYSTEM_SMTP_URL, e.g.
 * smtps://noreply%40yourdomain.com:APP_PASSWORD@smtp.gmail.com:465
 * Without it, the email is printed to the server console, which is fine for local development.
 */
const transporter = env.SYSTEM_SMTP_URL ? nodemailer.createTransport(env.SYSTEM_SMTP_URL) : null;

export async function sendSystemEmail(to: string, subject: string, text: string): Promise<void> {
  if (!transporter) {
    console.log(`\n[system email, SYSTEM_SMTP_URL not set]\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  await transporter.sendMail({ from: env.SYSTEM_FROM ?? 'LeadPilot <no-reply@localhost>', to, subject, text });
}
