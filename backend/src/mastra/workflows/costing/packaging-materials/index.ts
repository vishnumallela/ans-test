import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { join } from "path";
import { readFileSync } from "fs";
import papa from "papaparse";

const csvPath = join(__dirname, "../../../../resources/packaging-materials.csv");
const csvText = readFileSync(csvPath, "utf8");

const catalog = papa.parse(csvText, {
  header: true,
  skipEmptyLines: true,
  transformHeader: (h) => h.trim().toLowerCase(),
}).data;

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
  description: "Returns the packaging materials catalog",
  inputSchema,
  outputSchema,
})
  .then(fetchStep)
  .commit();