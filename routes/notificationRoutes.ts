import { Router } from 'express';
import {
  getCustomerNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteNotificationsBulk
} from '../controllers/notificationController';

const router = Router();

router.get('/', getCustomerNotifications);
router.patch('/read-all', markAllNotificationsAsRead);
router.patch('/:id/read', markNotificationAsRead);
router.delete('/:id', deleteNotification);
router.delete('/', deleteNotificationsBulk);

export default router;
