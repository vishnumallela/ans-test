---
name: cpq-manufacturing-costs
step: 5
description: Blender selection, Weigh-Up and Mixing via ORM lookup, optional Coating or Encapsulation. Tool: manufacturing-costs.
---

# Step 5 — Manufacturing Costs

Tool: `manufacturing-costs`

Usually runs inside Step 7. Input is auto-derived from Step 4's density output.

## Input

| Field | Source |
|-------|--------|
| `numRawMaterials` | count of materials with `quantityPerUnitMg > 0` from Step 3 |
| `totalMassKg` | `density.product.totalMassKg` from Step 4 |
| `bulkDensityKgPerL` | `density.product.densityGPerMl` from Step 4 (g/mL = kg/L numerically) |
| `productForm` | `"capsule"` or `"tablet"` from user input |

## Blender Selection

Available sizes: 5, 12.5, 60, 150, 300 cu ft. Working fill fraction: 80% for all sizes except 300 cu ft (100%).

```
requiredVolumeCuFt = (totalMassKg / bulkDensityKgPerL) / 28.3168
batches = ceil(requiredVolumeCuFt / workingCapacity)
```

Selection criteria: fewest batches first, then fill fraction closest to 1.0, then smallest blender.

## ORM Lookup — Weigh-Up and Mixing

Rows are matched from ORM reference data by:
- `ProductClass = "Solid Dose"`, `ProcessCategory = "Manufacturing"`
- `ProcessDescription = "Weigh-Up"` or `"Mixing"`
- `RunRangeBasis = "RM lines"`, matched against `numRawMaterials`

## Cost Calculation per Operation

| Field | Formula |
|-------|---------|
| `setupHours` | `row.SetupHours + (batches - 1) x (SetupHours / 2)`, ceiling to 0.1h |
| `runHours` | `row.RunRate x batches` |
| `machineHours` | `setupHours + runHours` |
| `laborHours` | `row.Headcount x machineHours` |
| `overheadCost` | `machineHours x $205` |
| `laborCost` | `laborHours x $40` |
| `totalCost` | `overheadCost + laborCost` |

## Form Operation (Coating / Encapsulation)

Applied only when `productForm` is set. Flat 0.75 hr setup, no run hours.

| Form | Operation | Cost |
|------|-----------|------|
| tablet | Coating | `0.75 x ($205 + $40) = $183.75` |
| capsule | Encapsulation | `0.75 x ($205 + $40) = $183.75` |

## Output

Returns `blender` (selected size + batches), `blenderOptions[]` (all sizes evaluated), `operations[]` (Weigh-Up, Mixing, and optionally Coating/Encapsulation), and `totals` (summed machine hours, labor hours, overhead, labor, grand total).
