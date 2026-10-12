# Security & Row Level Security

## Model
- **Authentication:** Supabase Auth (email + password). Passwords are hashed by Supabase and never handled or stored by this app.
- **Authorisation:** PostgreSQL **Row Level Security (RLS)** on every table. The browser uses only the anon key, so every request runs as the signed-in user, and the database filters rows by `auth.uid()`. Hiding things in the frontend is a convenience, not the protection.
- **Secrets:** only the Supabase URL and anon/publishable key are in the browser (`assets/js/env.js`). `config.js` refuses to run if it detects a `service_role` or `sb_secret_` key.

## Policies (002_security_and_functions.sql)
| Tables | Rule |
|---|---|
| `profiles` | Select and update only your own row (`id = auth.uid()`). Rows are created by a trigger at sign-up. |
| All private tables (`user_settings`, templates, schedule, sessions, exercises, sets, records, suggestions, nutrition, water, measurements, photos, achievements earned) | Select, insert, update and delete only where `user_id = auth.uid()`. Inserts must carry your own id. |
| `exercises`, `foods` | Everyone signed in can read the shared library (`user_id is null`). You can add, edit and delete only your own custom items. |
| `achievements` | Read-only definitions. |
| `anon` role | No table access at all. |

**Defence in depth.** Child tables use composite foreign keys such as `(session_id, user_id)`, so a row can't be attached to another person's parent even with a guessed id. A `CHECK` ensures each photo path starts with its owner's id.

## Storage (003_storage.sql)
- The `progress-photos` bucket is **private**, with an 8 MB limit and image types only.
- Policies allow read, upload, update and delete only inside the folder named after your user id.
- Images are displayed through signed URLs that expire after 10 minutes (1 hour for the export page).

## Functions
- `handle_new_user()` (trigger, security definer): creates the profile, settings and starter program. Errors never block sign-up.
- `ensure_my_program()`: callable by signed-in users, and acts only on the caller.
- `delete_my_account()`: deletes the caller's auth user, which cascades to every table. The app first removes the user's photo files through the Storage API.
- `bootstrap_program()`: callable only internally. Execute permission is revoked from the anon and authenticated roles.

## Data integrity
- **One active workout at a time:** partial unique index.
- **A scheduled workout can only be completed once:** partial unique index on `(user_id, planned_date, name)` where status is completed. This prevents duplicate streak credit.
- **Validation:** CHECK constraints on ranges such as reps, weights, measurements, times and text lengths, mirrored by validation in the forms.
- **Retry safety:** client-generated UUIDs make offline retries idempotent (upserts), so dropped connections never create duplicates.

## Verified
`tests/db/rls_isolation_test.sql` runs on real PostgreSQL with Supabase-style roles. It checks that:
- another user cannot read, update or delete sessions, sets, measurements, profiles or photo objects
- forged `user_id` inserts are rejected
- attaching rows to someone else's session fails
- uploading into someone else's folder fails
- duplicate completions are rejected
- signed-out visitors have no access
- account deletion removes everything for that user and nothing else

**21/21 checks pass.** After deploying, repeat step 14 of the setup guide against your live project.

## Browser hardening
`.htaccess` / `_headers` set HSTS, a Content-Security-Policy that allows only your site, jsDelivr, Google Fonts and `*.supabase.co`, plus `X-Frame-Options: DENY`, `nosniff` and a strict referrer policy. All user text is HTML-escaped before rendering. CSV exports neutralise spreadsheet formula injection.

## If a key leaks
Rotate it in Supabase → Project Settings → API. Then update `env.js` (anon key) or wherever the secret was used.
