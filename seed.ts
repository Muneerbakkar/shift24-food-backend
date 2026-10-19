import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { User } from './models/User';
import { Plan } from './models/Plan';
import { Subscription } from './models/Subscription';
import { Order } from './models/Order';
import { MenuItem } from './models/MenuItem';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shift24';

async function seed() {
  try {
    console.log(`[Seeder] Connecting to MongoDB at ${MONGODB_URI}...`);
    await mongoose.connect(MONGODB_URI);
    console.log('[Seeder] Connected.');

    console.log('[Seeder] Clearing existing collections...');
    await Promise.all([
      User.deleteMany({}),
      Plan.deleteMany({}),
      Subscription.deleteMany({}),
      Order.deleteMany({}),
      MenuItem.deleteMany({})
    ]);

    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@shift24.com';
    const adminPass = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const adminHash = await bcrypt.hash(adminPass, 10);
    const demoHash = await bcrypt.hash('demo123', 10);

    const SEED_USERS = [
      {
        name: 'Shift24 Super Admin',
        email: adminEmail,
        password: adminHash,
        phone: '+91 98451 00000',
        role: 'admin',
        addresses: [{ title: 'Headquarters', address: 'MG Road, Kochi, Kerala', isDefault: true }],
      },
      {
        name: 'Rahul Sharma',
        email: 'rahul.s@example.com',
        password: demoHash,
        phone: '+91 98451 22345',
        role: 'customer',
        allergies: ['Dairy'],
        addresses: [{ title: 'Home', address: 'Flat 402, Green Meadows, MG Road, Kochi', isDefault: true }],
        totalSpent: 5700,
        totalOrders: 15,
      },
      {
        name: 'Ananya Roy',
        email: 'ananya.roy@example.com',
        password: demoHash,
        phone: '+91 99201 44512',
        role: 'customer',
        allergies: ['Peanuts'],
        addresses: [{ title: 'Home', address: 'Villa 12, Palm Residency, Panampilly Nagar, Kochi', isDefault: true }],
        totalSpent: 4680,
        totalOrders: 30,
      },
      {
        name: 'Vikram Menon',
        email: 'vikram.m@example.com',
        password: demoHash,
        phone: '+91 97455 88910',
        role: 'customer',
        allergies: [],
        addresses: [{ title: 'Penthouse', address: 'B-14, Skyline Imperial, Marine Drive, Kochi', isDefault: true }],
        totalSpent: 13500,
        totalOrders: 60,
      }
    ];

    const SEED_PLANS = [
      {
        planId: 'weight-loss',
        title: 'Weight Loss',
        description: 'Calorie-controlled, nutrient-dense meals designed to help you shed pounds safely.',
        pricePerWeek: 3000,
        calories: '1200 - 1500 kcal/day',
        benefits: ['High protein', 'Low carb', 'Metabolism boosting'],
        active: true,
      },
      {
        planId: 'balance',
        title: 'Balance Weight',
        description: 'Perfectly portioned meals to maintain your current physique and optimize health.',
        pricePerWeek: 2800,
        calories: '1800 - 2000 kcal/day',
        benefits: ['Balanced macros', 'Sustained energy', 'Heart healthy'],
        active: true,
      },
      {
        planId: 'weight-gain',
        title: 'Weight Gain',
        description: 'Calorie-surplus, high-protein meals for muscle building and healthy weight gain.',
        pricePerWeek: 3500,
        calories: '2500 - 3000 kcal/day',
        benefits: ['High protein', 'Complex carbs', 'Muscle recovery'],
        active: true,
      }
    ];

    const SEED_SUBSCRIPTIONS: any[] = [];

    const SEED_ORDERS = [
      {
        orderId: 'ORD-901',
        subscriptionId: 'SUB-801',
        customerName: 'Rahul Sharma',
        customerPhone: '+91 98451 22345',
        planTitle: 'Balance Weight',
        mealName: 'Oatmeal with Berries & Nuts',
        mealType: 'Breakfast',
        deliveryDate: 'Today, Sep 12',
        deliveryTimeSlot: '07:30 AM - 08:30 AM',
        address: 'Flat 402, Green Meadows, MG Road, Kochi',
        status: 'Delivered',
        amount: 190,
        paymentMethod: 'UPI (Direct UPI)',
        allergies: ['Dairy-Free Required'],
      },
      {
        orderId: 'ORD-902',
        subscriptionId: 'SUB-802',
        customerName: 'Ananya Roy',
        customerPhone: '+91 99201 44512',
        planTitle: 'Weight Loss',
        mealName: 'Avocado Toast with Egg',
        mealType: 'Breakfast',
        deliveryDate: 'Today, Sep 12',
        deliveryTimeSlot: '08:00 AM - 09:00 AM',
        address: 'Villa 12, Palm Residency, Panampilly Nagar, Kochi',
        status: 'Delivered',
        amount: 171,
        paymentMethod: 'Card ending in 4242',
        allergies: ['No Peanuts'],
      },
      {
        orderId: 'ORD-904',
        subscriptionId: 'SUB-801',
        customerName: 'Rahul Sharma',
        customerPhone: '+91 98451 22345',
        planTitle: 'Balance Weight',
        mealName: 'Grilled Chicken Quinoa Bowl',
        mealType: 'Lunch',
        deliveryDate: 'Today, Sep 12',
        deliveryTimeSlot: '12:00 PM - 01:00 PM',
        address: 'Flat 402, Green Meadows, MG Road, Kochi',
        status: 'Out for Delivery',
        amount: 190,
        paymentMethod: 'UPI (Direct UPI)',
        allergies: ['Dairy-Free Required'],
      }
    ];

    const SEED_MENU_ITEMS = [
      { day: 1, mealType: 'breakfast', name: 'Oatmeal with Berries & Nuts', calories: '350 kcal', protein: '12g', carbs: '55g', fat: '10g' },
      { day: 1, mealType: 'lunch', name: 'Grilled Chicken Quinoa Bowl', calories: '550 kcal', protein: '45g', carbs: '40g', fat: '15g' },
      { day: 1, mealType: 'dinner', name: 'Baked Salmon with Asparagus', calories: '450 kcal', protein: '35g', carbs: '25g', fat: '22g' },
      { day: 2, mealType: 'breakfast', name: 'Avocado Toast with Egg', calories: '400 kcal', protein: '18g', carbs: '35g', fat: '22g' },
      { day: 2, mealType: 'lunch', name: 'Mediterranean Lentil Salad', calories: '480 kcal', protein: '20g', carbs: '55g', fat: '18g' },
      { day: 2, mealType: 'dinner', name: 'Turkey Meatballs & Zucchini Noodles', calories: '420 kcal', protein: '40g', carbs: '15g', fat: '18g' },
      { day: 3, mealType: 'breakfast', name: 'Greek Yogurt Parfait', calories: '320 kcal', protein: '22g', carbs: '45g', fat: '5g' },
      { day: 3, mealType: 'lunch', name: 'Tuna Salad Lettuce Wraps', calories: '380 kcal', protein: '35g', carbs: '10g', fat: '20g' },
      { day: 3, mealType: 'dinner', name: 'Lean Steak with Broccoli', calories: '550 kcal', protein: '48g', carbs: '40g', fat: '22g' },
    ];

    console.log('[Seeder] Seeding Users with hashed passwords...');
    await (User as any).insertMany(SEED_USERS);

    console.log('[Seeder] Seeding Plans...');
    await (Plan as any).insertMany(SEED_PLANS);

    console.log('[Seeder] Seeding Subscriptions...');
    await (Subscription as any).insertMany(SEED_SUBSCRIPTIONS);

    console.log('[Seeder] Seeding Orders...');
    await (Order as any).insertMany(SEED_ORDERS);

    console.log('[Seeder] Seeding Menu Items...');
    await (MenuItem as any).insertMany(SEED_MENU_ITEMS);

    console.log('✅ [Seeder] Database seeding completed successfully with bcrypt passwords!');
    process.exit(0);
  } catch (error) {
    console.error('❌ [Seeder] Error during seeding:', error);
    process.exit(1);
  }
}

seed();
