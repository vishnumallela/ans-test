---
name: cpq-packaging
step: 6
description: Fetch packaging catalog, guide component selection, calculate materials cost and line overhead. Tools: get-packaging-materials-workflow, packaging-costs.
---

# Step 6 — Packaging

Two sub-steps: fetch catalog and confirm selections (6a), then calculate costs (6b inside Step 7).

## Step 6a — Get Packaging Catalog

Tool: `get-packaging-materials-workflow`  
Input: `{ "product_type": "capsule" }` or `"tablet"`

Returns the full catalog. Present it to the user and guide selection.

## Required Components

| Component | Required | Notes |
|-----------|----------|-------|
| Bottle | Yes | HDPE or glass, size matched to `unitsPerFinishedGood` |
| Cap | Yes | Match bottle neck finish |
| Label | Yes | Typically 1 per bottle |
| Induction inner seal | Common | Required by most retailers |
| Shrink band | Optional | Tamper evidence |
| Desiccant | Optional | Recommended for moisture-sensitive formulas |
| Cotton / poly-fil coil | Optional | Void fill, prevents rattling |

Quantity for most components = `finishedGoodQuantity`. Desiccant and coil may be multiple per bottle — confirm with user.

## Cost Concepts

**UoM (unit of measure)**

| UoM | Meaning | costEach |
|-----|---------|----------|
| EA | each | `costPerPurchasingUoM` |
| M | per thousand | `costPerPurchasingUoM / 1000` |

**Yield loss**

```
requiredUnitsWithYield = quantity x (1 + lineYieldPercent / 100)
```

Global default: 1.5%. Can be overridden per component with `lineYieldPercentOverride`.

**MOQ shortfall**

```
shortfall = max(0, moqEaches - requiredUnitsWithYield)
moqAddCost = shortfall x costEach
lineCostTotal = lineCostBeforeMOQ + moqAddCost
```

**Customer-supplied** — if `customerSupplied: true`, cost = $0 but quantity is still tracked.

## Step 6b — Packaging Costs

Tool: `packaging-costs` — runs inside `total-costing` in Step 7.

Line overhead is looked up from ORM reference data keyed by `ProcessDescription` (`"Bottle - Normal"` or `"Bottle - Glass"`, auto-detected) and `unitsPerFinishedGood` as the inner fill range. Overhead formula mirrors manufacturing: `machineHours x $205` + `laborHours x $40`.

## Output

`materials.summary.totalPackagingMaterialsCost` and `overhead.totalCost` are the two values consumed by the Step 7 grand total roll-up.
