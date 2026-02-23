import { createStep, createWorkflow } from "@mastra/core/workflows";
import { rawMaterialsWorkflowInput, rawMaterialsWorkflowOutput } from "../types";

const r = (v: number, dp: number) => Number(v.toFixed(dp));

// ── Intermediate schema ─────────────────────────────────────────────────────

const afterPerIngredientSchema = rawMaterialsWorkflowInput.extend({
  materialBreakdown: rawMaterialsWorkflowOutput.shape.materialBreakdown,
  density: rawMaterialsWorkflowOutput.shape.density,
});

// ── Step 1: Per-ingredient breakdown + density ──────────────────────────────

const perIngredientStep = createStep({
  id: "per-ingredient-breakdown",
  inputSchema: rawMaterialsWorkflowInput,
  outputSchema: afterPerIngredientSchema,
  execute: async ({ inputData }) => {
    const { rawMaterials, unitsPerFinishedGood, finishedGoodQuantity } = inputData;
    const totalUnits = unitsPerFinishedGood * finishedGoodQuantity;

    const materialBreakdown = rawMaterials.map((mat) => {
      const requiredMg = mat.quantityPerUnitMg * totalUnits * (1 + mat.ingredientOveragePercent / 100);
      const requiredKg = requiredMg / 1_000_000;
      const totalCost = requiredKg * mat.costPerPurchasingUnit;
      const massG = mat.quantityPerUnitMg / 1000;
      const volMl = massG / mat.densityGPerMl;

      return {
        ...(mat.id && { id: mat.id }),
        materialName: mat.materialName,
        requiredMg: r(requiredMg, 2),
        requiredKg: r(requiredKg, 5),
        costPerPurchasingUnit: mat.costPerPurchasingUnit,
        ingredientOveragePercent: mat.ingredientOveragePercent,
        densityGPerMl: r(mat.densityGPerMl, 4),
        volumePerUnitMl: r(volMl, 4),
        massPerUnitG: r(massG, 4),
        totalCostForMaterial: r(totalCost, 4),
        costPerFinishedGood: r(totalCost / finishedGoodQuantity, 6),
        costPerUnit: r(totalCost / totalUnits, 8),
      };
    });

    // Weighted-average bulk density
    let totalMassG = 0, totalVolMl = 0;
    rawMaterials.forEach((mat) => {
      const g = mat.quantityPerUnitMg / 1000;
      totalMassG += g;
      totalVolMl += g / mat.densityGPerMl;
    });
    const densityGPerMl = totalVolMl > 0 ? totalMassG / totalVolMl : 0;

    const density = {
      perUnit: { densityGPerMl: r(densityGPerMl, 4), massG: r(totalMassG, 4), volumeMl: r(totalVolMl, 4) },
      perFinishedGood: {
        densityGPerMl: r(densityGPerMl, 4),
        massG: r(totalMassG * unitsPerFinishedGood, 4),
        volumeMl: r(totalVolMl * unitsPerFinishedGood, 4),
      },
      product: {
        densityGPerMl: r(densityGPerMl, 4),
        totalMassG: r(totalMassG * totalUnits, 2),
        totalMassKg: r((totalMassG * totalUnits) / 1000, 4),
        totalVolumeMl: r(totalVolMl * totalUnits, 2),
        totalVolumeL: r((totalVolMl * totalUnits) / 1000, 4),
      },
    };

    return { ...inputData, materialBreakdown, density };
  },
});

// ── Step 2: Cost roll-up (yield loss, freight, overage) ─────────────────────

const costRollUpStep = createStep({
  id: "cost-roll-up",
  inputSchema: afterPerIngredientSchema,
  outputSchema: rawMaterialsWorkflowOutput,
  execute: async ({ inputData }) => {
    const {
      materialBreakdown, density,
      freightPercent, yieldLossPercent, productOveragePercent,
      unitsPerFinishedGood, finishedGoodQuantity,
    } = inputData;

    const totalUnits = unitsPerFinishedGood * finishedGoodQuantity;
    const base = materialBreakdown.reduce((s, m) => s + m.totalCostForMaterial, 0);
    const yieldLoss = (yieldLossPercent / 100) * base;
    const freight = (freightPercent / 100) * base;
    const overage = (productOveragePercent / 100) * base;
    const total = base + yieldLoss + freight + overage;

    return {
      summary: {
        totalUnits,
        baseMaterialCost: r(base, 4),
        yieldLossCost: r(yieldLoss, 4),
        freightCost: r(freight, 4),
        productOverageCost: r(overage, 4),
        totalRawMaterialCost: r(total, 4),
        costPerFinishedGood: r(total / finishedGoodQuantity, 6),
        costPerUnit: r(total / totalUnits, 8),
      },
      materialBreakdown,
      density,
    };
  },
});

// ── Workflow ─────────────────────────────────────────────────────────────────

export const rawMaterialsCostingWorkflow = createWorkflow({
  id: "raw-materials-costing",
  description: "Per-ingredient costs, weighted bulk density, yield loss, freight, and product overage",
  inputSchema: rawMaterialsWorkflowInput,
  outputSchema: rawMaterialsWorkflowOutput,
})
  .then(perIngredientStep)
  .then(costRollUpStep)
  .commit();