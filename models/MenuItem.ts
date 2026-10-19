import mongoose, { Schema, Model } from 'mongoose';

export interface IMicroNutrient {
  name: string;
  amount: string;
}

export interface IIngredientItem {
  name: string;
  quantity: string;
  price: number;
}

export interface IMenuItem {
  planId: string;
  day: number;
  mealType: 'breakfast' | 'lunch' | 'dinner';
  name: string;
  calories: string;
  description?: string;
  protein?: string;
  carbs?: string;
  fat?: string;
  benefits?: string[];
  image?: string;
  microNutrients?: IMicroNutrient[];
  ingredients?: IIngredientItem[];
  createdAt?: Date;
  updatedAt?: Date;
}

const MenuItemSchema = new Schema<IMenuItem>({
  planId: { type: String, default: 'balance', required: true, index: true },
  day: { type: Number, required: true, min: 1, max: 365 },
  mealType: { type: String, enum: ['breakfast', 'lunch', 'dinner'], required: true },
  name: { type: String, required: true },
  calories: { type: String, required: true },
  description: { type: String, default: '' },
  protein: { type: String, default: '20g' },
  carbs: { type: String, default: '40g' },
  fat: { type: String, default: '15g' },
  benefits: { type: [String], default: [] },
  image: { type: String, default: '' },
  microNutrients: {
    type: [{
      name: { type: String, required: true },
      amount: { type: String, required: true }
    }],
    default: []
  },
  ingredients: {
    type: [{
      name: { type: String, required: true },
      quantity: { type: String, default: '' },
      price: { type: Number, default: 0 }
    }],
    default: []
  }
}, {
  timestamps: true
});

MenuItemSchema.index({ planId: 1, day: 1, mealType: 1 }, { unique: true });

export const MenuItem: Model<IMenuItem> = (mongoose.models.MenuItem as Model<IMenuItem>) || mongoose.model<IMenuItem>('MenuItem', MenuItemSchema);
