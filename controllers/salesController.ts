import { Request, Response } from 'express';
import { Sale } from '../models/Sale';
import { Subscription } from '../models/Subscription';
import { Purchase } from '../models/Purchase';
import { Expense } from '../models/Expense';
import { isConnectedToDb } from '../config/db';

const DUMMY_SUB_IDS = ['SUB-801', 'SUB-802', 'SUB-803', 'SUB-804', 'SUB-805'];
const DUMMY_EMAILS = ['rahul.s@example.com', 'ananya.roy@example.com', 'vikram.m@example.com', 'pooja.i@example.com', 'karthik.n@example.com'];

// Helper to sync non-dummy subscriptions into Sale collection
const syncSubscriptionsToSales = async () => {
  if (!isConnectedToDb) return;
  try {
    const subscriptions = await Subscription.find({
      subId: { $nin: DUMMY_SUB_IDS },
      customerEmail: { $nin: DUMMY_EMAILS }
    });

    for (const sub of subscriptions) {
      const cleanId = (sub.subId || '').replace(/^SUB-/, '') || 'SUB';
      const saleId = `INV-${cleanId}`;

      const existing = await Sale.findOne({
        $or: [{ linkedId: sub.subId }, { saleId: saleId }]
      });

      if (!existing) {
        let category: 'Weight Loss' | 'Balanced Health' | 'Muscle Gain' = 'Balanced Health';
        const pId = (sub.planId || '').toLowerCase();
        const pTitle = (sub.planTitle || '').toLowerCase();
        if (pId.includes('loss') || pTitle.includes('loss')) category = 'Weight Loss';
        else if (pId.includes('gain') || pTitle.includes('gain')) category = 'Muscle Gain';

        const rawDate = sub.startDate || (sub.createdAt ? new Date(sub.createdAt).toISOString() : new Date().toISOString());
        const saleDate = rawDate.split('T')[0];
        const days = sub.durationDays || (sub.duration ? parseInt(String(sub.duration).replace(/\D+/g, ''), 10) : 30) || 30;
        const dailyCommissionRate = 100;
        const commissionAmount = days * dailyCommissionRate;
        const vendorPayout = Math.max(0, sub.totalPrice - commissionAmount);

        await Sale.create({
          saleId,
          source: 'Subscription',
          customerName: sub.customerName,
          customerEmail: sub.customerEmail,
          customerPhone: sub.customerPhone,
          description: `${sub.planTitle} (${sub.duration || `${days} Days`} - ${sub.mealsPerDay || 3} Meals/Day)`,
          category,
          quantity: 1,
          unitPrice: sub.totalPrice,
          taxAmount: 0,
          discountAmount: 0,
          totalAmount: sub.totalPrice,
          dailyCommissionRate,
          durationDays: days,
          commissionAmount,
          vendorPayout,
          paymentMethod: 'UPI',
          paymentStatus: sub.status === 'Cancelled' ? 'Refunded' : 'Completed',
          paymentReference: sub.subId,
          saleDate,
          linkedId: sub.subId,
          invoiceNotes: `Automated subscription booking from plan ${sub.planTitle}. Platform Commission: ₹${commissionAmount} (${days} days @ ₹${dailyCommissionRate}/day). Kitchen Payout: ₹${vendorPayout}.`
        });
      }
    }
  } catch (err) {
    console.warn('[SalesSync] Sync subscriptions to sales notice:', err);
  }
};

export const getSales = async (req: Request, res: Response) => {
  try {
    const { search, category, status, source, startDate, endDate } = req.query;

    if (isConnectedToDb) {
      // Synchronize in background/inline
      await syncSubscriptionsToSales();
    }

    if (!isConnectedToDb) {
      return res.status(503).json({
        success: false,
        message: 'MongoDB database is not connected'
      });
    }

    const query: any = {
      saleId: { $nin: ['INV-801', 'INV-802', 'INV-803', 'INV-804', 'INV-805', 'INV-445', 'INV-674'] },
      customerName: { $not: /probe|demo|test/i },
      customerEmail: { $not: /probe|demo|test|example\.com/i }
    };

    if (category && category !== 'all') {
      query.category = category;
    }

    if (status && status !== 'all') {
      query.paymentStatus = status;
    }

    if (source && source !== 'all') {
      query.source = source;
    }

    if (startDate || endDate) {
      query.saleDate = {};
      if (startDate) query.saleDate.$gte = String(startDate);
      if (endDate) query.saleDate.$lte = String(endDate);
    }

    if (search) {
      const searchStr = String(search).trim();
      query.$or = [
        { saleId: { $regex: searchStr, $options: 'i' } },
        { customerName: { $regex: searchStr, $options: 'i' } },
        { customerPhone: { $regex: searchStr, $options: 'i' } },
        { customerEmail: { $regex: searchStr, $options: 'i' } },
        { description: { $regex: searchStr, $options: 'i' } },
        { paymentReference: { $regex: searchStr, $options: 'i' } }
      ];
    }

    const sales = await Sale.find(query).sort({ saleDate: -1, createdAt: -1 });

    // Metric aggregations
    const allSales = await Sale.find({
      saleId: { $nin: ['INV-801', 'INV-802', 'INV-803', 'INV-804', 'INV-805', 'INV-445', 'INV-674'] },
      customerName: { $not: /probe|demo|test/i },
      customerEmail: { $not: /probe|demo|test|example\.com/i }
    });

    let totalRevenue = 0;
    let totalCommission = 0;
    let totalVendorPayout = 0;
    let completedCount = 0;
    let pendingAmount = 0;
    let pendingCount = 0;
    let refundedAmount = 0;
    let refundedCount = 0;

    const categoryMap: Record<string, number> = {};
    const methodMap: Record<string, number> = {};

    allSales.forEach(s => {
      let itemCommission = s.commissionAmount;
      if (itemCommission === undefined) {
        const days = s.durationDays || 30;
        const rate = s.dailyCommissionRate || 100;
        itemCommission = s.source === 'Subscription' ? days * rate : s.totalAmount;
      }
      const itemVendor = s.vendorPayout !== undefined ? s.vendorPayout : Math.max(0, (s.totalAmount || 0) - (itemCommission || 0));

      if (s.paymentStatus === 'Completed') {
        totalRevenue += s.totalAmount || 0;
        totalCommission += itemCommission || 0;
        totalVendorPayout += itemVendor;
        completedCount += 1;
        categoryMap[s.category] = (categoryMap[s.category] || 0) + (s.totalAmount || 0);
        methodMap[s.paymentMethod] = (methodMap[s.paymentMethod] || 0) + (s.totalAmount || 0);
      } else if (s.paymentStatus === 'Pending') {
        pendingAmount += s.totalAmount || 0;
        pendingCount += 1;
      } else if (s.paymentStatus === 'Refunded') {
        refundedAmount += s.totalAmount || 0;
        refundedCount += 1;
      }
    });

    const aov = completedCount > 0 ? Math.round(totalRevenue / completedCount) : 0;

    // Financial P&L summary against Purchases & Expenses
    let totalPurchases = 0;
    let totalExpenses = 0;

    try {
      const purchases = await Purchase.find();
      totalPurchases = purchases.reduce((sum, p) => sum + (p.totalCost || 0), 0);
    } catch (e) {}

    try {
      const expenses = await Expense.find();
      totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    } catch (e) {}

    const effectivePurchases = totalPurchases > 0 ? totalPurchases : totalVendorPayout;
    const totalCost = effectivePurchases + totalExpenses;
    const netProfit = totalCommission > 0 ? (totalCommission - totalExpenses) : (totalRevenue - totalCost);
    const profitMarginPercent = totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(1)) : 0;

    return res.json({
      success: true,
      count: sales.length,
      data: sales,
      metrics: {
        totalRevenue,
        totalCommission,
        totalVendorPayout,
        completedCount,
        pendingAmount,
        pendingCount,
        refundedAmount,
        refundedCount,
        aov,
        categoryBreakdown: categoryMap,
        methodBreakdown: methodMap,
        financialPL: {
          totalRevenue,
          totalPurchases: effectivePurchases,
          totalExpenses,
          totalCost,
          netProfit,
          profitMarginPercent
        }
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createSale = async (req: Request, res: Response) => {
  try {
    const body = req.body;

    if (!body.customerName || !body.customerPhone || body.totalAmount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Customer name, phone number, and total amount are required'
      });
    }

    const saleId = body.saleId || `INV-${Date.now().toString().slice(-6)}`;
    const saleDate = body.saleDate || new Date().toISOString().split('T')[0];
    const unitPrice = body.unitPrice !== undefined ? Number(body.unitPrice) : Number(body.totalAmount);
    const quantity = body.quantity ? Number(body.quantity) : 1;

    if (!isConnectedToDb) {
      return res.status(201).json({
        success: true,
        data: {
          saleId,
          ...body,
          quantity,
          unitPrice,
          saleDate,
          _id: `mock_${Date.now()}`
        },
        fallback: true
      });
    }

    const newSale = await Sale.create({
      saleId,
      source: body.source || 'Direct Order',
      customerName: body.customerName,
      customerEmail: body.customerEmail || '',
      customerPhone: body.customerPhone,
      description: body.description || 'Custom Meal Package',
      category: body.category || 'Other',
      quantity,
      unitPrice,
      taxAmount: Number(body.taxAmount) || 0,
      discountAmount: Number(body.discountAmount) || 0,
      totalAmount: Number(body.totalAmount),
      paymentMethod: body.paymentMethod || 'UPI',
      paymentStatus: body.paymentStatus || 'Completed',
      paymentReference: body.paymentReference || '',
      saleDate,
      linkedId: body.linkedId || '',
      invoiceNotes: body.invoiceNotes || ''
    });

    return res.status(201).json({
      success: true,
      message: 'Sale record created successfully',
      data: newSale
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!isConnectedToDb) {
      return res.json({
        success: true,
        message: 'Sale updated successfully (fallback mode)',
        data: { _id: id, ...updateData },
        fallback: true
      });
    }

    const isMongoId = id.match(/^[0-9a-fA-F]{24}$/);
    const updated = await Sale.findOneAndUpdate(
      { $or: [{ _id: isMongoId ? id : undefined }, { saleId: id }].filter(Boolean) },
      updateData,
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Sale record not found' });
    }

    return res.json({
      success: true,
      message: 'Sale record updated successfully',
      data: updated
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!isConnectedToDb) {
      return res.json({
        success: true,
        message: 'Sale deleted successfully (fallback mode)',
        fallback: true
      });
    }

    const isMongoId = id.match(/^[0-9a-fA-F]{24}$/);
    const deleted = await Sale.findOneAndDelete({
      $or: [{ _id: isMongoId ? id : undefined }, { saleId: id }].filter(Boolean)
    });

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Sale record not found' });
    }

    return res.json({
      success: true,
      message: 'Sale record deleted successfully'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
