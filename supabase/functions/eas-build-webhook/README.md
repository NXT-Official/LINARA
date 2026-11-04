# EAS build log (EAS → Edge Function → Apps Script → Google Doc)

Each finished `preview` build of `naaxtechs-team/linara-mobile` updates the
**LINARA** table's **Mobile** row in the team's "Latest build and URL list"
Doc, in place: Link = the build's install page (QR code), Notes =
`Preview · Android · v1.0.2 (12) · 564b61e Add home screen`, Date Updated =
the finish date (Manila). The cell's existing font is kept.

- A failed or canceled build leaves the row alone (the last working link stays).
- A build that finished before the one already in the row (a late retry) is skipped.
- The heading and row are found by their text: a paragraph reading exactly
  `LINARA`, the first table after it, the row whose first cell is `Mobile`.
  Columns are found by header (`Link…`, `Notes…`, `Date…`). Script properties
  `SECTION` and `ROW` change the heading and row names.
- If the Doc doesn't have them, nothing is written and the function returns
  502, so EAS retries; the Supabase logs show which part was missing.

```
EAS BUILD webhook (expo-signature HMAC-SHA1)
  → eas-build-webhook   checks the signature, keeps only the preview profile, keeps only expo.dev links
  → Apps Script doPost  checks TOKEN, writes each build id once, inserts the entry
  → Google Doc
```

Apps Script cannot read request headers, so it cannot check Expo's signature
itself; this function does, and passes a separate shared token in the body.

## Setup

Use two different random secrets (at least 32 characters each), for example
`openssl rand -hex 32`:

- `WEBHOOK_SECRET`: shared by EAS and this function
- `DOC_TOKEN`: shared by this function and Apps Script

### 1. Google Doc + Apps Script

1. Use the Doc with the `LINARA` heading and its Type | Link | Notes | Date Updated table (with a `Mobile` row).
2. In the Doc, open **Extensions → Apps Script**. Replace `Code.gs` with
   [`apps-script/Code.gs`](apps-script/Code.gs).
3. Open **Project Settings → Script properties** and add:
   - `TOKEN` = `DOC_TOKEN`
   - `DOC_ID` = the Doc id (the part of its URL between `/d/` and `/edit`)
4. Open **Deploy → New deployment → Web app**. Set **Execute as: Me** and
   **Who has access: Anyone**, then authorize. Copy the `/exec` URL.
   "Anyone" is needed because EAS calls it without a Google login; the TOKEN check is what keeps others out.
5. After any later edit to `Code.gs`, go to **Deploy → Manage deployments → Edit → New version**,
   or the `/exec` URL keeps running the old code.

### 2. Edge Function (from `LINARA/`)

```sh
npx supabase secrets set --project-ref tueckhlrrupmnzhblewy \
  EAS_WEBHOOK_SECRET=<WEBHOOK_SECRET> \
  EAS_LOG_APPS_SCRIPT_URL=<exec URL> \
  EAS_LOG_APPS_SCRIPT_TOKEN=<DOC_TOKEN>
npx supabase functions deploy eas-build-webhook --project-ref tueckhlrrupmnzhblewy --no-verify-jwt
```

`EAS_LOG_PROFILES` is optional (comma-separated, default `preview`), for
example `preview,production` later.

### 3. EAS webhook (from `LINARA_MOBILE/`)

```sh
eas webhook:create --event BUILD \
  --url https://tueckhlrrupmnzhblewy.supabase.co/functions/v1/eas-build-webhook \
  --secret <WEBHOOK_SECRET>
eas webhook:list
```

### 4. Check it

- `eas build --profile preview --platform android` should update the LINARA Mobile row when the build ends.
- A request with a bad signature should return 401 and add nothing:
  `curl -i -X POST <function URL> -H "expo-signature: sha1=00" -d "{}"`

## Responses (what EAS sees)

| Case | Status | EAS retries? |
|---|---|---|
| Logged, or already logged | 200 | no |
| Not a `preview` build | 200 (`ignored`) | no |
| Bad or missing signature | 401 | yes, and each retry is rejected again |
| Not a build payload | 400 | yes, rejected again |
| Doc side unreachable or refused | 502 | yes; Code.gs writes each build id once |
| Secrets not set | 500 | yes |

## Tests

`npx vitest run supabase/functions/eas-build-webhook` runs the real handler and
the real `Code.gs`. Only `fetch` to Apps Script and the Google services are faked.
