import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

interface SendResetEmailParams {
  toEmail: string;
  userName?: string;
  resetCode: string;
}

export interface SendEmailResult {
  sent: boolean;
  previewUrl?: string | false;
  message?: string;
  provider: 'smtp' | 'ethereal' | 'simulated';
}

export async function sendPasswordResetEmail({
  toEmail,
  userName = 'Member',
  resetCode
}: SendResetEmailParams): Promise<SendEmailResult> {
  // Reload environment variables so updates to .env take effect immediately
  try {
    dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
    dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env'), override: true });
  } catch (e) {
    // ignore
  }

  const smtpUser = (process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
  const rawPass = (process.env.SMTP_PASS || process.env.EMAIL_PASS || '').trim();
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT) || 587;
  const smtpService = (process.env.EMAIL_SERVICE || 'gmail').trim().toLowerCase();

  // For Gmail: Google generates App Passwords in 4-letter chunks with spaces (e.g. "malo rviw fycg hiui").
  // SMTP authentication requires removing all whitespace.
  const isGmail = smtpService === 'gmail' || smtpUser.includes('@gmail.com');
  const smtpPass = isGmail ? rawPass.replace(/\s+/g, '') : rawPass;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Shift24 Password Reset</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
        .container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
        .header { background: #ffffff; padding: 32px 24px 24px; text-align: center; border-bottom: 1px solid #f1f5f9; }
        .logo { font-size: 30px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase; color: #0f172a; }
        .logo span { color: #10b981; }
        .tagline { font-size: 13px; font-weight: 600; color: #64748b; margin-top: 5px; }
        .content { padding: 32px 28px; }
        h1 { font-size: 20px; font-weight: 800; margin-top: 0; color: #0f172a; }
        p { font-size: 14px; line-height: 1.6; color: #475569; margin: 12px 0; }
        .code-box { background: #f0fdf4; border: 2px dashed #10b981; border-radius: 14px; padding: 18px 24px; text-align: center; margin: 24px 0; }
        .code { font-family: monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #065f46; }
        .badge { display: inline-block; background: #dcfce7; color: #166534; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; margin-bottom: 8px; text-transform: uppercase; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; }
        .warning { font-size: 12px; color: #64748b; background: #f1f5f9; padding: 12px 16px; border-radius: 10px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">SHIFT<span>24</span></div>
          <div class="tagline">Clean Fuel for High Achievers</div>
        </div>
        <div class="content">
          <span class="badge">Password Reset Request</span>
          <h1>Hello, ${userName}</h1>
          <p>We received a request to reset your password for your <strong>SHIFT24</strong> account (<strong>${toEmail}</strong>).</p>
          <p>Use the following 6-digit verification code to complete your reset:</p>
          <div class="code-box">
            <div class="code">${resetCode}</div>
          </div>
          <p>This verification code is confidential and will expire in <strong>15 minutes</strong>.</p>
          <div class="warning">
            If you did not request a password reset, you can safely ignore this email. Your account remains completely secure.
          </div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} SHIFT24 Nutrition. All rights reserved.<br/>
          MG Road, Kochi, Kerala &bull; support@shift24.food
        </div>
      </div>
    </body>
    </html>
  `;

  // 1. If SMTP / Gmail credentials exist in environment variables
  if (smtpUser && smtpPass) {
    try {
      let transporterConfig: any;
      if (isGmail) {
        transporterConfig = {
          service: 'gmail',
          auth: { user: smtpUser, pass: smtpPass }
        };
      } else if (smtpHost) {
        transporterConfig = {
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass }
        };
      } else if (smtpService) {
        transporterConfig = {
          service: smtpService,
          auth: { user: smtpUser, pass: smtpPass }
        };
      } else {
        transporterConfig = {
          service: 'gmail',
          auth: { user: smtpUser, pass: smtpPass }
        };
      }

      const transporter = nodemailer.createTransport(transporterConfig);
      const fromAddress = process.env.SMTP_FROM || `"SHIFT24 Nutrition" <${smtpUser}>`;

      await transporter.sendMail({
        from: fromAddress,
        to: toEmail,
        subject: `SHIFT24 - Your Password Reset Verification Code: ${resetCode}`,
        text: `Your SHIFT24 password reset verification code is: ${resetCode}. It will expire in 15 minutes.`,
        html: htmlContent
      });

      console.log(`[Shift24 Email] Successfully dispatched live email to: ${toEmail}`);
      return { sent: true, provider: 'smtp', message: 'Email sent directly to your inbox' };
    } catch (err: any) {
      console.error('[Shift24 Email] Live SMTP transmission failed:', err.message);
    }
  }

  // 2. Fallback: try Ethereal for preview URL
  try {
    const testAccount = await nodemailer.createTestAccount();
    const testTransporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });

    const info = await testTransporter.sendMail({
      from: '"SHIFT24 Nutrition" <support@shift24.food>',
      to: toEmail,
      subject: `SHIFT24 - Your Password Reset Verification Code: ${resetCode}`,
      text: `Your SHIFT24 password reset verification code is: ${resetCode}. It will expire in 15 minutes.`,
      html: htmlContent
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`[Shift24 Email (Ethereal)] Preview URL: ${previewUrl}`);
    return {
      sent: false,
      previewUrl,
      provider: 'ethereal',
      message: 'SMTP credentials not configured in backend/.env'
    };
  } catch (etherealErr) {
    console.log(`[Shift24 Email (Console Only)] Code for ${toEmail}: ${resetCode}`);
    return {
      sent: false,
      provider: 'simulated',
      message: 'SMTP credentials not configured in backend/.env'
    };
  }
}
