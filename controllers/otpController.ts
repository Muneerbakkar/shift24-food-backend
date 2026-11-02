import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { User } from '../models/User';
import { OtpCode } from '../models/OtpCode';
import { isConnectedToDb } from '../config/db';
import { sendOtpSms } from '../services/smsService';
import { generateToken, setSessionAndCookie } from './authController';

/**
 * Customer OTP login (phone + 6-digit SMS code).
 *
 * - Codes live in MongoDB with a TTL index, so they disappear on their own.
 * - One code per phone number at a time, 60 s resend cooldown, 5 codes/hour,
 *   5 verification attempts, 5 minute expiry.
 * - A first-time phone number gets a customer account created automatically.
 */

const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_REQUESTS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

const OTP_SECRET = process.env.OTP_SECRET || process.env.JWT_SECRET || 'shift24_otp_secret';

/** Accepts "9876543210", "+91 98765 43210", "09876543210", "919876543210". */
function normalizePhone(raw: unknown): { e164: string; digits10: string } | null {
  const digits = String(raw || '').replace(/\D/g, '');
  let national = digits;
  if (digits.length === 12 && digits.startsWith('91')) national = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) national = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(national)) return null;
  return { e164: `+91${national}`, digits10: national };
}

function hashCode(code: string, identifier: string): string {
  return crypto.createHash('sha256').update(`${code}:${identifier}:${OTP_SECRET}`).digest('hex');
}

/** Codes are echoed back to the app only outside production (or with OTP_DEBUG). */
function canExposeDevCode(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.OTP_DEBUG === 'true';
}

async function findCustomerByPhone(digits10: string) {
  return User.findOne({ role: 'customer', phone: new RegExp(`${digits10}$`) })
    .sort({ phoneVerified: -1, createdAt: -1 });
}

export const requestOtp = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const phone = normalizePhone(req.body?.phone);
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid 10-digit Indian mobile number'
      });
    }

    const identifier = phone.digits10;

    const lastCode = await OtpCode.findOne({ identifier }).sort({ createdAt: -1 });
    if (lastCode?.createdAt) {
      const elapsed = Date.now() - new Date(lastCode.createdAt).getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({
          success: false,
          message: `Please wait ${retryAfter}s before requesting another code`,
          retryAfter
        });
      }
    }

    const requestedLastHour = await OtpCode.countDocuments({
      identifier,
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
    });
    if (requestedLastHour >= MAX_REQUESTS_PER_HOUR) {
      return res.status(429).json({
        success: false,
        message: 'Too many codes requested for this number. Please try again in an hour.'
      });
    }

    const code = String(crypto.randomInt(100000, 1000000));

    // Only one live code per number.
    await OtpCode.deleteMany({ identifier });
    await OtpCode.create({
      identifier,
      channel: 'sms',
      codeHash: hashCode(code, identifier),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      attempts: 0
    });

    const sms = await sendOtpSms(phone.e164, code);
    if (!sms.sent) {
      console.warn(`[Shift24 OTP] SMS not delivered (${sms.provider}): ${sms.message}`);
    }

    const existingUser = await findCustomerByPhone(identifier);

    const payload: Record<string, any> = {
      success: true,
      sent: sms.sent,
      provider: sms.provider,
      phone: phone.e164,
      isNewUser: !existingUser,
      expiresIn: Math.round(CODE_TTL_MS / 1000),
      message: sms.sent
        ? `Verification code sent to ${phone.e164}`
        : (sms.message || 'Verification code generated')
    };
    if (!sms.sent && canExposeDevCode()) {
      payload.devCode = code;
    }

    return res.json(payload);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Could not send the code' });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const phone = normalizePhone(req.body?.phone);
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Enter a valid 10-digit Indian mobile number' });
    }

    const code = String(req.body?.code || '').replace(/\D/g, '');
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: 'Enter the 6-digit code from the SMS' });
    }

    const identifier = phone.digits10;
    const otp = await OtpCode.findOne({ identifier }).sort({ createdAt: -1 });

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: 'No active code for this number. Please request a new one.'
      });
    }

    if (new Date(otp.expiresAt).getTime() < Date.now()) {
      await OtpCode.deleteOne({ _id: otp._id });
      return res.status(400).json({ success: false, message: 'That code has expired. Please request a new one.' });
    }

    if (otp.attempts >= MAX_VERIFY_ATTEMPTS) {
      await OtpCode.deleteOne({ _id: otp._id });
      return res.status(429).json({
        success: false,
        message: 'Too many incorrect attempts. Please request a new code.'
      });
    }

    otp.attempts += 1;
    await otp.save();

    if (hashCode(code, identifier) !== otp.codeHash) {
      const attemptsLeft = Math.max(MAX_VERIFY_ATTEMPTS - otp.attempts, 0);
      return res.status(400).json({
        success: false,
        message: `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`
      });
    }

    // Code is single-use.
    await OtpCode.deleteOne({ _id: otp._id });

    let user = await findCustomerByPhone(identifier);
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await User.create({
        name: 'Shift24 Customer',
        // The account is phone-first; a real email can be added later in the profile.
        email: `phone.${identifier}@customers.shift24.local`,
        password: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10),
        phone: phone.e164,
        role: 'customer',
        phoneVerified: true,
        allergies: [],
        addresses: []
      });
      console.log(`[Shift24 OTP] Created a phone-first customer account for ${phone.e164}`);
    } else if (!user.phoneVerified) {
      user.phoneVerified = true;
      await user.save();
    }

    const token = generateToken(user);
    setSessionAndCookie(req, res, user, token);

    const safeUser = {
      id: user._id,
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      addresses: user.addresses || [],
      allergies: user.allergies || [],
      totalSpent: user.totalSpent,
      totalOrders: user.totalOrders,
      phoneVerified: true
    };

    return res.json({
      success: true,
      isNewUser,
      message: isNewUser ? 'Welcome to SHIFT24!' : 'Signed in',
      token,
      user: safeUser,
      data: safeUser
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Could not verify the code' });
  }
};
