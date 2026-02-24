---
name: cpq-ingredient-search
step: 2
description: Vector search for the best-matching raw material trade name per ingredient. Score, validate, and confirm with user before proceeding.
---

# Step 2 — Ingredient Search

Tool: `ingredient-search`  
Input: `{ "ingredients": ["Vitamin C", "Zinc", ...] }` — pass `labelName` values from Step 1.  
Returns: top 6 candidates per ingredient with `trade_name`, `similarity_score`, `item_id`, `category`, `cost`, `cost_unit`.

## Match Rules

| Condition | Action |
|-----------|--------|
| Score > 0.85 and category aligns | Accept automatically |
| Score 0.70–0.85 or multiple plausible matches | Show top 2–3, ask user to pick |
| All scores < 0.70 | Flag as NOT FOUND |

A high score with a mismatched category is a false positive — do not accept it.

## Category Alignment

| Ingredient type | Expected categories |
|-----------------|---------------------|
| Vitamins | `vitamin` |
| Minerals | `mineral`, `electrolyte` |
| Botanicals / Herbals | `botanical`, `polyphenol`, `antioxidant_compound` |
| Amino acids | `amino_acid` |
| Fatty acids | `fatty_acid` |
| Probiotics | `probiotic` |
| Enzymes | `enzyme` |
| Fibers | `fiber`, `carbohydrate`, `prebiotic` |

## Cost Unit Handling

`cost_unit` determines whether the cost value can be used as `costPerKg`.

| cost_unit | Action |
|-----------|--------|
| `"kg"` | Use cost directly as costPerKg |
| `"EA"` or anything else | Do not use. Ask user for the per-kg cost or flag for manual entry. |

Never pass an EA-priced cost into assay adjustment as a per-kg figure.

## NOT FOUND Handling

If all scores are below 0.70: tell the user, ask for a manual `item_id`, `trade_name`, and `costPerKg`, or let them skip the ingredient and note it as excluded from costing.

## Presentation

Show all results as a single table before asking for confirmation:

| Label Ingredient | Matched Trade Name | Item ID | Category | Score | Cost | Cost Unit | Status |
|------------------|--------------------|---------|----------|-------|------|-----------|--------|
| Vitamin C | Ascorbic Acid Fine Granular USP | ITEM-001 | vitamin | 0.97 | 12.50 | kg | Accepted |
| Zinc | Zinc Gluconate | ITEM-042 | mineral | 0.88 | 8.20 | kg | Accepted |
| Magnesium | Magnesium Oxide 98% | ITEM-077 | mineral | 0.92 | 3.10 | EA | Need $/kg |

Wait for user confirmation before moving to Step 3.

## Data Passed to Step 3

```json
{
  "labelName": "Vitamin C",
  "claimedAmountPerServing": 500,
  "claimedUnit": "mg",
  "servingSize": 2,
  "matchedItemId": "ITEM-001",
  "matchedTradeName": "Ascorbic Acid Fine Granular USP",
  "matchedCategory": "vitamin",
  "matchedCostPerKg": 12.50,
  "constituentForms": null,
  "ingredientOveragePercent": 0
}
```
