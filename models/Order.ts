import mongoose, { Schema, Model } from 'mongoose';

export interface IOrder {
  orderId: string;
  subscriptionId?: string;
  customerName: string;
  customerPhone: string;
  planTitle: string;
  mealName: string;
  mealType: 'Breakfast' | 'Lunch' | 'Dinner';
  deliveryDate: string;
  deliveryTimeSlot: string;
  address: string;
  status: 'Pending' | 'Preparing' | 'Out for Delivery' | 'Delivered' | 'Cancelled';
  amount: number;
  paymentMethod: string;
  allergies: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const OrderSchema = new Schema<IOrder>({
  orderId: { type: String, required: true, unique: true },
  subscriptionId: { type: String },
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  planTitle: { type: String, required: true },
  mealName: { type: String, required: true },
  mealType: { type: String, enum: ['Breakfast', 'Lunch', 'Dinner'], required: true },
  deliveryDate: { type: String, required: true },
  deliveryTimeSlot: { type: String, required: true },
  address: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'], 
    default: 'Pending' 
  },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, default: 'Online Payment' },
  allergies: { type: [String], default: [] },
}, {
  timestamps: true
});

export const Order: Model<IOrder> = (mongoose.models.Order as Model<IOrder>) || mongoose.model<IOrder>('Order', OrderSchema);
