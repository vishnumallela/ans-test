/**
 * Ingredient Enrichment Workflow
 * 
 * parse-input → query-dsld → classify → enrich
 * 
 * Note: Web search steps (research, find-structures) removed to reduce costs.
 * References come only from DSLD factsheets.
 */

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";

const MODEL = openai("gpt-4o");
const DSLD_API_BASE = "https://api.ods.od.nih.gov/dsld/v9";
const MAX_SYNONYMS = 10;

const IngredientType = z.enum(["active", "excipient"]);

const CategoryType = z.enum([
  "vitamin",
  "mineral",
  "amino_acid",
  "botanical",
  "enzyme",
  "fatty_acid",
  "probiotic",
  "protein",
  "fiber",
  "emulsifier",
  "preservative",
  "binder",
  "filler",
  "flavoring",
  "colorant",
  "solvent",
  "other",
]);

const InputSchema = z.object({
  itemCode: z.string(),
  rawInput: z.string(),
});

const ParsedSchema = z.object({
  itemCode: z.string(),
  rawInput: z.string(),
  baseName: z.string(),
});

const DsldDataSchema = z.object({
  itemCode: z.string(),
  rawInput: z.string(),
  baseName: z.string(),
  dsldSummary: z.string(),
  references: z.array(z.string()),
});

const ClassifiedSchema = z.object({
  itemCode: z.string(),
  rawInput: z.string(),
  baseName: z.string(),
  dsldSummary: z.string(),
  references: z.array(z.string()),
  standardName: z.string(),
  ingredientType: IngredientType,
  category: CategoryType,
  subCategory: z.string().nullable(),
});

const ComponentSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string(),
});

const OutputSchema = z.object({
  itemCode: z.string(),
  rawInput: z.string(),
  standardName: z.string(),
  synonyms: z.array(z.string()),
  classification: z.string(),
  subCategory: z.string().nullable(),
  chemicalForm: z.string().nullable(),
  plantPart: z.string().nullable(),
  components: z.array(ComponentSchema).nullable(),
  description: z.string(),
  references: z.array(z.string()),
  embeddingText: z.string(),
});

const parseInputStep = createStep({
  id: "parse-input",
  inputSchema: InputSchema,
  outputSchema: ParsedSchema,
  execute: async ({ inputData }) => {
    const { itemCode, rawInput } = inputData;
    const normalizedInput = rawInput.trim();

    const { object } = await generateObject({
      model: MODEL,
      schema: z.object({ baseName: z.string() }),
      prompt: `Extract the BASE ingredient name for database lookup.

INPUT: "${normalizedInput}"

Rules:
- Remove quantities, percentages, ratios, and codes
- Remove form descriptors (extract, powder, etc.)
- Keep only the core ingredient identity

Examples:
  "Vitamin K2 as MK-7 (10000 ppm), 1%" → "Vitamin K2"
  "Omega-3 Fatty Acids 300/200EE" → "Omega-3 Fatty Acids"
  "Rhodiola rosea root extract std. 3% rosavins" → "Rhodiola rosea"`,
    });

    return { itemCode, rawInput: normalizedInput, baseName: object.baseName };
  },
});

const queryDsldStep = createStep({
  id: "query-dsld",
  inputSchema: ParsedSchema,
  outputSchema: DsldDataSchema,
  execute: async ({ inputData }) => {
    const { itemCode, rawInput, baseName } = inputData;
    let dsldSummary = "No data available in DSLD.";
    let references: string[] = [];

    try {
      const endpoint = `${DSLD_API_BASE}/ingredient-groups?method=by_keyword&term=${encodeURIComponent(baseName)}&size=1`;
      const response = await fetch(endpoint);

      if (response.ok) {
        const data = (await response.json()) as {
          hits?: Array<{
            _source?: {
              groupName?: string;
              category?: string[];
              synonyms?: string[];
              factsheets?: Array<{ link?: string }>;
            };
          }>;
        };

        const record = data.hits?.[0]?._source;
        if (record) {
          dsldSummary = `DSLD Group: ${record.groupName ?? "Unknown"}\nCategory: ${record.category?.[0] ?? "Uncategorized"}\nKnown Synonyms: ${record.synonyms?.slice(0, 5).join(", ") ?? "None"}`;
          references = (record.factsheets ?? [])
            .map((sheet) => sheet.link)
            .filter((url): url is string => typeof url === "string" && url.startsWith("http"));
        }
      }
    } catch {}

    return { itemCode, rawInput, baseName, dsldSummary, references };
  },
});

const classifyStep = createStep({
  id: "classify",
  inputSchema: DsldDataSchema,
  outputSchema: ClassifiedSchema,
  execute: async ({ inputData }) => {
    const { itemCode, rawInput, baseName, dsldSummary, references } = inputData;

    const { object } = await generateObject({
      model: MODEL,
      schema: z.object({
        standardName: z.string(),
        ingredientType: IngredientType,
        category: CategoryType,
        subCategory: z.string().nullable(),
      }),
      prompt: `Classify this dietary supplement ingredient.

RAW INPUT: "${rawInput}"
BASE NAME: "${baseName}"
DSLD DATA:
${dsldSummary}

Provide:
1. STANDARD NAME - Official USP/INCI nomenclature
2. INGREDIENT TYPE - "active" (therapeutic/nutritional) or "excipient" (inactive/processing)
3. CATEGORY - vitamin, mineral, amino_acid, botanical, enzyme, fatty_acid, probiotic, protein, fiber, emulsifier, preservative, binder, filler, flavoring, colorant, solvent, other
4. SUBCATEGORY - specific sub-classification or null`,
    });

    return { itemCode, rawInput, baseName, dsldSummary, references, ...object };
  },
});

const enrichStep = createStep({
  id: "enrich",
  inputSchema: ClassifiedSchema,
  outputSchema: OutputSchema,
  execute: async ({ inputData }) => {
    const { itemCode, rawInput, standardName, ingredientType, category, subCategory, dsldSummary, references } = inputData;

    const { object } = await generateObject({
      model: MODEL,
      schema: z.object({
        synonyms: z.array(z.string()).max(MAX_SYNONYMS),
        chemicalForm: z.string().nullable(),
        plantPart: z.string().nullable(),
        components: z.array(ComponentSchema).nullable(),
        description: z.string(),
      }),
      prompt: `Generate enrichment data for this ingredient.

RAW INPUT: "${rawInput}"
STANDARD NAME: ${standardName}
TYPE: ${ingredientType}
CATEGORY: ${category}

DSLD DATA:
${dsldSummary}

Provide:
1. SYNONYMS (up to ${MAX_SYNONYMS}) - Scientific names, INCI, CAS numbers, common names. NO brand names.
2. CHEMICAL FORM - Specific form from input (MK-7, HCl, Citrate, Extract) or null
3. PLANT PART - For botanicals only (root, leaf, seed) or null
4. COMPONENTS - Parse numeric values: "Omega 3 300/200EE" → [{name:"EPA",value:300,unit:"mg"},{name:"DHA",value:200,unit:"mg"}] or null
5. DESCRIPTION - Definition, benefits, uses, quality markers, regulatory status`,
    });

    const classification = `${ingredientType}|${category}`;
    
    // Build comprehensive embedding text for robust vector matching
    // Handles: full names, constituents, chemical forms, synonyms
    const embeddingParts = [standardName];
    
    // Add synonyms for alternate name matching
    if (object.synonyms.length) {
      embeddingParts.push(object.synonyms.slice(0, 5).join(", "));
    }
    
    // Add chemical form (MK-7, HCl, Citrate, etc.)
    if (object.chemicalForm) {
      embeddingParts.push(object.chemicalForm);
    }
    
    // Add category context
    embeddingParts.push(category);
    if (subCategory) {
      embeddingParts.push(subCategory);
    }
    
    // Add plant part for botanicals
    if (object.plantPart) {
      embeddingParts.push(object.plantPart);
    }
    
    // Add constituents/components for assay matching
    // Critical for: "EPA", "DHA", "rosavins", "ginsenosides", etc.
    if (object.components?.length) {
      const componentNames = object.components.map((c) => c.name);
      embeddingParts.push(componentNames.join(", "));
    }

    return {
      itemCode,
      rawInput,
      standardName,
      synonyms: object.synonyms,
      classification,
      subCategory,
      chemicalForm: object.chemicalForm,
      plantPart: object.plantPart,
      components: object.components,
      description: object.description,
      references,
      embeddingText: embeddingParts.join(" | "),
    };
  },
});

export const ingredientEnrichmentWorkflow = createWorkflow({
  id: "ingredient-enrichment",
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
})
  .then(parseInputStep)
  .then(queryDsldStep)
  .then(classifyStep)
  .then(enrichStep)
  .commit();
