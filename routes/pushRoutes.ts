import { Router } from 'express';
import {
  getVapidPublicKey,
  subscribeDevice,
  unsubscribeDevice,
  sendTestPush
} from '../controllers/pushController';

const router = Router();

router.get('/vapid-public-key', getVapidPublicKey);
router.post('/subscribe', subscribeDevice);
router.post('/unsubscribe', unsubscribeDevice);
router.post('/test', sendTestPush);

export default router;
