/**
 * lib/supabase.ts — Server-side Supabase client
 *
 * Uses the service_role key so it can bypass Row Level Security.
 * Never expose this client or its key to the browser.
 * Only import this file from server components, API routes, and server actions.
 */

import { createClient } from "@supabase/supabase-js"

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
