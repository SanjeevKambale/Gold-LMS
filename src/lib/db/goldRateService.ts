import { GoldRate } from '../../types';
import { cachedGoldRates, syncWrite } from '../database';

export function getAllGoldRates(): GoldRate[] {
  return cachedGoldRates;
}

export function updateGoldRate(id: string, ratePerGram: number): void {
  const today = new Date().toISOString().split('T')[0];
  
  // 1. Update memory cache synchronously
  const rate = cachedGoldRates.find(r => r.id === id);
  if (rate) {
    rate.ratePerGram = ratePerGram;
    rate.updatedAt = today;
  }

  // 2. Sync to local SQLite and Supabase background
  const payload = {
    rate_per_gram: ratePerGram,
    updated_at: today
  };
  syncWrite('gold_rates', 'update', id, payload);
}
