import { ingredientEnrichmentWorkflow } from "../mastra/workflows/ingredient-enrich/index";
import { spawn } from "child_process";
import { parse } from "papaparse";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Unified ingestion script
 * 
 * Usage:
 *   Single worker:  bun run src/scripts/injest.ts <start> <end>
 *   Multi-process:  bun run src/scripts/injest.ts --spawn <start> <batch_size> <concurrency>
 * 
 * Examples:
 *   bun run src/scripts/injest.ts 0 100           # Process rows 0-100
 *   bun run src/scripts/injest.ts --spawn 2000 200 10   # Start from 2000, 200 per batch, 10 concurrent
 */

const FILE_PATH = join(process.cwd(), "src/scripts/raw-materials.csv");

async function runWorker(start: number, end: number) {
  console.log(`[Worker] Processing rows ${start} to ${end}`);

  const csvContent = readFileSync(FILE_PATH, "utf8");
  const parsed = parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  const totalRows = parsed.data.length;
  const sliced = parsed.data.slice(start, Math.min(end, totalRows));
  console.log(`[Worker] Processing ${sliced.length} rows (${start}-${Math.min(end, totalRows)} of ${totalRows})`);

  for (const row of sliced) {
    const item_id = (row as any).itemid;
    const trade_name = (row as any).description;
    const commodity_code = (row as any).commoditycode;
    const workflow = await ingredientEnrichmentWorkflow.createRunAsync();
    await workflow.start({
      inputData: { item_id, trade_name, commodity_code },
    });
    console.log(`[Worker ${start}-${end}] Processed ${item_id}: ${trade_name}`);
  }

  console.log(`[Worker] Completed rows ${start} to ${end}`);
}

async function runSpawner(startIndex: number, batchSize: number, concurrency: number) {
  const csvContent = readFileSync(FILE_PATH, "utf8");
  const parsed = parse(csvContent, { header: true, skipEmptyLines: true });
  const totalRows = parsed.data.length;

  console.log(`Total rows: ${totalRows}, Start: ${startIndex}, Batch size: ${batchSize}, Concurrency: ${concurrency}`);

  // Create batches
  const batches: { start: number; end: number }[] = [];
  for (let i = startIndex; i < totalRows; i += batchSize) {
    batches.push({ start: i, end: Math.min(i + batchSize, totalRows) });
  }

  console.log(`Created ${batches.length} batches to process ${totalRows - startIndex} rows`);

  // Run batches with concurrency limit
  for (let i = 0; i < batches.length; i += concurrency) {
    const chunk = batches.slice(i, i + concurrency);
    console.log(`\nRunning batches ${i + 1}-${Math.min(i + concurrency, batches.length)} of ${batches.length}`);

    await Promise.all(
      chunk.map(
        (batch) =>
          new Promise<void>((resolve) => {
            const child = spawn("bun", ["run", "src/scripts/injest.ts", String(batch.start), String(batch.end)], {
              stdio: "inherit",
              cwd: process.cwd(),
              env: process.env,
            });
            child.on("close", () => resolve());
          })
      )
    );
  }

  console.log("\nAll batches completed!");
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--spawn") {
    const startIndex = parseInt(args[1] ?? "0") || 0;
    const batchSize = parseInt(args[2] ?? "200") || 200;
    const concurrency = parseInt(args[3] ?? "10") || 10;
    await runSpawner(startIndex, batchSize, concurrency);
  } else {
    const start = parseInt(args[0] ?? "0") || 0;
    const end = parseInt(args[1] ?? String(start + 500)) || start + 500;
    await runWorker(start, end);
  }
}

main().catch(console.error);
