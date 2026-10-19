import mongoose, { Schema, Model } from 'mongoose';

export interface IExpense {
  title: string;
  category: 
    | 'Kitchen Equipment & Utensils'
    | 'Utilities (Gas, Electricity, Water)'
    | 'Rent & Facilities'
    | 'Staff & Wages'
    | 'Packaging & Disposables'
    | 'Delivery & Logistics'
    | 'Marketing & Ads'
    | 'Maintenance & Repairs'
    | 'Software & Subscriptions'
    | 'Miscellaneous';
  amount: number;
  expenseDate: string;
  paymentMethod: 'UPI' | 'Bank Transfer' | 'Cash' | 'Credit Card' | 'Cheque';
  paidTo: string;
  referenceNumber?: string;
  status: 'Paid' | 'Pending' | 'Due';
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const ExpenseSchema = new Schema<IExpense>({
  title: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: [
      'Kitchen Equipment & Utensils',
      'Utilities (Gas, Electricity, Water)',
      'Rent & Facilities',
      'Staff & Wages',
      'Packaging & Disposables',
      'Delivery & Logistics',
      'Marketing & Ads',
      'Maintenance & Repairs',
      'Software & Subscriptions',
      'Miscellaneous'
    ],
    default: 'Utilities (Gas, Electricity, Water)'
  },
  amount: { type: Number, required: true, min: 0 },
  expenseDate: { type: String, required: true },
  paymentMethod: {
    type: String,
    enum: ['UPI', 'Bank Transfer', 'Cash', 'Credit Card', 'Cheque'],
    default: 'UPI'
  },
  paidTo: { type: String, required: true, trim: true },
  referenceNumber: { type: String, trim: true },
  status: {
    type: String,
    enum: ['Paid', 'Pending', 'Due'],
    default: 'Paid'
  },
  notes: { type: String, default: '' }
}, {
  timestamps: true
});

export const Expense: Model<IExpense> = (mongoose.models.Expense as Model<IExpense>) || mongoose.model<IExpense>('Expense', ExpenseSchema);
