import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./database.types";

/**
 * Cliente de Supabase para el servidor (Server Components, Server Actions,
 * Route Handlers). Usa la cookie store de Next.js para leer/escribir la sesión.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database, "gymstats">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "gymstats" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // El método `setAll` puede fallar cuando se llama desde un
            // Server Component. Es seguro ignorarlo si hay un proxy/middleware
            // refrescando la sesión.
          }
        },
      },
    },
  );
}
