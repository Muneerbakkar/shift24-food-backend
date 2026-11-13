import { Router } from 'express';
import { 
  getAllSubscriptions, 
  getMySubscriptions,
  getSubscriptionById, 
  createSubscription, 
  updateSubscriptionStatus, 
  updateSubscriptionSlot,
  updateSubscriptionDetails,
  deleteSubscription
} from '../controllers/subscriptionController';

const router = Router();

router.get('/', getAllSubscriptions);
// Must stay above `/:id` so "mine" is not treated as a subscription id.
router.get('/mine', getMySubscriptions);
router.get('/:id', getSubscriptionById);
router.post('/', createSubscription);
router.patch('/:id/status', updateSubscriptionStatus);
router.patch('/:id/slot', updateSubscriptionSlot);
router.patch('/:id', updateSubscriptionDetails);
router.put('/:id', updateSubscriptionDetails);
router.delete('/:id', deleteSubscription);

export default router;
