---
name: cpq-label-extraction
step: 1
description: Parse a supplement label and extract every active ingredient with its claimed amount converted to mg.
---

# Step 1 — Label Extraction

Reasoning-only step. No tools. Extract every active ingredient from the label, convert all amounts to mg, and confirm with the user before proceeding.

## What to Extract

For each ingredient: `labelName`, `claimedAmountPerServing` (in mg), `claimedUnit` (original), `servingSize`.

## Unit Conversions to mg

| Original unit | Conversion |
|---------------|------------|
| mcg | / 1,000 |
| mg | no change |
| g | x 1,000 |
| IU — Vitamin A | x 0.0003 |
| IU — Vitamin D | x 0.000025 |
| IU — Vitamin E natural (d-alpha) | x 0.67 |
| IU — Vitamin E synthetic (dl-alpha) | x 0.45 |

Always store the original unit in `claimedUnit` even after converting.

## Serving Size

`claimedAmountPerServing` is the number printed on the label — it is already the per-serving total. `servingSize` is the number of capsules or tablets that make up one serving. The per-unit amount used in costing = `claimedAmountPerServing / servingSize`.

## Include vs Exclude

Include: all active ingredients in the Supplement Facts panel — vitamins, minerals, botanicals, amino acids, enzymes, probiotics, fatty acids.

Exclude: "Other Ingredients" excipients (rice flour, magnesium stearate, silica, cellulose). These are not costed as actives.

## Edge Cases

- **"As" forms** — `"Calcium (as Calcium Citrate) 200 mg"`: use `"Calcium"` as the label name. The salt form is resolved in ingredient search.
- **Proprietary blends** — if only the blend total is given with no individual amounts, flag for user clarification before proceeding.
- **Missing units** — flag for user confirmation rather than guessing.

## Output

Present a table before proceeding:

| # | Label Name | Claimed Amount | Original Unit | Amount (mg) | Serving Size |
|---|------------|---------------|---------------|-------------|--------------|
| 1 | Vitamin C | 500 | mg | 500 | 2 |
| 2 | Vitamin D | 1000 | IU | 0.025 | 2 |
| 3 | Zinc | 15 | mg | 15 | 2 |

Wait for user confirmation before moving to Step 2.
