import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

/**
 * Cliente de Supabase para el navegador (Client Components).
 */
export function createClient() {
  return createBrowserClient<Database, "gymstats">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "gymstats" } },
  );
}
