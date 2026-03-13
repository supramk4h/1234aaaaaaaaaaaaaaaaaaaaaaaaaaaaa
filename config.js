/* ============================================================
   PROMPTVAULT — Configuration
   ─────────────────────────────────────────────────────────────
   MODE SWITCH:
     USE_LOCAL_DATA = true  → runs fully offline using data/prompts.json
     USE_LOCAL_DATA = false → connects to Supabase (requires internet)
   ============================================================ */

var PV_CONFIG = {

  // ── Toggle this to switch between offline and Supabase ──────
  USE_LOCAL_DATA: true,   // ← set to false when you're ready for Supabase

  // ── Supabase credentials (fill in when USE_LOCAL_DATA = false) ──
  SUPABASE_URL:      'https://YOUR_PROJECT_ID.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_ANON_PUBLIC_KEY',

  // ── App settings ─────────────────────────────────────────────
  STORAGE_BUCKET:    'prompt-images',
  PROMPTS_TABLE:     'prompts',
  PAGE_SIZE:         12,

  // ── Local data path (relative to index.html) ─────────────────
  LOCAL_DATA_PATH:   'data/prompts.json',
};

// Initialise Supabase client only when needed
var PV_SUPABASE = null;

function pvInitSupabase() {
  if (PV_CONFIG.USE_LOCAL_DATA) return null;
  if (PV_SUPABASE) return PV_SUPABASE;
  if (typeof window.supabase === 'undefined') {
    console.error('Supabase SDK not loaded. Check your CDN script tag.');
    return null;
  }
  PV_SUPABASE = window.supabase.createClient(
    PV_CONFIG.SUPABASE_URL,
    PV_CONFIG.SUPABASE_ANON_KEY
  );
  return PV_SUPABASE;
}
