#!/usr/bin/env bash
# Downloads USDA FoodData Central bulk CSVs (SR Legacy + FNDDS Survey) into data/foods/raw/ (git-ignored).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p raw
BASE=https://fdc.nal.usda.gov/fdc-datasets
for f in FoodData_Central_sr_legacy_food_csv_2018-04 FoodData_Central_survey_food_csv_2024-10-31; do
  [ -d "raw/$f" ] && { echo "have $f"; continue; }
  curl -fL --max-time 600 -o "raw/$f.zip" "$BASE/$f.zip"
  mkdir -p "raw/$f" && unzip -q -o "raw/$f.zip" -d "raw/$f"
done
ls raw
