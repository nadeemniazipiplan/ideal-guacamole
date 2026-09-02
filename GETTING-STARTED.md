# Getting started, step by step

A first-hour walkthrough: get it running, get it on your iPad, set it up, and use
it daily. The [README](README.md) is the reference manual; this is the checklist.

- [Part 1 — Run it on your computer](#part-1--run-it-on-your-computer) (5 min)
- [Part 2 — Put it online so the iPad can use it](#part-2--put-it-online-so-the-ipad-can-use-it) (6 clicks)
- [Part 3 — Install it on the iPad](#part-3--install-it-on-the-ipad) (2 min)
- [Part 4 — Set up your profile and targets](#part-4--set-up-your-profile-and-targets) (10 min)
- [Part 5 — A normal day](#part-5--a-normal-day)
- [Part 6 — A normal week](#part-6--a-normal-week)
- [Part 7 — Backups](#part-7--backups-do-not-skip-this)
- [Troubleshooting](#troubleshooting)

---

## Part 1 — Run it on your computer

**Step 1.** Install [Node.js 20 or newer](https://nodejs.org) if you do not have it.
Check with:

```bash
node --version
```

**Step 2.** Get the code and install its dependencies:

```bash
git clone https://github.com/nadeemniazipiplan/ideal-guacamole.git
cd ideal-guacamole
git checkout claude/personal-life-dashboard-g7l7ia
npm install
```

**Step 3.** Start it:

```bash
npm run dev
```

Open the printed address (usually <http://localhost:5173>). You should see the
**Today** page with a "Let's set this up" panel. That is the whole app — no
signup, no configuration, no internet needed.

**Step 4 (optional).** See it with data in it before entering anything real:

> **Settings → Backup → Load demo data**

Every demo record is named `DEMO` and its id starts with `demo-`. When you are
finished looking around, **Remove demo data** deletes exactly those records and
nothing else. Do this before you start entering real records so your history
stays clean.

**Step 5 (optional).** Confirm everything works on your machine:

```bash
npm test          # 64 unit and integration tests
npm run build     # type-check + production build
```

---

## Part 2 — Put it online so the iPad can use it

The iPad needs an `https://` address to install the app properly and work
offline. The repository is already set up to publish itself — **this takes six
clicks and no typing.**

### The six clicks

1. Open <https://github.com/nadeemniazipiplan/ideal-guacamole> and sign in.
2. Click **Settings** (the tab along the top of the repository, on the right).
3. In the left-hand menu, click **Pages**.
4. Under **Build and deployment → Source**, change the dropdown from
   *Deploy from a branch* to **GitHub Actions**.
5. Go to the **Actions** tab (top of the repository), click
   **Deploy to GitHub Pages** in the left list, then **Run workflow →
   Run workflow**.
6. Wait about two minutes for the green tick.

Your app is now live, permanently, at:

**https://nadeemniazipiplan.github.io/ideal-guacamole/**

That address does not change. Every future push to this branch rebuilds and
redeploys it automatically — the tests have to pass first, so a broken build
never replaces a working site.

> The repository is public, so GitHub Pages is free. Being public means anyone
> can read the *code*; it does **not** expose your records. Everything you enter
> is stored in your own browser and never leaves your device.

### Alternatives

- **Cloudflare Pages / Netlify / Vercel** — connect the repository, set build
  command `npm run build` and output directory `dist`, branch
  `claude/personal-life-dashboard-g7l7ia`, no environment variables.
- **On your own computer, same Wi-Fi** — `npm run build` then
  `npm run preview -- --host`, and open the printed `192.168.x.x:4173` address
  on the iPad. Fine for a quick look, but offline mode will not work over plain
  HTTP.
- **One self-contained file** — `npm run build:single` writes
  `dist-single/life-dashboard.html`, the whole app in a single file you can host
  anywhere that serves one page. It trades away offline support and Home Screen
  installation, which both need separate files.

---

## Part 3 — Install it on the iPad

**Step 1.** Open your HTTPS address in **Safari** (not Chrome — only Safari can
add a real Home Screen app on iOS).

**Step 2.** Tap the **Share** button, scroll down, tap **Add to Home Screen**, then
**Add**.

**Step 3.** Close Safari and launch it from the Home Screen icon instead. You now
have a full-screen app that:

- works with no internet at all,
- keeps its data between launches,
- respects the safe-area insets in both orientations,
- can show system notifications (which only work from the Home Screen app on iOS).

> Keep using the Home Screen icon from now on. The Safari tab and the Home Screen
> app can hold **separate** copies of the data on some iOS versions, so pick one
> and stay with it.

---

## Part 4 — Set up your profile and targets

Open **Settings** and work through the tabs in this order.

### Step 1 — Profile

- **Time zone** — auto-detected, falling back to Asia/Karachi. Everything hangs off
  this: which day an entry belongs to, when midnight rolls over, how streaks count.
- **Week starts on** — Monday by default.
- **Body weight** — used by the MET calorie estimates, so make it roughly right.
- **Units** — kg/lb, km/mi, and the matching pace unit.
- **Track water / body weight per day** — off by default; switch on if you want
  those fields on the Nutrition page.

### Step 2 — Expenditure method (still on the Profile tab)

This decides how your deficit or surplus is worked out. Pick the one that matches
the number you already have:

| | Choose this if… | The app then does |
| --- | --- | --- |
| **Method A** — baseline + exercise | your daily figure **excludes** exercise | expenditure = baseline + non-duplicated active calories |
| **Method B** — full TDEE | your daily figure **already includes** usual activity | expenditure = TDEE; logged exercise is shown separately, never added twice |

If you are unsure, Method A with a baseline near your resting/maintenance figure
is the safer choice. The method name is printed beside every deficit figure in the
app, so you always know which one produced it.

### Step 3 — Targets

Open **Targets → New target version** and fill in:

- calories, protein, carbohydrate, fat, fibre
- steps, study minutes, water
- **baseline expenditure** (Method A) *or* **full TDEE** (Method B) — fill in the
  one your method uses
- weekly workouts and weekly running distance

Set **Effective from** to today for your first version.

> Later, when you change a target, add a **new version** dated from when it should
> apply. Past days keep the targets that were in force at the time, so last month's
> analysis never silently changes.

### Step 4 — Streaks

Switch on only the conditions you actually want to be judged on. Starting with two
or three is more useful than all six:

- All mandatory tasks completed
- Calories within a band around target (default 85–110 %)
- Protein minimum
- Step target
- Workout or run completed
- Study minutes target

Then set your **planned rest days** (e.g. Sunday) and decide whether a rest day
*counts as a success* or is *skipped* when counting the streak.

### Step 5 — Reminders

Set quiet hours, the minimum gap between reminders, and which modules can nag you.
System notifications require one deliberate tap on **Allow system notifications** —
the app never asks on its own and never re-prompts. On iOS this only works from the
Home Screen app; otherwise reminders appear inside the app, which needs no
permission at all.

### Step 6 — Appearance (optional)

Light/dark/system, reduced motion, and a per-page colour and decoration editor.
To use your own artwork, drop files into `public/decor/franchise-placeholders/`
and pick them here.

### Step 7 — Screen lock (optional)

**Privacy → Set a four-digit PIN**, plus an auto-lock delay. Be clear on what this
is: a *screen lock*, not encryption. It stops someone picking up your iPad and
reading the page; it does not protect the stored file. For real protection, use the
device passcode and the encrypted backup option.

---

## Part 5 — A normal day

**The date selector in the header controls everything.** Whatever date is shown
there is the date every "add" goes to — so you can catch up on yesterday by moving
it back a day first.

**Morning**

1. Open **Today**. The ring is your overall progress; the cards show tasks,
   calories, estimated burn and your deficit/surplus.
2. Check **Still to do** for what is left and anything past its due time.

**Through the day** — use the **+** button (bottom right) from any page:

| Add | Where it lands |
| --- | --- |
| Task | Tasks, on the selected date |
| Food / calories | Nutrition |
| Gym session | Fitness → Gym |
| Run | Fitness → Running |
| Steps | Fitness → Steps |
| Study session | Study |
| Day note / mood | Calendar |

**Setting up recurring tasks (do this once).** On **Tasks → + Add task**, give it a
title, mark it **Mandatory** if it should count towards your streak, and choose a
repeat pattern (every day / selected weekdays / every N days). From then on it
appears automatically on the matching days. Editing it later changes **future**
instances only, unless you explicitly choose "Also update past records".

**Logging food.** Pick one mode per day at the top of the Nutrition page:

- **Itemised foods** — add each item with its calories and macros.
- **Quick day total** — type the whole day in one go.

They are mutually exclusive by design, so calories can never be double-counted. If
your macros do not match your calorie figure, you get a note — and your typed
number is kept exactly as entered.

**Logging exercise.** Enter duration and let the MET estimate do the calories, or
type a manual figure to override it. If something is already counted elsewhere
(a run inside a gym session, steps already inside your TDEE), tick **"already
included in another estimate"** and it stays out of the active-calorie total.

**Studying.** Use **Study → Start timer**. Pause, resume, then **Finish and log** to
turn it into a session. Elapsed time comes from stored timestamps, so you can
background the app, lock the iPad, or reload — nothing is lost.

**Evening.** Back on **Today**, the **Daily review** lists what your records
actually show for the day. If a day was genuinely off-limits (illness, travel),
open **Calendar**, pick the date, and mark it **Rest day** or **Excused** so it does
not unfairly break a streak.

---

## Part 6 — A normal week

**Any day, any past date:** open **Calendar**, tap a date, and the full record for
that day appears below the grid — tasks with their statuses, calories and macros
against the targets that applied *then*, expenditure and balance with the method
named, training, running, steps, study, and why the day did or did not qualify.
Everything there stays editable, and correcting it recalculates the summaries and
streaks immediately.

**Once a week:** open **Analytics**, choose a range (7 / 30 / 90 days, this month,
this year, or custom) and read the **Written review** at the bottom. It is
rule-based and built only from your records: what was achieved, what was missed,
the change from the previous comparable period, your best and hardest day, and two
or three observations. It never claims one thing caused another, and it says
plainly when there is not enough data.

Averages and completion rates count only days that have actually happened, so a
range running into the future is not judged against days yet to come.

**Exports:** the same page has per-module **CSV export** for the selected range and
a **Print report** button for a clean printable copy.

---

## Part 7 — Backups (do not skip this)

Your records live in one browser profile on one device. Clearing Safari's website
data, switching browser, or resetting the iPad removes them. There is no server
copy to fall back on.

**Weekly, from Settings → Backup:**

1. **Export full JSON backup** → save it to iCloud Drive, Google Drive, or wherever
   you keep things.
2. If it will sit in cloud storage, use **Export encrypted backup** with a
   passphrase of 8+ characters instead. It is AES-GCM with a PBKDF2-derived key —
   and if you lose the passphrase, the file is unrecoverable. There is no reset.

Settings shows the date of your last export, so you can see it going stale.

**To restore, or to move to a new device:** *Import a backup…*, choose the file,
then review the preview — it shows exactly how many records would be added,
updated and skipped as invalid, per store, and writes nothing until you confirm.
Choose **Merge** to keep what is already there, or **Replace** to overwrite (and
use *Back up current data first* on that screen before you do).

---

## Troubleshooting

**"Storage unavailable" on launch.** You are in a private window, or the browser is
set to block site data. Use a normal window and allow site data for the page.

**The iPad app shows different data from the Safari tab.** They are separate
storage areas on some iOS versions. Export from the one that has your records,
then import into the one you intend to keep using.

**Offline does not work.** The service worker only registers over HTTPS (or on
`localhost`). Deploy per Part 2, Route B.

**Notifications never appear on iOS.** iOS only allows web notifications from an
app added to the Home Screen. Add it, then tap *Allow system notifications* in
Settings → Reminders. In-app reminders work everywhere regardless.

**A repeating task is missing on an old date.** By design: a template never creates
instances for dates before the template existed, so adding a routine today cannot
retroactively mark last week as missed. Add a one-off task for that date instead.

**A future target changed a past figure.** It should not — that is what target
versions prevent. Check **Settings → Targets** and confirm the version's
*Effective from* date is the one you meant.

**Fonts look plain.** The rounded display font is loaded from Google Fonts; if that
is blocked or you are offline, the app falls back to system fonts. Nothing else is
affected — no other network request is made at runtime.
