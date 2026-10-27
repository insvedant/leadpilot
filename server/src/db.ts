import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './config/env';

// Node on Windows can pick up a dead DNS server even when the OS resolves fine.
if (env.DNS_SERVERS) {
  dns.setServers(env.DNS_SERVERS.split(',').map((s) => s.trim()));
}

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI);
  console.log('MongoDB connected');
}
