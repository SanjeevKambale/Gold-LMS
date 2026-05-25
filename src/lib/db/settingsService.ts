import { getDB, saveDB } from '../database';

export interface AppSettings {
  shop_name: string;
  shop_upi_id: string;
  shop_address: string;
  shop_phone: string;
  supabase_url?: string;
  supabase_key?: string;
}

export function getAllSettings(): AppSettings {
  const db = getDB();
  const result = db.exec('SELECT key, value FROM settings');
  
  const settings: any = {};
  if (result.length > 0) {
    result[0].values.forEach((row) => {
      settings[row[0] as string] = row[1] as string;
    });
  }
  
  return settings as AppSettings;
}

export function updateSettings(settings: Partial<AppSettings>): void {
  const db = getDB();
  
  Object.entries(settings).forEach(([key, value]) => {
    if (value !== undefined) {
      db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
  });
  
  saveDB();
}
