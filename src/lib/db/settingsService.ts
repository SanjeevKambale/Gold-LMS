import { supabase } from '../supabaseClient';
import { cachedSettings } from '../database';

export interface AppSettings {
  shop_name: string;
  shop_upi_id: string;
  shop_address: string;
  shop_phone: string;
}

export function getAllSettings(): AppSettings {
  return {
    shop_name: cachedSettings['shop_name'] || '',
    shop_upi_id: cachedSettings['shop_upi_id'] || '',
    shop_address: cachedSettings['shop_address'] || '',
    shop_phone: cachedSettings['shop_phone'] || ''
  };
}

export function updateSettings(settings: Partial<AppSettings>): void {
  const upserts: { key: string; value: string }[] = [];
  
  Object.entries(settings).forEach(([key, value]) => {
    if (value !== undefined) {
      cachedSettings[key] = value;
      upserts.push({ key, value });
    }
  });

  if (upserts.length > 0) {
    supabase.from('settings').upsert(upserts, { onConflict: 'key' }).then(({ error }) => {
      if (error) console.error('Failed to sync settings to Supabase in background:', error);
    });
  }
}

export function getSystemTheme(): string {
  return cachedSettings['system_theme'] || 'gold';
}

export function updateSystemTheme(theme: string): void {
  cachedSettings['system_theme'] = theme;
  
  supabase.from('settings').upsert([{ key: 'system_theme', value: theme }], { onConflict: 'key' }).then(({ error }) => {
    if (error) console.error('Failed to sync system theme to Supabase in background:', error);
  });
  
  document.documentElement.setAttribute('data-theme', theme);
}
