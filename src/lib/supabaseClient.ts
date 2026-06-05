/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

// Load credentials from environment variables (configured via .env in Vite)
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-project.supabase.co';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

// Verify credentials exist on startup, output warning to developer console if missing
const isConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

if (!isConfigured) {
  console.warn(
    "⚠️ Supabase credentials missing! Please create a '.env' file in the root directory " +
    "and add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY variables."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export { isConfigured };
