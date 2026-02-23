import { z } from "zod";

// ── Shared primitives ────────────────────────────────────────────────────────

export const RawMaterialSchema = z.object({
  id: z.string().optional(),
  materialName: z.string(),
  costPerPurchasingUnit: z.number().nonnegative(),
  quantityPerUnitMg: z.number().nonnegative(),
  ingredientOveragePercent: z.number().nonnegative().default(0),
  densityGPerMl: z.number().positive(),
});

export const PackagingComponentSchema = z.object({
  id: z.string().optional(),
  componentName: z.string(),
  uom: z.enum(["ea", "M"]),
  quantity: z.number().nonnegative(),
  quantityOverride: z.number().nonnegative().optional(),
  lineYieldPercentOverride: z.number().nonnegative().optional(),
  costPerPurchasingUoM: z.number().nonnegative(),
  costOverride: z.number().nonnegative().optional(),
  moqEaches: z.number().nonnegative().optional().default(0),
  customerSupplied: z.boolean().optional().default(false),
});

export const BlenderOptionSchema = z.object({
  blenderSizeCuFt: z.number(),
  workingCapacityCuFt: z.number(),
  batches: z.number(),
  fillFraction: z.number(),
});

export const OperationBreakdownSchema = z.object({
  operation: z.string(),
  headcount: z.number(),
  setupHours: z.number(),
  runHours: z.number(),
  machineHours: z.number(),
  laborHours: z.number(),
  overheadCost: z.number(),
  laborCost: z.number(),
  totalCost: z.number(),
});

export const PackagingBreakdownRowSchema = z.object({
  id: z.string().optional(),
  componentName: z.string(),
  uom: z.enum(["ea", "M"]),
  quantityBase: z.number(),
  quantityUsed: z.number(),
  lineYieldPercentUsed: z.number(),
  requiredUnitsWithYield: z.number(),
  costPerEachApplied: z.number(),
  moqEaches: z.number(),
  moqShortfallEaches: z.number(),
  moqAddCost: z.number(),
  lineCostBeforeMOQ: z.number(),
  lineCostTotal: z.number(),
});

// ── Raw Materials I/O ────────────────────────────────────────────────────────

export const rawMaterialsWorkflowInput = z.object({
  rawMaterials: z.array(RawMaterialSchema),
  unitsPerFinishedGood: z.number().positive(),
  finishedGoodQuantity: z.number().positive(),
  freightPercent: z.number().nonnegative().default(4),
  yieldLossPercent: z.number().nonnegative().default(8),
  productOveragePercent: z.number().nonnegative().default(0),
});

export const rawMaterialsWorkflowOutput = z.object({
  summary: z.object({
    totalUnits: z.number(),
    baseMaterialCost: z.number(),
    yieldLossCost: z.number(),
    freightCost: z.number(),
    productOverageCost: z.number(),
    totalRawMaterialCost: z.number(),
    costPerFinishedGood: z.number(),
    costPerUnit: z.number(),
  }),
  materialBreakdown: z.array(
    z.object({
      id: z.string().optional(),
      materialName: z.string(),
      requiredMg: z.number(),
      requiredKg: z.number(),
      costPerPurchasingUnit: z.number(),
      ingredientOveragePercent: z.number(),
      densityGPerMl: z.number(),
      volumePerUnitMl: z.number(),
      massPerUnitG: z.number(),
      totalCostForMaterial: z.number(),
      costPerFinishedGood: z.number(),
      costPerUnit: z.number(),
    })
  ),
  density: z.object({
    perUnit: z.object({ densityGPerMl: z.number(), massG: z.number(), volumeMl: z.number() }),
    perFinishedGood: z.object({ densityGPerMl: z.number(), massG: z.number(), volumeMl: z.number() }),
    product: z.object({
      densityGPerMl: z.number(),
      totalMassG: z.number(),
      totalMassKg: z.number(),
      totalVolumeMl: z.number(),
      totalVolumeL: z.number(),
    }),
  }),
});

export type RawMaterialsWorkflowInput = z.infer<typeof rawMaterialsWorkflowInput>;
export type RawMaterialsWorkflowOutput = z.infer<typeof rawMaterialsWorkflowOutput>;

// ── Manufacturing I/O ────────────────────────────────────────────────────────

export const manufacturingWorkflowInput = z.object({
  numRawMaterials: z.number().int().positive(),
  totalMassKg: z.number().positive(),
  bulkDensityKgPerL: z.number().positive(),
  productForm: z.enum(["tablet", "capsule"]).optional(),
});

export const manufacturingWorkflowOutput = z.object({
  blender: z.object({
    blenderSizeCuFt: z.number(),
    batches: z.number(),
    requiredVolumeCuFt: z.number(),
    workingCapacityCuFt: z.number(),
    workingFillFraction: z.number(),
  }),
  blenderOptions: z.array(BlenderOptionSchema),
  operations: z.array(OperationBreakdownSchema),
  totals: z.object({
    machineHours: z.number(),
    laborHours: z.number(),
    overheadCost: z.number(),
    laborCost: z.number(),
    grandTotal: z.number(),
  }),
});

export type ManufacturingWorkflowInput = z.infer<typeof manufacturingWorkflowInput>;
export type ManufacturingWorkflowOutput = z.infer<typeof manufacturingWorkflowOutput>;

// ── Packaging I/O ────────────────────────────────────────────────────────────

export const packagingWorkflowInput = z.object({
  packagingComponents: z.array(PackagingComponentSchema),
  packagingYieldPercentGlobal: z.number().nonnegative().default(1.5),
  unitsPerFinishedGood: z.number().positive(),
  finishedGoodQuantity: z.number().positive(),
});

export const packagingWorkflowOutput = z.object({
  materials: z.object({
    summary: z.object({
      packagingYieldPercentGlobal: z.number(),
      totalPackagingMaterialsCost: z.number(),
    }),
    breakdown: z.array(PackagingBreakdownRowSchema),
  }),
  overhead: z
    .object({
      operation: z.literal("Packaging"),
      headcount: z.number(),
      setupHours: z.number(),
      runHours: z.number(),
      machineHours: z.number(),
      laborHours: z.number(),
      overheadCost: z.number(),
      laborCost: z.number(),
      totalCost: z.number(),
      basis: z.object({
        innerFill: z.number(),
        processDescription: z.enum(["Bottle - Normal", "Bottle - Glass"]),
      }),
    })
    .nullable(),
});

export type PackagingWorkflowInput = z.infer<typeof packagingWorkflowInput>;
export type PackagingWorkflowOutput = z.infer<typeof packagingWorkflowOutput>;

// ── Total Costing I/O ────────────────────────────────────────────────────────

export const totalCostingWorkflowInput = z.object({
  rawMaterials: rawMaterialsWorkflowInput,
  productForm: z.enum(["tablet", "capsule"]).optional(),
  packaging: packagingWorkflowInput,
});

export const totalCostingWorkflowOutput = z.object({
  rawMaterials: rawMaterialsWorkflowOutput,
  manufacturing: manufacturingWorkflowOutput,
  packaging: packagingWorkflowOutput,
  totals: z.object({
    rawMaterialsCost: z.number(),
    packagingMaterialsCost: z.number(),
    packagingOverheadCost: z.number(),
    manufacturingCost: z.number(),
    grandTotal: z.number(),
    costPerFinishedGood: z.number(),
    costPerUnit: z.number(),
  }),
});

export type TotalCostingWorkflowInput = z.infer<typeof totalCostingWorkflowInput>;
export type TotalCostingWorkflowOutput = z.infer<typeof totalCostingWorkflowOutput>;