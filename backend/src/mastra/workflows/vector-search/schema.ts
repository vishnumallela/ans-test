import { z } from "zod";

export const vectorSearchInputSchema = z.array(
  z.object({
    name: z.string(),
  })
);

export const vectorSearchOutputSchema = z.array(
  z.object({
    name: z.string(),
    top_matches: z.array(
      z.object({
        name: z.string(),
        similarity: z.number(),
        id: z.string(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    ),
  })
);
