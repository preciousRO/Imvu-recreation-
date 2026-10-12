// Backend configuration. With no Supabase project configured the app runs in local mode:
// accounts live in this browser only and rooms show only you and the room's regulars.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || '';
export const APP_NAME = 'Loft';
export const START_CREDITS = 5000;
export const DAILY_CREDITS = 500;
