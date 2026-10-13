import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';


const supabaseUrl ='https://dsvzkquhzswwsvhduasq.supabase.co'
const supabaseAnonKey = 'sb_publishable_xGicF6asbe1xt_GWmWWvCQ_vewoZn5V'


const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});