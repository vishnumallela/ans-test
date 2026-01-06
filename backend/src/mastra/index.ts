import { Mastra } from "@mastra/core/mastra";
import { vectorSearchWorkflow } from "./workflows/vector-search";

export const mastra = new Mastra({
  workflows: { vectorSearchWorkflow },
});

