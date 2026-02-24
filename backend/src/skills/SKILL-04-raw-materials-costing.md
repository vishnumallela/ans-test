---
name: cpq-raw-materials-costing
step: 4
description: Per-ingredient cost calculation with yield loss, freight, and product overage roll-up. Also computes weighted bulk density for manufacturing. Tool: raw-materials-costing.
---

# Step 4 — Raw Materials Costing

Tool: `raw-materials-costing`

Usually runs inside Step 7. Run standalone only for isolated cost calculations or debugging.

## Input

Pass `rawMaterialsCostingInput` from Step 3 directly. All `costPerPurchasingUnit` values must be in USD per kg.

## Per-Ingredient Calculations

| Output field | Formula |
|---|---|
| `requiredMg` | `quantityPerUnitMg x totalUnits x (1 + ingredientOveragePercent / 100)` |
| `requiredKg` | `requiredMg / 1,000,000` |
| `totalCostForMaterial` | `requiredKg x costPerPurchasingUnit` |
| `costPerFinishedGood` | `totalCostForMaterial / finishedGoodQuantity` |
| `costPerUnit` | `totalCostForMaterial / totalUnits` |
| `volumePerUnitMl` | `(quantityPerUnitMg / 1000) / densityGPerMl` |

Where `totalUnits = unitsPerFinishedGood x finishedGoodQuantity`.

## Cost Roll-Up

| Component | Formula |
|-----------|---------|
| Base material cost | sum of all `totalCostForMaterial` |
| Yield loss | `yieldLossPercent / 100 x baseMaterialCost` |
| Freight | `freightPercent / 100 x baseMaterialCost` |
| Product overage | `productOveragePercent / 100 x baseMaterialCost` |
| Total raw material cost | sum of all four |

## Bulk Density

A weighted-average bulk density is computed across all materials using total mass (g) and total volume (mL) per unit:

`densityGPerMl = totalMassG / totalVolumeMl`

This feeds directly into Step 5 for blender selection. g/mL is numerically equal to kg/L.

## Density Defaults by Category

| Category | Density (g/mL) |
|----------|---------------|
| mineral, electrolyte | 0.6 |
| botanical, polyphenol | 0.4 |
| vitamin, amino_acid, protein, fatty_acid | 0.5 |
| enzyme, probiotic, fiber, carbohydrate | 0.5 |
| excipient, additive, unknown | 0.5 |

The user can override `densityGPerMl` per material if they have measured values.

## Output Structure

Three objects returned: `summary` (totals), `materialBreakdown[]` (per-ingredient rows), `density` (per-unit / per-finished-good / per-batch scopes). The `density.product` fields feed Step 5.
