import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { User } from './models/User';
import { Plan } from './models/Plan';
import { Subscription } from './models/Subscription';
import { Order } from './models/Order';

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
      Order.deleteMany({})
    ]);

    // Seeding must not create an account with a built-in password.
    const adminEmail = (process.env.DEFAULT_ADMIN_EMAIL || '').trim().toLowerCase();
    const adminPass = process.env.DEFAULT_ADMIN_PASSWORD || '';
    if (!adminEmail || !adminPass) {
      throw new Error('DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD must be set before seeding.');
    }
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

    console.log('[Seeder] Seeding Users with hashed passwords...');
    await (User as any).insertMany(SEED_USERS);

    console.log('[Seeder] Seeding Plans...');
    await (Plan as any).insertMany(SEED_PLANS);

    console.log('[Seeder] Seeding Subscriptions...');
    await (Subscription as any).insertMany(SEED_SUBSCRIPTIONS);

    console.log('[Seeder] Seeding Orders...');
    await (Order as any).insertMany(SEED_ORDERS);

    console.log('✅ [Seeder] Database seeding completed successfully with bcrypt passwords!');
    process.exit(0);
  } catch (error) {
    console.error('❌ [Seeder] Error during seeding:', error);
    process.exit(1);
  }
}

seed();
