import { Mastra } from "@mastra/core/mastra";
import { ingredientEnrichmentWorkflow } from "./workflows/ingredient-enrich/index";
import { ingredientSearchWorkflow } from "./workflows/ingredient-search/index";
import {
  assayAdjustmentWorkflow,
  rawMaterialsCostingWorkflow,
  manufacturingCostsWorkflow,
  packagingCostsWorkflow,
  getPackagingMaterialsWorkflow,
  totalCostingWorkflow,
} from "./workflows/costing";

export const mastra = new Mastra({
  workflows: {
    ingredientEnrichmentWorkflow,
    ingredientSearchWorkflow,
    assayAdjustmentWorkflow,
    rawMaterialsCostingWorkflow,
    manufacturingCostsWorkflow,
    packagingCostsWorkflow,
    getPackagingMaterialsWorkflow,
    totalCostingWorkflow,
  },
});