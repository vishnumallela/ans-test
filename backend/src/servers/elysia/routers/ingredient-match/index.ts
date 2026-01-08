import { Elysia } from "elysia";
import { IngredientMatchBody, IngredientMatchResponse, IngredientMatchErrorResponse } from "./model";
import { extractAndMatchIngredients } from "./service";

export const ingredientMatchRouter = new Elysia({ prefix: "/ingredient-match" })
  .onError(({ error, set }) => {
    console.error(error);
    set.status = 500;
    return { success: false as const, error: "Failed to process image and match ingredients" };
  })
  .post("/", async ({ body }) => {
    const result = await extractAndMatchIngredients(body.file);
    return { success: true as const, ...result };
  }, {
    body: IngredientMatchBody,
    response: {
      200: IngredientMatchResponse,
      500: IngredientMatchErrorResponse,
    },
  });

