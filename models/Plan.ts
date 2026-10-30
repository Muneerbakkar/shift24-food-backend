import mongoose, { Schema, Model } from 'mongoose';

export interface IDurationOption {
  id: string;
  title: string;
  days: number;
  description: string;
  discount: number;
  popular: boolean;
  badge?: string;
  price?: number;
  customPrice?: number;
  prices?: {
    '1'?: number;
    '2'?: number;
    '3'?: number;
  };
  slotPrices?: {
    breakfast?: number;
    lunch?: number;
    dinner?: number;
    'breakfast-lunch'?: number;
    'lunch-dinner'?: number;
    'breakfast-dinner'?: number;
  };
  features?: string[];
}

export interface IMealOption {
  id: '1' | '2' | '3';
  label: string;
  sub: string;
  multiplier: number;
}

export interface IPlan {
  planId: string;
  title: string;
  subtitle?: string;
  description: string;
  pricePerWeek: number;
  calories: string;
  benefits: string[];
  durationOptions?: IDurationOption[];
  mealOptions?: IMealOption[];
  active: boolean;
  popular?: boolean;
  badge?: string;
  order?: number;
  dailyCommission?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const PlanSchema = new Schema<IPlan>({
  planId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  subtitle: { type: String, default: 'Customize your daily meal routine and subscription duration. The longer you commit, the more you save.' },
  description: { type: String, required: true },
  pricePerWeek: { type: Number, required: true },
  calories: { type: String, required: true },
  benefits: { type: [String], default: [] },
  durationOptions: { type: Schema.Types.Mixed, default: [] },
  mealOptions: { type: Schema.Types.Mixed, default: [] },
  active: { type: Boolean, default: true },
  popular: { type: Boolean, default: false },
  badge: { type: String, default: '' },
  order: { type: Number, default: 0 },
  dailyCommission: { type: Number, default: 100 },
}, {
  timestamps: true
});

export const Plan: Model<IPlan> = (mongoose.models.Plan as Model<IPlan>) || mongoose.model<IPlan>('Plan', PlanSchema);
