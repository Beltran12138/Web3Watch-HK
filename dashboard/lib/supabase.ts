import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key);

export type NewsItem = {
  id: number;
  title: string;
  detail: string | null;
  source: string;
  timestamp: number;
  business_category: string | null;
  alpha_score: number | null;
  is_important: number | boolean | null;
  impact: '利好' | '利空' | '中性' | null;
  bitv_action: string | null;
  url: string | null;
};
