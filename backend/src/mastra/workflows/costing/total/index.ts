import { createStep, createWorkflow } from "@mastra/core/workflows";
import {
  totalCostingWorkflowInput, totalCostingWorkflowOutput,
  rawMaterialsWorkflowOutput, manufacturingWorkflowOutput, packagingWorkflowOutput,
  type RawMaterialsWorkflowOutput, type ManufacturingWorkflowOutput, type PackagingWorkflowOutput,
} from "../types";
import { z } from "zod";

// ── Intermediate schemas ────────────────────────────────────────────────────

const afterRM = totalCostingWorkflowInput.extend({ rawMaterialsResult: rawMaterialsWorkflowOutput });
const afterMfg = afterRM.extend({ manufacturingResult: manufacturingWorkflowOutput });
const afterPkg = afterMfg.extend({ packagingResult: packagingWorkflowOutput });

// ── Step 1: Raw materials sub-workflow ──────────────────────────────────────

const runRawMaterialsStep = createStep({
  id: "run-raw-materials-costing",
  inputSchema: totalCostingWorkflowInput,
  outputSchema: afterRM,
  execute: async ({ inputData, mastra }) => {
    const wf = mastra?.getWorkflow("raw-materials-costing");
    if (!wf) throw new Error("raw-materials-costing workflow not registered");
    const { status, result } = await wf.createRun().start({ inputData: inputData.rawMaterials });
    if (status !== "success") throw new Error(`raw-materials-costing failed: ${JSON.stringify(result)}`);
    return { ...inputData, rawMaterialsResult: result as RawMaterialsWorkflowOutput };
  },
});

// ── Step 2: Manufacturing sub-workflow ──────────────────────────────────────

const runManufacturingStep = createStep({
  id: "run-manufacturing-costs",
  inputSchema: afterRM,
  outputSchema: afterMfg,
  execute: async ({ inputData, mastra }) => {
    const { rawMaterialsResult, rawMaterials, productForm } = inputData;
    const numRM = rawMaterials.rawMaterials.filter((m) => m.quantityPerUnitMg > 0).length;
    const wf = mastra?.getWorkflow("manufacturing-costs");
    if (!wf) throw new Error("manufacturing-costs workflow not registered");
    const { status, result } = await wf.createRun().start({
      inputData: {
        numRawMaterials: numRM,
        totalMassKg: rawMaterialsResult.density.product.totalMassKg,
        bulkDensityKgPerL: rawMaterialsResult.density.product.densityGPerMl,
        productForm,
      },
    });
    if (status !== "success") throw new Error(`manufacturing-costs failed: ${JSON.stringify(result)}`);
    return { ...inputData, manufacturingResult: result as ManufacturingWorkflowOutput };
  },
});

// ── Step 3: Packaging sub-workflow ──────────────────────────────────────────

const runPackagingStep = createStep({
  id: "run-packaging-costs",
  inputSchema: afterMfg,
  outputSchema: afterPkg,
  execute: async ({ inputData, mastra }) => {
    const wf = mastra?.getWorkflow("packaging-costs");
    if (!wf) throw new Error("packaging-costs workflow not registered");
    const { status, result } = await wf.createRun().start({ inputData: inputData.packaging });
    if (status !== "success") throw new Error(`packaging-costs failed: ${JSON.stringify(result)}`);
    return { ...inputData, packagingResult: result as PackagingWorkflowOutput };
  },
});

// ── Step 4: Grand total roll-up (BUG FIX: costPer* uses grandTotal) ────────

const grandTotalStep = createStep({
  id: "grand-total-roll-up",
  inputSchema: afterPkg,
  outputSchema: totalCostingWorkflowOutput,
  execute: async ({ inputData }) => {
    const { rawMaterialsResult: rm, manufacturingResult: mfg, packagingResult: pkg, rawMaterials } = inputData;

    const rmCost = rm.summary.totalRawMaterialCost;
    const pkgMatCost = pkg.materials.summary.totalPackagingMaterialsCost;
    const pkgOhCost = pkg.overhead?.totalCost ?? 0;
    const mfgCost = mfg.totals.grandTotal;
    const grand = rmCost + pkgMatCost + pkgOhCost + mfgCost;

    const fgQty = rawMaterials.finishedGoodQuantity;
    const totalUnits = rawMaterials.unitsPerFinishedGood * fgQty;

    return {
      rawMaterials: rm,
      manufacturing: mfg,
      packaging: pkg,
      totals: {
        rawMaterialsCost: Number(rmCost.toFixed(4)),
        packagingMaterialsCost: Number(pkgMatCost.toFixed(4)),
        packagingOverheadCost: Number(pkgOhCost.toFixed(4)),
        manufacturingCost: Number(mfgCost.toFixed(4)),
        grandTotal: Number(grand.toFixed(4)),
        costPerFinishedGood: Number((grand / fgQty).toFixed(6)),
        costPerUnit: Number((grand / totalUnits).toFixed(8)),
      },
    };
  },
});

// ── Workflow ─────────────────────────────────────────────────────────────────

export const totalCostingWorkflow = createWorkflow({
  id: "total-costing",
  description: "Orchestrates raw-materials → manufacturing → packaging and rolls up grand total",
  inputSchema: totalCostingWorkflowInput,
  outputSchema: totalCostingWorkflowOutput,
})
  .then(runRawMaterialsStep)
  .then(runManufacturingStep)
  .then(runPackagingStep)
  .then(grandTotalStep)
  .commit();