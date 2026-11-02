import { Router } from 'express';
import {
  getActivityLogs,
  getRecentActivity,
  deleteActivityLog,
  purgeActivityLogs
} from '../controllers/activityController';

const router = Router();

router.get('/', getActivityLogs);
router.get('/recent', getRecentActivity);
router.delete('/', purgeActivityLogs);
router.delete('/:id', deleteActivityLog);

export default router;
