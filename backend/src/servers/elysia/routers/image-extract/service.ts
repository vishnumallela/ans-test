import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TextractClient, AnalyzeDocumentCommand } from "@aws-sdk/client-textract";
import { TextractDocument, type ApiAnalyzeDocumentResponse } from "amazon-textract-response-parser";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! },
});

const textract = new TextractClient({
  region: process.env.AWS_REGION!,
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! },
});

type TextractData = {
  text: string;
  tables: { headers: string[]; rows: { confidence: number; values: string[] }[] }[];
};

const parseTextractResponse = (response: ApiAnalyzeDocumentResponse): TextractData => {
  const doc = new TextractDocument(response as any);

  const text = doc
    .listPages()
    .flatMap((p) => p.listLines())
    .map((l) => l.text.trim())
    .filter(Boolean)
    .join("\n");

  const tables = doc.listPages().flatMap((page) =>
    page.listTables().map((table) => {
      const rows = table.listRows().map((row) => {
        const cells = row.listCells();
        return {
          confidence: Math.round((cells.reduce((sum, c) => sum + c.confidence, 0) / cells.length) * 100) / 100,
          values: cells.map((c) => c.text.trim()),
        };
      });
      return { headers: rows[0]?.values || [], rows: rows.slice(1) };
    })
  );

  return { text, tables };
};

const extractWithTextract = async (file: File) => {
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `${Date.now()}-${file.name}`;
  const bucket = process.env.AWS_BUCKET_NAME!;

  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: file.type }));
  const imageUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
  const response = await textract.send(
    new AnalyzeDocumentCommand({ Document: { S3Object: { Bucket: bucket, Name: key } }, FeatureTypes: ["TABLES"] })
  );

  return { imageUrl, ...parseTextractResponse(response as ApiAnalyzeDocumentResponse) };
};

const SupplementFactsSchema = z.object({
  product_name: z.string(),
  product_form: z.enum(["capsule", "softgel", "tablet", "powder", "liquid", "gummy", "other"]),
  active_ingredients: z.array(
    z.object({
      name: z.string(),
      category: z.enum(["vitamin", "mineral", "amino_acid", "herb", "enzyme", "other"]),
      amount_per_serving: z.number(),
      unit: z.enum(["mg", "g", "mcg", "IU", "mcg RAE", "% DV", "µg", "kcal", "mg NE"]),
      daily_value_percentage: z.number().nullish(),
      sources: z.array(z.object({ form: z.string(), percentage: z.number() })).optional(),
      confidence: z.object({ textract: z.number().optional(), openai: z.number().optional() }),
    })
  ),
  inactive_ingredients: z
    .array(
      z.object({
        name: z.string(),
        category: z.enum(["filler", "binder", "lubricant", "coating", "preservative", "color", "flavor", "sweetener", "other"]),
        confidence: z.object({ textract: z.number().optional(), openai: z.number().optional() }),
      })
    )
    .optional(),
  notes: z.string(),
});

const SYSTEM_PROMPT = (data: TextractData) => `
# SUPPLEMENT FACTS EXTRACTION SYSTEM

You are a precision data extraction system for dietary supplement labels. Your task is to analyze supplement facts panels and extract structured, validated data.

## PURPOSE
Convert raw OCR data and visual information into a normalized, structured format suitable for database storage and nutritional analysis.

## INPUT DATA
AWS Textract has pre-processed the image. Use this data as your PRIMARY source for text values and confidence scores:

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

## EXTRACTION RULES

### Product Identification
- **product_name**: Extract from label header. Use "Unknown" if not visible.
- **product_form**: Identify physical form. MUST be exactly one of: capsule | softgel | tablet | powder | liquid | gummy | other

### Active Ingredients
For each ingredient in the Supplement Facts table:
- **name**: Exact ingredient name as printed (e.g., "Vitamin D3", "Zinc")
- **category**: Classify by function:
  - vitamin: A, B-complex, C, D, E, K variants
  - mineral: Calcium, Iron, Magnesium, Zinc, etc.
  - amino_acid: L-Glutamine, BCAA, Taurine, etc.
  - herb: Plant-derived extracts (Turmeric, Ginseng, etc.)
  - enzyme: Digestive enzymes (Lipase, Protease, etc.)
  - other: Probiotics, specialty compounds
- **amount_per_serving**: Numeric value only
- **unit**: MUST be exactly one of: mg | g | mcg | IU | mcg RAE | % DV | µg | kcal | mg NE
- **daily_value_percentage**: The "% Daily Value" if listed
- **sources**: If ingredient has sub-forms listed (e.g., "as Cholecalciferol"), include form name and percentage (use 100 if single source)

### Inactive Ingredients (Other Ingredients)
Parse the "Other Ingredients" section:
- **name**: Exact ingredient name
- **category**: Classify by function:
  - filler: Microcrystalline cellulose, maltodextrin
  - binder: Starch, cellulose gum
  - lubricant: Magnesium stearate, stearic acid
  - coating: HPMC, shellac, carnauba wax
  - preservative: Sorbic acid, sodium benzoate
  - color: Titanium dioxide, FD&C colors
  - flavor: Natural/artificial flavors, vanilla
  - sweetener: Stevia, sucralose, sugar alcohols
  - other: Anything not fitting above categories

### Confidence Scoring
- **textract**: Use the row confidence value from Textract data (0-100). If unavailable, omit.
- **openai**: Your assessment of extraction reliability (0-100) based on:
  - Text clarity and readability
  - Unambiguous parsing
  - Complete information visibility
  - High: 90-100 | Medium: 70-89 | Low: 50-69 | Very Low: <50

### Notes Field
Provide a brief, professional analysis (1-3 sentences) covering:
- Formulation quality observations
- Bioavailability of ingredient forms used
- Any notable inclusions or omissions

## STRICT CONSTRAINTS
1. NEVER fabricate data not visible in the image or Textract output
2. NEVER guess ambiguous values—use the closest valid enum or omit optional fields
3. ALWAYS prefer Textract data for text accuracy
4. ALWAYS use exact enum values specified above—no variations
5. If product_name cannot be determined, use "Unknown"
`;

const extractWithVision = async (imageUrl: string, textractData: TextractData) => {
  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: SupplementFactsSchema,
    messages: [
      { role: "system", content: SYSTEM_PROMPT(textractData) },
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze this supplement label and extract structured information." },
          { type: "image", image: imageUrl },
        ],
      },
    ],
  });
  return object;
};

export const extractSupplementLabel = async (file: File) => {
  const { imageUrl, text, tables } = await extractWithTextract(file);
  const data = await extractWithVision(imageUrl, { text, tables });
  return { data, imageUrl };
};
