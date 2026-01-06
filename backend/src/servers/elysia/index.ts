import { Elysia } from "elysia";
import { imageExtractRouter } from "./routers/image-extract";
import { openapi } from "@elysiajs/openapi";
import { zodToJsonSchema } from "zod-to-json-schema";

export const app = new Elysia()
  .use(
    openapi({
      provider: "swagger-ui",
      mapJsonSchema:{
        zod:zodToJsonSchema
      }
    })
  )
  .use(imageExtractRouter);

export function startElysiaServer(port: number) {
  app.listen(port, () => {
    console.log(`Elysia Server running on http://localhost:${port}`);
  });
}
