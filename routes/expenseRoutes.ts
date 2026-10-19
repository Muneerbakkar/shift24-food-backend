import { Router } from 'express';
import { 
  getExpenses, 
  createExpense, 
  updateExpense, 
  deleteExpense 
} from '../controllers/expenseController';

const router = Router();

router.get('/', getExpenses);
router.post('/', createExpense);
router.put('/:id', updateExpense);
router.delete('/:id', deleteExpense);

export default router;
