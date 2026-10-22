# T-11 · Database schema, seed state and reset

| Field | Value |
|---|---|
| Wave | 1: Scaffold, data, seed |
| Demo importance | VISIBLE (charts, PRs, targets and the brief all rely on it) |
| Size | M |
| Depends on | T-10, T-12 (food IDs), T-04 (DB library) |
| Owns | `db/`, `data/exercises/`, `data/program/` |
| Approval needed | Only to run against Aurora (it writes data to an AWS resource) |
| Status | TODO |

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
_The agent fills this in._
