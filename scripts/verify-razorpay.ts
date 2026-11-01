import express from 'express';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();
try {
  dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env'), override: true });
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
} catch (e) {}

import { createRazorpayOrder, verifyRazorpayPayment, getRazorpayKey } from '../controllers/paymentController';

async function runTests() {
  console.log('--- Starting Razorpay Integration Automated Verification ---');
  console.log('Loaded RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? `${process.env.RAZORPAY_KEY_ID.substring(0, 8)}...` : 'MISSING');
  console.log('Loaded RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? 'PRESENT' : 'MISSING');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`, detail || '');
      failed++;
    }
  }

  // Mock Request/Response helpers
  function createMockRes() {
    const res: any = {
      statusCode: 200,
      jsonData: null,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.jsonData = data;
        return this;
      }
    };
    return res;
  }

  // TEST 1: Public Key endpoint
  {
    const req: any = {};
    const res = createMockRes();
    await getRazorpayKey(req, res);
    assert(res.statusCode === 200 && res.jsonData.keyId === (process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder'), 'GET Razorpay Key returns correct Key ID');
  }

  // TEST 2: Amount validation (< 100 paise)
  {
    const req: any = { body: { amount: 50, currency: 'INR' } };
    const res = createMockRes();
    await createRazorpayOrder(req, res);
    assert(res.statusCode === 400 && res.jsonData.success === false, 'POST /api/create-order rejects amount < 100 paise with 400 status', res.jsonData);
  }

  // TEST 3: Amount validation (missing amount)
  {
    const req: any = { body: {} };
    const res = createMockRes();
    await createRazorpayOrder(req, res);
    assert(res.statusCode === 400 && res.jsonData.success === false, 'POST /api/create-order rejects missing amount with 400 status', res.jsonData);
  }

  // TEST 4: Successful Order Creation with Razorpay API (amount >= 100 paise)
  let createdOrderId = '';
  {
    const req: any = {
      body: {
        amount: 50000, // 50000 paise = 500 INR
        currency: 'INR',
        receipt: `test_${Date.now()}`
      }
    };
    const res = createMockRes();
    await createRazorpayOrder(req, res);
    const data = res.jsonData;
    const ok = res.statusCode === 200 && data.success && data.order_id && data.amount === 50000 && data.currency === 'INR';
    createdOrderId = data?.order_id || '';
    assert(ok, 'POST /api/create-order creates real Razorpay order returning { order_id, amount, currency }', data);
  }

  // TEST 5: Verify Payment - Missing fields
  {
    const req: any = { body: { razorpay_order_id: createdOrderId } }; // missing payment_id & signature
    const res = createMockRes();
    await verifyRazorpayPayment(req, res);
    assert(res.statusCode === 400 && res.jsonData.success === false, 'POST /api/verify-payment returns 400 on missing fields', res.jsonData);
  }

  // TEST 6: Verify Payment - Invalid signature (Signature mismatch)
  {
    const req: any = {
      body: {
        razorpay_order_id: createdOrderId || 'order_mock_123',
        razorpay_payment_id: 'pay_test_payment_456',
        razorpay_signature: 'invalid_signature_hex_value_1234567890abcdef1234567890abcdef12345678'
      }
    };
    const res = createMockRes();
    await verifyRazorpayPayment(req, res);
    assert(res.statusCode === 400 && res.jsonData.verified === false, 'POST /api/verify-payment returns 400 and marks unverified on signature mismatch', res.jsonData);
  }

  // TEST 7: Verify Payment - Valid HMAC-SHA256 signature
  {
    const testOrderId = createdOrderId || 'order_test_999';
    const testPaymentId = 'pay_test_valid_888';
    const secret = process.env.RAZORPAY_KEY_SECRET || 'test_secret';
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(`${testOrderId}|${testPaymentId}`)
      .digest('hex');

    const req: any = {
      body: {
        razorpay_order_id: testOrderId,
        razorpay_payment_id: testPaymentId,
        razorpay_signature: validSignature
      }
    };
    const res = createMockRes();
    await verifyRazorpayPayment(req, res);
    assert(res.statusCode === 200 && res.jsonData.success === true && res.jsonData.verified === true, 'POST /api/verify-payment verifies valid HMAC-SHA256 signature with 200 OK', res.jsonData);
  }

  // TEST 8: Verify Payment with snake_case field aliases { order_id, payment_id, signature }
  {
    const testOrderId = createdOrderId || 'order_test_999';
    const testPaymentId = 'pay_test_valid_777';
    const secret = process.env.RAZORPAY_KEY_SECRET || 'test_secret';
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(`${testOrderId}|${testPaymentId}`)
      .digest('hex');

    const req: any = {
      body: {
        order_id: testOrderId,
        payment_id: testPaymentId,
        signature: validSignature
      }
    };
    const res = createMockRes();
    await verifyRazorpayPayment(req, res);
    assert(res.statusCode === 200 && res.jsonData.verified === true, 'POST /api/verify-payment accepts both snake_case and razorpay_ prefixed fields', res.jsonData);
  }

  console.log(`\nVerification complete: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
