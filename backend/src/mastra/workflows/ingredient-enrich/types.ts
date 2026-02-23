import { z } from "zod";

export const workflow_input = z.object({
  item_id: z
    .string()
    .describe("Unique identifier for the item/ingredient row (e.g., ITEMID)."),
  trade_name: z
    .string()
    .describe(
      "Display or trade name for the ingredient (may include brand/trade naming)."
    ),
  commodity_code: z
    .string()
    .describe(
      "Source commodity classification code from the dataset (e.g., COMMODITYCODE)."
    ),
});

const UnitEnum = z
  .enum([
    "mcg",
    "mg",
    "g",
    "iu",
    "ppm",
    "percent",
    "mesh",
    "bloom",
    "da",
    "unknown",
  ])
  .describe("Unit for an extracted numeric value.");

const AmountSchema = z
  .object({
    amount: z.number().describe("Numeric amount extracted from the text."),
    unit: UnitEnum.describe("Unit associated with the numeric amount."),
  })
  .describe("A numeric amount with an associated unit.");

const PotencyRatioSchema = z
  .object({
    ratio_raw: z
      .string()
      .describe(
        'Raw potency/strength ratio string from text (e.g., "300/200", "TG500200").'
      ),
    ratio_unit_hint: z
      .string()
      .nullable()
      .describe(
        'Hint tied to the ratio (e.g., "EE", "TG") if present in the text, null otherwise.'
      ),
  })
  .describe(
    "Potency/strength ratio representation (kept as raw text to avoid mis-parsing)."
  );

export const workflow_output = z.object({
  item_id: z
    .string()
    .describe(
      "Unique identifier for the item/ingredient row (copied from input)."
    ),

  trade_name: z
    .string()
    .describe("Trade name for the ingredient row (copied from input)."),

  synonyms: z
    .array(z.string())
    .nullable()
    .describe(
      "Alternate names extracted from the description (e.g., chemical names, common names in parentheses), null if none."
    ),

  category: z
    .enum([
      // nutrients
      "vitamin",
      "mineral",
      "fatty_acid",
      "amino_acid",
      "carbohydrate",
      "lipid",
      "protein",
      "fiber",
      "electrolyte",

      // bioactives / functional
      "botanical",
      "enzyme",
      "probiotic",
      "prebiotic",
      "postbiotic",
      "peptide",
      "polyphenol",
      "antioxidant_compound",

      // additives / formulation
      "excipient",
      "additive",
      "preservative",
      "emulsifier",
      "stabilizer",
      "thickener",
      "humectant",
      "anti_caking_agent",
      "sweetener",
      "flavor",
      "color",
      "acidulant",
      "buffer",
      "solvent",
      "carrier",

      // other
      "other",
      "unknown",
    ])
    .describe(
      "High-level ingredient category (what type of thing this ingredient is)."
    ),

  sub_category: z
    .enum([
      /* ---------------- vitamins ---------------- */
      "fat_soluble_vitamin",
      "water_soluble_vitamin",
      "vitamin_a",
      "vitamin_b1",
      "vitamin_b2",
      "vitamin_b3",
      "vitamin_b5",
      "vitamin_b6",
      "vitamin_b7",
      "vitamin_b9",
      "vitamin_b12",
      "vitamin_c",
      "vitamin_d",
      "vitamin_e",
      "vitamin_k",

      /* ---------------- minerals ---------------- */
      "major_mineral",
      "trace_mineral",
      "electrolyte_mineral",

      /* ---------------- fatty acids / lipids ---------------- */
      "omega_3",
      "omega_6",
      "omega_9",
      "saturated_fatty_acid",
      "monounsaturated_fatty_acid",
      "polyunsaturated_fatty_acid",
      "mct",
      "phospholipid",
      "sterol",

      /* ---------------- amino acids / protein related ---------------- */
      "essential_amino_acid",
      "nonessential_amino_acid",
      "conditionally_essential_amino_acid",
      "branched_chain_amino_acid",
      "protein_hydrolysate",
      "collagen",
      "gelatin",
      "whey",
      "casein",
      "plant_protein",

      /* ---------------- fiber / carbs ---------------- */
      "soluble_fiber",
      "insoluble_fiber",
      "resistant_starch",
      "oligosaccharide",
      "polysaccharide",

      /* ---------------- botanical ---------------- */
      "botanical_powder",
      "botanical_extract",
      "standardized_extract",
      "tincture",
      "essential_oil",
      "oleoresin",

      /* ---------------- probiotics etc. ---------------- */
      "probiotic_strain",
      "prebiotic_fiber  ",
      "postbiotic",

      /* ---------------- enzymes ---------------- */
      "digestive_enzyme",
      "protease",
      "amylase",
      "lipase",
      "lactase",

      /* ---------------- excipients / formulation functions ---------------- */
      "filler",
      "binder",
      "carrier",
      "coating",
      "disintegrant",
      "lubricant",
      "glidant",
      "anti_caking_agent",
      "flow_agent",
      "stabilizer",
      "emulsifier",
      "surfactant",
      "thickener",
      "gelling_agent",
      "humectant",
      "buffering_agent",
      "acidulant",
      "solvent",
      "preservative",
      "antioxidant_additive",
      "sweetener",
      "flavoring_agent",
      "coloring_agent",
      "processing_aid",

      /* ---------------- flavor / color subtypes ---------------- */
      "natural_flavor",
      "artificial_flavor",
      "wonf",
      "natural_color",
      "artificial_color",

      /* ---------------- catch-alls ---------------- */
      "other",
      "unknown",
    ])
    .nullable()
    .describe(
      "More specific classification under category (use only when confidently inferred from the description), null if unknown."
    ),

  purpose_role: z
    .enum([
      "active",
      "inactive",
      "excipient",
      "additive",
      "processing_aid",
      "unknown",
    ])
    .describe(
      "Why the ingredient is included: active (main benefit), inactive (support), excipient (inactive for delivery/manufacturing), additive (technical effect), processing_aid (processing only)."
    ),

  functional_role: z
    .array(
      z.enum([
        // stability / preservation
        "antioxidant",
        "preservative",
        "antimicrobial",
        "stabilizer",
        "chelating_agent",
        "buffering_agent",
        "acidulant",
        "humectant",

        // mixing / texture / physical
        "emulsifier",
        "surfactant",
        "thickener",
        "gelling_agent",
        "foaming_agent",
        "anti_foaming_agent",
        "anti_caking_agent",
        "flow_agent",

        // tableting / encapsulation (supplement/pharma)
        "filler",
        "binder",
        "disintegrant",
        "lubricant",
        "glidant",
        "coating_agent",
        "encapsulating_agent",

        // sensory
        "flavoring_agent",
        "sweetener",
        "coloring_agent",
        "fragrance",

        // nutrition/health positioning
        "nutrient",
        "bioactive",

        // misc
        "carrier",
        "solvent",
        "processing_aid",
        "unknown",
      ])
    )
    .nullable()
    .describe(
      "Technical functions the ingredient plays in the formula (multi-value), null if not stated or inferable."
    ),

  ingredient_amounts: z
    .array(AmountSchema)
    .nullable()
    .describe(
      "Amounts that apply to the MAIN ingredient itself (use when no specific form/constituent is the target of the number), null if none."
    ),

  potency_ratio: PotencyRatioSchema.nullable().describe(
    'Ratio-style strengths like "300/200EE" or "TG500200". Store here (not as ingredient_amounts or form_amounts), null if none.'
  ),

  constituent_forms: z
    .array(
      z.object({
        name: z
          .string()
          .describe(
            "Name of the constituent/chemical form mentioned (e.g., MK-7, EPA, DHA)."
          ),
        relation: z
          .enum(["as", "from", "contains", "unknown"])
          .nullable()
          .describe(
            'Relationship cue from the text linking the form to the ingredient (e.g., "as MK-7"), null if not stated.'
          ),
        form_amounts: z
          .array(AmountSchema)
          .nullable()
          .describe(
            "Amounts that apply specifically to this form/constituent (not the whole ingredient), null if not stated."
          ),
      })
    )
    .nullable()
    .describe(
      "Constituent/chemical forms explicitly mentioned in the description, null if none."
    ),

  notes: z
    .string()
    .nullable()
    .describe(
      "Additional notes about the ingredient. Use when the text provides context that is not captured by the other fields, null if none."
    ),

  sources: z
    .array(z.string())
    .nullable()
    .describe(
      "References and sources for the ingredient information, typically from DSLD database, null if none."
    ),
});
