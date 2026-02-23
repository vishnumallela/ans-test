"use client";

import { useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { UploadIcon } from "lucide-react";
import { $api } from "@/lib/api/client";
import type { operations } from "@/lib/api/schema";
import { decode as fromToon } from "@toon-format/toon";

// Extract Match type from search response
type SearchResponse = operations["postSearch-similar"]["responses"][200]["content"]["application/json"];
type Match = SearchResponse["results"][number]["matches"][number];

// Label data structure (decoded from TOON)
interface LabelData {
  product_name: string;
  product_form: string | null;
  serving_size: string | null;
  servings_per_container: string | null;
  ingredients: Array<{
    name: string;
    amount: string | null;
    daily_value: string | null;
    constituents: Array<{ name: string; amount: string | null }>;
  }>;
  other_ingredients: string[];
  allergens: string[];
  certifications: string[];
  warnings: string[];
  manufacturer: string | null;
  storage_instructions: string | null;
  suggested_use: string | null;
}

export default function ImageExtractPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSearchedRef = useRef<string | null>(null);
  const extractMutation = $api.useMutation("post", "/image-extract/");
  const searchMutation = $api.useMutation("post", "/search-similar/");

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    lastSearchedRef.current = null;
    searchMutation.reset();
    extractMutation.mutate({ body: { file: file as unknown as string }, bodySerializer: () => formData });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Decode TOON to JSON
  const extractedData = useMemo(() => {
    if (!extractMutation.data?.toon) return null;
    try {
      return fromToon(extractMutation.data.toon) as unknown as LabelData;
    } catch {
      return null;
    }
  }, [extractMutation.data?.toon]);
  
  const imageUrl = extractMutation.data?.imageUrl;

  useEffect(() => {
    if (!extractedData) return;
    
    const { ingredients, other_ingredients } = extractedData;
    const allItems = [
      ...ingredients.map((i) => i.name),
      ...ingredients.flatMap((i) => i.constituents.map((c) => c.name)),
      ...other_ingredients,
    ].filter(Boolean);
    
    const key = allItems.join("|");
    
    if (key === lastSearchedRef.current) return;
    if (allItems.length === 0) return;
    
    lastSearchedRef.current = key;
    searchMutation.mutate({ body: { ingredients: allItems } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractedData]);

  const searchResults = searchMutation.data?.results;

  const searchMap = useMemo(() => {
    if (!searchResults) return new Map<string, Match[]>();
    return new Map(searchResults.map((r) => [r.ingredient, r.matches]));
  }, [searchResults]);

  const isProcessing = extractMutation.isPending || searchMutation.isPending;

  return (
    <div className="h-full flex flex-col text-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div>
          <h1 className="text-base font-semibold">Extract & Match</h1>
          <p className="text-muted-foreground text-xs">Upload label → Extract → Find matches in inventory</p>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        <Button size="sm" className="h-8" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
          <UploadIcon className="mr-1.5 h-3 w-3" />Upload
        </Button>
      </div>

      <div className="flex-1 min-h-0">
        {isProcessing && (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Spinner className="h-5 w-5" />
            <span className="text-xs">{extractMutation.isPending ? "Extracting label info..." : "Finding matches..."}</span>
          </div>
        )}

        {(extractMutation.isError || searchMutation.isError) && (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-destructive">{String(extractMutation.error || searchMutation.error)}</p>
          </div>
        )}

        {extractedData && imageUrl && !isProcessing && (
          <div className="h-full grid grid-cols-2 overflow-hidden">
            <div className="border-r overflow-y-auto p-4">
              {/* Image Card */}
              <div className="border rounded-xl bg-card shadow-sm overflow-hidden mb-4">
                <div className="p-4 bg-muted/20">
                  <Image src={imageUrl} alt="Label" width={400} height={600} className="max-h-[400px] w-auto object-contain rounded-lg border mx-auto" unoptimized />
                </div>
              </div>

              {/* Product Info Card */}
              <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-muted/40 border-b">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">{extractedData.product_name}</h3>
                      {extractedData.manufacturer && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{extractedData.manufacturer}</p>
                      )}
                    </div>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(extractedData as any).product_form && (
                      <Badge variant="secondary" className="text-[10px] px-2 py-0.5 shrink-0">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(extractedData as any).product_form}
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div className="p-4 space-y-4">
                  {/* Serving Info */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border rounded-lg p-3 bg-muted/20">
                      <p className="text-[10px] text-muted-foreground uppercase mb-1">Serving Size</p>
                      <p className="text-xs font-medium">{extractedData.serving_size || "N/A"}</p>
                    </div>
                    <div className="border rounded-lg p-3 bg-muted/20">
                      <p className="text-[10px] text-muted-foreground uppercase mb-1">Servings</p>
                      <p className="text-xs font-medium">{extractedData.servings_per_container || "N/A"}</p>
                    </div>
                  </div>

                  {/* Allergens */}
                  {extractedData.allergens.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Allergens</p>
                      <div className="flex flex-wrap gap-1.5">
                        {extractedData.allergens.map((item, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px] px-2 py-0.5">{item}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Certifications */}
                  {extractedData.certifications.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Certifications</p>
                      <div className="flex flex-wrap gap-1.5">
                        {extractedData.certifications.map((item, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] px-2 py-0.5">{item}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warnings */}
                  {extractedData.warnings.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Warnings</p>
                      <div className="space-y-1">
                        {extractedData.warnings.map((item, i) => (
                          <p key={i} className="text-[11px] text-muted-foreground">• {item}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggested Use */}
                  {extractedData.suggested_use && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Suggested Use</p>
                      <p className="text-[11px]">{extractedData.suggested_use}</p>
                    </div>
                  )}

                  {/* Storage */}
                  {extractedData.storage_instructions && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Storage</p>
                      <p className="text-[11px]">{extractedData.storage_instructions}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-y-auto p-4 max-h-[calc(100vh-100px)] space-y-4">
              {/* Total Count Header */}
              <div className="flex items-center justify-between px-1">
                <p className="text-sm font-semibold">Ingredients</p>
                <Badge variant="secondary" className="text-[11px] px-2 py-0.5">
                  {extractedData.ingredients.length + extractedData.other_ingredients.length} total items
                </Badge>
              </div>

              {extractedData.ingredients.map((ing, i) => {
                const ingredientMatches = searchMap.get(ing.name) || [];
                
                return (
                  <div key={i} className="border rounded-xl bg-card shadow-sm overflow-hidden">
                    {/* Card Header */}
                    <div className="px-4 py-3 bg-muted/40 border-b">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-muted-foreground bg-muted rounded-full w-6 h-6 flex items-center justify-center">{i + 1}</span>
                          <div>
                            <h3 className="text-sm font-semibold">{ing.name}</h3>
                            {ing.constituents.length > 0 && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {ing.constituents.length} chemical form{ing.constituents.length > 1 ? 's' : ''}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {ing.amount && (
                            <Badge variant="secondary" className="text-[11px] px-2 py-0.5 font-mono">
                              {ing.amount}
                            </Badge>
                          )}
                          {ing.daily_value && (
                            <Badge variant="secondary" className="text-[11px] px-2 py-0.5 font-semibold">
                              {ing.daily_value} DV
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {/* Constituents Row */}
                      {ing.constituents.length > 0 && (
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-muted-foreground uppercase">Forms:</span>
                          {ing.constituents.map((c, j) => (
                            <Badge key={j} variant="outline" className="text-[10px] font-normal">
                              {c.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Card Body - Two Tables */}
                    <div className="p-4 space-y-4">
                      {/* Ingredient Level Matches */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Ingredient Matches
                          </p>
                          {ingredientMatches.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">{ingredientMatches.length} items</span>
                          )}
                        </div>
                        {ingredientMatches.length > 0 ? (
                          <div className="border rounded-lg overflow-hidden">
                            <div className="grid grid-cols-[1fr_100px_60px] gap-2 px-3 py-1.5 bg-muted/30 text-[9px] font-semibold uppercase text-muted-foreground">
                              <div>Trade Name</div>
                              <div>Item ID</div>
                              <div className="text-right">Match</div>
                            </div>
                            {ingredientMatches.slice(0, 3).map((m, j) => (
                              <div key={j} className="grid grid-cols-[1fr_100px_60px] gap-2 px-3 py-2 border-t items-center">
                                <span className="text-xs truncate">{m.trade_name}</span>
                                <code className="text-[10px] text-muted-foreground">{m.item_id}</code>
                                <div className="text-right">
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {(m.similarity_score * 100).toFixed(0)}%
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic px-1">No matches</p>
                        )}
                      </div>

                      {/* Constituent Level Matches - Each form gets its own table */}
                      {ing.constituents.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Chemical Form Matches
                          </p>
                          {ing.constituents.map((c, cIdx) => {
                            const cMatches = searchMap.get(c.name) || [];
                            return (
                              <div key={cIdx} className="pl-3 border-l-2 border-muted-foreground/30">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-medium">{c.name}</p>
                                  {cMatches.length > 0 && (
                                    <span className="text-[10px] text-muted-foreground">{cMatches.length} items</span>
                                  )}
                                </div>
                                {cMatches.length > 0 ? (
                                  <div className="border rounded-lg overflow-hidden">
                                    <div className="grid grid-cols-[1fr_100px_60px] gap-2 px-3 py-1.5 bg-muted/30 text-[9px] font-semibold uppercase text-muted-foreground">
                                      <div>Trade Name</div>
                                      <div>Item ID</div>
                                      <div className="text-right">Match</div>
                                    </div>
                                    {cMatches.slice(0, 3).map((m, j) => (
                                      <div key={j} className="grid grid-cols-[1fr_100px_60px] gap-2 px-3 py-2 border-t items-center">
                                        <span className="text-xs truncate">{m.trade_name}</span>
                                        <code className="text-[10px] text-muted-foreground">{m.item_id}</code>
                                        <div className="text-right">
                                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                            {(m.similarity_score * 100).toFixed(0)}%
                                          </Badge>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-muted-foreground italic">No matches</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Other Ingredients */}
              {extractedData.other_ingredients.length > 0 && (
                <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-muted/40 border-b">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground bg-muted rounded-full w-6 h-6 flex items-center justify-center">+</span>
                      <h3 className="text-sm font-semibold">Other Ingredients</h3>
                      <Badge variant="secondary" className="text-[10px] px-2 py-0.5">{extractedData.other_ingredients.length} items</Badge>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Inventory Matches
                    </p>
                    <div className="border rounded-lg overflow-hidden">
                      <div className="grid grid-cols-[1fr_1fr_100px_60px] gap-2 px-3 py-1.5 bg-muted/30 text-[9px] font-semibold uppercase text-muted-foreground">
                        <div>Ingredient</div>
                        <div>Trade Name</div>
                        <div>Item ID</div>
                        <div className="text-right">Match</div>
                      </div>
                      {extractedData.other_ingredients.map((name, i) => {
                        const matches = searchMap.get(name) || [];
                        const bestMatch = matches[0];
                        return (
                          <div key={i} className="grid grid-cols-[1fr_1fr_100px_60px] gap-2 px-3 py-2 border-t items-center">
                            <span className="text-xs truncate">{name}</span>
                            {bestMatch ? (
                              <>
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 shrink-0" />
                                  <span className="text-xs truncate">{bestMatch.trade_name}</span>
                                </div>
                                <code className="text-[10px] text-muted-foreground">{bestMatch.item_id}</code>
                                <div className="text-right">
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {(bestMatch.similarity_score * 100).toFixed(0)}%
                                  </Badge>
                                </div>
                              </>
                            ) : (
                              <>
                                <span className="text-xs text-muted-foreground italic">No match</span>
                                <span></span>
                                <span></span>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {!extractedData && !isProcessing && (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Upload an image to extract and match ingredients</p>
          </div>
        )}
      </div>
    </div>
  );
}
