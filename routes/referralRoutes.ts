import { Router } from 'express';
import { 
  getMyReferrals, 
  validateReferralCode, 
  getAdminReferrals, 
  markReferralAsPaid,
  deleteReferral
} from '../controllers/referralController';

const router = Router();

// Customer endpoints
router.get('/my-referrals', getMyReferrals);
router.post('/validate-code', validateReferralCode);

// Admin endpoints
router.get('/admin/all', getAdminReferrals);
router.patch('/admin/:id/payout', markReferralAsPaid);
router.delete('/admin/:id', deleteReferral);

export default router;
