import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Purchase } from '../models/Purchase';
import { isConnectedToDb } from '../config/db';

const cleanQueryVal = (val: any) => {
  if (!val) return undefined;
  const s = String(val).trim();
  if (s === '' || s === 'undefined' || s === 'null' || s === 'All') return undefined;
  return s;
};

export const getPurchases = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const category = cleanQueryVal(req.query.category);
    const search = cleanQueryVal(req.query.search);
    const startDate = cleanQueryVal(req.query.startDate);
    const endDate = cleanQueryVal(req.query.endDate);
    const status = cleanQueryVal(req.query.status);

    const query: any = {};
    if (category) query.category = category;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { itemName: { $regex: search, $options: 'i' } },
        { supplier: { $regex: search, $options: 'i' } },
        { invoiceNumber: { $regex: search, $options: 'i' } }
      ];
    }
    if (startDate || endDate) {
      query.purchaseDate = {};
      if (startDate) query.purchaseDate.$gte = String(startDate);
      if (endDate) query.purchaseDate.$lte = String(endDate);
    }

    const purchases = await Purchase.find(query).sort({ purchaseDate: -1, createdAt: -1 });

    const totalSpend = purchases.reduce((sum, p) => sum + (Number(p.totalCost) || 0), 0);

    const categoryBreakdown: Record<string, number> = {};
    purchases.forEach(p => {
      const cat = p.category || 'Other';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (Number(p.totalCost) || 0);
    });

    return res.json({
      success: true,
      count: purchases.length,
      totalSpend,
      categoryBreakdown,
      data: purchases
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createPurchase = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const {
      itemName,
      category,
      quantity,
      unit,
      unitCost,
      totalCost,
      supplier,
      invoiceNumber,
      purchaseDate,
      paymentMethod,
      status,
      notes
    } = req.body;

    if (!itemName || quantity === undefined || unitCost === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Item name, quantity, and unit cost are required'
      });
    }

    const q = Number(quantity);
    const uc = Number(unitCost);
    const tc = totalCost !== undefined ? Number(totalCost) : Math.round(q * uc * 100) / 100;
    const effectiveDate = purchaseDate || new Date().toISOString().split('T')[0];

    const newPurchaseData = {
      itemName: itemName.trim(),
      category: category || 'Vegetables',
      quantity: q,
      unit: unit || 'kg',
      unitCost: uc,
      totalCost: tc,
      supplier: (supplier || 'Local Wholesale Vendor').trim(),
      invoiceNumber: invoiceNumber ? String(invoiceNumber).trim() : '',
      purchaseDate: effectiveDate,
      paymentMethod: paymentMethod || 'UPI',
      status: status || 'Paid',
      notes: notes ? notes.trim() : ''
    };

    const created = await Purchase.create(newPurchaseData);
    return res.status(201).json({
      success: true,
      message: 'Purchase recorded successfully',
      data: created
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updatePurchaseStatus = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!['Paid', 'Pending', 'Credit'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be Paid, Pending, or Credit'
      });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid purchase ID' });
    }

    const updated = await Purchase.findByIdAndUpdate(id, { status }, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Purchase record not found' });
    }

    return res.json({
      success: true,
      message: 'Purchase status updated',
      data: updated
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updatePurchase = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid purchase ID' });
    }

    const updated = await Purchase.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Purchase record not found' });
    }

    return res.json({
      success: true,
      message: 'Purchase updated successfully',
      data: updated
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deletePurchase = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid purchase ID' });
    }

    const deleted = await Purchase.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Purchase record not found' });
    }

    return res.json({
      success: true,
      message: 'Purchase log deleted successfully'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
