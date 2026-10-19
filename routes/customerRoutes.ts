import { Router } from 'express';
import { 
  getAllCustomers, 
  getCustomerById, 
  updateCustomerAllergies 
} from '../controllers/customerController';

const router = Router();

router.get('/', getAllCustomers);
router.get('/:id', getCustomerById);
router.put('/:id/allergies', updateCustomerAllergies);

export default router;
