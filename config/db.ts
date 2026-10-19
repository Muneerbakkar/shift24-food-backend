import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shift24';

export let isConnectedToDb = false;

const updateConnectionStatus = () => {
  isConnectedToDb = mongoose.connection.readyState === 1;
};

mongoose.connection.on('connected', () => {
  updateConnectionStatus();
  console.log('[Database] MongoDB connection established successfully.');
});

mongoose.connection.on('disconnected', () => {
  updateConnectionStatus();
  console.warn('[Database] MongoDB connection disconnected.');
});

mongoose.connection.on('reconnected', () => {
  updateConnectionStatus();
  console.log('[Database] MongoDB reconnected.');
});

let reconnectInterval: NodeJS.Timeout | null = null;
function startReconnectLoop() {
  if (reconnectInterval) return;
  reconnectInterval = setInterval(async () => {
    if (mongoose.connection.readyState === 1) {
      updateConnectionStatus();
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
        reconnectInterval = null;
      }
      return;
    }
    try {
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
      updateConnectionStatus();
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
        reconnectInterval = null;
      }
    } catch (_) {}
  }, 10000);
}

export async function connectDB(): Promise<boolean> {
  try {
    mongoose.set('strictQuery', false);
    
    console.log(`[Database] Connecting to MongoDB...`);
    
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    updateConnectionStatus();
    console.log('[Database] MongoDB connection established successfully.');
    return true;
  } catch (error: any) {
    updateConnectionStatus();
    console.warn(`[Database] Warning: Could not connect to MongoDB.`);
    console.warn(`[Database] Details: ${error.message}`);
    console.warn('[Database] API requests requiring database will return 503 until MongoDB is connected.');
    startReconnectLoop();
    return false;
  }
}
