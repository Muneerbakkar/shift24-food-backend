import { Router } from 'express';
import { 
  getRazorpayKey, 
  createRazorpayOrder, 
  verifyRazorpayPayment 
} from '../controllers/paymentController';

const router = Router();

// Public key retrieval
router.get('/key', getRazorpayKey);
router.get('/razorpay/key', getRazorpayKey);

// Order creation
router.post('/create-order', createRazorpayOrder);
router.post('/razorpay/create-order', createRazorpayOrder);

// Payment signature verification
router.post('/verify-payment', verifyRazorpayPayment);
router.post('/verify', verifyRazorpayPayment);
router.post('/razorpay/verify', verifyRazorpayPayment);

export default router;
