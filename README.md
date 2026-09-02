# Personal Life Dashboard

A private, local-first Progressive Web App for one person: daily tasks, nutrition,
gym training, running, steps, study, streaks and long-term progress.

Everything is stored in **IndexedDB on your own device**. There is no account, no
server, no analytics and no third-party request at runtime. It works offline, keeps
every past day exactly as you left it, and exports everything you have entered
whenever you ask.

Built for iPad first (portrait and landscape), and comfortable on phones and
desktop browsers.

**New here? Follow [GETTING-STARTED.md](GETTING-STARTED.md)** — a step-by-step
walkthrough from `npm install` to a working Home Screen app. This file is the
reference manual behind it.

---

## Contents

- [Architecture](#architecture)
- [File tree](#file-tree)
- [Running it](#running-it)
- [Installing on an iPad](#installing-on-an-ipad)
- [How the numbers work](#how-the-numbers-work)
- [Data storage, backup and restore](#data-storage-backup-and-restore)
- [Privacy and security](#privacy-and-security)
- [Accessibility](#accessibility)
- [Artwork](#artwork)
- [Testing](#testing)
- [Deployment](#deployment)
- [Optional private cloud sync](#optional-private-cloud-sync)
- [Acceptance tests](#acceptance-tests)

---

## Architecture

React 18 + TypeScript, built with Vite. Four clean layers, no cross-talk:

| Layer | Where | Responsibility |
| --- | --- | --- |
| **Persistence** | `src/db/` | IndexedDB schema, migrations, typed CRUD, defaults, demo data |
| **Domain logic** | `src/lib/` | Dates and time zones, validation, recurrence, all calculations, streaks, analytics, CSV, backup/encryption |
| **State** | `src/state/AppStore.tsx` | One in-memory snapshot mirrored to IndexedDB, plus the actions that write to it |
| **UI** | `src/components/`, `src/pages/` | Presentation only; every figure it shows comes from the domain layer |

Deliberate choices:

- **No charting or calendar dependency.** Both are hand-written accessible SVG/DOM
  components, so there is nothing to break on a major-version bump, and every chart
  ships a written summary and a data table.
- **Only two runtime dependencies** (`react`, `react-dom`), each pinned exactly.
- **Everything is derived.** Day summaries, weekly analyses and streaks are
  recomputed from source records on every render. No cached total is ever the
  source of truth, so editing a historical entry immediately corrects every figure
  that depends on it.
- **Routes are lazily loaded** — each page is its own chunk (~4–12 kB gzipped).
- **Local calendar dates, not UTC.** A day is a `YYYY-MM-DD` string resolved in
  your selected time zone; all arithmetic runs on a UTC-noon anchor so a
  daylight-saving change can never shift a date.

## File tree

```
.
├── index.html                     App shell, CSP, manifest and font links
├── package.json / tsconfig.json / vite.config.ts
├── .env.example                   Variable NAMES only - never real secrets
├── scripts/
│   ├── generate-icons.mjs         Renders the PWA PNG icons from code
│   └── layout-check.mjs           Real-browser overflow + target-size check
├── public/
│   ├── manifest.webmanifest       Installable PWA metadata
│   ├── sw.js                      Offline app-shell service worker
│   ├── icons/                     Generated PNG icons
│   └── decor/                     Original mascots + franchise placeholder slots
├── supabase/migrations/           OPTIONAL cloud sync schema + RLS policies
├── src/
│   ├── main.tsx                   Entry point, service-worker registration
│   ├── App.tsx                    Shell, routes, lazy loading
│   ├── router.tsx                 Tiny hash router
│   ├── types/models.ts            Every stored record type
│   ├── db/
│   │   ├── idb.ts                 Promise wrapper around IndexedDB
│   │   ├── schema.ts              Object stores, indexes, migrations
│   │   ├── repo.ts                Load/save/delete, snapshot type
│   │   ├── defaults.ts            Default settings, targets, MET presets
│   │   └── seed.ts                Demo dataset (ids prefixed `demo-`)
│   ├── state/AppStore.tsx         Context, actions, undo, autosave, midnight rollover
│   ├── lib/
│   │   ├── date.ts                Time-zone aware calendar dates
│   │   ├── validate.ts            Range/type/length coercion for all input
│   │   ├── uuid.ts, bus.ts, pin.ts, notify.ts
│   │   ├── recurrence.ts          Templates -> dated instances
│   │   ├── dataIndex.ts           Date-keyed views over the snapshot
│   │   ├── daySummary.ts          The full record for one date
│   │   ├── analytics.ts           Range analysis + rule-based written review
│   │   ├── csv.ts, backup.ts      Exports, imports, AES-GCM encryption
│   │   └── calc/
│   │       ├── tasks.ts  nutrition.ts  fitness.ts
│   │       ├── energy.ts  study.ts  streak.ts  targets.ts
│   ├── components/                Ui, Charts, DayDetail, AppShell, ThemeScope, LockScreen, Reminders
│   ├── pages/                     Today, Tasks, Nutrition, Fitness, Study, Calendar, Analytics, Settings
│   └── styles/app.css             Design system + validated data-viz palette
└── tests/
    ├── calculations.test.ts       Percentages, macros, pace, MET, energy, targets, timer, dates, CSV
    ├── streaks.test.ts            Day qualification and streak counting
    ├── persistence.test.ts        IndexedDB round-trips, backup/restore, encryption
    └── app.test.tsx               End-to-end flows through the real UI
```

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build into dist/
npm run preview      # serve dist/ at http://localhost:4173
npm test             # unit + integration tests
npm run icons        # regenerate the PWA icons
npm run check:layout # real-browser layout check (needs `npm run preview` running)
```

Requires Node 20 or newer.

## Installing on an iPad

1. Run `npm run build`, then serve `dist/` over **HTTPS** (see
   [Deployment](#deployment)). A service worker will not register over plain HTTP
   except on `localhost`.
2. Open the URL in Safari.
3. Tap **Share → Add to Home Screen**.
4. Launch it from the Home Screen. It runs full-screen, works offline, and honours
   the safe-area insets on every side.

The bottom navigation bar is thumb-reachable in both orientations; on screens
900 px and wider a left sidebar appears alongside it.

## How the numbers work

Every calculation is deterministic, unit-tested, and labelled where it is an
estimate.

**Tasks.** Daily completion = completed eligible tasks ÷ all eligible tasks × 100.
Cancelled and excused tasks are excluded from the denominator; excused tasks stay
visible in history. Skipped tasks count as missed, and a pending task counts as
missed once its day is in the past. All-task and mandatory-only figures are shown
separately.

**Recurring tasks.** A template creates a dated instance for each matching day.
Instances are never created for dates before the template existed, so adding a
routine today cannot retroactively mark last week as missed. Editing a template
updates **future pending instances only** unless you explicitly choose
"Also update past records". Deleting a recurring instance cancels it for that day
(so the recurrence does not regenerate it) and leaves the historical record intact.

**Nutrition.** Each day is either *itemised* or *quick total* — never both — so
calories cannot be double-counted. Macro-derived calories are estimated at
4 kcal/g protein and carbohydrate, 9 kcal/g fat; if that differs from your entered
figure by more than 15 % you get a gentle warning and **your entered value is kept
exactly as typed**. Nothing is ever auto-filled from a food database.

**Exercise calories.** Manual entry always wins. Otherwise the MET estimate is

```
estimated kcal = MET × 3.5 × body weight in kg ÷ 200 × duration in minutes
```

The MET value is shown and editable on every entry. Any session, run or step
record can be flagged **"already included in another estimate"**, which keeps it
out of the active-calorie total so nothing is counted twice.

**Energy balance.** Exercise calories are never used on their own. Choose one
method in Settings:

- **Method A — baseline + exercise.** You enter a baseline that *excludes* logged
  exercise. Estimated total expenditure = baseline + non-duplicated active calories.
- **Method B — full TDEE.** You enter a TDEE that already includes usual activity.
  Estimated total expenditure = TDEE; logged exercise is displayed separately and
  is not added again.

Then `estimated energy balance = estimated total expenditure − calorie intake`.
Positive is labelled *estimated deficit*, negative is shown by absolute value as
*estimated surplus*, and the method is printed beside every figure. With no food
logged, no balance figure is shown at all. These are estimates, not clinical
measurements, and none of this is medical advice.

**Targets.** Every target is versioned by effective date. The version in force on a
day is the newest one whose effective date is on or before it, so a target you set
for tomorrow can never rewrite yesterday's analysis.

**Study timer.** Elapsed time is derived from stored timestamps
(`startedAt` + `accumulatedMs`), never from a running interval, so backgrounding
the app, locking the iPad or reloading the page loses nothing.

**Streaks.** You choose which conditions make a day successful (mandatory tasks,
a calorie band, a protein minimum, steps, a workout, study minutes). Planned rest
days can count as successes; excused days are skipped entirely rather than
breaking a run; today never breaks a streak while it is still in progress. Every
date shows exactly which conditions it met and which it did not.

**Written reviews.** The daily review and the weekly analysis are rule-based and
generated from your stored records only. No external service, no invented facts,
no causal claims from correlations, and an explicit "not enough data" when there
is nothing to say.

## Data storage, backup and restore

The database is `personal-life-dashboard` in IndexedDB, with one object store per
record type and versioned migrations in `src/db/schema.ts`. Every record carries a
stable UUID, its local date and time zone, `createdAt`, `updatedAt` and a schema
version. Writes autosave immediately and show a brief "Saved" indicator; recent
deletions offer an Undo, and destructive bulk actions require confirmation
(deleting everything additionally requires typing `DELETE`).

**Settings → Backup** gives you:

- **Full JSON export** with schema version and export timestamp.
- **Passphrase-encrypted export** — AES-GCM with a PBKDF2-SHA256 key
  (310 000 iterations). If you lose the passphrase the file is unrecoverable;
  there is no reset.
- **Import** with validation, a size limit, duplicate detection, a merge/replace
  choice, a one-click backup-before-replace, and a preview that shows exactly how
  many records would be added, updated and skipped as invalid — nothing is written
  until you confirm.
- The date of your most recent successful export.

**Analytics → Export CSV** produces per-module exports (daily summary, tasks,
nutrition, gym sets, running, steps, study) for the selected date range, with
formula-injection-safe escaping. **Print report** produces a clean print layout of
the current analytics view.

> Records live in one browser profile. Clearing site data, switching browser or
> resetting the device removes them. Export a backup regularly and keep it
> somewhere you control.

## Privacy and security

- No advertisements, behavioural analytics, trackers or telemetry.
- No data leaves the device. The only outbound request is an optional Google Fonts
  stylesheet, which degrades cleanly to system fonts when blocked or offline.
- IndexedDB is persistent but is **not** an encrypted vault. Anyone with access to
  the device and browser profile can read it — your device passcode still matters.
- The optional four-digit PIN is a **visual screen lock only**, never described as
  encryption. Real at-rest protection is offered through encrypted backups.
- All user input is validated for type, range, length and date validity before it
  is stored, and all imported backups are schema-validated, size-limited, previewed
  and confirmed.
- Content is rendered as text by React — there is no `dangerouslySetInnerHTML`, no
  `eval`, and no dynamic code execution anywhere in the app.
- A restrictive Content-Security-Policy ships in `index.html`; see
  [Deployment](#deployment) for the headers to send in production.

## Accessibility

Targeting WCAG 2.2 AA:

- Semantic HTML, labelled form controls, described hints and errors, live regions
  for save state and reminders.
- Full keyboard support: a skip link, visible focus rings, arrow-key navigation in
  the calendar grid, focus-trapped dialogs that restore focus on close, and
  keyboard alternatives to every drag-and-drop action.
- Interactive targets are at least 24 × 24 CSS pixels (most are 44 × 44); this is
  verified in a real browser by `npm run check:layout`.
- Every chart carries a title, a written numerical summary and an expandable data
  table, and identity is never conveyed by colour alone.
- No horizontal scrolling at iPad portrait or landscape widths (also verified by
  `check:layout`); wide tables and charts scroll inside their own container.
- Dark mode, `prefers-reduced-motion` (plus a manual override), text resizing and
  safe-area insets are all honoured.

Chart colours come from a validated palette: one hue for magnitude, fixed
categorical slots for identity, and reserved status colours for state, with
separately chosen steps for the dark surface rather than an automatic flip.

## Artwork

The decorations are **original, anime-inspired mascots** drawn for this project
(`public/decor/mascot-*.svg`), rendered behind content at 8–15 % opacity with
`aria-hidden` and empty alt text, and switchable per page in
**Settings → Appearance**.

No character art is scraped, bundled or hot-linked. Clearly named placeholder
slots for Naruto, Jujutsu Kaisen, Attack on Titan and Black Clover live in
`public/decor/franchise-placeholders/` — replace those files with artwork you own
or are licensed to use. All motivational microcopy is original; no dialogue from
any series is reproduced. See `public/decor/README.md`.

## Testing

```bash
npm test
```

- **Unit** — task percentages and eligibility rules, macro totals and the
  4/4/9 estimate, pace and speed, MET calories, unit conversion, training volume,
  personal records, non-duplicated active calories, both energy-balance methods,
  target versioning, recurrence rules, timestamp-based timer elapsed time,
  time-zone-aware date arithmetic, and CSV escaping.
- **Streaks** — day qualification for each condition, rest/excused handling, the
  unfinished-today rule, longest-streak tracking, per-module streaks, and
  recalculation after a historical edit.
- **Persistence** — first-run defaults, reload survival, edits and deletes that
  leave other days untouched, export → clear → re-import equivalence, invalid and
  duplicate record handling, and encrypted-backup round-trip.
- **End-to-end (real UI)** — adding a task, reloading, completing it; logging food
  without double counting; opening a calendar date and seeing the full record;
  adding a future-dated target that leaves today unchanged.
- **Layout** — `npm run check:layout` drives Chromium across four viewports and
  eight routes, failing on horizontal overflow or undersized targets.

## Deployment

Any static host works — the build output in `dist/` is plain files. Serve it over
HTTPS so the service worker and "Add to Home Screen" work.

Send these response headers (a `<meta>` tag cannot set `frame-ancestors`, and
these belong at the edge anyway):

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()
Strict-Transport-Security: max-age=63072000; includeSubDomains
```

To host under a sub-path, set `base` in `vite.config.ts`; every asset reference
already uses `import.meta.env.BASE_URL`.

## Optional private cloud sync

Not enabled in this build, and the app is complete without it. If you want a
private sync/backup target, `supabase/migrations/0001_init.sql` contains a ready
schema with:

- one owner column (`user_id`) referencing `auth.users`, on every row;
- row-level security **enabled and forced**, with separate select / insert /
  update / delete policies that each check `auth.uid()` — never a hidden UI route;
- server-side triggers that set ownership and timestamps, so a client cannot
  claim another user's row or backdate a record;
- payload size and store-name constraints;
- a **private** storage bucket for exported backups, readable only by its owner.

Then:

1. Put the project URL and **anon** key in `.env` using the names in
   `.env.example`, and set `VITE_ENABLE_CLOUD_SYNC=true`.
2. Keep `SUPABASE_SERVICE_ROLE_KEY` **server-side only** — never prefix it with
   `VITE_`, never ship it to the browser.
3. Use single-user email or passkey authentication, require HTTPS, rate-limit the
   auth routes, and validate writes server-side as well as in the client.
4. Sign-out and automatic-lock controls already exist in Settings.

## Acceptance tests

| # | Requirement | Where it is covered |
| --- | --- | --- |
| 1 | Add, edit, complete, delete a task; reload; state remains | `tests/app.test.tsx`, `tests/persistence.test.ts` |
| 2 | Crossing midnight or changing date adds a new day without erasing previous days | midnight rollover in `AppStore.tsx`; `persistence.test.ts` |
| 3 | A target effective tomorrow leaves past analyses unchanged | `calculations.test.ts`, `app.test.tsx` |
| 4 | Itemised or quick-total nutrition, never double counted | `calculations.test.ts`, `app.test.tsx` |
| 5 | Gym, run and steps; pace, volume and non-duplicated active calories | `calculations.test.ts` |
| 6 | Either expenditure method, clearly labelled everywhere | `calculations.test.ts`; method shown beside every figure |
| 7 | Study timer survives backgrounding via stored timestamps | `calculations.test.ts` |
| 8 | Any calendar date opens its full daily record | `app.test.tsx` |
| 9 | Editing a historical entry recalculates summaries and streaks | `streaks.test.ts` |
| 10 | Analytics filters across ranges match the underlying records | `analytics.ts` + chart data tables |
| 11 | Export, clear, re-import recovers equivalent records | `persistence.test.ts` |
| 12 | Works offline and keeps locally saved records | `public/sw.js`, IndexedDB persistence |
| 13 | Comfortable on iPad portrait and landscape, no overflow | `npm run check:layout` |
| 14 | Cloud sync isolation | not enabled; RLS policies supplied in `supabase/` |
