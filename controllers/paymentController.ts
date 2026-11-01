import { Request, Response } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';

/**
 * Returns a configured Razorpay instance or null if credentials are not provided.
 */
function getRazorpayInstance(): Razorpay | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (keyId && keySecret && !keyId.includes('YOUR_') && !keySecret.includes('YOUR_')) {
    return new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });
  }
  return null;
}

/**
 * GET /api/payment/razorpay/key or /api/razorpay-key
 * Returns public Razorpay key ID to frontend
 */
export const getRazorpayKey = async (req: Request, res: Response) => {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() || '';
  const isConfigured = Boolean(keyId && keySecret && !keyId.includes('YOUR_') && !keySecret.includes('YOUR_'));

  return res.json({
    success: true,
    key_id: keyId,
    keyId: keyId,
    isConfigured
  });
};

/**
 * POST /api/create-order (or /api/payment/razorpay/create-order)
 * Creates a Razorpay order in paise
 * 
 * Request: { amount (paise), currency, receipt, notes? }
 * Minimum amount: 100 paise
 * Returns: { order_id, amount, currency, ... }
 */
export const createRazorpayOrder = async (req: Request, res: Response) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount. Minimum amount is 100 paise (1 INR).'
      });
    }

    const keyId = process.env.RAZORPAY_KEY_ID?.trim();
    const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

    if (!keyId || !keySecret) {
      return res.status(401).json({
        success: false,
        message: 'Razorpay authentication failed: API credentials are not configured.'
      });
    }

    const rzp = getRazorpayInstance();
    if (!rzp) {
      return res.status(401).json({
        success: false,
        message: 'Razorpay authentication failed: Invalid API credentials.'
      });
    }

    const amountInPaise = Math.round(numAmount);
    const orderReceipt = (receipt || `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`).toString().slice(0, 40);

    const options = {
      amount: amountInPaise,
      currency: (currency || 'INR').toUpperCase(),
      receipt: orderReceipt,
      notes: notes || {}
    };

    const order = await rzp.orders.create(options);

    return res.status(200).json({
      success: true,
      order_id: order.id,
      orderId: order.id,
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      key_id: keyId,
      keyId: keyId
    });
  } catch (error: any) {
    console.error('[Razorpay] Error creating order:', error);

    // Auth failure status
    if (
      error?.statusCode === 401 ||
      error?.status === 401 ||
      (error?.error?.code === 'BAD_REQUEST_ERROR' && /auth|key/i.test(error?.error?.description || '')) ||
      (error?.message && /auth|unauthorized|credential/i.test(error.message))
    ) {
      return res.status(401).json({
        success: false,
        message: error?.error?.description || error?.message || 'Razorpay authentication failed'
      });
    }

    return res.status(500).json({
      success: false,
      message: error?.error?.description || error.message || 'Failed to create Razorpay order'
    });
  }
};

/**
 * POST /api/verify-payment (or /api/payment/razorpay/verify)
 * Verifies Razorpay payment signature
 * 
 * Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
 * Compare generated signature with razorpay_signature
 * Return success only if signatures match
 */
export const verifyRazorpayPayment = async (req: Request, res: Response) => {
  try {
    const orderId = req.body.razorpay_order_id || req.body.order_id;
    const paymentId = req.body.razorpay_payment_id || req.body.payment_id;
    const signature = req.body.razorpay_signature || req.body.signature;

    // Missing fields: return 400
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment verification fields (order_id, payment_id, signature)'
      });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
    if (!keySecret) {
      return res.status(500).json({
        success: false,
        message: 'Server Razorpay Key Secret is not configured'
      });
    }

    // Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    // Secure timing-safe comparison
    let isValid = false;
    try {
      isValid = (
        generatedSignature.length === signature.length &&
        crypto.timingSafeEqual(
          Buffer.from(generatedSignature),
          Buffer.from(signature)
        )
      );
    } catch {
      isValid = false;
    }

    if (isValid) {
      return res.status(200).json({
        success: true,
        verified: true,
        order_id: orderId,
        orderId: orderId,
        payment_id: paymentId,
        paymentId: paymentId,
        message: 'Payment verified successfully'
      });
    } else {
      // Signature mismatch: return 400, do NOT mark as paid
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'Invalid payment signature. Verification failed.'
      });
    }
  } catch (error: any) {
    console.error('[Razorpay] Verification error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Payment signature verification error'
    });
  }
};
