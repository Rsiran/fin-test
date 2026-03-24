"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { X } from "@phosphor-icons/react";

type Category = "bug" | "feature" | "general";

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Ide" },
  { value: "general", label: "Annet" },
];

const CATEGORY_STYLES: Record<Category, string> = {
  bug: "bg-[#f8717133] text-[#f87171] border-[#f87171aa] shadow-[0_0_8px_#f8717122]",
  feature: "bg-[#2DD4BF22] text-accent border-[#2DD4BF88] shadow-[0_0_8px_#2DD4BF22]",
  general: "bg-[#88888822] text-[#aaa] border-[#888888aa] shadow-[0_0_8px_#88888822]",
};

const PLACEHOLDERS: Record<Category, string> = {
  bug: "Hva skjedde? Hva forventet du skulle skje?",
  feature: "Beskriv ideen din...",
  general: "Hva vil du fortelle oss?",
};

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("bug");
  const [description, setDescription] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitFeedback = useMutation(api.feedback.submit);
  const generateUploadUrl = useMutation(api.feedback.generateScreenshotUploadUrl);

  const resetForm = useCallback(() => {
    setCategory("bug");
    setDescription("");
    setStepsToReproduce("");
    setScreenshotFile(null);
    setScreenshotPreview(null);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setSubmitted(false);
    resetForm();
  }, [resetForm]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  const handleScreenshot = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setScreenshotPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    if (category === "bug" && !stepsToReproduce.trim()) return;

    setSubmitting(true);
    try {
      let screenshotId: Id<"_storage"> | undefined;

      if (screenshotFile) {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": screenshotFile.type },
          body: screenshotFile,
        });
        const { storageId } = await result.json();
        screenshotId = storageId as Id<"_storage">;
      }

      await submitFeedback({
        category,
        description: description.trim(),
        stepsToReproduce:
          category === "bug" ? stepsToReproduce.trim() : undefined,
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        screenshotId,
      });

      setSubmitted(true);
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (error) {
      console.error("Failed to submit feedback:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const isValid =
    description.trim().length > 0 &&
    (category !== "bug" || stepsToReproduce.trim().length > 0);

  return (
    <>
      {/* Edge tab */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed top-1/2 right-0 -translate-y-1/2 z-40 bg-accent text-[#1A1A1E] font-bold text-[10px] tracking-[1.5px] uppercase px-[5px] py-3 rounded-l-md shadow-[-2px_0_8px_rgba(45,212,191,0.2)] hover:brightness-90 transition-all duration-150"
          style={{ writingMode: "vertical-rl" }}
        >
          FEEDBACK
        </button>
      )}

      {/* Slide-in panel */}
      {open && (
        <div className="fixed inset-0 z-50" onClick={handleClose}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" />

          {/* Panel */}
          <div
            className="absolute top-0 right-0 bottom-0 w-full max-w-md bg-elevated border-l border-white/5 shadow-[-4px_0_20px_rgba(0,0,0,0.4)] flex flex-col animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            {submitted ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-lg font-semibold">Takk!</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between p-5 pb-0">
                  <h2 className="text-lg font-semibold">
                    Send tilbakemelding
                  </h2>
                  <button
                    onClick={handleClose}
                    className="text-[#666666] hover:text-[#F5F5F5] transition-colors duration-150"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Form */}
                <form
                  onSubmit={handleSubmit}
                  className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto"
                >
                  {/* Category pills */}
                  <div className="flex gap-2">
                    {CATEGORY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setCategory(opt.value)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all duration-150 ${
                          category === opt.value
                            ? CATEGORY_STYLES[opt.value]
                            : "bg-transparent text-[#666] border-[#88888833] hover:border-[#88888866]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-1.5">
                      Beskrivelse{" "}
                      <span className="text-[#f87171]">*</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={PLACEHOLDERS[category]}
                      rows={4}
                      className="w-full bg-base rounded-lg px-3 py-2.5 text-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] placeholder:text-[#666666] resize-none"
                    />
                  </div>

                  {/* Steps to reproduce (bug only) */}
                  {category === "bug" && (
                    <div>
                      <label className="block text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-1.5">
                        Hva gjorde du da det skjedde?{" "}
                        <span className="text-[#f87171]">*</span>
                      </label>
                      <textarea
                        value={stepsToReproduce}
                        onChange={(e) => setStepsToReproduce(e.target.value)}
                        placeholder='F.eks: "Jeg klikket på Last opp, valgte en PDF, og ventet i 2 min uten at noe skjedde"'
                        rows={3}
                        className="w-full bg-base rounded-lg px-3 py-2.5 text-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] placeholder:text-[#666666] resize-none"
                      />
                    </div>
                  )}

                  {/* Screenshot */}
                  <div>
                    <label className="block text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-1.5">
                      Skjermbilde (valgfritt)
                    </label>
                    {screenshotPreview ? (
                      <div className="relative">
                        <img
                          src={screenshotPreview}
                          alt="Screenshot"
                          className="w-full rounded-lg border border-white/5"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setScreenshotFile(null);
                            setScreenshotPreview(null);
                          }}
                          className="absolute top-2 right-2 bg-black/60 rounded-full p-1 text-[#666666] hover:text-[#F5F5F5] transition-colors duration-150"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const file = e.dataTransfer.files[0];
                          if (file) handleScreenshot(file);
                        }}
                        className="w-full bg-base border border-dashed border-[#444] rounded-lg py-4 text-center text-[#666666] text-xs hover:border-[#666] transition-colors duration-150"
                      >
                        Klikk eller dra inn et bilde
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleScreenshot(file);
                      }}
                    />
                  </div>

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Submit */}
                  <div>
                    <button
                      type="submit"
                      disabled={!isValid || submitting}
                      className="w-full py-2.5 text-sm bg-accent text-[#1A1A1E] rounded-lg hover:brightness-90 transition-all duration-150 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {submitting ? "Sender..." : "Send inn"}
                    </button>
                    <p className="text-center text-[9px] text-[#555] mt-1.5">
                      Sendes til Jonas
                    </p>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
