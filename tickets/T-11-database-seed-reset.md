# T-11 · Database schema, seed state and reset

| Field | Value |
|---|---|
| Wave | 1: Scaffold, data, seed |
| Demo importance | VISIBLE (charts, PRs, targets and the brief all rely on it) |
| Size | M |
| Depends on | T-10, T-12 (food IDs), T-04 (DB library) |
| Owns | `db/`, `data/exercises/`, `data/program/` |
| Approval needed | Only to run against Aurora (it writes data to an AWS resource) |
| Status | DONE (the T-21 trim and T-24 PR cross-checks run in those tickets) |

## Goal
Create:
- the database schema
- the exercise list and the pre-set program
- a deterministic 6-week history for the demo user
- a reset that restores the same state in seconds

## Why it matters for the demo
- Charts (S6), PRs (S3), adjusted targets and the morning brief (S5) need history on day one.
- Every take must start from the same state, so retakes match.

## Read first
- [DESIGN.md §6 Data model](../DESIGN.md#6-data-model), [§8 Demo controls](../DESIGN.md#8-demo-controls), D8, D19, D20
- [DEMO-SCRIPT.md](../DEMO-SCRIPT.md) S3 and S5: the seed must produce the PR and the calorie trim those scenes show.

## Tasks
1. **Schema.** Write it with the library chosen in T-04 (Drizzle is the suggestion), covering every table in DESIGN.md §6. Write migrations that run on local Postgres and on Aurora through the Data API.
2. **`data/exercises/exercises.json`.** About 60 exercises: barbell, dumbbell, machine, bodyweight and cardio. Each one has:
   - `id`, `name`
   - `aliases` (for example "bench" and "flat bench" → barbell bench press; "OHP" → overhead press)
   - `type` (strength or cardio), `muscle`, `equipment`
   - `alternatives`: ordered swap options, used by T-24
   - An optional source is free-exercise-db (public domain) on GitHub.
   - T-23 and T-24 read this file. They send alias changes through the orchestrator.
3. **`data/program/program.json`.** The pre-set 4-day program (D19): Push, Pull, Legs, Upper.
   - Each exercise has sets, rep range (min and max) and rest seconds.
   - Push day starts with barbell bench press, and includes overhead press (used for the S3 swap).
   - T-24 reads this file.
4. **`db/seed/persona.json`.** The demo user. Use placeholder values the user can edit:
   - sex, birth year, height, start weight
   - goal = cut, activity level
   - preferences: desi food, high protein, dislikes, full gym
   - check-in weekday
5. **`db/seed/generate.ts`**, with a fixed random seed. It creates 42 days of history, ending the day before demo day:
   - **Meals:** 3–4 entries a day, using T-12 foods (a realistic mix of desi and generic dishes).
     - Intake stays near target, with natural variation.
     - Make protein low on rest days. This gives the brief its insight.
   - **Water** on most days.
   - **Body weight** daily, with noise.
     - The trend is −0.3 to −0.5 kg a week.
     - It slows in the last week, so the next check-in trims calories (S5).
   - **Workouts:** 4 days a week, following `data/program/program.json`.
     - Use double progression.
     - Bench press estimated 1RM rises over the 6 weeks.
     - Set the last bench session so the S3 set (for example 80 kg × 8) is a new PR. Agree the exact numbers with T-24 and the Demo Monitor.
   - **Targets:** the initial targets, plus weekly adjustments.
   - **Demo clock:** 13:00 on demo day (S1 is lunch). Set the check-in weekday to the day after demo day, so "skip to morning" triggers the weekly check-in.
   - **Cached overnight output:** if `jobs/overnight/cache/overnight-cache.json` exists (T-27 writes it), load it.
6. **`db/reset.ts`.** It truncates every user table, reloads the seed and sets the demo clock. Targets: under 3 s locally, under 10 s on Aurora.
7. **Scripts:**
   - `npm run db:migrate`
   - `npm run db:reset`
   - `npm run db:hash` (a hash per table)
   - `npm run db:report`: weight trend, average intake, bench e1RM by week, last check-in
8. **Snapshot test.** Two resets in a row produce identical hashes.

## Acceptance criteria
- [ ] Migrations run on local Postgres and on Aurora.
- [ ] Two resets produce identical table hashes.
- [ ] Reset time: under 3 s locally, under 10 s on Aurora.
- [ ] `db:report` shows rising bench e1RM, a weight trend that slows in the last week, and protein lower on rest days.
- [ ] The T-21 engine on this seed trims calories by 100–200 kcal at the next check-in (checked together with T-21).
- [ ] The S3 scripted set is a PR on this seed (checked together with T-24).

## Test scenario
1. Run `npm run db:reset && npm run db:hash > a.txt`.
2. Run `npm run db:reset && npm run db:hash > b.txt`.
3. Run `diff a.txt b.txt`. Expect no difference.
4. Run `npm run db:report`. Expect the trends listed in the acceptance criteria.

## Result
**Status: REVIEW.** Four of the six criteria pass. The other two need code that doesn't exist yet (T-21 and T-24), so the seed is set up for them but not yet proven against them.

**Built:**
- **Schema** (`db/src/schema.ts`, Drizzle): all 20 tables from DESIGN §6.
- **Migrations** (`db/migrations/0000–0002`):
  - pg_trgm, plus an IMMUTABLE `dayform_aliases_text()` so `foods.aliases` can carry a trigram index.
  - The generated schema.
  - The catalog fields T-13 asked for.
- **Data:** `data/exercises/exercises.json` (66 exercises; aliases are unique and every alternative exists) and `data/program/program.json` (4 days, with weekdays).
- **Seed:** `db/seed/{persona.json, placeholder-foods.json, generate.ts, README.md}`.
- **Scripts:** `db/src/{client,migrate,reset,hash,report}.ts`, plus the test `db/test/reset.test.ts`.
- **Numbers** are in `db/seed/README.md`, which is the single place to read them.

**Verification (2026-10-22):**
- **Local** (`dayform-pg`): `db:migrate` passes. `db:reset` takes 284–393 ms of DB work and 1.6 s wall including tsx start-up. Reset, hash, reset, hash, then `diff`: no difference. `npm test -w @dayform/db`: 1 passed. `npm test -w @dayform/data`: 4 passed.
- **Aurora** (`--target aurora`, approved): migrations applied in 5.0 s. Reset takes 2.4–3.0 s of DB work and 4.3 s wall. Two resets give identical hashes, and the **Aurora hashes equal the local ones**.
- **`db:report`:**
  - Bench e1RM 88.7 → 91.8 → 92.5 → 95.0 → 98.2 → 98.7.
  - S3 target 80 × 8 = e1RM 101.3, a NEW PR (+2.6 kg).
  - Weight by week: −0.46, −0.43, −0.43, −0.33, −0.26 kg. The check-in window to 2026-10-23 reads −0.21 kg against a −0.4 plan.
  - Protein: 162 g on training days, 104 g on rest days. Intake averages about 2337 kcal against a 2360 target.

**Acceptance:**
- [x] Migrations run locally and on Aurora.
- [x] Two resets give identical hashes.
- [x] Reset time is under 3 s locally and under 10 s on Aurora.
- [x] `db:report` shows the three trends.
- [ ] Next check-in trims 100–200 kcal (needs T-21).
- [ ] The S3 set is a PR (seed side is shown; needs T-24's detector).

**Deviations:**
- **Program days have fixed weekdays:** Mon pull, Wed upper, Fri push, Sat legs. This puts demo day on push and the check-in morning on legs, as S5 needs.
- **Reset reloads more than user tables:** it also reloads exercises, program and `catalog_items` (from `data/catalog/catalog.json`, per the orchestrator). It leaves `foods` alone.
- **Next targets are pre-seeded:** `next_targets` for 2026-10-23 is filled in, as if the overnight job of 10-22 had run.
- **`demo_clock` has `set_at`:** `clock.now()` = `demo_now` + (wall time − `set_at`).

**Fallbacks used:** none. Foods come from T-12's files. `placeholder-foods.json` is only a fallback and is not used on the current data.

**Orchestrator close-out (2026-10-22):** verified two resets → identical hashes (19 tables), reset ~3 s locally, db:report shows bench e1RM 88.7→98.7 (80×8 = PR +2.6), weight loss slowing to −0.21 kg/week, protein 104 g rest vs 162 g training. Decisions: fixed weekdays stand (demo day = push, next morning = legs); seed adds a demo-day breakfast and weigh-in; overnight cache shape to be confirmed by T-27.
