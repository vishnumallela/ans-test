import { z } from "zod";

// ── Input: matched ingredients from vector search ────────────────────────────

export const MatchedIngredientSchema = z.object({
  labelName: z.string(),
  claimedAmountPerServing: z.number().nonnegative(),
  claimedUnit: z.string().default("mg"),
  servingSize: z.number().positive().default(1),
  matchedItemId: z.string(),
  matchedTradeName: z.string(),
  matchedCategory: z.string().optional(),
  matchedCostPerKg: z.number().nonnegative(),
  constituentForms: z
    .array(z.object({
      name: z.string(),
      relation: z.string().nullable().optional(),
      form_amounts: z.array(z.object({ amount: z.number(), unit: z.string() })).nullable().optional(),
    }))
    .nullable()
    .optional(),
  ingredientOveragePercent: z.number().nonnegative().default(0),
});

export const assayAdjustmentInput = z.object({
  ingredients: z.array(MatchedIngredientSchema),
  unitsPerFinishedGood: z.number().positive(),
  finishedGoodQuantity: z.number().positive(),
  productForm: z.enum(["tablet", "capsule"]).optional(),
  freightPercent: z.number().nonnegative().default(4),
  yieldLossPercent: z.number().nonnegative().default(8),
  productOveragePercent: z.number().nonnegative().default(0),
});

export type AssayAdjustmentInput = z.infer<typeof assayAdjustmentInput>;

// ── LLM potency extraction result ───────────────────────────────────────────

export const PotencyResultSchema = z.object({
  labelName: z.string(),
  matchedItemId: z.string(),
  potencyPercent: z.number().positive().max(100),
  potencyBasis: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string(),
});

export const PotencyExtractionOutput = z.object({
  results: z.array(PotencyResultSchema),
});

export type PotencyExtractionOutput = z.infer<typeof PotencyExtractionOutput>;

// ── Adjusted ingredient detail row ──────────────────────────────────────────

export const AdjustedIngredientSchema = z.object({
  labelName: z.string(),
  matchedItemId: z.string(),
  matchedTradeName: z.string(),
  matchedCategory: z.string(),
  claimedAmountPerServing: z.number(),
  claimedAmountPerUnit: z.number(),
  potencyPercent: z.number(),
  potencyBasis: z.string(),
  potencyConfidence: z.enum(["high", "medium", "low"]),
  adjustedWeightPerUnitMg: z.number(),
  densityGPerMl: z.number(),
  costPerKg: z.number(),
  ingredientOveragePercent: z.number(),
  notes: z.string(),
});

// ── Workflow output ─────────────────────────────────────────────────────────

export const assayAdjustmentOutput = z.object({
  adjustedIngredients: z.array(AdjustedIngredientSchema),
  rawMaterialsCostingInput: z.object({
    rawMaterials: z.array(z.object({
      id: z.string().optional(),
      materialName: z.string(),
      costPerPurchasingUnit: z.number().nonnegative(),
      quantityPerUnitMg: z.number().nonnegative(),
      ingredientOveragePercent: z.number().nonnegative(),
      densityGPerMl: z.number().positive(),
    })),
    unitsPerFinishedGood: z.number().positive(),
    finishedGoodQuantity: z.number().positive(),
    freightPercent: z.number().nonnegative(),
    yieldLossPercent: z.number().nonnegative(),
    productOveragePercent: z.number().nonnegative(),
  }),
});

export type AssayAdjustmentOutput = z.infer<typeof assayAdjustmentOutput>;