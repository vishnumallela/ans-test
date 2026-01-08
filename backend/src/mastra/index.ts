import { Mastra } from "@mastra/core/mastra";
import { vectorSearchWorkflow } from "./workflows/vector-search";
import { ingredientEnrichmentWorkflow } from "./workflows/ingredient-enrichment";

export const mastra = new Mastra({
  workflows: { vectorSearchWorkflow, ingredientEnrichmentWorkflow },
});

