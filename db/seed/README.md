# Seed state: the numbers

This is the one place T-21, T-24, T-27 and the Demo Monitor read the seed numbers from. All of them come out of `generate.ts`, which is deterministic (fixed PRNG seed `20261023`), and `npm run db:report` prints them from the database. If you change a number here, change `generate.ts` and paste the new report.

## Calendar
- **Demo day:** 2026-10-23, a Friday, in Asia/Karachi (+05:00). **Demo clock after reset:** `2026-10-23T13:00:00+05:00` (S1 is lunch).
- **History:** 42 days, 2026-09-11 (Fri) to 2026-10-22 (Thu). On demo day itself, only a morning weigh-in and a breakfast exist (see "Demo day so far").
- **Check-in weekday:** 6, Saturday, the day after demo day. "Skip to morning" lands on 2026-10-24, the next check-in.
- **Program schedule** (`data/program/program.json`, fixed weekdays): Mon pull, Wed upper, Fri push, Sat legs. Tue, Thu and Sun are rest days. Demo day is push (S3). 2026-10-24 is legs (S5: "Today is legs").

## Persona (`persona.json`, placeholders you can edit)
Ali, male, born 1996 (age 30 in 2026), 178 cm, starts at 84.0 kg, moderate activity (×1.55). Goal `lose` at 0.4 kg a week, protein 2.0 g/kg. Likes desi food and high protein, dislikes bitter gourd and mushrooms, full gym, 90 min max prep.

## Targets
- **Initial (2026-09-11):** Mifflin-St Jeor BMR 1807.5 × 1.55 = 2801.6 TDEE, minus 0.4 × 7700 / 7 = 440, rounded to 10: **2360 kcal**. Protein 168 g, fat 66 g (25% of kcal), carbs 274 g (the remainder), fiber 33 g (14 g per 1000 kcal), sodium 2300 mg, water 2900 ml (35 ml/kg, rounded to 100).
- **Weekly check-ins** on 2026-09-26, 10-03, 10-10 and 10-17 (Saturdays with 14 days of data behind them). All are on track, so kcal stays at 2360 and protein follows weight (167, 166, 165, 165 g). Reason code `on_track`.
- **Next check-in, 2026-10-24:** weight is down 0.23 kg against a 0.4 kg plan (mean of the 7 days to 2026-10-23, demo-day weigh-in included, vs the 7 days before), so T-21 should trim calories. Acceptance target: a 100–200 kcal trim, to be checked with T-21. S5's line is "trimmed 150".

## Body weight
Daily at 07:10. Each Fri–Thu week's mean follows a fixed step, with zero-mean noise of ±0.3 kg on Sat–Thu. Fridays sit on the mean, so the Sat–Fri check-in windows read cleanly.

| Week (Fri–Thu) | Mean | Change |
|---|---|---|
| 09-11..09-17 | 84.0 | |
| 09-18..09-24 | 83.6 | −0.46 |
| 09-25..10-01 | 83.1 | −0.43 |
| 10-02..10-08 | 82.7 | −0.43 |
| 10-09..10-15 | 82.4 | −0.33 |
| 10-16..10-22 | 82.1 | −0.26 (−0.23 in the check-in window, with the demo-day 82.0) |

## Demo day so far (S1 at 13:00)
- **Weigh-in** at 07:10: 82.0 kg (last week's mean minus 0.1, continuing the slower trend).
- **Breakfast** at 08:30: "two eggs, one roti, a cup of chai and one banana". That's one entry, four items.
- **Rings at 13:00** (`db:report`), against the 2026-10-17 targets:

| | Eaten | Target | Remaining |
|---|---|---|---|
| kcal | 486 | 2360 | 1874 |
| Protein g | 20 | 165 | 145 |
| Carbs g | 61 | 277 | 216 |
| Fat g | 18 | 66 | 48 |

- No water is logged on demo day.

## Intake
- 3–4 meal entries a day, made from day templates: 3 for training days and 3 for rest days. Plate, bowl and serving amounts are scaled in quarter steps so each day lands at the target ±6%. Counted items (roti, egg, naan) stay whole.
- **Averages:** about 2337 kcal a day against the 2360 target (weekly means 2279–2415). **Protein is 162 g on training days and 104 g on rest days**; that gap is the brief's insight.
- **Foods:** desi dishes use T-12 slugs (`roti`, `chicken-karahi`, `daal-chawal`, …) with T-12's nutrients. Generic foods use T-12 USDA slugs: eggs `usda-2707154`, oatmeal `usda-2708380`, chicken breast `usda-2705956`, banana `usda-2709224`, milk `usda-171265`, Greek yogurt `usda-2705422`, whey `usda-2710742`.
- If a T-12 file or nutrient is missing, `placeholder-foods.json` fills in, and those rows are marked `seed-placeholder`. The placeholder portions (egg, serving, container, scoop, …) sit underneath T-12's portions, so a portion T-12 renames doesn't break the seed.
- Water: on 38 of 42 days, 3–5 logs.

## Training (double progression, Epley e1RM = w × (1 + reps/30))
Every exercise in the program is logged on its weekday: 24 sessions, 378 sets, 3 sets each. An Upper day also adds a 20 min incline walk.

**Bench press (push, Fridays), rep range 6–8:**

| Date | Sets | Best e1RM |
|---|---|---|
| 09-11 | 70×8,8,8 | 88.7 |
| 09-18 | 72.5×8,8,8 | 91.8 |
| 09-25 | 75×7,7,6 | 92.5 |
| 10-02 | 75×8,8,8 | 95.0 |
| 10-09 | 77.5×8,8,8 | 98.2 |
| 10-16 | 80×7,7,6 | **98.7** (best) |

- **S3:** the target for 2026-10-23 is **80 kg × 8** (same weight, because not every set reached 8). 80×8 gives an e1RM of 101.3, which beats 98.7 by 2.6 kg: a **new e1RM PR**. It is also a rep-best PR, since the best weight for 8 reps so far is 77.5. To be checked with T-24.
- **Squat (legs, Saturdays), rep range 5–7:** 92.5×7,7,7 → 95×6,6,5 → 95×7,7,7 → 97.5×7,7,7 → 100×6,6,5 → 100×7,7,7. Every set reached 7 in the last session, so the next target is **102.5 kg × 5** (S5).
- **`next_targets` for 2026-10-23** (as if the overnight job of 10-22 had run): bench 80×8, overhead press 52.5×6, incline dumbbell press 30×8, lateral raise 13×12, triceps pushdown 32.5×10.
- **PR flags on historical sets:** `pr_e1rm` is set when a set beats an earlier best e1RM. `pr_rep_best` is set when a set beats the best weight earlier lifted for the same rep count. The first session of an exercise never flags.

## What reset does
- **Truncates and reloads:** `exercises`, `program_days`, `program_exercises` and `catalog_items` (from `data/catalog/catalog.json`), plus every user table.
- **Sets** the demo clock (`demo_now` 13:00, `set_at` = wall time, `rest_seconds` NULL).
- **Leaves `foods` alone.** T-12's `data:load-foods` loads it.
- **Cached overnight output:** if `jobs/overnight/cache/overnight-cache.json` exists, its `briefs`, `next_targets`, `targets` and `meal_plans` arrays are inserted as table rows. Rows use this schema's column names. Rows without an `id` get the next free one.
