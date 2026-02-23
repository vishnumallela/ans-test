import { Elysia, t } from "elysia";
import { TextractClient, AnalyzeDocumentCommand } from "@aws-sdk/client-textract";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TextractDocument, type ApiAnalyzeDocumentResponse } from "amazon-textract-response-parser";
import { generateText, Output } from "ai";
import { z } from "zod";
import { CHAT_MODEL } from "../../../../utils/models";
import { randomUUID } from "crypto";
import { standardErrors, throwError } from "../../plugins/error-handler";
import { encode as toToon } from "@toon-format/toon";

const textract = new TextractClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const S3_BUCKET = process.env.S3_BUCKET || "ans-uploads";
const MAX_FILE_SIZE = 3 * 1024 * 1024;

type TextractData = {
  text: string;
  tables: { headers: string[]; rows: { confidence: number; values: string[] }[] }[];
};

const ConstituentSchema = z.object({
  name: z.string().nullable(),
  amount: z.string().nullable(),
});

const IngredientSchema = z.object({
  name: z.string().nullable(),
  amount: z.string().nullable(),
  daily_value: z.string().nullable(),
  constituents: z.array(ConstituentSchema).nullable(),
});

const LabelInfoSchema = z.object({
  product_name: z.string().nullable(),
  product_form: z.string().nullable(),
  serving_size: z.string().nullable(),
  servings_per_container: z.string().nullable(),
  ingredients: z.array(IngredientSchema).nullable(),
  other_ingredients: z.array(z.string()).nullable(),
  allergens: z.array(z.string()).nullable(),
  certifications: z.array(z.string()).nullable(),
  warnings: z.array(z.string()).nullable(),
  manufacturer: z.string().nullable(),
  storage_instructions: z.string().nullable(),
  suggested_use: z.string().nullable(),
});

type LabelInfo = z.infer<typeof LabelInfoSchema>;

const ImageExtractSuccessResponse = z.object({
  success: z.literal(true),
  imageUrl: z.string(),
  toon: z.string().describe("Label data in TOON format - decode with @toon-format/toon"),
});

const SYSTEM_PROMPT = (data: TextractData) => `
You are extracting complete supplement label data. Capture all information accurately.

## OCR Reference Data
${JSON.stringify(data, null, 2)}

## Extraction Rules

### Ingredients
- name = exact full text including parentheses (e.g., "Iron (Ferrous Fumarate)" or "Vitamin D3 (as Cholecalciferol)")
- amount = amount with unit as string (e.g., "25 mcg") or null
- daily_value = % DV as string (e.g., "125%") or null if † or missing
- constituents = ALWAYS parse the chemical form/source from parentheses:
  * Look for patterns: "(as ...)", "(from ...)", or just "(...)" 
  * Extract ALL chemical forms as separate constituents
  * Handle multiple constituents separated by commas, slashes, or "and"
  * Each constituent should have: name (the chemical form) and amount (null unless specified)

### Constituent Extraction Examples:

**Simple case:**
"Iron (Ferrous Fumarate)" → constituents: [{ name: "Ferrous Fumarate", amount: null }]

**Multiple constituents with slashes:**
"Boron (as boron citrate/aspartate/glycinate complex)" → constituents: [
  { name: "boron citrate", amount: null },
  { name: "aspartate", amount: null },
  { name: "glycinate complex", amount: null }
]

**Multiple constituents with commas:**
"Magnesium (as Magnesium Malate, Magnesium Gluconate, Magnesium Glycinate)" → constituents: [
  { name: "Magnesium Malate", amount: null },
  { name: "Magnesium Gluconate", amount: null },
  { name: "Magnesium Glycinate", amount: null }
]

**Natural/direct form (no "as" or "from"):**
"Coenzyme Q10 (natural ubidecarenone)" → constituents: [{ name: "ubidecarenone", amount: null }]

**With "from" keyword:**
"Iodine (from Kelp)" → constituents: [{ name: "Kelp", amount: null }]

**Standard "as" pattern:**
"Vitamin D (as cholecalciferol)" → constituents: [{ name: "cholecalciferol", amount: null }]

**Complex proprietary blend:**
"Calcium (as calcium carbonate and calcium citrate)" → constituents: [
  { name: "calcium carbonate", amount: null },
  { name: "calcium citrate", amount: null }
]

**No parentheses:**
"Riboflavin" → constituents: []

### Other Fields
- product_form = Physical form of the supplement (e.g., "Capsule", "Tablet", "Softgel", "Powder", "Liquid", "Gummy", "Chewable", "Lozenge"). Look at serving size or product description.
- allergens = List allergens like "milk", "soy", "wheat", "fish", "shellfish", "tree nuts", "peanuts", "eggs". Look for "Contains:" or "Allergen:" sections.
- certifications = List certifications like "Non-GMO", "Kosher", "Halal", "Vegan", "Vegetarian", "Gluten-Free", "Organic", "GMP Certified", "NSF Certified", "Third Party Tested"
- warnings = Any warning statements (e.g., "Consult physician before use", "Keep out of reach of children", "Do not exceed recommended dose")
- manufacturer = Company name if visible
- storage_instructions = Storage info (e.g., "Store in a cool, dry place")
- suggested_use = Dosage/usage instructions (e.g., "Take 1 capsule daily with food")
`;

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

const uploadToS3 = async (buffer: Buffer, fileName: string, contentType: string): Promise<string> => {
  const fileExtension = fileName.split(".").pop() || "png";
  const s3Key = `uploads/${randomUUID()}.${fileExtension}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const presignedUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    }),
    { expiresIn: 60 * 60 * 24 * 7 }
  );

  return presignedUrl;
};

const extractLabelData = async (buffer: Buffer, contentType: string): Promise<LabelInfo> => {
  const base64 = `data:${contentType};base64,${buffer.toString("base64")}`;

  const textractRes = await textract.send(
    new AnalyzeDocumentCommand({
      Document: { Bytes: new Uint8Array(buffer) },
      FeatureTypes: ["TABLES"],
    })
  );
  const ocrData = parseTextractResponse(textractRes as ApiAnalyzeDocumentResponse);

  const { output } = await generateText({
    model: CHAT_MODEL,
    system: SYSTEM_PROMPT(ocrData),
    output: Output.object({ schema: LabelInfoSchema }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Extract all label information." },
          { type: "image", image: base64 },
        ],
      },
    ],
  });
  return output!;
};

const processImage = async (file: File) => {
  const buffer = Buffer.from(await file.arrayBuffer());

  if (file.size > MAX_FILE_SIZE) {
    throwError(400, `Image too large. Max 3MB, got ${(file.size / 1024 / 1024).toFixed(1)}MB`);
  }

  const [imageUrl, data] = await Promise.all([
    uploadToS3(buffer, file.name, file.type),
    extractLabelData(buffer, file.type),
  ]);

  return { imageUrl, data };
};

export const imageExtractRouter = new Elysia({ prefix: "/image-extract" }).post(
  "/",
  async ({ body ,set}) => {
    const result = await processImage(body.file);
    return {
      success: true as const,
      imageUrl: result.imageUrl,
      toon: toToon(result.data),
    };
  },
  {
    body: t.Object({
      file: t.File({ description: "Image file of the supplement label" }),
    }),
    response: {
      200: ImageExtractSuccessResponse,
      ...standardErrors,
    },
    detail: {
      summary: "Extract supplement label",
      description: "Upload an image. Returns TOON format - decode with @toon-format/toon on frontend.",
      tags: ["Image Extract"],
    },
    
  }
);
