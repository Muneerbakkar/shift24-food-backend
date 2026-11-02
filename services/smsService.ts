/**
 * SMS delivery for customer OTP logins.
 *
 * Providers, in order of preference:
 *   1. Twilio        — TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *   2. Fast2SMS      — FAST2SMS_API_KEY (popular in India)
 *   3. Console       — no credentials: the code is logged on the server and
 *                      handed back to the app in development only.
 *
 * Note for India: A2P SMS to Indian numbers needs a DLT-registered sender and
 * template with your provider, otherwise carriers silently drop the message.
 */

export interface SmsResult {
  sent: boolean;
  provider: 'twilio' | 'fast2sms' | 'console';
  message?: string;
}

const readConfig = () => ({
  twilioSid: (process.env.TWILIO_ACCOUNT_SID || '').trim(),
  twilioToken: (process.env.TWILIO_AUTH_TOKEN || '').trim(),
  twilioFrom: (process.env.TWILIO_FROM_NUMBER || '').trim(),
  fast2smsKey: (process.env.FAST2SMS_API_KEY || '').trim(),
  senderId: (process.env.SMS_SENDER_ID || 'SHFT24').trim()
});

export function getSmsProvider(): { provider: SmsResult['provider']; configured: boolean } {
  const { twilioSid, twilioToken, twilioFrom, fast2smsKey } = readConfig();
  if (twilioSid && twilioToken && twilioFrom) return { provider: 'twilio', configured: true };
  if (fast2smsKey) return { provider: 'fast2sms', configured: true };
  return { provider: 'console', configured: false };
}

export function otpSmsText(code: string): string {
  return `Your SHIFT24 verification code is ${code}. It expires in 5 minutes. Never share this code with anyone.`;
}

export async function sendOtpSms(phoneE164: string, code: string): Promise<SmsResult> {
  const { twilioSid, twilioToken, twilioFrom, fast2smsKey } = readConfig();
  const text = otpSmsText(code);

  // 1. Twilio
  if (twilioSid && twilioToken && twilioFrom) {
    try {
      const body = new URLSearchParams({ To: phoneE164, From: twilioFrom, Body: text });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body,
        signal: AbortSignal.timeout(12000)
      });
      if (!res.ok) {
        const payload: any = await res.json().catch(() => ({}));
        return { sent: false, provider: 'twilio', message: payload?.message || `Twilio rejected the message (HTTP ${res.status})` };
      }
      return { sent: true, provider: 'twilio' };
    } catch (err: any) {
      return { sent: false, provider: 'twilio', message: err?.message || 'Twilio request failed' };
    }
  }

  // 2. Fast2SMS (India)
  //    - With FAST2SMS_OTP_TEMPLATE_ID: DLT-approved OTP template (recommended, reliable)
  //    - Without it: Quick SMS route "q" (works for testing, carriers may drop it)
  if (fast2smsKey) {
    const mobile = phoneE164.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    const templateId = (process.env.FAST2SMS_OTP_TEMPLATE_ID || '').trim();

    try {
      if (templateId) {
        const res = await fetch('https://www.fast2sms.com/dev/otp/send', {
          method: 'POST',
          headers: {
            authorization: fast2smsKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            mobile,
            otp_id: templateId,
            otp: code,
            otp_expiry: 5,
            otp_length: 6
          }),
          signal: AbortSignal.timeout(12000)
        });
        const payload: any = await res.json().catch(() => ({}));
        if (!res.ok || payload?.return === false) {
          return {
            sent: false,
            provider: 'fast2sms',
            message: Array.isArray(payload?.message) ? payload.message.join(', ') : (payload?.message || `Fast2SMS rejected the OTP (HTTP ${res.status})`)
          };
        }
        return { sent: true, provider: 'fast2sms' };
      }

      const url = new URL('https://www.fast2sms.com/dev/bulkV2');
      url.searchParams.set('route', 'q');
      url.searchParams.set('message', text);
      url.searchParams.set('numbers', mobile);
      const res = await fetch(url.toString(), {
        headers: { authorization: fast2smsKey },
        signal: AbortSignal.timeout(12000)
      });
      const payload: any = await res.json().catch(() => ({}));
      if (!res.ok || payload?.return === false) {
        return {
          sent: false,
          provider: 'fast2sms',
          message: Array.isArray(payload?.message) ? payload.message.join(', ') : (payload?.message || `Fast2SMS rejected the message (HTTP ${res.status})`)
        };
      }
      return { sent: true, provider: 'fast2sms' };
    } catch (err: any) {
      return { sent: false, provider: 'fast2sms', message: err?.message || 'Fast2SMS request failed' };
    }
  }

  // 3. Console fallback (development)
  console.log(`[Shift24 SMS] No SMS provider configured — OTP for ${phoneE164}`);
  return {
    sent: false,
    provider: 'console',
    message: 'No SMS provider configured (TWILIO_* or FAST2SMS_API_KEY). The code was printed to the server log.'
  };
}
