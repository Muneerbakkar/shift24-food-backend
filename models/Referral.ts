import mongoose, { Schema, Model } from 'mongoose';

export interface IReferral {
  referralId: string;
  referrerEmail: string;
  referrerName: string;
  referrerPhone?: string;
  referralCode: string;
  
  refereeEmail: string;
  refereeName: string;
  refereePhone?: string;
  
  subId: string;
  planTitle: string;
  duration: string;
  durationDays: number;
  isMonthlyPlan: boolean;
  rewardAmount: number; // ₹500
  
  subscriptionStatus: 'Active' | 'Completed' | 'Cancelled' | 'Paused';
  payoutStatus: 'Pending' | 'Eligible' | 'Paid' | 'Rejected';
  
  paymentReference?: string;
  adminNotes?: string;
  paidAt?: Date;
  completedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const ReferralSchema = new Schema<IReferral>({
  referralId: { type: String, required: true, unique: true },
  referrerEmail: { type: String, required: true, lowercase: true, trim: true },
  referrerName: { type: String, required: true },
  referrerPhone: { type: String, default: '' },
  referralCode: { type: String, required: true, uppercase: true, trim: true },
  
  refereeEmail: { type: String, required: true, lowercase: true, trim: true },
  refereeName: { type: String, required: true },
  refereePhone: { type: String, default: '' },
  
  subId: { type: String, required: true },
  planTitle: { type: String, required: true },
  duration: { type: String, required: true },
  durationDays: { type: Number, required: true },
  isMonthlyPlan: { type: Boolean, default: false },
  rewardAmount: { type: Number, default: 500 },
  
  subscriptionStatus: { 
    type: String, 
    enum: ['Active', 'Completed', 'Cancelled', 'Paused'], 
    default: 'Active' 
  },
  payoutStatus: { 
    type: String, 
    enum: ['Pending', 'Eligible', 'Paid', 'Rejected'], 
    default: 'Pending' 
  },
  
  paymentReference: { type: String, default: '' },
  adminNotes: { type: String, default: '' },
  paidAt: { type: Date },
  completedAt: { type: Date }
}, {
  timestamps: true
});

export const Referral: Model<IReferral> = (mongoose.models.Referral as Model<IReferral>) || mongoose.model<IReferral>('Referral', ReferralSchema);
