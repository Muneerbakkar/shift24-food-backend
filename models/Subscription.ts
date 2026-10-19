import mongoose, { Schema, Model } from 'mongoose';

export interface ISubscription {
  subId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  planId: 'weight-loss' | 'balance' | 'weight-gain';
  planTitle: string;
  duration: string;
  durationDays: number;
  mealsPerDay: '1' | '2' | '3';
  slot: string;
  slotLabel: string;
  totalPrice: number;
  status: 'Active' | 'Paused' | 'Cancelled' | 'Completed';
  startDate: string;
  endDate: string;
  nextDelivery: string;
  address: string;
  allergies: string[];
  preferences?: string[];
  pauseStartDate?: string;
  pauseEndDate?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const SubscriptionSchema = new Schema<ISubscription>({
  subId: { type: String, required: true, unique: true },
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true },
  customerPhone: { type: String, required: true },
  planId: { type: String, enum: ['weight-loss', 'balance', 'weight-gain'], required: true },
  planTitle: { type: String, required: true },
  duration: { type: String, required: true },
  durationDays: { type: Number, required: true },
  mealsPerDay: { type: String, enum: ['1', '2', '3'], required: true },
  slot: { type: String, required: true },
  slotLabel: { type: String, required: true },
  totalPrice: { type: Number, required: true },
  status: { type: String, enum: ['Active', 'Paused', 'Cancelled', 'Completed'], default: 'Active' },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  nextDelivery: { type: String, default: 'Tomorrow, 07:30 AM (Breakfast)' },
  address: { type: String, required: true },
  allergies: { type: [String], default: [] },
  preferences: { type: [String], default: [] },
  pauseStartDate: { type: String, default: null },
  pauseEndDate: { type: String, default: null },
}, {
  timestamps: true
});

export const Subscription: Model<ISubscription> = (mongoose.models.Subscription as Model<ISubscription>) || mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
