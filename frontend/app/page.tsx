"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ArrowUp, Paperclip } from "lucide-react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";

type ExtractResponse = {
  success: true;
  imageUrl: string;
  toon: string;
};

export default function AgentPage() {
  const { messages, sendMessage, status, error } = useChat();
  const [input, setInput] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll to bottomfo
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  const handleImageExtract = async (file: File) => {
    setIsExtracting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("http://localhost:3002/image-extract/", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Failed to extract image: ${response.statusText}`);
      }

      const data: ExtractResponse = await response.json();
      const { toon, imageUrl } = data;
      
      // Send TOON format directly to LLM
      const context = `![Supplement Label](${imageUrl})\n\n## Extracted Label Data (TOON format)\n\`\`\`\n${toon}\n\`\`\`\n\nAnalyze this supplement label and provide insights.`;
      await sendMessage({ text: context });
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error("Image extraction error:", error);
      // You could add error handling UI here
    } finally {
      setIsExtracting(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput("");
    await sendMessage({ text });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as FormEvent);
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isLoading || isExtracting) return;
    handleImageExtract(file);
  };

  const getText = (parts: typeof messages[0]["parts"]) =>
    parts.filter((p): p is { type: "text"; text: string } => p.type === "text").map((p) => p.text).join("");


  return (
    <div className="h-[98vh] flex bg-white overflow-hidden">
      {/* Chat Area - Full Width */}
      <div className="w-full flex flex-col min-h-0">
        {/* Messages Container - Scrollable above input */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="max-w-3xl mx-auto px-6 py-8">
            {messages.length === 0 && !isExtracting ? (
              <div className="h-full flex items-center justify-center min-h-[60vh]">
                <p className="text-neutral-400 text-sm">How can I help you today?</p>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((msg, i) => (
                  <div key={msg.id} className="space-y-1">
                    {/* Role Label */}
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                      {msg.role === "user" ? "You" : "Assistant"}
                    </p>
                    {/* Message Content */}
                    <div className="text-sm text-neutral-900 leading-relaxed prose prose-sm prose-neutral max-w-none">
                      <Streamdown 
                        plugins={{ code }} 
                        isAnimating={status === "streaming" && i === messages.length - 1 && msg.role === "assistant"}
                        caret={msg.role === "assistant" && i === messages.length - 1 ? "block" : undefined}
                        linkSafety={{ enabled: true }}
                      >
                        {getText(msg.parts)}
                      </Streamdown>
                    </div>
                  </div>
                ))}
                {(isLoading || isExtracting) && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Assistant</p>
                    <div className="flex items-center gap-2 text-neutral-400">
                      <Spinner className="h-3 w-3" />
                      <span className="text-sm">{isExtracting ? "Extracting label..." : "Thinking..."}</span>
                    </div>
                  </div>
                )}
                {error && (
                  <p className="text-sm text-red-600">{error.message}</p>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Fixed Input at Bottom */}
        <div className="shrink-0 px-6 pb-6 pt-4 border-t border-neutral-100 bg-white">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={onSubmit} className="relative">
              <div className="rounded-2xl bg-neutral-100 transition-all">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message..."
                  disabled={isLoading}
                  rows={1}
                  className="w-full px-4 py-3 pr-24 text-sm bg-transparent border-none outline-none resize-none ring-0 shadow-none placeholder:text-neutral-400 disabled:opacity-50"
                  style={{ border: 'none', outline: 'none', boxShadow: 'none' }}
                />
                <div className="absolute right-2 bottom-2 flex items-center gap-1">
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading || isExtracting}
                  >
                    {isExtracting ? <Spinner className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="submit"
                    size="icon"
                    disabled={isLoading || !input.trim()}
                    className="h-8 w-8 rounded-full bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
