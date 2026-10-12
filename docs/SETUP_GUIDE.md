# Setup & deployment guide (beginner friendly)

Each step is labelled with **where** it happens:

- 🖥️ **Your computer**: the project folder, a terminal, or your AI coding tool
- 🗄️ **Supabase**: supabase.com, where the database and logins live
- 🌐 **Hosting panel**: e.g. Hostinger hPanel, plus Cloudflare if your domain's DNS is there

## First, the big picture: two kinds of hosting

Think of the app as a shop.

- **Frontend hosting** is the shop window: the HTML, CSS, JavaScript and images that your browser downloads. These files are the same for every visitor and contain no private data. They go on your subdomain, for example `fit.yourdomain.com`.
- **Backend / database hosting** is the locked stockroom: workouts, meals, photos and accounts. This is Supabase. The browser asks Supabase for data, and Supabase checks who is asking before answering.

Because the stockroom checks every request itself (Row Level Security), it is safe for the shop window to contain the Supabase **anon key**. That key only opens what the signed-in person is allowed to see. The **service_role / secret key** and the **database password** are master keys. They never go in any file you upload. The app refuses to start if it finds a secret key in `env.js`.

---

## 1. Get the project organised 🖥️

Unzip the project somewhere easy, e.g. `C:\Projects\physique-tracker`. Keep the folder structure exactly as it is.

If you use an AI coding tool such as Claude Code, Cursor or VS Code, open this folder in it. You don't need to generate anything: the code is complete. Use the AI tool for changes later, e.g. "add a deadlift to the Legs template". Tell it to keep the existing structure in `README.md`.

## 2. Run it on Windows 🖥️

1. Install **Node.js LTS** from nodejs.org. Accept the defaults.
2. Open the project folder in File Explorer. Click the address bar, type `cmd` and press Enter.
3. Run `npm test`. You should see `# pass 16`.
4. Run `npm start`, then open **http://localhost:5173** in Chrome.

You'll see the landing page. Signing in won't work until steps 3–7 are done.

> Opening `index.html` by double-clicking won't work. Browsers block JavaScript modules from `file://` addresses, so always use `npm start`. The VS Code "Live Server" extension also works.

## 3. Create a Supabase project 🗄️

1. Sign up at **supabase.com**, then click **New project**.
2. Name it, e.g. `physique-tracker`. Generate a strong database password and save it in your password manager. You won't put it anywhere else.
3. Region: choose the closest one, e.g. a Middle East or Europe region.
4. Wait about two minutes for it to finish.

## 4. Create the database (run the migrations) 🗄️

In your project, open **SQL Editor** and click **New query**. For each file below, in this order, open it in Notepad, copy everything, paste it into the editor and click **Run**:

1. `database/migrations/001_schema.sql`
2. `database/migrations/002_security_and_functions.sql`
3. `database/migrations/003_storage.sql`
4. `database/seed.sql`
5. `database/migrations/004_variety_and_time.sql`

Each should end with "Success. No rows returned". Then:

- **Table Editor** should list tables such as `profiles`, `workout_sessions` and `exercise_sets`.
- `exercises` should have 70 rows and `foods` 24.

If a file fails, read the red message. Usually a file was run out of order. All four files are safe to run again.

## 5. Configure sign-in and redirect URLs 🗄️

Go to **Authentication → URL Configuration**.

**Site URL:** `https://fit.yourdomain.com` (your real subdomain).

**Redirect URLs** (add each one):
- `https://fit.yourdomain.com/app.html`
- `https://fit.yourdomain.com/login.html`
- `http://localhost:5173/**` (for testing on your computer)

Then go to **Authentication → Providers → Email**:
- Keep **Email** enabled.
- **Confirm email** on is safer (people must click a link before signing in). Off is more convenient while testing.

**Email sending:** Supabase's built-in sender only allows a few emails per hour. That's fine for testing. For real use, add your own SMTP under **Authentication → Emails → SMTP Settings**. Your hosting email or a service like Brevo or Resend works.

## 6. Private photo storage 🗄️

Step 4 already created a **private** bucket called `progress-photos`, with rules that let each user touch only their own folder. To check: open **Storage**. The bucket should show as *Private*. Never switch it to public.

## 7. Add your keys to the app 🖥️

1. In Supabase, open **Project Settings → API**. Copy the **Project URL** and the **anon public** key (newer projects call it the *publishable* key). Don't copy `service_role` or any *secret* key.
2. In the project folder, copy `assets/js/env.example.js` to `assets/js/env.js`.
3. Edit `env.js`:

```js
window.FITAPP_ENV = {
  SUPABASE_URL: 'https://abcd1234.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...your anon key...',
  SITE_URL: 'https://fit.yourdomain.com',
};
```

While testing locally, set `SITE_URL` to `http://localhost:5173` and change it back before uploading. `env.js` is listed in `.gitignore`, so it won't end up in a public code repository.

Refresh http://localhost:5173/login.html. You should now see the sign-in form.

## 8. Deploy the frontend 🌐 (Hostinger)

1. **hPanel → Domains → Subdomains**: create `fit` (or any name). Note the folder it creates, e.g. `public_html/fit`.
2. **hPanel → Files → File Manager**: open that folder and upload **all** project files and folders, keeping the structure. File Manager can upload a zip and extract it in place.
   - Include `.htaccess`. It's a hidden file, so enable "show hidden files" if you can't see it.
   - Uploading `database/`, `tests/` and `docs/` is optional. `.htaccess` blocks web access to them anyway.
3. Make sure `assets/js/env.js` is uploaded with your **live** `SITE_URL`.

Other hosts work the same way: Netlify and Cloudflare Pages use the `_headers` file instead of `.htaccess`. Drag the folder onto their dashboard and set the publish directory to the project root. There is no build command.

## 9. Point the subdomain at the hosting 🌐

- **DNS managed by Hostinger:** creating the subdomain in step 8 is enough.
- **DNS managed by Cloudflare:** in Cloudflare → **DNS**, add a record for `fit`:
  - Use the same type and target as your main domain's Hostinger record. Usually that's an **A** record with Hostinger's server IP, shown in hPanel → Hosting → Details.
  - Proxy (orange cloud) on is fine.

DNS changes usually take a few minutes, occasionally up to a few hours.

## 10. Turn on HTTPS 🌐

- **Hostinger:** hPanel → Security → **SSL**. Install the free SSL for `fit.yourdomain.com`.
- **Cloudflare in front:** SSL/TLS mode **Full (strict)**, after Hostinger's certificate is active. "Flexible" can cause redirect loops with the included `.htaccess`.

Visit `http://fit.yourdomain.com`. It should jump to `https://` automatically. Logins, phone installation and the camera upload all require HTTPS.

## 11. Use it on your phone 📱

Open `https://fit.yourdomain.com` on the phone, then:

- **iPhone (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** menu → *Install app*.

It now opens full-screen like a normal app and keeps the screen awake during workouts.

## 12. Create the first account

1. Tap **Create account** and enter a name, email and password.
2. If email confirmation is on, tap the link in the email. Check spam.

New accounts automatically get the 5-day split: Push on Saturday, Pull + Abs on Sunday, Legs on Monday, Upper + Abs on Tuesday, Lower on Wednesday, and rest on Thursday and Friday. Timezone is Asia/Qatar, the gym window is 4:30–6:00 PM, and the targets are 140–160 g protein and 2,500–2,650 kcal.

**Optional, for Asif's account only** 🗄️: open `database/seed_asif_profile.sql`, replace the email placeholder with the email he signed up with, and run it in the SQL Editor. It fills in his name, profession, goal, height, age and starting weight of 73.4 kg. Everything stays editable in **Profile & Settings**, including the program start date.

## 13. Check that saving really works

1. Go to **Measurements**, enter a weight and waist, and save. The pill at the top should go *Saving… → Saved*.
2. **Workout → Start Workout**. Enter weight and reps for one set and tick it.
3. Close the browser completely, reopen the app, then go to **Workout → Resume**. The set should still be there.
4. In Supabase → **Table Editor → exercise_sets**, your set is visible as a row.
5. Finish the workout. It appears in **Progress → History**, and the streak shows 1.

## 14. Test two separate accounts

1. Open a private/incognito window and create a second account with a different email.
2. Log a measurement and a food entry there.
3. Back in the first account, none of it appears, and the first account's data doesn't appear in the second.

This is enforced by the database, not just hidden by the app. For the technically curious, `npm run test:db` (Linux with PostgreSQL) runs 21 automated isolation checks.

## 15. Backups and exports

- **Your own records:** **Profile → Export & privacy → Download full backup (JSON)**, or CSV per table for Excel. Do this monthly.
- **Whole database:** paid Supabase plans include daily backups (Project Settings → Database → Backups). On the free plan, use per-user exports. A technical helper can also run `pg_dump` with the connection string from Project Settings → Database, entered on their own computer only.
- **Restore:** an individual JSON export is a readable record of your history. A full `pg_dump` restores with `psql` into a fresh project after running the migrations.

## 16. Troubleshooting

| What you see | Likely cause → fix |
|---|---|
| "Connect your database" screen | `env.js` missing or still has `YOUR-` placeholders → step 7 |
| "Stopped: env.js contains a secret key" | You pasted `service_role`/secret → use the anon/publishable key, then **rotate** the secret key in Supabase |
| Blank page locally | Opened via `file://` → use `npm start` |
| Sign-up email never arrives | Supabase default email limit or spam folder → wait, check spam, or configure SMTP (step 5) |
| Email link opens localhost or the wrong site | Site URL / Redirect URLs wrong (step 5) or `SITE_URL` in `env.js` |
| "Couldn't load this… relation does not exist" | Migrations not run, or run out of order → step 4 |
| No workout templates after sign-up | `seed.sql` ran after the account was created → just reload the app, it rebuilds them |
| Pill says "Sign in again" | Session expired → sign in. Queued changes on that phone are kept and sent afterwards |
| Pill says "Offline — N waiting" | No signal → keep logging. It syncs automatically when you're back online |
| Photo upload fails | File over 8 MB or unsupported type, or `003_storage.sql` not run |
| Redirect loop on the subdomain | Cloudflare SSL set to Flexible → use Full (strict) |
| Changes to files not showing | Old app version cached → reload twice, or close and reopen the installed app |
