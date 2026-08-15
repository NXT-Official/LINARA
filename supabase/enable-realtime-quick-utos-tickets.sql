-- Closes KNOWN_GAPS.md gap C23 (quick_utos/tickets realtime silently never fired).
--
-- `hooks/use-realtime-subscription.ts` (LINARA_MOBILE) and
-- `app-store-provider.tsx` (LINARA) both call
-- `supabase.channel(...).on('postgres_changes', ...).subscribe()` against
-- `public.quick_utos` and `public.tickets`, and `.subscribe()` succeeds even
-- when the target table isn't in the `supabase_realtime` publication -- it
-- just never delivers events, with no client-side error. Neither table had
-- ever been added, on any environment, because no migration or dashboard
-- step ever did it. Symptom: changes only appeared after a full app
-- restart (a fresh mount re-fetches via TanStack Query), not live. This is
-- not gated behind a paid Supabase compute tier -- Postgres Changes works
-- on the free tier; the publication was just never populated.
ALTER PUBLICATION supabase_realtime ADD TABLE public.quick_utos, public.tickets;

-- Ensures UPDATE/DELETE payloads carry full old-row data, not just the
-- primary key, which the recipient_id/helper_id filters above depend on.
ALTER TABLE public.quick_utos REPLICA IDENTITY FULL;
ALTER TABLE public.tickets REPLICA IDENTITY FULL;