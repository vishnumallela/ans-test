import { createStep, createWorkflow } from "@mastra/core/workflows";
import {
  packagingWorkflowInput,
  packagingWorkflowOutput,
  PackagingBreakdownRowSchema,
} from "../types";
import { z } from "zod";
import ormBulkRefData from "../../../../resources/orm-bulk-ref-data.json";

const OVERHEAD_RATE = 205;
const LABOR_RATE = 40;

type OrmRow = {
  ProductClass: string; ProcessCategory: string; ProcessDescription: string;
  Headcount: number; SetupHours: number; RunRate: number | null;
  RunUnitsPerHour: number; RunRangeBasis: string; RunLowRange: number; RunHighRange: number;
};

const findPkgRow = (desc: "Bottle - Normal" | "Bottle - Glass", fill: number): OrmRow | null =>
  (ormBulkRefData as OrmRow[]).find(
    (r) => r.ProductClass === "Solid Dose" && r.ProcessCategory === "Packaging" &&
      r.ProcessDescription === desc && r.RunRangeBasis === "Inner fill" &&
      fill >= r.RunLowRange && fill <= r.RunHighRange
  ) ?? null;

// ── Intermediate schema ─────────────────────────────────────────────────────

const afterMaterialsSchema = packagingWorkflowInput.extend({
  materials: z.object({
    summary: z.object({ packagingYieldPercentGlobal: z.number(), totalPackagingMaterialsCost: z.number() }),
    breakdown: z.array(PackagingBreakdownRowSchema),
  }),
});

// ── Step 1: Packaging materials cost ────────────────────────────────────────

const packagingMaterialsStep = createStep({
  id: "packaging-materials",
  inputSchema: packagingWorkflowInput,
  outputSchema: afterMaterialsSchema,
  execute: async ({ inputData }) => {
    const { packagingComponents, packagingYieldPercentGlobal } = inputData;

    const breakdown = packagingComponents.map((c) => {
      const qtyUsed = c.quantityOverride ?? c.quantity;
      const yieldPct = c.lineYieldPercentOverride ?? packagingYieldPercentGlobal;
      const reqWithYield = qtyUsed * (1 + yieldPct / 100);
      const costPerUoM = c.costOverride ?? c.costPerPurchasingUoM;
      const costEach = c.uom === "M" ? costPerUoM / 1000 : costPerUoM;
      const lineBefore = c.customerSupplied ? 0 : reqWithYield * costEach;
      const moq = c.moqEaches ?? 0;
      const shortfall = Math.max(moq - reqWithYield, 0);
      const moqAdd = c.customerSupplied ? 0 : shortfall * costEach;

      return {
        ...(c.id && { id: c.id }),
        componentName: c.componentName, uom: c.uom,
        quantityBase: c.quantity,
        quantityUsed: Number(qtyUsed.toFixed(6)),
        lineYieldPercentUsed: yieldPct,
        requiredUnitsWithYield: Number(reqWithYield.toFixed(6)),
        costPerEachApplied: Number(costEach.toFixed(6)),
        moqEaches: moq,
        moqShortfallEaches: Number(shortfall.toFixed(6)),
        moqAddCost: Number(moqAdd.toFixed(6)),
        lineCostBeforeMOQ: Number(lineBefore.toFixed(6)),
        lineCostTotal: Number((lineBefore + moqAdd).toFixed(6)),
      };
    });

    const total = breakdown.reduce((s, b) => s + b.lineCostTotal, 0);

    return {
      ...inputData,
      materials: {
        summary: {
          packagingYieldPercentGlobal: Number(packagingYieldPercentGlobal.toFixed(4)),
          totalPackagingMaterialsCost: Number(total.toFixed(6)),
        },
        breakdown,
      },
    };
  },
});

// ── Step 2: Packaging line overhead (ORM lookup) ────────────────────────────

const packagingOverheadStep = createStep({
  id: "packaging-overhead",
  inputSchema: afterMaterialsSchema,
  outputSchema: packagingWorkflowOutput,
  execute: async ({ inputData }) => {
    const { packagingComponents, unitsPerFinishedGood, finishedGoodQuantity, materials } = inputData;

    const hasGlass = packagingComponents.some((c) => /glass/i.test(c.componentName));
    const desc: "Bottle - Normal" | "Bottle - Glass" = hasGlass ? "Bottle - Glass" : "Bottle - Normal";
    const row = findPkgRow(desc, unitsPerFinishedGood);
    let overhead: z.infer<typeof packagingWorkflowOutput>["overhead"] = null;

    if (row && row.RunUnitsPerHour > 0) {
      const setup = row.SetupHours;
      const run = finishedGoodQuantity / row.RunUnitsPerHour;
      const mach = setup + run;
      const lab = row.Headcount * mach;
      const ohCost = Number((mach * OVERHEAD_RATE).toFixed(2));
      const labCost = Number((lab * LABOR_RATE).toFixed(2));

      overhead = {
        operation: "Packaging" as const, headcount: row.Headcount,
        setupHours: Number(setup.toFixed(2)), runHours: Number(run.toFixed(2)),
        machineHours: Number(mach.toFixed(2)), laborHours: Number(lab.toFixed(2)),
        overheadCost: ohCost, laborCost: labCost, totalCost: Number((ohCost + labCost).toFixed(2)),
        basis: { innerFill: unitsPerFinishedGood, processDescription: desc },
      };
    }

    return { materials, overhead };
  },
});

// ── Workflow ─────────────────────────────────────────────────────────────────

export const packagingCostsWorkflow = createWorkflow({
  id: "packaging-costs",
  description: "Packaging materials cost (yield, UoM, MOQ) + line overhead from ORM ref-data",
  inputSchema: packagingWorkflowInput,
  outputSchema: packagingWorkflowOutput,
})
  .then(packagingMaterialsStep)
  .then(packagingOverheadStep)
  .commit();