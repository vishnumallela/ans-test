import { createStep, createWorkflow } from "@mastra/core/workflows";
import { workflow_input, workflow_output } from "./types";
import { generateText, Output, embed } from "ai";
import { SYSTEM_PROMPT } from "./system-prompt";
import { vector_db } from "../../../../utils/vectordb-client";
import { CHAT_MODEL, EMBEDDING_MODEL } from "../../../../utils/models";
import { z } from "zod";
import { randomUUID } from "crypto";

const DSLD_API_BASE = "https://api.ods.od.nih.gov/dsld/v9";
const QDRANT_COLLECTION_NAME = "ingredients";

// Step 1: Initial LLM extraction
const llmExtractionStep = createStep({
  id: "llm-extraction",
  inputSchema: workflow_input,
  outputSchema: workflow_output,
  execute: async ({ inputData }) => {
    const { output } = await generateText({
      model: CHAT_MODEL,
      system: SYSTEM_PROMPT,
      output: Output.object({ schema: workflow_output }),
      prompt: `INGREDIENT TO ENRICH:
- Item ID: ${inputData.item_id}
- Trade Name: "${inputData.trade_name}"
- Commodity Code: ${inputData.commodity_code}

Please analyze the ingredient trade name and extract all relevant enrichment information.`,
    });
    return output!;
  },
});

// Step 2: DSLD synonym search using LLM results
const dsldSynonymSearchStep = createStep({
  id: "dsld-synonym-search",
  inputSchema: workflow_output,
  outputSchema: workflow_output,
  execute: async ({ inputData }) => {
    const searchTerms = new Set<string>();

    // Add synonyms from LLM extraction
    if (inputData.synonyms) {
      inputData.synonyms.forEach((synonym) => searchTerms.add(synonym));
    }

    // Add constituent forms as potential search terms
    if (inputData.constituent_forms) {
      inputData.constituent_forms.forEach((form) => {
        if (form?.name) searchTerms.add(form.name);
      });
    }

    if (inputData.trade_name) {
      searchTerms.add(inputData.trade_name);
    }

    const allDsldSynonyms = new Set<string>();
    const allDsldSources = new Set<string>();

    // Search DSLD for each term
    for (const term of Array.from(searchTerms)) {
      try {
        const cleanTerm = (term.split("(")[0] || term).trim();
        const response = await fetch(
          `${DSLD_API_BASE}/ingredient-groups?method=factsheet&term=${encodeURIComponent(cleanTerm)}&size=10`
        );
        const dsldData = await response.json();

        const hits = (dsldData as any)?.hits;
        if (hits && Array.isArray(hits)) {
          hits.forEach((hit: any) => {
            const record = hit._source;
            if (record?.synonyms && Array.isArray(record.synonyms)) {
              record.synonyms.forEach((synonym: string) => {
                allDsldSynonyms.add(synonym);
              });
            }
            if (record?.factsheets && Array.isArray(record.factsheets)) {
              record.factsheets.forEach((sheet: any) => {
                if (
                  sheet?.link &&
                  typeof sheet.link === "string" &&
                  sheet.link.startsWith("http")
                ) {
                  allDsldSources.add(sheet.link);
                }
              });
            }
          });
        }
      } catch (error) {
        console.error("Error searching DSLD:", error);
      }
    }

    const existingSynonyms = inputData.synonyms || [];
    const combinedSynonyms = Array.from(
      new Set([...existingSynonyms, ...Array.from(allDsldSynonyms)])
    );

    // Combine existing sources with DSLD sources
    const existingSources = inputData.sources || [];
    const combinedSources = Array.from(
      new Set([...existingSources, ...Array.from(allDsldSources)])
    );

    return {
      ...inputData,
      synonyms:
        combinedSynonyms.length > 0 ? combinedSynonyms : inputData.synonyms,
      sources: combinedSources.length > 0 ? combinedSources : null,
    };
  },
});

// Step 3: LLM ranking and filtering of synonyms
const synonymRankingStep = createStep({
  id: "synonym-ranking",
  inputSchema: workflow_output,
  outputSchema: workflow_output,
  execute: async ({ inputData }) => {
    if (!inputData.synonyms || inputData.synonyms.length === 0) {
      return inputData;
    }

    const rankingPrompt = `Given this ingredient analysis and the list of potential synonyms, please rank and filter the synonyms to keep only the most relevant and accurate ones.

INGREDIENT ANALYSIS:
- Trade Name: "${inputData.trade_name}"
- Category: ${inputData.category}
- Sub-category: ${inputData.sub_category || "None"}
- Purpose Role: ${inputData.purpose_role}
- Constituent Forms: ${
      inputData.constituent_forms
        ?.map((f) => f?.name || "")
        .filter((name) => name.length > 0)
        .join(", ") || "None"
    }

ALL POTENTIAL SYNONYMS:
${inputData.synonyms.map((syn, i) => `${i + 1}. ${syn}`).join("\n")}

Please return a JSON object with:
- "filtered_synonyms": Array of the top 5-10 most relevant synonyms, ranked by relevance
- "reasoning": Brief explanation of why these synonyms were selected

Only include synonyms that are truly legitimate alternate names for this ingredient.`;

    try {
      const rankingSchema = z.object({
        filtered_synonyms: z.array(z.string()),
        reasoning: z.string(),
      });

      const { output: rankingResult } = await generateText({
        model: CHAT_MODEL,
        output: Output.object({ schema: rankingSchema }),
        prompt: rankingPrompt,
      });

      return {
        ...inputData,
        synonyms: rankingResult?.filtered_synonyms || inputData.synonyms,
      };
    } catch (error) {
      return inputData;
    }
  },
});

// Step 4: Generate embeddings and store in Qdrant vector database
const vectorStorageStep = createStep({
  id: "vector-storage",
  inputSchema: workflow_output,
  outputSchema: workflow_output.extend({
    vector_id: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    try {
      const embeddingText = [
        inputData.trade_name,
        inputData.category,
        inputData.synonyms?.join(" ") || "",
      ]
        .filter(Boolean)
        .join(" ");

      const { embedding } = await embed({
        model: EMBEDDING_MODEL,
        value: embeddingText,
      });

      const collections = await vector_db.getCollections();
      const collectionExists = collections.collections.some(
        (col: any) => col.name === QDRANT_COLLECTION_NAME
      );

      if (!collectionExists) {
        await vector_db.createCollection(QDRANT_COLLECTION_NAME, {
          vectors: {
            size: 3072,
            distance: "Cosine",
          },
        });
      }

      const pointId = randomUUID();
      await vector_db.upsert(QDRANT_COLLECTION_NAME, {
        points: [
          {
            id: pointId,
            vector: embedding,
            payload: {
              item_id: inputData.item_id,
              trade_name: inputData.trade_name,
              category: inputData.category,
              synonyms: inputData.synonyms || [],
              embedding_text: embeddingText,
              sub_category: inputData.sub_category,
              purpose_role: inputData.purpose_role,
              functional_role: inputData.functional_role,
              ingredient_amounts: inputData.ingredient_amounts,
              potency_ratio: inputData.potency_ratio,
              constituent_forms: inputData.constituent_forms,
              notes: inputData.notes,
              sources: inputData.sources,
            },
          },
        ],
      });

      return {
        ...inputData,
        vector_id: pointId,
      };
    } catch (error) {
      console.error("Failed to generate embedding or store in Qdrant:", error);
      return inputData;
    }
  },
});

//workflow
export const ingredientEnrichmentWorkflow = createWorkflow({
  id: "ingredient-enrichment",
  inputSchema: workflow_input,
  outputSchema: workflow_output.extend({
    vector_id: z.string().optional(),
  }),
})
  .then(llmExtractionStep)
  .then(dsldSynonymSearchStep)
  .then(synonymRankingStep)
  .then(vectorStorageStep)
  .commit();
