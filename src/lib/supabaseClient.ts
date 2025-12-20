import { createClient } from '@supabase/supabase-js'

// Ambil URL dan Kunci Anon dari environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Lakukan validasi sederhana untuk memastikan variabel ada
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL and Anon Key must be defined in the .env.local file");
}

// Buat dan ekspor klien Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
