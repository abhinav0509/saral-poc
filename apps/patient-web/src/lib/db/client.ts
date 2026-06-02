// Web shim → shared data layer in @saral/core.
// Importing ensures the Supabase client is configured for this runtime.
import "./_init";

export { getSupabase } from "@saral/core";
