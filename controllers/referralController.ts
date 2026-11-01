import { Request, Response } from 'express';
import crypto from 'crypto';
import { User } from '../models/User';
import { Referral } from '../models/Referral';
import { Notification } from '../models/Notification';
import { isConnectedToDb } from '../config/db';

/**
 * Generates a clean, human-readable referral code.
 * Example: SHIFT-MUNEER8A or SHIFT-9F2B
 */
export function generateUserReferralCode(name?: string, email?: string): string {
  const prefix = 'SHIFT';
  const cleanName = (name || '').trim().replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4);
  const randomSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${cleanName ? `${cleanName}` : ''}${randomSuffix}`;
}

/**
 * Helper to ensure a user has an active referral code
 */
export async function ensureUserReferralCode(user: any): Promise<string> {
  if (user.referralCode && user.referralCode.trim().length > 0) {
    return user.referralCode;
  }
  let code = generateUserReferralCode(user.name, user.email);
  // Guarantee uniqueness
  let existing = await User.findOne({ referralCode: code });
  while (existing) {
    code = generateUserReferralCode(user.name, user.email);
    existing = await User.findOne({ referralCode: code });
  }

  user.referralCode = code;
  await user.save();
  return code;
}

/**
 * GET /api/referrals/my-referrals
 * Retrieves the current customer's referral dashboard details
 */
export const getMyReferrals = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'Database offline' });
    }

    // Resolve user email from session, JWT, or query
    const userEmail = (req as any).user?.email || req.query.email || (req as any).session?.user?.email;
    if (!userEmail) {
      return res.status(401).json({ success: false, message: 'Authentication required to view referrals' });
    }

    const cleanEmail = String(userEmail).toLowerCase().trim();
    let user = await User.findOne({ email: cleanEmail });
    if (!user) {
      // Auto-create basic profile if missing
      user = await User.create({
        name: cleanEmail.split('@')[0],
        email: cleanEmail,
        role: 'customer'
      });
    }

    const referralCode = await ensureUserReferralCode(user);

    // Fetch all referrals where this user is the referrer
    const referrals = await Referral.find({
      $or: [
        { referrerEmail: cleanEmail },
        { referralCode: referralCode }
      ]
    }).sort({ createdAt: -1 });

    const totalReferred = referrals.length;
    // Count monthly plans
    const monthlyReferrals = referrals.filter(r => r.isMonthlyPlan);
    const pendingCount = monthlyReferrals.filter(r => r.payoutStatus === 'Pending').length;
    const eligibleCount = monthlyReferrals.filter(r => r.payoutStatus === 'Eligible').length;
    const paidCount = monthlyReferrals.filter(r => r.payoutStatus === 'Paid').length;
    const totalEarned = paidCount * 500;
    const pendingEarnings = eligibleCount * 500;

    return res.json({
      success: true,
      data: {
        referralCode,
        rewardPerMonthlyPlan: 500,
        totalReferred,
        monthlyReferralsCount: monthlyReferrals.length,
        pendingCount,
        eligibleCount,
        paidCount,
        totalEarned,
        pendingEarnings,
        referrals
      }
    });
  } catch (error: any) {
    console.error('[Referral] Error fetching my referrals:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/referrals/validate-code
 * Validates a referral code entered during checkout
 */
export const validateReferralCode = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'Database offline' });
    }

    const { code, userEmail } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, valid: false, message: 'Please enter a referral code' });
    }

    const cleanCode = code.trim().toUpperCase();
    const referrer = await User.findOne({ referralCode: cleanCode });

    if (!referrer) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: 'Invalid referral code. Please check and try again.'
      });
    }

    // Check if self-referral
    if (userEmail && referrer.email.toLowerCase() === String(userEmail).toLowerCase().trim()) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'You cannot use your own referral code.'
      });
    }

    return res.json({
      success: true,
      valid: true,
      referralCode: cleanCode,
      referrerName: referrer.name,
      message: `Referral code applied! Referred by ${referrer.name}.`
    });
  } catch (error: any) {
    console.error('[Referral] Error validating code:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/referrals/admin/all
 * Admin list of all referrals with statistics and filtering
 */
export const getAdminReferrals = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'Database offline' });
    }

    const { status, search } = req.query;
    const query: any = {};

    if (status && status !== 'all') {
      if (status === 'eligible') {
        query.payoutStatus = 'Eligible';
      } else if (status === 'paid') {
        query.payoutStatus = 'Paid';
      } else if (status === 'pending') {
        query.payoutStatus = 'Pending';
      } else {
        query.payoutStatus = status;
      }
    }

    if (search) {
      const q = String(search).trim();
      query.$or = [
        { referrerName: { $regex: q, $options: 'i' } },
        { referrerEmail: { $regex: q, $options: 'i' } },
        { referrerPhone: { $regex: q, $options: 'i' } },
        { refereeName: { $regex: q, $options: 'i' } },
        { refereeEmail: { $regex: q, $options: 'i' } },
        { referralCode: { $regex: q, $options: 'i' } },
        { subId: { $regex: q, $options: 'i' } }
      ];
    }

    const referrals = await Referral.find(query).sort({ createdAt: -1 });

    const totalCount = await Referral.countDocuments();
    const eligibleCount = await Referral.countDocuments({ payoutStatus: 'Eligible' });
    const paidCount = await Referral.countDocuments({ payoutStatus: 'Paid' });
    const totalPaidAmount = paidCount * 500;
    const totalPendingAmount = eligibleCount * 500;

    return res.json({
      success: true,
      stats: {
        totalCount,
        eligibleCount,
        paidCount,
        totalPaidAmount,
        totalPendingAmount
      },
      data: referrals
    });
  } catch (error: any) {
    console.error('[Referral] Admin fetch error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/referrals/admin/:id/payout
 * Admin marks a referral's ₹500 as manually paid via GPay / UPI / Bank transfer
 */
export const markReferralAsPaid = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'Database offline' });
    }

    const { id } = req.params;
    const { paymentReference, adminNotes } = req.body;

    const referral = await Referral.findOne({
      $or: [{ referralId: id }, { _id: id }]
    });

    if (!referral) {
      return res.status(404).json({ success: false, message: 'Referral record not found' });
    }

    referral.payoutStatus = 'Paid';
    referral.paidAt = new Date();
    referral.paymentReference = paymentReference || `Manual Payout (Admin)`;
    if (adminNotes) {
      referral.adminNotes = adminNotes;
    }

    await referral.save();

    // Trigger Notification to Referrer
    try {
      await Notification.create({
        notificationId: `NOTIF-${Date.now()}`,
        userId: referral.referrerEmail,
        title: '₹500 Referral Reward Paid!',
        message: `Your ₹500 reward for referring ${referral.refereeName} (${referral.planTitle} Monthly Plan) has been paid. Ref: ${referral.paymentReference}`,
        type: 'payment',
        read: false,
        createdAt: new Date()
      });
    } catch (notifErr) {
      console.warn('[Referral] Notification notice:', notifErr);
    }

    return res.json({
      success: true,
      message: `₹500 referral payout marked as completed for ${referral.referrerName}`,
      data: referral
    });
  } catch (error: any) {
    console.error('[Referral] Payout error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
