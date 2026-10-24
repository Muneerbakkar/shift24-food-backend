import { Router } from 'express';
import { getKitchenSettings, updateKitchenSettings } from '../controllers/settingsController';

const router = Router();

// Kitchen location & profile settings
router.get('/', getKitchenSettings);
router.get('/kitchen', getKitchenSettings);
router.put('/', updateKitchenSettings);
router.post('/', updateKitchenSettings);
router.put('/kitchen', updateKitchenSettings);
router.post('/kitchen', updateKitchenSettings);

export default router;
