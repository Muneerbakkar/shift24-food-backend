import mongoose, { Schema, Model } from 'mongoose';

export interface IPurchase {
  itemName: string;
  category: 'Vegetables' | 'Meat & Poultry' | 'Seafood' | 'Dairy & Eggs' | 'Grains & Pulses' | 'Spices & Oils' | 'Packaging' | 'Other';
  quantity: number;
  unit: 'kg' | 'g' | 'liters' | 'ml' | 'packets' | 'pieces' | 'boxes';
  unitCost: number;
  totalCost: number;
  supplier: string;
  invoiceNumber?: string;
  purchaseDate: string;
  paymentMethod: 'Cash' | 'Bank Transfer' | 'UPI' | 'Credit Card' | 'Cheque';
  status: 'Paid' | 'Pending' | 'Credit';
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const PurchaseSchema = new Schema<IPurchase>({
  itemName: { type: String, required: true, trim: true },
  category: { 
    type: String, 
    enum: ['Vegetables', 'Meat & Poultry', 'Seafood', 'Dairy & Eggs', 'Grains & Pulses', 'Spices & Oils', 'Packaging', 'Other'],
    default: 'Vegetables'
  },
  quantity: { type: Number, required: true, min: 0 },
  unit: { 
    type: String, 
    enum: ['kg', 'g', 'liters', 'ml', 'packets', 'pieces', 'boxes'],
    default: 'kg'
  },
  unitCost: { type: Number, required: true, min: 0 },
  totalCost: { type: Number, required: true, min: 0 },
  supplier: { type: String, default: 'Local Wholesale Vendor', trim: true },
  invoiceNumber: { type: String, trim: true },
  purchaseDate: { type: String, required: true },
  paymentMethod: { 
    type: String, 
    enum: ['Cash', 'Bank Transfer', 'UPI', 'Credit Card', 'Cheque'],
    default: 'UPI'
  },
  status: { 
    type: String, 
    enum: ['Paid', 'Pending', 'Credit'],
    default: 'Paid'
  },
  notes: { type: String, default: '' }
}, {
  timestamps: true
});

export const Purchase: Model<IPurchase> = (mongoose.models.Purchase as Model<IPurchase>) || mongoose.model<IPurchase>('Purchase', PurchaseSchema);
