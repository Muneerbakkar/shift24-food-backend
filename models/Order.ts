import mongoose, { Schema, Model } from 'mongoose';

export interface IOrder {
  orderId: string;
  subscriptionId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  planTitle: string;
  mealName: string;
  mealType: 'Breakfast' | 'Lunch' | 'Dinner';
  deliveryDate: string;
  deliveryTimeSlot: string;
  address: string;
  coordinates?: { lat: number; lng: number };
  latitude?: number;
  longitude?: number;
  status: 'Pending' | 'Preparing' | 'Out for Delivery' | 'Delivered' | 'Cancelled';
  amount: number;
  paymentMethod: string;
  allergies: string[];
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  driverVehicle?: string;
  assignedAt?: Date;
  stopIndex?: number;
  distanceFromHub?: number;
  distanceFromPrevOrder?: number;
  deliveredAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const OrderSchema = new Schema<IOrder>({
  orderId: { type: String, required: true, unique: true },
  subscriptionId: { type: String },
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  customerEmail: { type: String, default: '', lowercase: true, trim: true },
  planTitle: { type: String, required: true },
  mealName: { type: String, required: true },
  mealType: { type: String, enum: ['Breakfast', 'Lunch', 'Dinner'], required: true },
  deliveryDate: { type: String, required: true },
  deliveryTimeSlot: { type: String, required: true },
  address: { type: String, required: true },
  coordinates: {
    lat: { type: Number },
    lng: { type: Number }
  },
  latitude: { type: Number },
  longitude: { type: Number },
  status: {
    type: String,
    enum: ['Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'],
    default: 'Pending'
  },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, default: 'Online' },
  allergies: { type: [String], default: [] },
  driverId: { type: String },
  driverName: { type: String },
  driverPhone: { type: String },
  driverVehicle: { type: String },
  assignedAt: { type: Date },
  stopIndex: { type: Number },
  distanceFromHub: { type: Number },
  distanceFromPrevOrder: { type: Number },
  deliveredAt: { type: Date }
}, {
  timestamps: true
});

OrderSchema.index({ deliveryDate: 1, mealType: 1, status: 1 });
OrderSchema.index({ subscriptionId: 1 });
OrderSchema.index({ customerPhone: 1 });
OrderSchema.index({ customerEmail: 1 });
OrderSchema.index({ driverId: 1, deliveryDate: 1 });

export const Order: Model<IOrder> = mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema);
