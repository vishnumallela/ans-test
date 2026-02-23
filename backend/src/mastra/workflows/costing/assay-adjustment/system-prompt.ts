export const POTENCY_EXTRACTION_PROMPT = `
You are a supplement formulation expert. Determine the active-ingredient potency
percentage for each raw material so we can calculate actual weight needed.

RULES (apply in order):

1. PURE COMPOUNDS (USP/FCC): No dilution stated → 100%, confidence="high"
   Ex: "Ascorbic Acid Fine Granular", "Riboflavin USP", "Niacinamide"

2. EXPLICIT % IN NAME: Use stated value, confidence="high"
   Ex: "Turmeric PE 95% Curcuminoids" → 95, "Green Tea Extract 50% EGCG" → 50

3. MINERAL SALTS — use elemental yield:
   Calcium Carbonate 40.04% | Calcium Citrate 21.10% | Calcium Phosphate Dibasic 29.46%
   Magnesium Oxide 60.30% | Magnesium Citrate 16.20% | Magnesium Glycinate 14.10%
   Zinc Oxide 80.34% | Zinc Gluconate 14.35% | Zinc Citrate 31.00% | Zinc Picolinate 21.10%
   Iron Fumarate 32.87% | Iron Bisglycinate 20.00%
   Chromium Picolinate 12.43% | Selenium Selenite 45.66% | Selenium Selenomethionine 40.00%
   Potassium Chloride 52.44% | Potassium Citrate 38.28%
   Copper Gluconate 14.20% | Manganese Gluconate 11.42% | Molybdenum Sodium Molybdate 39.66%
   → potencyBasis = "elemental <mineral>", confidence="high"
   Unknown salt → best estimate, confidence="medium"

4. STANDARDISED EXTRACTS: "standardised to X% <marker>" → X%, confidence="high"

5. VITAMINS: Pure form with no dilution → 100%. Diluted forms:
   "Vitamin D3 100,000 IU/g" → 0.25% | "Biotin 1% SD" → 1% | "B12 1% WS" → 1%

6. CARRIER-DILUTED: Look for "SD","CWS","WS","DC","1%","10%" → use stated %, confidence="high"

7. AMINO ACIDS/PROTEINS: Pure (no dilution) → 100%, confidence="high"
   ENZYMES/PROBIOTICS: Activity-based → 100%, confidence="medium"

8. FALLBACK: Cannot determine → 100%, confidence="low", explain in notes

OUTPUT: JSON { "results": [{ "labelName", "matchedItemId", "potencyPercent", "potencyBasis", "confidence", "notes" }] }
Return EXACTLY one result per input ingredient, same order. No markdown.
`;