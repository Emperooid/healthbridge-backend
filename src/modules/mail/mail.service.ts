import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey = process.env.BREVO_API_KEY!;
  private readonly senderEmail = process.env.BREVO_SENDER_EMAIL || 'awosikaemmanueldefirst@gmail.com';
  private readonly apiUrl = 'https://api.brevo.com/v3/smtp/email';

  private async send(to: string, subject: string, htmlContent: string) {
    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'CliniLynk', email: this.senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Brevo ${res.status}: ${body}`);
    }
  }

  async sendEmailVerification(to: string, firstName: string, verifyUrl: string) {
    try {
      await this.send(to, 'Verify your CliniLynk email address', `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2>Welcome to CliniLynk, ${firstName}!</h2>
          <p>Please verify your email address to activate your account.
             This link expires in <strong>24 hours</strong>.</p>
          <a href="${verifyUrl}"
             style="display:inline-block;padding:12px 24px;background:#16a34a;
                    color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
            Verify Email
          </a>
          <p style="margin-top:24px;color:#6b7280;font-size:13px">
            If you didn't create a CliniLynk account, ignore this email.<br>
            Link: ${verifyUrl}
          </p>
        </div>
      `);
    } catch (err: any) {
      this.logger.error(`Failed to send verification email to ${to}: ${err?.message ?? err}`);
    }
  }

  async sendDoctorInvite(to: string, firstName: string, hospitalName: string, acceptUrl: string) {
    try {
      await this.send(to, `You've been invited to join ${hospitalName} on CliniLynk`, `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2>You're invited, ${firstName}!</h2>
          <p><strong>${hospitalName}</strong> has invited you to join CliniLynk as a doctor.</p>
          <p>Click the button below to set your password and activate your account.
             This link expires in <strong>7 days</strong>.</p>
          <a href="${acceptUrl}"
             style="display:inline-block;padding:12px 24px;background:#16a34a;
                    color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
            Accept Invitation
          </a>
          <p style="margin-top:24px;color:#6b7280;font-size:13px">
            If you weren't expecting this, you can ignore this email.<br>
            Link: ${acceptUrl}
          </p>
        </div>
      `);
    } catch (err: any) {
      this.logger.error(`Failed to send invite email to ${to}: ${err?.message ?? err}`);
    }
  }

  async sendPasswordReset(to: string, firstName: string, resetUrl: string) {
    try {
      await this.send(to, 'Reset your CliniLynk password', `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2>Password Reset Request</h2>
          <p>Hi ${firstName},</p>
          <p>We received a request to reset your CliniLynk password.
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
      `);
    } catch (err: any) {
      this.logger.error(`Failed to send password reset email to ${to}: ${err?.message ?? err}`);
    }
  }
}
