import { Router } from 'express';
import { 
  getAllOrders, 
  createOrder, 
  updateOrderStatus,
  generateOrdersFromSubscriptions,
  deleteAllOrders,
  deleteOrderById,
  deleteOrdersBulk,
  assignDriverToOrder,
  bulkAssignDriverToOrders,
  updateRouteSequence
} from '../controllers/orderController';

const router = Router();

router.get('/', getAllOrders);
router.post('/generate', generateOrdersFromSubscriptions);
router.delete('/all', deleteAllOrders);
router.post('/bulk-delete', deleteOrdersBulk);
router.post('/bulk-assign-driver', bulkAssignDriverToOrders);
router.post('/reorder-route', updateRouteSequence);
router.patch('/:id/assign-driver', assignDriverToOrder);
router.delete('/:id', deleteOrderById);
router.post('/', createOrder);
router.patch('/:id/status', updateOrderStatus);

export default router;
