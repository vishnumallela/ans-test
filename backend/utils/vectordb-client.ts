import { QdrantClient } from "@qdrant/qdrant-js";

export const vector_db = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY!,
});
