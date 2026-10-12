# Acceptance tests

**Status key:**
- ✅ **Automated** — verified by tests in this repository
- 🔎 **By hand** — do these on your live site after deploying (setup guide steps 11–14)

| # | Requirement | Status | How |
|---|---|---|---|
| 1 | Correct workout for today's Qatar date | ✅ | `npm test`: 21:30 UTC is the next day in Doha; weekday mapping |
| 2 | Thursday and Friday are rest days | ✅ | `npm test`; smoke test calendar statuses |
| 3 | Individual set weight and rep tracking | ✅ | Smoke test: set saved as its own row (22.5 kg × 12) |
| 4 | Saved workouts persist after reload | ✅ / 🔎 | Smoke test re-renders from stored data; 🔎 close the browser and reopen (step 13) |
| 5 | Unfinished workouts can be resumed | ✅ | Smoke test: leave, return, set still filled |
| 6 | Previous exercise performance loads | ✅ / 🔎 | Query covered by smoke test; 🔎 "Last time" line shows on the second session |
| 7 | Nutrition totals calculate correctly | ✅ | `npm test`: 4 eggs + 150 g chicken = 71.7 g protein; smoke test quick-add |
| 8 | Streaks ignore duplicate and unfinished workouts | ✅ | `npm test` + database unique index test |
| 9 | Multiple users have isolated records | ✅ / 🔎 | `npm run test:db` 21/21; 🔎 step 14 on live Supabase |
| 10 | Photos remain private | ✅ / 🔎 | Storage policy tests; 🔎 open a signed photo link after 10 minutes — it expires |
| 11 | Charts use real database data | ✅ | Charts receive only queried rows; empty states when nothing is logged |
| 12 | Exports contain the user's actual records | 🔎 | Download JSON and check your workouts are in it |
| 13 | Mobile and desktop layouts work | 🔎 | Check on your phone and laptop (bottom nav vs sidebar) |
| 14 | Broken media links have fallbacks | ✅ | Global image error handler swaps in the illustration |
| 15 | Offline changes are not silently lost | ✅ / 🔎 | Queue design (persisted, idempotent, "Saved" only after server confirms); 🔎 airplane mode mid-workout, log a set, reconnect |
| 16 | No dead buttons or placeholder features | ✅ / 🔎 | Smoke test renders all 13 pages with no console errors; 🔎 tap through each page once |
| 17 | Footer text correct, year updates | ✅ | Smoke test checks the exact text with the current year |
| — | Progression suggestions only with confirmation | ✅ | `npm test`; weights are pre-filled only after Accept or Edit |
| — | Landing page scroll sections render | ✅ | `tests/smoke/landing.mjs` |

| — | Exercises rotate between sessions | ✅ | `npm test` (bench → dumbbell bench → machine press); smoke test checks the started session differs from the template |
| — | Workout fits the available time and stays achievable | ✅ | `npm test` (time fit, set trimming, pace, cap); smoke test checks extras appear and can be added |
| — | Weak connection never shows the setup screen | ✅ | `tests/smoke/boot.mjs` |

**Latest run:** 25/25 unit tests, 40/40 end-to-end smoke checks, 2/2 boot checks, 8/8 landing checks, 26/26 database checks.
