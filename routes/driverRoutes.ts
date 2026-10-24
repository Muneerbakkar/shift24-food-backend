import { Router } from 'express';
import { 
  getAllDrivers, 
  getDriverById, 
  createDriver, 
  updateDriver, 
  deleteDriver,
  driverLogin,
  getDriverOrders
} from '../controllers/driverController';

const router = Router();

router.post('/login', driverLogin);
router.get('/', getAllDrivers);
router.get('/:id/orders', getDriverOrders);
router.get('/:id', getDriverById);
router.post('/', createDriver);
router.put('/:id', updateDriver);
router.patch('/:id', updateDriver);
router.delete('/:id', deleteDriver);

export default router;
