import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Expense } from '../models/Expense';
import { isConnectedToDb } from '../config/db';

const cleanQueryVal = (val: any) => {
  if (!val) return undefined;
  const s = String(val).trim();
  if (s === '' || s === 'undefined' || s === 'null' || s === 'All') return undefined;
  return s;
};

export const getExpenses = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const category = cleanQueryVal(req.query.category);
    const status = cleanQueryVal(req.query.status);
    const search = cleanQueryVal(req.query.search);
    const startDate = cleanQueryVal(req.query.startDate);
    const endDate = cleanQueryVal(req.query.endDate);

    const query: any = {};
    if (category) query.category = category;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { paidTo: { $regex: search, $options: 'i' } },
        { referenceNumber: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } }
      ];
    }
    if (startDate || endDate) {
      query.expenseDate = {};
      if (startDate) query.expenseDate.$gte = String(startDate);
      if (endDate) query.expenseDate.$lte = String(endDate);
    }

    const expenses = await Expense.find(query).sort({ expenseDate: -1, createdAt: -1 });

    const totalAmount = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const categoryBreakdown: Record<string, number> = {};
    expenses.forEach(e => {
      const cat = e.category || 'Other';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (Number(e.amount) || 0);
    });

    return res.json({
      success: true,
      count: expenses.length,
      totalAmount,
      categoryBreakdown,
      data: expenses
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createExpense = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const {
      title,
      category,
      amount,
      expenseDate,
      paymentMethod,
      paidTo,
      referenceNumber,
      status,
      notes
    } = req.body;

    if (!title || amount === undefined || !paidTo) {
      return res.status(400).json({
        success: false,
        message: 'Expense Title, Amount, and Paid To recipient are required'
      });
    }

    const effectiveDate = expenseDate || new Date().toISOString().split('T')[0];

    const newRecord = {
      title: title.trim(),
      category: category || 'Utilities (Gas, Electricity, Water)',
      amount: Number(amount),
      expenseDate: effectiveDate,
      paymentMethod: paymentMethod || 'UPI',
      paidTo: paidTo.trim(),
      referenceNumber: referenceNumber ? String(referenceNumber).trim() : '',
      status: status || 'Paid',
      notes: notes ? notes.trim() : ''
    };

    const created = await Expense.create(newRecord);
    return res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateExpenseStatus = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!['Paid', 'Pending', 'Due'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid expense status' });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid expense ID' });
    }

    const updated = await Expense.findByIdAndUpdate(id, { status }, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Expense record not found' });
    }

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateExpense = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid expense ID' });
    }

    const updated = await Expense.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Expense record not found' });
    }

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteExpense = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid expense ID' });
    }

    const deleted = await Expense.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Expense record not found' });
    }

    return res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
