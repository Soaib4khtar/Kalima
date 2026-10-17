import { createClient } from "@supabase/supabase-js";

function configuredClient() {
  const address = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!address || !key?.startsWith("sb_publishable_")) return null;
  try {
    const url = new URL(address);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return createClient(url.origin, key, { auth: {
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
      flowType: "pkce", storageKey: "kalima-auth",
    } });
  } catch { return null; }
}

// A publishable key is public configuration. Never put a secret/service-role key here.
export const authClient = configuredClient();
