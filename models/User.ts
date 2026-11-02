import mongoose, { Schema, Model } from 'mongoose';

export interface IUser {
  name: string;
  email: string;
  password?: string;
  phone?: string;
  phoneVerified?: boolean;
  role: string;
  permissions?: string[];
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
  referralCode?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, default: 'demo123' },
  phone: { type: String, default: '+91 98451 22345' },
  phoneVerified: { type: Boolean, default: false },
  // Role slug: customer/driver are fixed; admin/staff/kitchen or any custom role from the roles collection
  role: { type: String, default: 'customer' },
  // Section keys this team member may open in the admin panel (empty = role default)
  permissions: { type: [String], default: [] },
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
  referralCode: { type: String, sparse: true, uppercase: true, trim: true },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
}, {
  timestamps: true
});

export const User: Model<IUser> = (mongoose.models.User as Model<IUser>) || mongoose.model<IUser>('User', UserSchema);
