import { Request, Response } from 'express';
import { Order } from '../models/Order';
import { isConnectedToDb } from '../config/db';

export const getKitchenPrepBoard = async (req: Request, res: Response) => {
  try {
    if (!isConnectedToDb) {
      return res.status(503).json({ success: false, message: 'MongoDB database is not connected' });
    }

    const ordersList = await Order.find({}).sort({ createdAt: -1 });

    const todayObj = new Date();
    const todayFormatted = todayObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase();
    const todayISO = todayObj.toISOString().split('T')[0];

    const todayOrders = ordersList.filter(o => {
      if ((o.orderId || '').includes('-M-')) return false;
      const d = (o.deliveryDate || '').toLowerCase();
      return d.includes('today') || d.includes(todayISO) || d.includes(todayFormatted);
    });

    const activeOrders = todayOrders.length > 0 ? todayOrders : ordersList;

    // Dish breakdown
    const dishCounts: Record<string, number> = {};
    const allergyAlerts: any[] = [];

    activeOrders.forEach(order => {
      dishCounts[order.mealName] = (dishCounts[order.mealName] || 0) + 1;
      if (order.allergies && order.allergies.length > 0) {
        allergyAlerts.push({
          orderId: order.orderId,
          customerName: order.customerName,
          mealType: order.mealType,
          mealName: order.mealName,
          allergies: order.allergies
        });
      }
    });

    const breakfastCount = activeOrders.filter(o => o.mealType === 'Breakfast').length;
    const lunchCount = activeOrders.filter(o => o.mealType === 'Lunch').length;
    const dinnerCount = activeOrders.filter(o => o.mealType === 'Dinner').length;

    return res.json({
      success: true,
      data: {
        totalMealsToday: activeOrders.length,
        breakfastCount,
        lunchCount,
        dinnerCount,
        dishCounts,
        allergyAlerts,
        orders: activeOrders
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
