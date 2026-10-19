import { Router } from 'express';
import { 
  getAllSubscriptions, 
  getSubscriptionById, 
  createSubscription, 
  updateSubscriptionStatus, 
  updateSubscriptionSlot 
} from '../controllers/subscriptionController';

const router = Router();

router.get('/', getAllSubscriptions);
router.get('/:id', getSubscriptionById);
router.post('/', createSubscription);
router.patch('/:id/status', updateSubscriptionStatus);
router.patch('/:id/slot', updateSubscriptionSlot);

export default router;
