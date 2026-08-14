import http from "node:http";

/**
 * A minimal stand-in for the handful of Supabase Auth/PostgREST endpoints
 * the server functions in people.actions.ts call (auth/v1/user,
 * rest/v1/user_profiles, rest/v1/helper_profiles). Started once from
 * playwright.config.ts and pointed to via SUPABASE_URL in webServer.env, so
 * the e2e smoke test never touches the real, shared Supabase project --
 * see KNOWN_GAPS.md.
 */

export const FIXTURES = {
  token: "smoke-test-manager-token",
  userId: "00000000-0000-4000-8000-000000000001",
  householdId: "00000000-0000-4000-8000-000000000002",
  helperId: "00000000-0000-4000-8000-000000000003",
  helperName: "Ate Rosa",
};

function send(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(json);
}

export function startMockSupabaseServer(port: number): Promise<{ close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/auth/v1/user") {
      const auth = req.headers.authorization ?? "";
      // eslint-disable-next-line security/detect-possible-timing-attacks -- False positive. Local-only test fixture token, not a real secret.
      if (auth === `Bearer ${FIXTURES.token}`) {
        return send(res, 200, {
          id: FIXTURES.userId,
          aud: "authenticated",
          email: "smoke-manager@example.test",
        });
      }
      return send(res, 401, { error: "invalid_token", error_description: "Invalid token" });
    }

    if (url.pathname === "/rest/v1/user_profiles") {
      return send(res, 200, {
        id: FIXTURES.userId,
        household_id: FIXTURES.householdId,
        full_name: "Smoke Manager",
        user_type: "primary_manager",
      });
    }

    if (url.pathname === "/rest/v1/helper_profiles") {
      return send(res, 200, [
        {
          id: FIXTURES.helperId,
          user_id: null,
          household_id: FIXTURES.householdId,
          name: FIXTURES.helperName,
          station: "House",
          monthly_rate: 8000,
          payday_interval: "monthly",
          shift_start: "08:00",
          shift_end: "17:00",
          daily_break_duration: 60,
          weekly_rest_day: 0,
          break_start: null,
          break_end: null,
          invite_code: null,
          status: "ACTIVE",
          employment: "live-in",
          phone: null,
          created_at: new Date().toISOString(),
        },
      ]);
    }

    send(res, 404, { error: "not_found", path: url.pathname });
  });

  return new Promise((resolve, reject) => {
    // Playwright loads this config from more than one process (the main
    // runner plus each worker); whichever one gets here first wins the
    // port, and the rest are harmless no-ops against the same fixture data.
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve({ close: () => Promise.resolve() });
        return;
      }
      reject(err);
    });
    server.listen(port, "127.0.0.1", () => {
      resolve({
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
