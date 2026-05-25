import { GoldRate } from '../../types';
import { getDB, saveDB } from '../database';
import { getAllSettings } from './settingsService';

function rowToGoldRate(row: any[]): GoldRate {
  return {
    id: row[0] as string,
    goldType: row[1] as '24K' | '22K' | '18K',
    ratePerGram: row[2] as number,
    updatedAt: row[3] as string,
  };
}

export function getAllGoldRates(): GoldRate[] {
  const db = getDB();
  const result = db.exec('SELECT id, gold_type, rate_per_gram, updated_at FROM gold_rates ORDER BY gold_type');
  if (!result.length) return [];
  return result[0].values.map(rowToGoldRate);
}

export function updateGoldRate(id: string, ratePerGram: number): void {
  const db = getDB();
  const today = new Date().toISOString().split('T')[0];
  db.run('UPDATE gold_rates SET rate_per_gram=?, updated_at=? WHERE id=?', [ratePerGram, today, id]);
  saveDB();
}

