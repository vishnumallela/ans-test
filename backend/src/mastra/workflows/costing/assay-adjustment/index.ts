import { createStep, createWorkflow } from "@mastra/core/workflows";
import { generateText, Output } from "ai";
import { z } from "zod";
import { CHAT_MODEL } from "../../../../../utils/models";
import { POTENCY_EXTRACTION_PROMPT } from "./system-prompt";
import {
  assayAdjustmentInput,
  assayAdjustmentOutput,
  PotencyExtractionOutput,
  PotencyResultSchema,
  AdjustedIngredientSchema,
} from "./types";

// ── Density defaults (g/mL ≡ kg/L) by category ─────────────────────────────

const DENSITY: Record<string, number> = {
  mineral: 0.6, electrolyte: 0.6,
  botanical: 0.4, polyphenol: 0.4,
  vitamin: 0.5, amino_acid: 0.5, protein: 0.5, fatty_acid: 0.5,
  enzyme: 0.5, probiotic: 0.5, fiber: 0.5, carbohydrate: 0.5,
  antioxidant_compound: 0.5, excipient: 0.5, additive: 0.5,
};

const r = (v: number, dp: number) => Number(v.toFixed(dp));

// ── Intermediate schema ─────────────────────────────────────────────────────

const afterPotencySchema = assayAdjustmentInput.extend({
  potencyResults: z.array(PotencyResultSchema),
});

// ── Step 1: LLM potency extraction ──────────────────────────────────────────

const potencyExtractionStep = createStep({
  id: "potency-extraction",
  inputSchema: assayAdjustmentInput,
  outputSchema: afterPotencySchema,
  execute: async ({ inputData }) => {
    const payload = inputData.ingredients.map((i) => ({
      labelName: i.labelName,
      matchedItemId: i.matchedItemId,
      matchedTradeName: i.matchedTradeName,
      matchedCategory: i.matchedCategory ?? "unknown",
      constituentForms: i.constituentForms ?? null,
    }));

    const { output } = await generateText({
      model: CHAT_MODEL,
      system: POTENCY_EXTRACTION_PROMPT,
      output: Output.object({ schema: PotencyExtractionOutput }),
      prompt: `Extract potency for these ${payload.length} ingredients:\n${JSON.stringify(payload, null, 2)}`,
    });

    const map = new Map((output?.results ?? []).map((r) => [r.matchedItemId, r]));

    const potencyResults = inputData.ingredients.map((ing) =>
      map.get(ing.matchedItemId) ?? {
        labelName: ing.labelName,
        matchedItemId: ing.matchedItemId,
        potencyPercent: 100,
        potencyBasis: "assumed pure — LLM did not return a result",
        confidence: "low" as const,
        notes: "Fallback: LLM did not return potency for this ingredient",
      }
    );

    return { ...inputData, potencyResults };
  },
});

// ── Step 2: Math + costing input formatting ─────────────────────────────────

const assayCalculationStep = createStep({
  id: "assay-calculation",
  inputSchema: afterPotencySchema,
  outputSchema: assayAdjustmentOutput,
  execute: async ({ inputData }) => {
    const {
      ingredients, potencyResults,
      unitsPerFinishedGood, finishedGoodQuantity,
      freightPercent, yieldLossPercent, productOveragePercent,
    } = inputData;

    const adjusted: z.infer<typeof AdjustedIngredientSchema>[] = [];
    const rawMaterials: z.infer<typeof assayAdjustmentOutput>["rawMaterialsCostingInput"]["rawMaterials"] = [];

    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      const pot = potencyResults[i];
      const perUnit = r(ing.claimedAmountPerServing / (ing.servingSize || 1), 4);
      const adjWeight = r(perUnit / (pot.potencyPercent / 100), 4);
      const density = r(DENSITY[ing.matchedCategory?.toLowerCase() ?? ""] ?? 0.5, 1);

      adjusted.push({
        labelName: ing.labelName,
        matchedItemId: ing.matchedItemId,
        matchedTradeName: ing.matchedTradeName,
        matchedCategory: ing.matchedCategory ?? "unknown",
        claimedAmountPerServing: ing.claimedAmountPerServing,
        claimedAmountPerUnit: perUnit,
        potencyPercent: r(pot.potencyPercent, 2),
        potencyBasis: pot.potencyBasis,
        potencyConfidence: pot.confidence,
        adjustedWeightPerUnitMg: adjWeight,
        densityGPerMl: density,
        costPerKg: ing.matchedCostPerKg,
        ingredientOveragePercent: ing.ingredientOveragePercent,
        notes: pot.notes,
      });

      rawMaterials.push({
        id: ing.matchedItemId,
        materialName: ing.matchedTradeName,
        costPerPurchasingUnit: ing.matchedCostPerKg,
        quantityPerUnitMg: adjWeight,
        ingredientOveragePercent: ing.ingredientOveragePercent,
        densityGPerMl: density,
      });
    }

    return {
      adjustedIngredients: adjusted,
      rawMaterialsCostingInput: {
        rawMaterials,
        unitsPerFinishedGood,
        finishedGoodQuantity,
        freightPercent,
        yieldLossPercent,
        productOveragePercent,
      },
    };
  },
});

// ── Workflow ─────────────────────────────────────────────────────────────────

export const assayAdjustmentWorkflow = createWorkflow({
  id: "assay-adjustment",
  description: "Extracts potency from matched trade names via LLM, calculates assay-adjusted raw material weights, and formats output for raw-materials-costing",
  inputSchema: assayAdjustmentInput,
  outputSchema: assayAdjustmentOutput,
})
  .then(potencyExtractionStep)
  .then(assayCalculationStep)
  .commit();