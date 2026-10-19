import { Router } from 'express';
import { 
  getSales, 
  createSale, 
  updateSale, 
  deleteSale 
} from '../controllers/salesController';

const router = Router();

router.get('/', getSales);
router.post('/', createSale);
router.put('/:id', updateSale);
router.delete('/:id', deleteSale);

export default router;
