import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { Database } from "./database.types";
import {
  getSupabasePublishableKey,
  getSupabaseSecretKey,
  getSupabaseUrl,
  hasSupabasePublicConfig,
  hasSupabaseServerWriteConfig,
} from "./env";

export async function createServerSupabaseClient() {
  if (!hasSupabasePublicConfig()) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

export function createServerWriteClient() {
  if (!hasSupabaseServerWriteConfig()) {
    return null;
  }

  return createSupabaseClient<Database>(getSupabaseUrl(), getSupabaseSecretKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
