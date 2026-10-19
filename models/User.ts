import mongoose, { Schema, Model } from 'mongoose';

export interface IUser {
  name: string;
  email: string;
  password?: string;
  phone?: string;
  role: 'customer' | 'admin' | 'staff' | 'kitchen';
  adminTitle?: string;
  status?: 'active' | 'inactive';
  allergies: string[];
  addresses: Array<{
    title: string;
    address: string;
    isDefault: boolean;
  }>;
  totalSpent: number;
  totalOrders: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, default: 'demo123' },
  phone: { type: String, default: '+91 98451 22345' },
  role: { type: String, enum: ['customer', 'admin', 'staff', 'kitchen'], default: 'customer' },
  adminTitle: { type: String, default: 'Administrator' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  allergies: { type: [String], default: [] },
  addresses: [{
    title: { type: String, default: 'Home' },
    address: { type: String, required: true },
    isDefault: { type: Boolean, default: false }
  }],
  totalSpent: { type: Number, default: 0 },
  totalOrders: { type: Number, default: 0 },
}, {
  timestamps: true
});

export const User: Model<IUser> = (mongoose.models.User as Model<IUser>) || mongoose.model<IUser>('User', UserSchema);
