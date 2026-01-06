import { Elysia } from "elysia";
import { ImageExtractBody, ImageExtractResponse, ImageExtractErrorResponse } from "./model";
import { extractSupplementLabel } from "./service";

export const imageExtractRouter = new Elysia({ prefix: "/image-extract" })
  .onError(({ error, set }) => {
    console.error(error);
    set.status = 500;
    return { success: false as const, error: "Failed to process image" };
  })
  .post("/", async ({ body }) => {
    const result = await extractSupplementLabel(body.file);
    return { success: true as const, ...result };
  }, {
    body: ImageExtractBody,
    response: {
      200: ImageExtractResponse,
      500: ImageExtractErrorResponse,
    },
  });
