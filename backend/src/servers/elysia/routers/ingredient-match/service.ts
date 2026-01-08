import { extractSupplementLabel } from "../image-extract/service";
import { vectorSearchWorkflow } from "../../../../mastra/workflows/vector-search";

type IngredientMatchResult = {
  name: string;
  type: "active" | "inactive";
  top_matches: {
    name: string;
    similarity: number;
    id: string;
    metadata?: Record<string, unknown>;
  }[];
};

export const extractAndMatchIngredients = async (file: File) => {
  // Step 1: Extract supplement label data from image
  const { data: extraction, imageUrl } = await extractSupplementLabel(file);

  // Step 2: Collect all ingredient names with their types
  const ingredientInputs: { name: string; type: "active" | "inactive" }[] = [];

  // Add active ingredients
  for (const ingredient of extraction.active_ingredients) {
    ingredientInputs.push({ name: ingredient.name, type: "active" });
  }

  // Add inactive ingredients if present
  if (extraction.inactive_ingredients) {
    for (const ingredient of extraction.inactive_ingredients) {
      ingredientInputs.push({ name: ingredient.name, type: "inactive" });
    }
  }

  // Step 3: Run vector search workflow for all ingredients
  const searchInput = ingredientInputs.map((i) => ({ name: i.name }));
  const run = await vectorSearchWorkflow.createRunAsync();
  const runResult = await run.start({ inputData: searchInput });

  // Step 4: Map results back with ingredient types
  let matches: IngredientMatchResult[] = [];

  if (runResult.status === "success" && runResult.result) {
    matches = runResult.result.map((searchResult, index) => ({
      name: searchResult.name,
      type: ingredientInputs[index]?.type ?? "active",
      top_matches: searchResult.top_matches,
    }));
  }

  return {
    imageUrl,
    extraction,
    matches,
  };
};

