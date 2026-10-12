# Physique 24 — Asif's 6-Month Physique Tracker

A multi-user fitness web app for a 24-week training plan: set-by-set workout
logging, an exercise library, nutrition and water tracking, body measurements,
private progress photos, streaks, achievements and progress charts.

- **Frontend:** HTML, CSS and vanilla JavaScript modules (no build step), Chart.js, Lucide icons, installable as a phone app (PWA).
- **Backend:** Supabase — PostgreSQL database, authentication, private file storage, Row Level Security.
- **Footer:** "Developed by Asif Mohamed | All Rights Reserved." with the year updating automatically.

**New to this? Start with [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md).** It walks through every step from an empty folder to the app running on your subdomain.

## What's where

```
index.html            Landing page (scroll-animated story of the plan)
login.html            Sign in, create account, reset password
app.html              The app itself (all pages load inside it)
manifest.json         Phone-app (PWA) settings
service-worker.js     Offline support — never caches your data, only app files
.htaccess / _headers  HTTPS + security headers for Apache/Hostinger or Netlify/Cloudflare Pages
assets/css/           app.css (design system), landing.css
assets/js/
  env.example.js      Copy to env.js and add your Supabase URL + anon key
  app.js              App shell, navigation, router
  landing.js          Landing page scroll engine
  login.js            Authentication screens
  core/               Supabase client, data layer (api.js), offline save queue (sync.js), UI helpers, charts, media
  logic/              Pure, unit-tested logic: dates (Qatar time), schedule, streaks, progression, records, nutrition,
                      program, planner (exercise rotation + fitting workouts to your time)
assets/vendor/        Supabase, Chart.js and Lucide served from your own site (no outside CDN needed to start the app)
  pages/              One file per page: dashboard, today, active workout, library, history, nutrition,
                      progress, measurements, photos, streaks, timeline, settings, privacy
database/
  migrations/001_schema.sql               Tables, keys, indexes, constraints
  migrations/002_security_and_functions.sql  Row Level Security, new-user setup, account deletion
  migrations/003_storage.sql              Private photo bucket + policies
  migrations/004_variety_and_time.sql     70-exercise library with variation groups, time + rotation settings
  seed.sql                                Exercise library, food library, achievements
  seed_asif_profile.sql                   Optional: fill in Asif's profile after he registers
docs/                 Setup guide, security, media, acceptance tests
tests/                Logic unit tests, database security tests, headless end-to-end smoke test
```

## Quick start (if you've done this before)

1. Create a Supabase project. In the SQL Editor run `001`, `002`, `003`, `seed.sql`, then `004`.
2. `cp assets/js/env.example.js assets/js/env.js` and fill in the project URL and **anon** key.
3. In Supabase → Authentication → URL Configuration, set the Site URL and add redirect URLs.
4. `npm start` and open http://localhost:5173.
5. Upload every file (including `.htaccess`) to your subdomain's folder.

## Tests

| Command | What it checks |
|---|---|
| `npm test` | 25 unit tests: Qatar date, weekday→workout, rest days, reschedules, streaks, progression, PRs, nutrition, units, exercise rotation, time fitting, pace and achievable-plan cap |
| `npm run test:smoke` | Runs the real app headlessly against fixture data (40 checks): every page renders; rotated, time-fitted plan; start → log sets → add an extra → resume → finish; nutrition, water, measurements; calendar; plus boot behaviour on a bad connection |
| `npm run test:db` | Linux with PostgreSQL only: runs all migrations and 26 checks (two-user isolation, library, safe re-runs) |

See [docs/ACCEPTANCE_TESTS.md](docs/ACCEPTANCE_TESTS.md) for the full checklist, including the checks you do by hand on your live site.

## How workouts are planned

Each template slot belongs to a **variation group** (e.g. flat chest press = barbell bench, dumbbell bench, machine press). Every time you repeat a workout, each slot moves to the next variation, so Push day alternates exercises instead of repeating the same five. In Settings you can rotate everything, keep the main lifts fixed (better for tracking strength), or switch rotation off.

Each session is then **sized to your time** (Settings → Time in the gym, or your gym window):
- realistic estimates: about 3 minutes to set up each exercise, 1 minute per set, plus the rest between sets, warm-up and cool-down
- main lifts are kept first and accessories trimmed first; an accessory can drop from 3 to 2 sets before it's removed
- the plan **learns from you**: if your workouts take longer than estimated, it plans fewer exercises; if you've been leaving exercises unfinished, it plans about as many as you actually finish
- anything that doesn't fit appears as **"If you have time"** quick-add buttons during the workout

## Known limitations

- **No exercise photos or videos are bundled.** No media links were invented. Each exercise shows an illustration plus a "Find demo videos" search. Add licensed media with [docs/MEDIA.md](docs/MEDIA.md).
- **Food values are typical estimates**, labelled as such. Check package labels for exact numbers.
- **Startup needs a connection once.** The app files now load from your own site, and it retries automatically on a weak signal instead of showing a setup error. After the first visit, the installed app opens even offline.
- **Offline:** sets, food, water and exercise edits made offline are queued and synced later. Starting a new workout, finishing one, uploading photos and changing settings need a connection.
- **Visual review:** layouts were checked through headless tests, not in a real browser on every device. Run the "by hand" section of the acceptance checklist on your phone.
- Supabase's built-in email sender is rate-limited. For more than a few sign-ups an hour, set up custom SMTP (see the setup guide).
- Calorie and protein targets are starting estimates, not medical advice.
