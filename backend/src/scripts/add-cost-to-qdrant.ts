import { vector_db } from "../../utils/vectordb-client"
import { parse } from "papaparse";
import { join } from "path";
import { readFileSync } from "fs";

const csv_file = join(process.cwd(), "src/resources/materials.csv");
const csv_text = readFileSync(csv_file, "utf8");
const parsed = parse(csv_text, {
  header: true,
  skipEmptyLines: true,
  transformHeader: (header) => header.trim().toLowerCase(),
});

for (const row of parsed.data) {
  const item_id = (row as any).itemid;      
  const cost = (row as any).cost;          
  const cost_unit = (row as any).costum;    

  if (!item_id) {
    console.log("Skipping: no itemid");
    continue;
  }

  try {
 
    const result = await vector_db.scroll("ingredients", {
      filter: {
        must: [
          {
            key: "item_id",           
            match: { value: item_id }
          }
        ]
      },
      limit: 100,
      with_payload: true,
      with_vector: false
    });

    if (!result.points || result.points.length === 0) {
      console.log(`Not found: ${item_id}`);
      continue;
    }

    for (const point of result.points) {
      await vector_db.setPayload("ingredients", {
        points: [point.id],
        payload: {
          cost: cost,
          cost_unit: cost_unit    
        }
      });
      console.log(`Updated: ${item_id}`);
    }

  } catch (err) {
    console.error(`Error for ${item_id}:`, err);
  }
}