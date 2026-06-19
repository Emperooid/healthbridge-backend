import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend;
  private from = 'HealthBridge <onboarding@resend.dev>';

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendEmailVerification(to: string, firstName: string, verifyUrl: string) {
    try {
      await this.resend.emails.send({
        from: this.from,
        to,
        subject: 'Verify your HealthBridge email address',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2>Welcome to HealthBridge, ${firstName}!</h2>
            <p>Please verify your email address to activate your account.
               This link expires in <strong>24 hours</strong>.</p>
            <a href="${verifyUrl}"
               style="display:inline-block;padding:12px 24px;background:#16a34a;
                      color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
              Verify Email
            </a>
            <p style="margin-top:24px;color:#6b7280;font-size:13px">
              If you didn't create a HealthBridge account, ignore this email.<br>
              Link: ${verifyUrl}
            </p>
          </div>
        `,
      });
    } catch (err: any) {
      this.logger.error(`Failed to send verification email to ${to}: ${err?.message ?? err}`);
    }
  }

  async sendPasswordReset(to: string, firstName: string, resetUrl: string) {
    try {
      await this.resend.emails.send({
        from: this.from,
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
