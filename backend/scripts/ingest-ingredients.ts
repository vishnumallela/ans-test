import { ingredientEnrichmentWorkflow } from "../src/mastra/workflows/ingredient-enrichment";
import { QdrantClient } from "@qdrant/qdrant-js";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { readFileSync } from "fs";
import { join } from "path";
import Papa from "papaparse";

const CSV_PATH = join(import.meta.dir, "ingredients.csv");
const COLLECTION = process.env.QDRANT_COLLECTION_NAME ?? "ingredients";

// Support range-based processing for parallel execution
// Usage: bun run scripts/ingest-ingredients.ts [from] [to]
const FROM_INDEX = parseInt(process.argv[2] ?? "0", 10);
const TO_INDEX = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY,
});

async function main() {

  const { data: rows } = Papa.parse<{ itemid: string; description: string; commoditycode: string }>(
    readFileSync(CSV_PATH, "utf-8"),
    { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() }
  );

  const total = rows.length;
  const endIndex = TO_INDEX !== undefined ? Math.min(TO_INDEX, total) : total;
  const itemsToProcess = endIndex - FROM_INDEX;
  
  console.log(`\n📊 Total rows: ${total}`);
  console.log(`🚀 Processing range: ${FROM_INDEX} → ${endIndex}`);
  console.log(`📝 Will process: ${itemsToProcess} items\n`);
  console.log("─".repeat(50));

  const { collections } = await qdrant.getCollections();
  if (!collections.some((c) => c.name === COLLECTION)) {
    await qdrant.createCollection(COLLECTION, { vectors: { size: 3072, distance: "Cosine" } });
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = FROM_INDEX; i < endIndex; i++) {
    const row = rows[i];
    if (!row) continue;
    const { itemid, description, commoditycode } = row;
    const current = i + 1;
    
    console.log(`\n[${current}/${total}] ID: ${itemid} | ${description} | ${commoditycode}`);

    const run = await ingredientEnrichmentWorkflow.createRunAsync();
    const result = await run.start({ inputData: { itemCode: itemid, rawInput: description } });

    if (result.status !== "success" || !result.result) {
      failCount++;
      console.log(`  ❌ Failed | Progress: ${current}/${total} | Success: ${successCount} | Failed: ${failCount}`);
      console.log(`  ⚠️  If rate limited, resume with: FROM_INDEX=${i} TO_INDEX=${endIndex}`);
      continue;
    }

    const data = result.result;
    console.log(`  → ${data.embeddingText}`);

    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-large"),
      value: data.embeddingText,
    });

    // Use numeric index as Qdrant ID (itemid is stored in payload)
    await qdrant.upsert(COLLECTION, { wait: true, points: [{ id: i, vector: embedding, payload: data }] });
    successCount++;
    console.log(`  ✅ Done | Progress: ${current}/${total} | Success: ${successCount} | Failed: ${failCount}`);
  }

  console.log("\n" + "─".repeat(50));
  console.log(`\n🏁 Ingestion complete for range ${FROM_INDEX} → ${endIndex}!`);
  console.log(`   Total processed: ${successCount + failCount}`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}\n`);
}

main();
