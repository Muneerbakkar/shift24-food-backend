import { Router } from 'express';
import { 
  getAllOrders, 
  createOrder, 
  updateOrderStatus 
} from '../controllers/orderController';

const router = Router();

router.get('/', getAllOrders);
router.post('/', createOrder);
router.patch('/:id/status', updateOrderStatus);

export default router;
