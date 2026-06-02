// Web shim → shared data layer in @saral/core.
// Importing ensures the Supabase client is configured for this runtime, then
// re-exports every query/mutation/type so existing "@/lib/db/queries" imports
// keep working unchanged.
import "./_init";

export * from "@saral/core";
