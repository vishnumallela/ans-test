import { Mastra } from '@mastra/core/mastra';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { QdrantClient } from '@qdrant/qdrant-js';
import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import { z } from 'zod';

"use strict";
const vectorSearchInputSchema = z.array(
  z.object({
    name: z.string()
  })
);
const vectorSearchOutputSchema = z.array(
  z.object({
    name: z.string(),
    top_matches: z.array(
      z.object({
        name: z.string(),
        similarity: z.number(),
        id: z.string(),
        metadata: z.record(z.string(), z.unknown()).optional()
      })
    )
  })
);

"use strict";
const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME ?? "ingredients";
const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY
});
const vectorSearchStep = createStep({
  id: "vector-search",
  inputSchema: vectorSearchInputSchema,
  outputSchema: vectorSearchOutputSchema,
  execute: async ({ inputData }) => {
    const texts = inputData.map((input) => input.name);
    const { embeddings } = await embedMany({
      model: openai.embedding("text-embedding-3-large"),
      values: texts
    });
    const searches = embeddings.map((vector) => ({
      vector,
      limit: 5,
      with_payload: true
    }));
    const batchResults = await qdrantClient.searchBatch(COLLECTION_NAME, {
      searches
    });
    return inputData.map((input, index) => ({
      name: input.name,
      top_matches: (batchResults[index] ?? []).map((result) => ({
        name: String(result.payload?.name ?? ""),
        similarity: result.score ?? 0,
        id: String(result.id),
        metadata: result.payload ?? void 0
      }))
    }));
  }
});
const vectorSearchWorkflow = createWorkflow({
  id: "ingredient-vector-search",
  description: "Search for similar ingredients using vector similarity matching",
  inputSchema: vectorSearchInputSchema,
  outputSchema: vectorSearchOutputSchema
}).then(vectorSearchStep).commit();

"use strict";
const mastra = new Mastra({
  workflows: {
    vectorSearchWorkflow
  }
});

export { mastra };
