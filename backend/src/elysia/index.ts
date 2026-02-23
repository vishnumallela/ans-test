import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { imageExtractRouter } from "./routers/image-extract";
import { searchSimilarRouter } from "./routers/search-similar";
import { errorHandler } from "./plugins/error-handler";
import { logger } from "@grotto/logysia";

const app = new Elysia({
  serve: { idleTimeout: 255 },
})
  .use(
    logger({
      logIP: false,
      writer: { write: (msg: string) => console.log(msg) },
    })
  )
  .use(
    cors({
      origin: [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
      ],
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
    })
  )
  .use(
    openapi({
      provider: "swagger-ui",
      documentation: {
        info: {
          title: "ANS API",
          version: "1.0.0",
        },
      },
    })
  )
  .use(errorHandler)
  .use(imageExtractRouter)
  .use(searchSimilarRouter);

export function startElysiaServer(port: number) {
  app.listen(port, () => {
    console.log(`API Server running on http://localhost:${port}`);
    console.log(`Swagger UI: http://localhost:${port}/openapi`);
  });
}
