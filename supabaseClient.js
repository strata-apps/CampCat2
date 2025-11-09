// supabaseClient.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ✅ Fill these with your project values (from Supabase -> Project Settings -> API)
const SUPABASE_URL = 'https://cjitnxbcziyiyvtahklo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqaXRueGJjeml5aXl2dGFoa2xvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1NDQ4MjQsImV4cCI6MjA3ODEyMDgyNH0.qh0tKBv860UxTuf9UwHYynZLYFng7GO_xf4ewBrsvYM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Keep backwards compatibility with existing code that expects `window.supabase`
if (!window.supabase) window.supabase = supabase;

export default supabase;
