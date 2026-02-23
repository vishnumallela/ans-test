import { createStep, createWorkflow } from "@mastra/core/workflows";
import { embed } from "ai";
import { vector_db } from "../../../../utils/vectordb-client";
import { EMBEDDING_MODEL } from "../../../../utils/models";
import { z } from "zod";

const inputSchema = z.object({
  ingredients: z
    .array(z.string().describe("A single ingredient name extracted from a product label"))
    .describe("List of ingredient names extracted from a product label to search for matches"),
});

const outputSchema = z
  .array(
    z.object({
      ingredient: z.string().describe("The original ingredient name that was searched"),
      matches: z
        .array(
          z.object({
            trade_name: z.string().describe("The trade name of the matching raw material"),
            similarity_score: z.number().describe("Vector similarity score - may include false positives"),
            item_id: z.string().describe("Unique identifier of the raw material in the database"),
            category: z.string().optional().describe("Ingredient category for context"),
            cost: z.number().optional().describe("Cost of the matching raw material"),
            cost_unit: z.string().optional().describe("Unit of the cost of the matching raw material"),
          })
        )
        .describe("Top 6 candidates - LLM should re-rank and filter false positives"),
    })
  )
  .describe("Search results for each ingredient - includes potential false positives for LLM to filter");


const searchStep = createStep({
  id: "search",
  inputSchema,
  outputSchema,
  execute: async ({ inputData }) => {
    const { ingredients } = inputData;

    const results = await Promise.all(
      ingredients.map(async (ingredient) => {
        try {
          const { embedding } = await embed({ model: EMBEDDING_MODEL, value: ingredient });
          const searchResults = await vector_db.search("ingredients", {
            vector: embedding,
            limit: 6,
            with_payload: true,
          });
          return {
            ingredient,
            matches: searchResults.map((r) => ({
              trade_name: r.payload?.trade_name as string,
              similarity_score: Math.round(r.score * 1000) / 1000,
              item_id: r.payload?.item_id as string,
              category: (r.payload?.category as string) || undefined,
              cost: r.payload?.cost as number,
              cost_unit: r.payload?.cost_unit as string,
            })),
          };
        } catch {
          return { ingredient, matches: [] };
        }
      })
    );

    return results;
  },
});

export const ingredientSearchWorkflow = createWorkflow({
  id: "ingredient-search",
  description: "Once ingredient names are extracted from a product label, this workflow searches the database for the most similar raw materials",
  inputSchema,
  outputSchema,
})
  .then(searchStep)
  .commit();
