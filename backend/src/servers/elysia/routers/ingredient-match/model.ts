import { t } from "elysia";

export const IngredientMatchBody = t.Object({
  file: t.File(),
});

const ConfidenceSchema = t.Object({
  textract: t.Optional(t.Number()),
  openai: t.Optional(t.Number()),
});

const ActiveIngredientSchema = t.Object({
  name: t.String(),
  category: t.Union([
    t.Literal("vitamin"),
    t.Literal("mineral"),
    t.Literal("amino_acid"),
    t.Literal("herb"),
    t.Literal("enzyme"),
    t.Literal("other"),
  ]),
  amount_per_serving: t.Number(),
  unit: t.Union([
    t.Literal("mg"),
    t.Literal("g"),
    t.Literal("mcg"),
    t.Literal("IU"),
    t.Literal("mcg RAE"),
    t.Literal("% DV"),
    t.Literal("µg"),
    t.Literal("kcal"),
    t.Literal("mg NE"),
  ]),
  daily_value_percentage: t.Optional(t.Union([t.Number(), t.Null()])),
  sources: t.Optional(t.Array(t.Object({ form: t.String(), percentage: t.Number() }))),
  confidence: ConfidenceSchema,
});

const InactiveIngredientSchema = t.Object({
  name: t.String(),
  category: t.Union([
    t.Literal("filler"),
    t.Literal("binder"),
    t.Literal("lubricant"),
    t.Literal("coating"),
    t.Literal("preservative"),
    t.Literal("color"),
    t.Literal("flavor"),
    t.Literal("sweetener"),
    t.Literal("other"),
  ]),
  confidence: ConfidenceSchema,
});

const SupplementFactsSchema = t.Object({
  product_name: t.String(),
  product_form: t.Union([
    t.Literal("capsule"),
    t.Literal("softgel"),
    t.Literal("tablet"),
    t.Literal("powder"),
    t.Literal("liquid"),
    t.Literal("gummy"),
    t.Literal("other"),
  ]),
  active_ingredients: t.Array(ActiveIngredientSchema),
  inactive_ingredients: t.Optional(t.Array(InactiveIngredientSchema)),
  notes: t.String(),
});

const MatchSchema = t.Object({
  name: t.String(),
  similarity: t.Number(),
  id: t.String(),
  metadata: t.Optional(t.Record(t.String(), t.Unknown())),
});

const IngredientMatchResultSchema = t.Object({
  name: t.String(),
  type: t.Union([t.Literal("active"), t.Literal("inactive")]),
  top_matches: t.Array(MatchSchema),
});

export const IngredientMatchResponse = t.Object({
  success: t.Literal(true),
  imageUrl: t.String(),
  extraction: SupplementFactsSchema,
  matches: t.Array(IngredientMatchResultSchema),
});

export const IngredientMatchErrorResponse = t.Object({
  success: t.Literal(false),
  error: t.String(),
});

