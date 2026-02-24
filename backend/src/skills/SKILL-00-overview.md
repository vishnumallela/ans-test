---
name: cpq-overview
description: Master pipeline reference for the Supplement Manufacturing CPQ agent.
---

# CPQ Agent — Pipeline Overview

Parse a product label and produce a complete Bill of Materials with cost breakdown across raw materials, manufacturing, and packaging.

## Pipeline

| Step | Name | Tool | Gate |
|------|------|------|------|
| 1 | Label Extraction | none | user confirms extraction |
| 2 | Ingredient Search | `ingredient-search` | user confirms matches |
| 3 | Assay Adjustment | `assay-adjustment` | user confirms potency + fill weight |
| 4 | Raw Materials Costing | `raw-materials-costing` | runs inside Step 7 |
| 5 | Manufacturing Costs | `manufacturing-costs` | runs inside Step 7 |
| 6a | Get Packaging Catalog | `get-packaging-materials-workflow` | user selects components |
| 6b | Packaging Costs | `packaging-costs` | runs inside Step 7 |
| 7 | Total BOM | `total-costing` | final user review |

Steps 4, 5, and 6b are orchestrated automatically inside `total-costing`. Only run them standalone for isolated calculations.

## Required Inputs

Collect everything in one message before starting.

| Field | Default |
|-------|---------|
| Product label (image or text) | required |
| Product form: `capsule` or `tablet` | required |
| Units per finished good (e.g. 60 capsules/bottle) | required |
| Finished good quantity (e.g. 5,000 bottles) | required |
| Freight % | 4 |
| Yield loss % | 8 |
| Product overage % | 0 |
| Per-ingredient overage % | 0 |
| Packaging yield % | 1.5 |

## Data Flow

```
Label
  -> [Step 1] ingredients[] with amounts in mg
  -> [Step 2] matched trade names, item_ids, costPerKg
  -> [Step 3] adjusted weights + rawMaterialsCostingInput
  -> [Step 6a] user-selected packagingComponents[]
  -> [Step 7] full BOM: rawMaterials + manufacturing + packaging + grandTotal
```

## Re-Run Routing

| Change | Re-entry point |
|--------|---------------|
| Different label | Step 1 |
| Swap ingredient match | Step 2 (affected ingredient only) then Step 3 |
| Change potency or overage | Step 3 then Step 7 |
| Change freight / yield / batch qty | Step 7 only |
| Swap packaging component | Step 6a then Step 7 |

## Rules

- Never skip assay adjustment. Potency-adjusted weights are mandatory for accurate costing.
- Always confirm matches with the user before Step 3.
- Always confirm assay results and flag low-confidence potency before Step 7.
- Announce each step before running its tool.
- Do not restart from Step 1 unless the label changes.

## Glossary

| Term | Meaning |
|------|---------|
| Potency % | Active content of a raw material (e.g. Calcium Carbonate = 40.04% elemental Ca) |
| Assay adjustment | claimedAmount / (potency / 100) = actual raw material weight needed |
| Yield loss % | Manufacturing process waste added to raw material cost |
| Freight % | Inbound shipping as a % of material cost |
| MOQ | Minimum Order Quantity — you pay for the minimum even if you need less |
| Packaging yield % | Components wasted on the filling line |
| Cost per finished good | grandTotal / finishedGoodQuantity |
| Cost per unit | grandTotal / (unitsPerFinishedGood x finishedGoodQuantity) |
