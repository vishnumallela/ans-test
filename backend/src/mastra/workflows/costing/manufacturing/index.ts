import { createStep, createWorkflow } from "@mastra/core/workflows";
import {
  manufacturingWorkflowInput,
  manufacturingWorkflowOutput,
  BlenderOptionSchema,
  OperationBreakdownSchema,
} from "../types";
import { z } from "zod";
import ormBulkRefData from "../../../../resources/orm-bulk-ref-data.json";

// ── Constants ───────────────────────────────────────────────────────────────

const L_PER_CUFT = 28.316846592;
const BLENDER_SIZES = [5, 12.5, 60, 150, 300];
const FILL_FRAC = 0.8;
const OVERHEAD_RATE = 205; // $/machine-hr
const LABOR_RATE = 40;     // $/person-hr

// ── ORM helpers ─────────────────────────────────────────────────────────────

type OrmRow = {
  ProductClass: string; ProcessCategory: string; ProcessDescription: string;
  Headcount: number; SetupHours: number; RunRate: number | null;
  RunUnitsPerHour: number; RunRangeBasis: string; RunLowRange: number; RunHighRange: number;
};

const findMfgRow = (op: "Weigh-Up" | "Mixing", rmLines: number): OrmRow | null =>
  (ormBulkRefData as OrmRow[]).find(
    (r) => r.ProductClass === "Solid Dose" && r.ProcessCategory === "Manufacturing" &&
      r.ProcessDescription === op && r.RunRangeBasis === "RM lines" &&
      rmLines >= r.RunLowRange && rmLines <= r.RunHighRange
  ) ?? null;

const r2 = (v: number) => Math.round(v * 100) / 100;
const ceil10 = (v: number) => Math.ceil(v * 10) / 10;

// ── Intermediate schemas ────────────────────────────────────────────────────

const afterBlenderSchema = manufacturingWorkflowInput.extend({
  blender: z.object({
    blenderSizeCuFt: z.number(), batches: z.number(),
    requiredVolumeCuFt: z.number(), workingCapacityCuFt: z.number(), workingFillFraction: z.number(),
  }),
  blenderOptions: z.array(BlenderOptionSchema),
});

const afterBulkOpsSchema = afterBlenderSchema.extend({
  weighUp: OperationBreakdownSchema,
  mixing: OperationBreakdownSchema,
});

// ── Step 1: Blender selection ───────────────────────────────────────────────

const blenderSelectionStep = createStep({
  id: "blender-selection",
  inputSchema: manufacturingWorkflowInput,
  outputSchema: afterBlenderSchema,
  execute: async ({ inputData }) => {
    const reqCuFt = (inputData.totalMassKg / inputData.bulkDensityKgPerL) / L_PER_CUFT;

    const options = BLENDER_SIZES.map((size) => {
      const wf = size === 300 ? 1.0 : FILL_FRAC;
      const wCap = size * wf;
      const batches = Math.max(1, Math.ceil(reqCuFt / wCap));
      const fillFraction = Math.min(1, reqCuFt / (batches * wCap));
      return { blenderSizeCuFt: size, workingCapacityCuFt: wCap, batches, fillFraction };
    });

    // Pick: fewest batches → fill closest to 1 → smallest
    const sel = [...options].sort((a, b) => {
      if (a.batches !== b.batches) return a.batches - b.batches;
      const d = Math.abs(1 - a.fillFraction) - Math.abs(1 - b.fillFraction);
      return d !== 0 ? d : a.blenderSizeCuFt - b.blenderSizeCuFt;
    })[0];

    return {
      ...inputData,
      blender: {
        blenderSizeCuFt: sel.blenderSizeCuFt, batches: sel.batches,
        requiredVolumeCuFt: reqCuFt, workingCapacityCuFt: sel.workingCapacityCuFt,
        workingFillFraction: sel.workingCapacityCuFt / sel.blenderSizeCuFt,
      },
      blenderOptions: options,
    };
  },
});

// ── Step 2: Weigh-Up & Mixing (ORM lookup) ──────────────────────────────────

const bulkOperationsStep = createStep({
  id: "bulk-operations",
  inputSchema: afterBlenderSchema,
  outputSchema: afterBulkOpsSchema,
  execute: async ({ inputData }) => {
    const { numRawMaterials, blender: { batches } } = inputData;

    function computeOp(op: "Weigh-Up" | "Mixing") {
      const row = findMfgRow(op, numRawMaterials);
      if (!row) throw new Error(`No ORM row for "${op}" with ${numRawMaterials} RM lines`);

      const setupHrs = ceil10(row.SetupHours + (batches - 1) * (row.SetupHours / 2));
      const runHrs = (row.RunRate ?? 0) * batches;
      const machHrs = setupHrs + runHrs;
      const labHrs = row.Headcount * machHrs;
      const overhead = r2(machHrs * OVERHEAD_RATE);
      const labor = r2(labHrs * LABOR_RATE);

      return {
        operation: op, headcount: row.Headcount,
        setupHours: r2(setupHrs), runHours: r2(runHrs),
        machineHours: r2(machHrs), laborHours: r2(labHrs),
        overheadCost: overhead, laborCost: labor, totalCost: r2(overhead + labor),
      };
    }

    return { ...inputData, weighUp: computeOp("Weigh-Up"), mixing: computeOp("Mixing") };
  },
});

// ── Step 3: Form operation (Coating/Encap) + totals ─────────────────────────

const formOperationAndTotalsStep = createStep({
  id: "form-operation-and-totals",
  inputSchema: afterBulkOpsSchema,
  outputSchema: manufacturingWorkflowOutput,
  execute: async ({ inputData }) => {
    const { weighUp, mixing, blender, blenderOptions, productForm } = inputData;

    let formOp: z.infer<typeof OperationBreakdownSchema> | null = null;
    if (productForm === "tablet" || productForm === "capsule") {
      const s = 0.75; // flat setup hours
      formOp = {
        operation: productForm === "tablet" ? "Coating" : "Encapsulation",
        headcount: 1, setupHours: r2(s), runHours: 0, machineHours: r2(s),
        laborHours: r2(s), overheadCost: r2(s * OVERHEAD_RATE),
        laborCost: r2(s * LABOR_RATE), totalCost: r2(s * OVERHEAD_RATE + s * LABOR_RATE),
      };
    }

    const ops = formOp ? [weighUp, mixing, formOp] : [weighUp, mixing];
    const totals = ops.reduce(
      (a, o) => ({
        machineHours: a.machineHours + o.machineHours,
        laborHours: a.laborHours + o.laborHours,
        overheadCost: a.overheadCost + o.overheadCost,
        laborCost: a.laborCost + o.laborCost,
        grandTotal: a.grandTotal + o.totalCost,
      }),
      { machineHours: 0, laborHours: 0, overheadCost: 0, laborCost: 0, grandTotal: 0 }
    );

    return {
      blender, blenderOptions, operations: ops,
      totals: {
        machineHours: r2(totals.machineHours), laborHours: r2(totals.laborHours),
        overheadCost: r2(totals.overheadCost), laborCost: r2(totals.laborCost),
        grandTotal: r2(totals.grandTotal),
      },
    };
  },
});

// ── Workflow ─────────────────────────────────────────────────────────────────

export const manufacturingCostsWorkflow = createWorkflow({
  id: "manufacturing-costs",
  description: "Blender selection, Weigh-Up & Mixing from ORM ref-data, optional Coating/Encapsulation",
  inputSchema: manufacturingWorkflowInput,
  outputSchema: manufacturingWorkflowOutput,
})
  .then(blenderSelectionStep)
  .then(bulkOperationsStep)
  .then(formOperationAndTotalsStep)
  .commit();