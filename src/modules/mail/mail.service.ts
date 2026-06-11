import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendPasswordReset(to: string, firstName: string, resetUrl: string) {
    try {
      await this.transporter.sendMail({
        from: `"HealthBridge" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to,
        subject: 'Reset your HealthBridge password',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2>Password Reset Request</h2>
            <p>Hi ${firstName},</p>
            <p>We received a request to reset your HealthBridge password.
               Click the button below to choose a new password.
               This link expires in <strong>30 minutes</strong> and can only be used once.</p>
            <a href="${resetUrl}"
               style="display:inline-block;padding:12px 24px;background:#2563eb;
                      color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
              Reset Password
            </a>
            <p style="margin-top:24px;color:#6b7280;font-size:13px">
              If you didn't request this, ignore this email — your password won't change.<br>
              Link: ${resetUrl}
            </p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send password reset email to ${to}`, err);
    }
  }
}
