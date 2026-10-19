import { Router } from 'express';
import { 
  getPlans, 
  createPlan,
  updatePlan, 
  deletePlan,
  getWeeklyMenu, 
  saveMenuItem,
  updateMenuItem,
  deleteMenuItem 
} from '../controllers/menuController';

const router = Router();

// Plans endpoints
router.get('/plans', getPlans);
router.post('/plans', createPlan);
router.put('/plans/:id', updatePlan);
router.delete('/plans/:id', deletePlan);

// Weekly Menu & Foods endpoints
router.get('/menu', getWeeklyMenu);
router.post('/menu', saveMenuItem);
router.put('/menu/:day/:mealType', updateMenuItem);
router.delete('/menu/:id', deleteMenuItem);
router.delete('/menu', deleteMenuItem);

export default router;
