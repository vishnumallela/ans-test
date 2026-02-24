---
name: cpq-assay-adjustment
step: 3
description: Convert label-claimed amounts to actual raw material weights using potency percentages. Check fill capacity. Tool: assay-adjustment.
---

# Step 3 — Assay Adjustment

Tool: `assay-adjustment`

The label claims the active nutrient amount. The raw material you purchase may be a diluted salt, standardized extract, or carrier blend. Assay adjustment converts the claimed amount into the actual weight of raw material needed.

Formula: `adjustedWeight (mg) = claimedAmountPerUnit (mg) / (potencyPercent / 100)`

## Potency Determination Rules

The tool's internal LLM applies these rules in order:

| Case | Example | Potency | Confidence |
|------|---------|---------|------------|
| Pure compound, USP/FCC, no dilution stated | Ascorbic Acid Fine Granular USP | 100% | high |
| Explicit % in trade name | Turmeric PE 95% Curcuminoids | 95% | high |
| Mineral salt — elemental yield (see table) | Calcium Carbonate | 40.04% | high |
| Standardized extract | Green Tea Std. 50% EGCG | 50% | high |
| Diluted vitamin form (IU/g stated) | Vitamin D3 100,000 IU/g | 0.25% | high |
| Carrier-diluted (SD, CWS, WS, 1%, 10%) | Biotin 1% SD | 1% | high |
| Pure amino acid or protein | L-Leucine | 100% | high |
| Enzyme or probiotic (activity-based) | Bromelain | 100% | medium |
| Cannot determine | Unknown blend | 100% | low |

## Mineral Salt Elemental Yields

| Salt | Elemental yield |
|------|----------------|
| Calcium Carbonate | 40.04% |
| Calcium Citrate | 21.10% |
| Calcium Phosphate Dibasic | 29.46% |
| Magnesium Oxide | 60.30% |
| Magnesium Citrate | 16.20% |
| Magnesium Glycinate | 14.10% |
| Zinc Oxide | 80.34% |
| Zinc Gluconate | 14.35% |
| Zinc Citrate | 31.00% |
| Zinc Picolinate | 21.10% |
| Iron Fumarate | 32.87% |
| Iron Bisglycinate | 20.00% |
| Chromium Picolinate | 12.43% |
| Potassium Chloride | 52.44% |
| Potassium Citrate | 38.28% |
| Copper Gluconate | 14.20% |
| Manganese Gluconate | 11.42% |
| Selenium Selenomethionine | 40.00% |

## Required Checks After Running

**Low confidence** — if any ingredient returns `potencyConfidence = "low"`, surface it to the user with the `potencyBasis` reason and ask for confirmation or a manual override. Do not proceed to costing until resolved.

**Fill capacity** — sum all `adjustedWeightPerUnitMg` values and compare to the target form:

| Form | Typical capacity |
|------|-----------------|
| Capsule size 00 | 735 mg |
| Capsule size 0 | 500 mg |
| Capsule size 1 | 400 mg |
| Tablet | 1,000 mg |

If the total exceeds capacity, warn the user and offer options: larger capsule size, more units per serving, reformulation, or acknowledge and proceed.

## Presentation

| Label Item | Claimed/unit (mg) | Trade Name | Potency % | Adjusted weight (mg) | Confidence |
|------------|-------------------|------------|-----------|----------------------|------------|
| Vitamin C | 250 | Ascorbic Acid USP | 100% | 250.00 | high |
| Calcium | 100 | Calcium Carbonate | 40.04% | 249.75 | high |
| Turmeric | 250 | Turmeric PE 95% | 95% | 263.16 | high |
| Total fill | | | | 762.91 mg | |

## Output Passed Forward

The tool returns `adjustedIngredients[]` and `rawMaterialsCostingInput`. Pass `rawMaterialsCostingInput` directly into Step 7 without modification.
