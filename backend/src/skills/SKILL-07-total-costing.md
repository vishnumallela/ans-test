---
name: cpq-total-costing
step: 7
description: Orchestrates raw materials, manufacturing, and packaging into a single call and rolls up the grand total BOM. Tool: total-costing.
---

# Step 7 — Total BOM

Tool: `total-costing`

Single call that runs `raw-materials-costing` -> `manufacturing-costs` -> `packaging-costs` -> grand total roll-up in sequence.

## Input Structure

```
{
  rawMaterials:  rawMaterialsCostingInput from Step 3 (pass as-is),
  productForm:   "capsule" | "tablet",
  packaging: {
    packagingComponents: [...user selections from Step 6a],
    packagingYieldPercentGlobal: 1.5,
    unitsPerFinishedGood: 60,
    finishedGoodQuantity: 5000
  }
}
```

Do not modify `rawMaterialsCostingInput` before passing it in.

## Grand Total Formula

| Component | Source |
|-----------|--------|
| rawMaterialsCost | `rawMaterials.summary.totalRawMaterialCost` (includes yield loss + freight + overage) |
| packagingMaterialsCost | `packaging.materials.summary.totalPackagingMaterialsCost` |
| packagingOverheadCost | `packaging.overhead.totalCost` (0 if no ORM row matched) |
| manufacturingCost | `manufacturing.totals.grandTotal` |
| grandTotal | sum of all four |
| costPerFinishedGood | `grandTotal / finishedGoodQuantity` |
| costPerUnit | `grandTotal / (unitsPerFinishedGood x finishedGoodQuantity)` |

## Final BOM Presentation

Present in four sections.

**Raw materials**

| Material | Required (kg) | Cost/kg | Total cost |
|----------|--------------|---------|------------|
| Ascorbic Acid USP | 0.075 | $12.50 | $0.94 |

| | |
|---|---|
| Base material cost | $1,250.00 |
| Yield loss (8%) | $100.00 |
| Freight (4%) | $50.00 |
| Total raw materials | $1,400.00 |

**Manufacturing**

| Operation | Machine hrs | Labor hrs | Total |
|-----------|------------|-----------|-------|
| Weigh-Up | 2.50 | 5.00 | $712.50 |
| Mixing | 1.50 | 3.00 | $427.50 |
| Encapsulation | 0.75 | 0.75 | $183.75 |
| Total | 4.75 | 8.75 | $1,323.75 |

Note selected blender size and batch count.

**Packaging**

| Component | Qty | Line total |
|-----------|-----|------------|
| HDPE 60-count bottle | 5,075 | $1,421.00 |
| 38mm CT cap | 5,075 | $482.13 |

| | |
|---|---|
| Materials total | $2,983.38 |
| Line overhead | $1,137.50 |
| Total packaging | $4,120.88 |

**Grand total**

| | |
|---|---|
| Raw materials | $1,400.00 |
| Manufacturing | $1,323.75 |
| Packaging materials | $2,983.38 |
| Packaging overhead | $1,137.50 |
| Grand total | $6,844.63 |
| Cost per bottle | $1.37 |
| Cost per capsule | $0.0228 |

## Re-Run Guidance

If the user wants to change a variable, identify the minimal re-entry point and pass updated values. Never reconstruct the full input from scratch — carry forward all confirmed data from previous steps and update only the changed fields.
