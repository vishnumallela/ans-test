import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import catalog from "./packaging-materials.json";

const inputSchema = z.object({
  product_type: z.enum(["tablet", "capsule"]),
});

const outputSchema = z.object({
  packagingMaterials: z.array(z.any()),
});

const fetchStep = createStep({
  id: "get-packaging-materials",
  inputSchema,
  outputSchema,
  execute: async () => ({ packagingMaterials: catalog }),
});

export const getPackagingMaterialsWorkflow = createWorkflow({
  id: "get-packaging-materials-workflow",
  description: "Returns the packaging materials catalog (bottles, caps, labels, etc.)",
  inputSchema,
  outputSchema,
})
  .then(fetchStep)
  .commit();