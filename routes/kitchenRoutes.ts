import { Router } from 'express';
import { getKitchenPrepBoard } from '../controllers/kitchenController';

const router = Router();

router.get('/prep-board', getKitchenPrepBoard);

export default router;
