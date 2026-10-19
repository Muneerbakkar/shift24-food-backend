import { Router } from 'express';
import { 
  getPurchases, 
  createPurchase, 
  updatePurchase, 
  deletePurchase 
} from '../controllers/purchaseController';

const router = Router();

router.get('/', getPurchases);
router.post('/', createPurchase);
router.put('/:id', updatePurchase);
router.delete('/:id', deletePurchase);

export default router;
