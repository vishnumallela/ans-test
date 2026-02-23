import { Elysia } from "elysia";
import { z } from "zod";
import { embed } from "ai";
import { vector_db } from "../../../../utils/vectordb-client";
import { EMBEDDING_MODEL } from "../../../../utils/models";
import { standardErrors } from "../../plugins/error-handler";

const MatchSchema = z.object({
  trade_name: z.string().describe("Trade name of the matching raw material"),
  similarity_score: z.number().describe("Similarity score between 0 and 1"),
  item_id: z.string().describe("Unique identifier of the raw material"),
});

const SearchResultSchema = z.object({
  ingredient: z.string().describe("The original ingredient name searched"),
  matches: z.array(MatchSchema).describe("Top matching raw materials"),
});

const SearchRequestSchema = z.object({
  ingredients: z.array(z.string()).describe("List of ingredient names to search"),
});

const SearchSuccessResponse = z.object({
  success: z.literal(true),
  results: z.array(SearchResultSchema),
});

const searchIngredient = async (ingredient: string) => {
  try {
    const { embedding } = await embed({ model: EMBEDDING_MODEL, value: ingredient });
    const searchResults = await vector_db.search("ingredients", {
      vector: embedding,
      limit: 4,
      with_payload: true,
    });
    return {
      ingredient,
      matches: searchResults.map((r) => ({
        trade_name: r.payload?.trade_name as string,
        similarity_score: Math.round(r.score * 1000) / 1000,
        item_id: r.payload?.item_id as string,
      })).sort((a, b) => b.similarity_score - a.similarity_score),
    };
  } catch {
    return { ingredient, matches: [] };
  }
};

export const searchSimilarRouter = new Elysia({ prefix: "/search-similar" }).post(
  "/",
  async ({ body }) => {
    const results = await Promise.all(body.ingredients.map(searchIngredient));
    return { success: true as const, results };
  },
  {
    body: SearchRequestSchema,
    response: {
      200: SearchSuccessResponse,
      ...standardErrors,
    },
    detail: {
      summary: "Search similar ingredients",
      description: "Search for similar raw materials in the inventory database by ingredient names",
      tags: ["Search"],
    },
  }
);
