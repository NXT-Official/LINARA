-- Grocery runs (decided 2026-10-06, KNOWN_GAPS.md O40).
--
-- Until now each household had one palengke list that never closed: bought
-- lines stayed on it forever, "spent" was everything ever bought against one
-- petty-cash number, there was no history by trip, and every helper saw and
-- bought from the same list. For an estate with a kitchen, a garden and a
-- driver pool that falls apart. So:
--
--   * THE NEEDED POOL. grocery_items with no run_id: what's running low,
--     "Ubos na", anything added by hand. Everyone in the house sees it, as
--     before, and can still tick something bought straight from it.
--   * RUNS (grocery_runs). A manager or a pantry lead makes one ("Saturday
--     palengke", "S&R stock-up"), moves lines from the pool onto it, picks a
--     team and shoppers, and can link the task that carries it (the driver's
--     trip to the market). draft -> (a lead asks) pending -> (a manager
--     approves, and records the cash handed over) ready -> done, or
--     cancelled. Closing a run puts whatever wasn't bought back in the pool.
--   * MONEY. Each run has cash_given (abono) and change_returned (sukli), so
--     cash - spent - change shows whether the petty cash reconciles. Each
--     house, and each team, can have a monthly budget (grocery_budgets),
--     counted against what was bought that month (grocery_items.bought_at).
--     households.petty_cash_budget is no longer read by either app.
--   * REPEATS (grocery_templates). "Weekly palengke": a title, team,
--     shoppers, usual cash and usual items. start_grocery_run() makes a draft
--     from one, pulling matching lines out of the pool instead of doubling
--     them.
--
-- Who sees a run: managers; pantry leads (every run); and, once it's ready
-- or done, its shoppers, everyone on (or covering) its team, and the helper
-- on its linked task. Drafts and runs waiting for approval are only for
-- managers and leads. Lines on a run someone can't see are hidden from them.
--
-- Who does what (grocery_runs_guard, grocery_items_run_guard):
--   * managers (primary, co, remote admin): everything;
--   * leads: make drafts, edit them, ask for approval, withdraw, cancel; no
--     cash, no approving;
--   * anyone who can see a ready run: tick lines, enter costs, enter the
--     change and close it.
-- Nobody buys from a draft or a run waiting for approval, and only a manager
-- touches a closed one (to fix a figure).
--
-- Apply by hand in the SQL editor, after add-shared-staff-and-places.sql (and
-- so after teams, managers, pantry roles, restock and grocery receipts).
-- Safe to run twice. Tested in PGlite: supabase/tests/grocery-runs.test.mjs.

-- --------------------------------------------------------------------------
-- 1. Tables.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grocery_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL DEFAULT public.current_household_id()
        REFERENCES public.households(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 60),
    team_id UUID REFERENCES public.household_teams(id) ON DELETE SET NULL,
    -- 0 = Sunday ... 6 = Saturday; NULL when it has no fixed day.
    repeat_weekday SMALLINT CHECK (repeat_weekday BETWEEN 0 AND 6),
    cash_default NUMERIC(10,2) CHECK (cash_default >= 0),
    -- Who usually goes. Checked again when a run is started from it.
    shopper_ids UUID[] NOT NULL DEFAULT '{}',
    created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grocery_templates_household ON public.grocery_templates(household_id);

CREATE TABLE IF NOT EXISTS public.grocery_template_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.grocery_templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
    qty NUMERIC(6,2) NOT NULL CHECK (qty > 0),
    unit TEXT NOT NULL,
    pantry_item_id UUID REFERENCES public.pantry_items(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grocery_template_items_template
    ON public.grocery_template_items(template_id);

CREATE TABLE IF NOT EXISTS public.grocery_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL DEFAULT public.current_household_id()
        REFERENCES public.households(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 60),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending', 'ready', 'done', 'cancelled')),
    team_id UUID REFERENCES public.household_teams(id) ON DELETE SET NULL,
    shop_on DATE,
    -- The task that carries it, e.g. the driver's trip to the market.
    ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
    template_id UUID REFERENCES public.grocery_templates(id) ON DELETE SET NULL,
    cash_given NUMERIC(10,2) CHECK (cash_given >= 0),
    change_returned NUMERIC(10,2) CHECK (change_returned >= 0),
    note TEXT CHECK (char_length(note) <= 300),
    created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
    approved_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    closed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grocery_runs_household_status
    ON public.grocery_runs(household_id, status);
CREATE INDEX IF NOT EXISTS grocery_runs_household_closed
    ON public.grocery_runs(household_id, closed_at DESC);
CREATE INDEX IF NOT EXISTS grocery_runs_ticket ON public.grocery_runs(ticket_id);

CREATE TABLE IF NOT EXISTS public.grocery_run_shoppers (
    run_id UUID NOT NULL REFERENCES public.grocery_runs(id) ON DELETE CASCADE,
    helper_id UUID NOT NULL REFERENCES public.helper_profiles(id) ON DELETE CASCADE,
    PRIMARY KEY (run_id, helper_id)
);
CREATE INDEX IF NOT EXISTS grocery_run_shoppers_helper ON public.grocery_run_shoppers(helper_id);

CREATE TABLE IF NOT EXISTS public.grocery_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL DEFAULT public.current_household_id()
        REFERENCES public.households(id) ON DELETE CASCADE,
    -- NULL: the whole house.
    team_id UUID REFERENCES public.household_teams(id) ON DELETE CASCADE,
    monthly_amount NUMERIC(10,2) NOT NULL CHECK (monthly_amount >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS grocery_budgets_house
    ON public.grocery_budgets(household_id) WHERE team_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS grocery_budgets_team
    ON public.grocery_budgets(team_id) WHERE team_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'grocery_items' AND column_name = 'run_id'
    ) THEN
        ALTER TABLE public.grocery_items
            ADD COLUMN run_id UUID REFERENCES public.grocery_runs(id) ON DELETE SET NULL,
            ADD COLUMN bought_at TIMESTAMPTZ;
        -- Lines already bought count from when they were listed: the best
        -- there is. They become history "bought outside a run".
        UPDATE public.grocery_items SET bought_at = created_at WHERE bought;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'grocery_receipts' AND column_name = 'run_id'
    ) THEN
        ALTER TABLE public.grocery_receipts
            ADD COLUMN run_id UUID REFERENCES public.grocery_runs(id) ON DELETE SET NULL;
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS grocery_items_run ON public.grocery_items(run_id);
CREATE INDEX IF NOT EXISTS grocery_items_household_bought_at
    ON public.grocery_items(household_id, bought_at);
CREATE INDEX IF NOT EXISTS grocery_receipts_run ON public.grocery_receipts(run_id);

-- --------------------------------------------------------------------------
-- 2. Lookups. SECURITY DEFINER so policies and guards can ask about a run,
--    task or team without going through (or recursing into) RLS.
-- --------------------------------------------------------------------------

-- Every team she's on: her home team, her team in each house she's shared
-- into, and the teams she covers.
CREATE OR REPLACE FUNCTION public.my_team_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT hp.team_id FROM public.helper_profiles hp
    WHERE hp.user_id = auth.uid() AND hp.status = 'ACTIVE' AND hp.team_id IS NOT NULL
    UNION
    SELECT hh.team_id FROM public.helper_households hh
    JOIN public.helper_profiles hp ON hp.id = hh.helper_id
    WHERE hp.user_id = auth.uid() AND hp.status = 'ACTIVE' AND hh.team_id IS NOT NULL
    UNION
    SELECT c.team_id FROM public.helper_team_covers c
    JOIN public.helper_profiles hp ON hp.id = c.helper_id
    WHERE hp.user_id = auth.uid() AND hp.status = 'ACTIVE';
$$;

CREATE OR REPLACE FUNCTION public.ticket_household(p_ticket_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT household_id FROM public.tickets WHERE id = p_ticket_id;
$$;

CREATE OR REPLACE FUNCTION public.grocery_run_household(p_run_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT household_id FROM public.grocery_runs WHERE id = p_run_id;
$$;

CREATE OR REPLACE FUNCTION public.grocery_run_status(p_run_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT status FROM public.grocery_runs WHERE id = p_run_id;
$$;

-- Whether the caller may see a run with these values. Takes the row's own
-- columns rather than its id so that the policy also works for a row being
-- inserted (a lookup by id wouldn't find it yet).
CREATE OR REPLACE FUNCTION public.grocery_run_visible(
    p_run_id UUID,
    p_household_id UUID,
    p_status TEXT,
    p_team_id UUID,
    p_ticket_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p_household_id IN (SELECT public.my_household_ids())
       AND (
           public.is_household_admin()
           OR public.my_pantry_role() IS NOT DISTINCT FROM 'lead'
           OR (p_status IN ('ready', 'done') AND (
               EXISTS (
                   SELECT 1 FROM public.grocery_run_shoppers s
                   JOIN public.helper_profiles hp ON hp.id = s.helper_id
                   WHERE s.run_id = p_run_id AND hp.user_id = auth.uid()
               )
               OR EXISTS (
                   SELECT 1 FROM public.tickets t
                   JOIN public.helper_profiles hp ON hp.id = t.helper_id
                   WHERE t.id = p_ticket_id AND hp.user_id = auth.uid()
               )
               OR p_team_id IN (SELECT public.my_team_ids())
           ))
       );
$$;

CREATE OR REPLACE FUNCTION public.can_see_grocery_run(p_run_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((
        SELECT public.grocery_run_visible(r.id, r.household_id, r.status, r.team_id, r.ticket_id)
        FROM public.grocery_runs r WHERE r.id = p_run_id
    ), FALSE);
$$;

-- Whether the caller may change what's on a run and who goes: a manager
-- until it's closed, a lead while it's a draft or waiting.
CREATE OR REPLACE FUNCTION public.can_edit_grocery_run(p_run_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.grocery_runs r
        WHERE r.id = p_run_id
          AND r.household_id IN (SELECT public.my_household_ids())
          AND (
              (public.is_household_admin() AND r.status IN ('draft', 'pending', 'ready'))
              OR (public.my_pantry_role() IS NOT DISTINCT FROM 'lead'
                  AND r.status IN ('draft', 'pending'))
          )
    );
$$;

-- Managers and pantry leads plan runs and keep repeats.
CREATE OR REPLACE FUNCTION public.i_plan_groceries()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_household_admin() OR public.my_pantry_role() IS NOT DISTINCT FROM 'lead';
$$;

-- --------------------------------------------------------------------------
-- 3. Guards.
-- --------------------------------------------------------------------------

-- Who may move a run along, and what they may change on the way.
CREATE OR REPLACE FUNCTION public.grocery_runs_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_changed TEXT[];
BEGIN
    -- Whoever writes: the team and the task are this household's.
    IF NEW.team_id IS NOT NULL
       AND public.team_household(NEW.team_id) IS DISTINCT FROM NEW.household_id THEN
        RAISE EXCEPTION 'That team belongs to another household';
    END IF;
    IF NEW.ticket_id IS NOT NULL
       AND public.ticket_household(NEW.ticket_id) IS DISTINCT FROM NEW.household_id THEN
        RAISE EXCEPTION 'That task belongs to another household';
    END IF;
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.created_by := auth.uid();
        IF public.is_household_admin() THEN
            IF NEW.status NOT IN ('draft', 'ready') THEN
                RAISE EXCEPTION 'A new run starts as a draft or ready to shop';
            END IF;
            RETURN NEW;
        END IF;
        IF NEW.status <> 'draft' OR NEW.cash_given IS NOT NULL OR NEW.change_returned IS NOT NULL THEN
            RAISE EXCEPTION 'Draft muna. Ang manager ang mag-a-approve at magbibigay ng pera.';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.household_id IS DISTINCT FROM OLD.household_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'A run stays in its household';
    END IF;
    IF public.is_household_admin() THEN
        RETURN NEW;
    END IF;

    -- What the caller changed, leaving out the stamps set by grocery_runs_stamp.
    SELECT COALESCE(array_agg(n.key), '{}') INTO v_changed
    FROM jsonb_each(to_jsonb(NEW)) n
    WHERE n.key NOT IN ('approved_by', 'approved_at', 'closed_by', 'closed_at', 'updated_at')
      AND n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key);

    IF OLD.status IN ('draft', 'pending') THEN
        IF public.my_pantry_role() IS DISTINCT FROM 'lead' THEN
            RAISE EXCEPTION 'Ang namamahala ng pantry lang ang makakapagbago ng run na ito';
        END IF;
        IF NEW.status NOT IN ('draft', 'pending', 'cancelled') THEN
            RAISE EXCEPTION 'Ang manager ang mag-a-approve ng run';
        END IF;
        IF NOT v_changed <@ ARRAY['title', 'team_id', 'shop_on', 'ticket_id', 'note', 'status'] THEN
            RAISE EXCEPTION 'Ang manager ang magtatakda ng pera para sa run';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'ready' THEN
        IF NEW.status NOT IN ('ready', 'done')
           OR NOT v_changed <@ ARRAY['status', 'change_returned'] THEN
            RAISE EXCEPTION 'Puwede mo lang ilagay ang sukli at tapusin ang run';
        END IF;
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Sarado na ang run na ito';
END;
$$;

-- Who approved and who closed it, and when. Runs for every write (a
-- function's too), after the guard, so the stamps can't be sent by a client.
CREATE OR REPLACE FUNCTION public.grocery_runs_stamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'ready' THEN
            NEW.approved_by := auth.uid();
            NEW.approved_at := now();
        ELSE
            NEW.approved_by := NULL;
            NEW.approved_at := NULL;
        END IF;
        NEW.closed_by := NULL;
        NEW.closed_at := NULL;
        RETURN NEW;
    END IF;

    IF NEW.status = 'ready' AND OLD.status IN ('draft', 'pending') THEN
        NEW.approved_by := auth.uid();
        NEW.approved_at := now();
    ELSIF NEW.status IN ('draft', 'pending') THEN
        NEW.approved_by := NULL;
        NEW.approved_at := NULL;
    ELSE
        NEW.approved_by := OLD.approved_by;
        NEW.approved_at := OLD.approved_at;
    END IF;

    IF NEW.status IN ('done', 'cancelled') AND OLD.status NOT IN ('done', 'cancelled') THEN
        NEW.closed_by := auth.uid();
        NEW.closed_at := now();
    ELSIF NEW.status NOT IN ('done', 'cancelled') THEN
        NEW.closed_by := NULL;
        NEW.closed_at := NULL;
    ELSE
        NEW.closed_by := OLD.closed_by;
        NEW.closed_at := OLD.closed_at;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- Closing or cancelling a run puts what wasn't bought back in the pool.
CREATE OR REPLACE FUNCTION public.grocery_runs_release()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status IN ('done', 'cancelled') AND OLD.status NOT IN ('done', 'cancelled') THEN
        UPDATE public.grocery_items SET run_id = NULL WHERE run_id = NEW.id AND NOT bought;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grocery_runs_guard ON public.grocery_runs;
CREATE TRIGGER grocery_runs_guard
    BEFORE INSERT OR UPDATE ON public.grocery_runs
    FOR EACH ROW EXECUTE FUNCTION public.grocery_runs_guard();
DROP TRIGGER IF EXISTS grocery_runs_stamp ON public.grocery_runs;
CREATE TRIGGER grocery_runs_stamp
    BEFORE INSERT OR UPDATE ON public.grocery_runs
    FOR EACH ROW EXECUTE FUNCTION public.grocery_runs_stamp();
DROP TRIGGER IF EXISTS grocery_runs_release ON public.grocery_runs;
CREATE TRIGGER grocery_runs_release
    AFTER UPDATE OF status ON public.grocery_runs
    FOR EACH ROW EXECUTE FUNCTION public.grocery_runs_release();

-- A shopper works in the run's household.
CREATE OR REPLACE FUNCTION public.grocery_run_shoppers_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NOT public.helper_works_in(NEW.helper_id, public.grocery_run_household(NEW.run_id)) THEN
        RAISE EXCEPTION 'That person doesn''t work in this household';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grocery_run_shoppers_guard ON public.grocery_run_shoppers;
CREATE TRIGGER grocery_run_shoppers_guard
    BEFORE INSERT OR UPDATE ON public.grocery_run_shoppers
    FOR EACH ROW EXECUTE FUNCTION public.grocery_run_shoppers_guard();

-- Lines on a run: only someone who may change the run moves lines on or off
-- it, adds or removes them, or fixes them; buying happens on a ready run
-- (or, for a manager fixing a figure, a closed one). The pantry-role guard
-- (add-pantry-roles.sql) still limits a runner to ticking and pricing.
-- Skipped for functions and for writes made by another trigger (closing a
-- run releases its lines through grocery_runs_release).
CREATE OR REPLACE FUNCTION public.grocery_items_run_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
BEGIN
    IF TG_OP <> 'DELETE' THEN
        IF NEW.run_id IS NOT NULL
           AND public.grocery_run_household(NEW.run_id) IS DISTINCT FROM NEW.household_id THEN
            RAISE EXCEPTION 'That run is in another household';
        END IF;
    END IF;
    IF current_user <> 'authenticated' OR pg_trigger_depth() > 1 THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.run_id IS NOT NULL AND NOT public.can_edit_grocery_run(NEW.run_id) THEN
            RAISE EXCEPTION 'Hindi mo na madadagdagan ang run na ito';
        END IF;
        IF NEW.run_id IS NOT NULL AND NEW.bought THEN
            RAISE EXCEPTION 'Add it first, then tick it bought';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.run_id IS NOT NULL AND NOT public.can_edit_grocery_run(OLD.run_id) THEN
            RAISE EXCEPTION 'Hindi mo matatanggal ang nasa run na ito';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.run_id IS DISTINCT FROM OLD.run_id THEN
        IF OLD.bought THEN
            RAISE EXCEPTION 'A bought line stays where it was bought';
        END IF;
        IF (OLD.run_id IS NOT NULL AND NOT public.can_edit_grocery_run(OLD.run_id))
           OR (NEW.run_id IS NOT NULL AND NOT public.can_edit_grocery_run(NEW.run_id)) THEN
            RAISE EXCEPTION 'Hindi mo mailipat ang item sa run na ito';
        END IF;
    END IF;

    IF NEW.run_id IS NOT NULL THEN
        v_status := public.grocery_run_status(NEW.run_id);
        IF (NEW.bought, NEW.actual_cost) IS DISTINCT FROM (OLD.bought, OLD.actual_cost)
           AND NOT (v_status = 'ready' OR (v_status = 'done' AND public.is_household_admin())) THEN
            RAISE EXCEPTION '%', CASE
                WHEN v_status IN ('draft', 'pending') THEN 'Hindi pa naaaprubahan ang run na ito'
                ELSE 'Sarado na ang run na ito'
            END;
        END IF;
        IF (NEW.name, NEW.qty, NEW.unit, NEW.pantry_item_id)
               IS DISTINCT FROM (OLD.name, OLD.qty, OLD.unit, OLD.pantry_item_id)
           AND NOT public.can_edit_grocery_run(NEW.run_id) THEN
            RAISE EXCEPTION 'Hindi mo mababago ang item sa run na ito';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- When a line was bought, for the month it counts against. Set here, for
-- every write, so it can't be back-dated. Named to run after the guards.
CREATE OR REPLACE FUNCTION public.grocery_items_stamp_bought()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.bought_at := CASE WHEN NEW.bought THEN now() END;
    ELSIF NEW.bought AND NOT OLD.bought THEN
        NEW.bought_at := now();
    ELSIF NOT NEW.bought THEN
        NEW.bought_at := NULL;
    ELSE
        NEW.bought_at := OLD.bought_at;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grocery_items_run_guard ON public.grocery_items;
CREATE TRIGGER grocery_items_run_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.grocery_items
    FOR EACH ROW EXECUTE FUNCTION public.grocery_items_run_guard();
DROP TRIGGER IF EXISTS grocery_items_stamp_bought ON public.grocery_items;
CREATE TRIGGER grocery_items_stamp_bought
    BEFORE INSERT OR UPDATE ON public.grocery_items
    FOR EACH ROW EXECUTE FUNCTION public.grocery_items_stamp_bought();

-- Teams on repeats and budgets, and a receipt's run, stay in the household.
CREATE OR REPLACE FUNCTION public.grocery_same_household_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_TABLE_NAME = 'grocery_receipts' THEN
        IF NEW.run_id IS NOT NULL
           AND public.grocery_run_household(NEW.run_id) IS DISTINCT FROM NEW.household_id THEN
            RAISE EXCEPTION 'That run is in another household';
        END IF;
    ELSIF NEW.team_id IS NOT NULL
          AND public.team_household(NEW.team_id) IS DISTINCT FROM NEW.household_id THEN
        RAISE EXCEPTION 'That team belongs to another household';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grocery_templates_same_household ON public.grocery_templates;
CREATE TRIGGER grocery_templates_same_household
    BEFORE INSERT OR UPDATE ON public.grocery_templates
    FOR EACH ROW EXECUTE FUNCTION public.grocery_same_household_guard();
DROP TRIGGER IF EXISTS grocery_budgets_same_household ON public.grocery_budgets;
CREATE TRIGGER grocery_budgets_same_household
    BEFORE INSERT OR UPDATE ON public.grocery_budgets
    FOR EACH ROW EXECUTE FUNCTION public.grocery_same_household_guard();
DROP TRIGGER IF EXISTS grocery_receipts_same_household ON public.grocery_receipts;
CREATE TRIGGER grocery_receipts_same_household
    BEFORE INSERT OR UPDATE ON public.grocery_receipts
    FOR EACH ROW EXECUTE FUNCTION public.grocery_same_household_guard();

-- --------------------------------------------------------------------------
-- 4. Policies.
-- --------------------------------------------------------------------------
ALTER TABLE public.grocery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_run_shoppers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grocery_runs_read ON public.grocery_runs;
CREATE POLICY grocery_runs_read ON public.grocery_runs
    FOR SELECT USING (public.grocery_run_visible(id, household_id, status, team_id, ticket_id));

DROP POLICY IF EXISTS grocery_runs_insert ON public.grocery_runs;
CREATE POLICY grocery_runs_insert ON public.grocery_runs
    FOR INSERT WITH CHECK (
        household_id IN (SELECT public.my_household_ids()) AND public.i_plan_groceries()
    );

DROP POLICY IF EXISTS grocery_runs_update ON public.grocery_runs;
CREATE POLICY grocery_runs_update ON public.grocery_runs
    FOR UPDATE USING (public.grocery_run_visible(id, household_id, status, team_id, ticket_id))
    WITH CHECK (household_id IN (SELECT public.my_household_ids()));

-- Only drafts and runs waiting for approval; anything further is cancelled
-- instead, so its history stays.
DROP POLICY IF EXISTS grocery_runs_delete ON public.grocery_runs;
CREATE POLICY grocery_runs_delete ON public.grocery_runs
    FOR DELETE USING (status IN ('draft', 'pending') AND public.can_edit_grocery_run(id));

DROP POLICY IF EXISTS grocery_run_shoppers_read ON public.grocery_run_shoppers;
CREATE POLICY grocery_run_shoppers_read ON public.grocery_run_shoppers
    FOR SELECT USING (public.can_see_grocery_run(run_id));
DROP POLICY IF EXISTS grocery_run_shoppers_insert ON public.grocery_run_shoppers;
CREATE POLICY grocery_run_shoppers_insert ON public.grocery_run_shoppers
    FOR INSERT WITH CHECK (public.can_edit_grocery_run(run_id));
DROP POLICY IF EXISTS grocery_run_shoppers_delete ON public.grocery_run_shoppers;
CREATE POLICY grocery_run_shoppers_delete ON public.grocery_run_shoppers
    FOR DELETE USING (public.can_edit_grocery_run(run_id));

-- Lines on a run she can't see are hidden from her, whatever else lets her
-- read the list. RESTRICTIVE: it narrows the household policies, it
-- doesn't replace them.
DROP POLICY IF EXISTS grocery_items_run_visible ON public.grocery_items;
CREATE POLICY grocery_items_run_visible ON public.grocery_items
    AS RESTRICTIVE FOR ALL
    USING (run_id IS NULL OR public.can_see_grocery_run(run_id))
    WITH CHECK (run_id IS NULL OR public.can_see_grocery_run(run_id));

DROP POLICY IF EXISTS grocery_templates_planners ON public.grocery_templates;
CREATE POLICY grocery_templates_planners ON public.grocery_templates
    FOR ALL USING (household_id IN (SELECT public.my_household_ids()) AND public.i_plan_groceries())
    WITH CHECK (household_id IN (SELECT public.my_household_ids()) AND public.i_plan_groceries());

DROP POLICY IF EXISTS grocery_template_items_planners ON public.grocery_template_items;
CREATE POLICY grocery_template_items_planners ON public.grocery_template_items
    FOR ALL USING (EXISTS (SELECT 1 FROM public.grocery_templates t WHERE t.id = template_id))
    WITH CHECK (EXISTS (SELECT 1 FROM public.grocery_templates t WHERE t.id = template_id));

-- Leads plan inside the budget, so they read it; managers set it.
DROP POLICY IF EXISTS grocery_budgets_read ON public.grocery_budgets;
CREATE POLICY grocery_budgets_read ON public.grocery_budgets
    FOR SELECT USING (household_id IN (SELECT public.my_household_ids()) AND public.i_plan_groceries());
DROP POLICY IF EXISTS grocery_budgets_write ON public.grocery_budgets;
CREATE POLICY grocery_budgets_write ON public.grocery_budgets
    FOR ALL USING (household_id = public.current_household_id() AND public.is_household_admin())
    WITH CHECK (household_id = public.current_household_id() AND public.is_household_admin());

-- --------------------------------------------------------------------------
-- 5. Starting a run from a repeat. One call, so a half-made run is never
--    left behind. A manager's draft carries the usual cash; a lead's doesn't
--    (the manager sets it when approving). A line already in the pool for
--    the same thing moves onto the run rather than being listed twice.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_grocery_run(p_template_id UUID, p_shop_on DATE DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_t public.grocery_templates%ROWTYPE;
    v_run UUID;
    v_item RECORD;
    v_pool UUID;
BEGIN
    SELECT * INTO v_t FROM public.grocery_templates
    WHERE id = p_template_id AND household_id IN (SELECT public.my_household_ids());
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No such repeat run';
    END IF;
    IF NOT public.i_plan_groceries() THEN
        RAISE EXCEPTION 'Ang manager o ang namamahala ng pantry lang ang makakapagsimula ng run';
    END IF;

    INSERT INTO public.grocery_runs
        (household_id, title, team_id, shop_on, template_id, cash_given, created_by, status)
    VALUES
        (v_t.household_id, v_t.title, v_t.team_id, p_shop_on, v_t.id,
         CASE WHEN public.is_household_admin() THEN v_t.cash_default END, auth.uid(), 'draft')
    RETURNING id INTO v_run;

    INSERT INTO public.grocery_run_shoppers (run_id, helper_id)
    SELECT DISTINCT v_run, hp.id
    FROM unnest(v_t.shopper_ids) AS s(id)
    JOIN public.helper_profiles hp ON hp.id = s.id AND hp.status = 'ACTIVE'
    WHERE public.helper_works_in(hp.id, v_t.household_id);

    FOR v_item IN
        SELECT * FROM public.grocery_template_items WHERE template_id = v_t.id ORDER BY created_at
    LOOP
        SELECT g.id INTO v_pool
        FROM public.grocery_items g
        WHERE g.household_id = v_t.household_id AND g.run_id IS NULL AND NOT g.bought
          AND ((v_item.pantry_item_id IS NOT NULL AND g.pantry_item_id = v_item.pantry_item_id)
               OR lower(btrim(g.name)) = lower(btrim(v_item.name)))
        ORDER BY g.created_at
        LIMIT 1;
        IF v_pool IS NOT NULL THEN
            UPDATE public.grocery_items SET run_id = v_run WHERE id = v_pool;
        ELSE
            INSERT INTO public.grocery_items
                (household_id, name, qty, unit, pantry_item_id, run_id, bought)
            VALUES
                (v_t.household_id, v_item.name, v_item.qty, v_item.unit, v_item.pantry_item_id,
                 v_run, FALSE);
        END IF;
    END LOOP;
    RETURN v_run;
END;
$$;

DO $$
DECLARE
    v_fn TEXT;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY[
        'public.my_team_ids()',
        'public.ticket_household(uuid)',
        'public.grocery_run_household(uuid)',
        'public.grocery_run_status(uuid)',
        'public.grocery_run_visible(uuid, uuid, text, uuid, uuid)',
        'public.can_see_grocery_run(uuid)',
        'public.can_edit_grocery_run(uuid)',
        'public.i_plan_groceries()',
        'public.start_grocery_run(uuid, date)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
    END LOOP;
END;
$$;

REVOKE ALL ON public.grocery_runs, public.grocery_run_shoppers, public.grocery_templates,
    public.grocery_template_items, public.grocery_budgets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.grocery_runs, public.grocery_templates, public.grocery_template_items,
       public.grocery_budgets
    TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.grocery_run_shoppers TO authenticated;
