// Shared Supabase client for the static frontend. The project URL and
// publishable key are NOT secrets - they're meant to be embedded
// client-side (Supabase's whole RLS model exists specifically so this
// key, by itself, can only ever do what RLS policies allow). The
// service_role key (full bypass) never appears in any file under
// assets/ - it lives only in Edge Function secrets (Phase 4+).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2?target=es2022";

export const SUPABASE_URL = "https://ngssgjuagrlyhsvtiwhk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Xg7LhnnYTjQhTkPea28TTQ_Yuvt5Kh3";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
