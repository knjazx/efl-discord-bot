import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_CLIENT_ID: z.string().min(1, 'DISCORD_CLIENT_ID is required'),
  DISCORD_GUILD_ID: z.string().optional(),

  MATCH_ADMIN_CHANNEL_ID: z.string().min(1, 'MATCH_ADMIN_CHANNEL_ID is required'),
  MATCH_ADMIN_ROLE_ID: z.string().min(1, 'MATCH_ADMIN_ROLE_ID is required'),
  SUPER_ADMIN_ROLE_ID: z.string().min(1, 'SUPER_ADMIN_ROLE_ID is required'),

  ALLOWED_MATCH_DOMAINS: z.string().default('cybershoke.net,faceit.com'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  // In development/test mode, fall back gracefully to default mock values if missing
}

export const config = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || 'MOCK_DISCORD_TOKEN',
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID || '123456789012345678',
  DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID || '',

  MATCH_ADMIN_CHANNEL_ID: process.env.MATCH_ADMIN_CHANNEL_ID || '123456789012345678',
  MATCH_ADMIN_ROLE_ID: process.env.MATCH_ADMIN_ROLE_ID || '123456789012345678',
  SUPER_ADMIN_ROLE_ID: process.env.SUPER_ADMIN_ROLE_ID || '123456789012345678',

  allowedDomains: (process.env.ALLOWED_MATCH_DOMAINS || 'cybershoke.net,faceit.com')
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean),
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
};
