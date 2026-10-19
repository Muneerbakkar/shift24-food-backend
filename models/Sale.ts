import mongoose, { Schema, Model } from 'mongoose';

export interface ISale {
  saleId: string; // e.g. 'INV-801', 'SLS-1002'
  source: 'Subscription' | 'Direct Order' | 'Corporate Catering' | 'Trial Pack' | 'Custom / Walk-in';
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  description: string;
  category: 'Weight Loss' | 'Balanced Health' | 'Muscle Gain' | 'Corporate Catering' | 'Trial Pack' | 'Single Meal' | 'Other';
  quantity: number;
  unitPrice: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  dailyCommissionRate?: number;
  durationDays?: number;
  commissionAmount?: number;
  vendorPayout?: number;
  paymentMethod: 'UPI' | 'Credit/Debit Card' | 'Net Banking' | 'Cash' | 'Cheque / Bank Transfer';
  paymentStatus: 'Completed' | 'Pending' | 'Refunded';
  paymentReference?: string;
  saleDate: string; // YYYY-MM-DD
  linkedId?: string; // e.g. SUB-801 or ORD-xxx
  invoiceNotes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const SaleSchema = new Schema<ISale>({
  saleId: { type: String, required: true, unique: true, trim: true },
  source: { 
    type: String, 
    enum: ['Subscription', 'Direct Order', 'Corporate Catering', 'Trial Pack', 'Custom / Walk-in'],
    default: 'Subscription'
  },
  customerName: { type: String, required: true, trim: true },
  customerEmail: { type: String, trim: true, lowercase: true },
  customerPhone: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  category: { 
    type: String, 
    enum: ['Weight Loss', 'Balanced Health', 'Muscle Gain', 'Corporate Catering', 'Trial Pack', 'Single Meal', 'Other'],
    default: 'Weight Loss'
  },
  quantity: { type: Number, required: true, default: 1, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  taxAmount: { type: Number, default: 0, min: 0 },
  discountAmount: { type: Number, default: 0, min: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  dailyCommissionRate: { type: Number, default: 100, min: 0 },
  durationDays: { type: Number, default: 30, min: 1 },
  commissionAmount: { type: Number, default: 0, min: 0 },
  vendorPayout: { type: Number, default: 0, min: 0 },
  paymentMethod: { 
    type: String, 
    enum: ['UPI', 'Credit/Debit Card', 'Net Banking', 'Cash', 'Cheque / Bank Transfer'],
    default: 'UPI'
  },
  paymentStatus: { 
    type: String, 
    enum: ['Completed', 'Pending', 'Refunded'],
    default: 'Completed'
  },
  paymentReference: { type: String, trim: true },
  saleDate: { type: String, required: true },
  linkedId: { type: String, trim: true },
  invoiceNotes: { type: String, trim: true },
}, {
  timestamps: true
});

export const Sale: Model<ISale> = (mongoose.models.Sale as Model<ISale>) || mongoose.model<ISale>('Sale', SaleSchema);
