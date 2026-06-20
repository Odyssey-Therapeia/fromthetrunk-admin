"use client";

import { useEffect, useRef, useState } from "react";

export function FloatingReviewTab() {
  const [comment, setComment] = useState("");
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [rating, setRating] = useState(5);
  const dialogRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const updateVisibility = () => {
      const top = sentinelRef.current?.getBoundingClientRect().top;
      setIsVisible(
        typeof top === "number"
          ? top <= window.innerHeight * 0.72 ||
              window.scrollY > window.innerHeight * 0.4
          : window.scrollY > window.innerHeight * 0.4,
      );
    };

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);

    return () => {
      window.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    window.setTimeout(() => {
      dialogRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const activeRating = hoverRating ?? rating;

  return (
    <>
      <span
        ref={sentinelRef}
        className="block h-px w-px"
        data-review-sentinel="true"
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setIsSubmitted(false);
        }}
        aria-hidden={!isVisible}
        aria-label="Open review form"
        tabIndex={isVisible ? 0 : -1}
        className={`fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 border border-[#AA8657]/50 bg-[#3C0C0F] px-3 py-5 text-[#F8F4EF] shadow-[0_18px_50px_rgba(60,12,15,0.28)] transition duration-500 hover:bg-[#280609] hover:text-[#AA8657] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AA8657] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8F4EF] md:flex ${
          isVisible
            ? "visible translate-x-0 opacity-100"
            : "invisible pointer-events-none translate-x-full opacity-0"
        }`}
      >
        <span
          className="[writing-mode:vertical-rl] text-[0.72rem] font-semibold uppercase tracking-[0.26em]"
          aria-hidden="true"
        >
          ★ Reviews
        </span>
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/68 px-4 py-8 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-dialog-title"
            tabIndex={-1}
            className="relative w-full max-w-xl border border-[#AA8657]/35 bg-[#F8F4EF] p-6 text-[#3C0C0F] shadow-[0_30px_100px_rgba(0,0,0,0.38)] outline-none md:p-9"
          >
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close review form"
              className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-[#3C0C0F]/12 text-[#3C0C0F] transition hover:border-[#AA8657] hover:text-[#AA8657] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AA8657]"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M6 6l12 12" />
                <path d="M18 6 6 18" />
              </svg>
            </button>

            {isSubmitted ? (
              <div className="py-10 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#AA8657]">
                  Thank You
                </p>
                <h2 className="mt-4 font-serif text-4xl leading-tight text-[#3C0C0F] md:text-5xl">
                  Thank you for sharing your story.
                </h2>
                <p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-[#3C0C0F]/68">
                  Your note helps us understand how each restored saree begins
                  its next chapter.
                </p>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="mt-8 rounded-full border border-[#AA8657] bg-[#3C0C0F] px-7 py-3 text-sm font-semibold text-[#AA8657] transition hover:-translate-y-0.5 hover:bg-[#280609] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AA8657] focus-visible:ring-offset-2"
                >
                  Close
                </button>
              </div>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setComment("");
                  setRating(5);
                  setHoverRating(null);
                  setIsSubmitted(true);
                }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#AA8657]">
                  Customer Review
                </p>
                <h2
                  id="review-dialog-title"
                  className="mt-4 max-w-md font-serif text-4xl leading-tight text-[#3C0C0F] md:text-5xl"
                >
                  Share your From The Trunk experience.
                </h2>
                <p className="mt-4 max-w-md text-sm leading-7 text-[#3C0C0F]/68">
                  Tell us how the saree felt, where it travelled, or what made
                  the piece feel personal.
                </p>

                <div className="mt-8 border-y border-[#3C0C0F]/10 py-6">
                  <p className="text-sm font-semibold text-[#3C0C0F]">
                    Your rating
                  </p>
                  <div
                    className="mt-3 flex items-center gap-2"
                    onMouseLeave={() => setHoverRating(null)}
                  >
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onMouseEnter={() => setHoverRating(star)}
                        onFocus={() => setHoverRating(star)}
                        onBlur={() => setHoverRating(null)}
                        onClick={() => setRating(star)}
                        aria-label={`Set rating to ${star} star${star > 1 ? "s" : ""}`}
                        className={`text-4xl leading-none transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AA8657] ${
                          star <= activeRating
                            ? "text-[#AA8657]"
                            : "text-[#3C0C0F]/20"
                        }`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                <label
                  htmlFor="review-comment"
                  className="mt-6 block text-sm font-semibold text-[#3C0C0F]"
                >
                  Your comment
                </label>
                <textarea
                  id="review-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={5}
                  required
                  placeholder="Write your review here..."
                  className="mt-3 w-full resize-none border border-[#3C0C0F]/15 bg-white/70 px-4 py-3 text-sm leading-6 text-[#3C0C0F] outline-none transition placeholder:text-[#3C0C0F]/35 focus:border-[#AA8657] focus:ring-2 focus:ring-[#AA8657]/25"
                />

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="submit"
                    className="rounded-full border border-[#AA8657] bg-[#3C0C0F] px-7 py-3 text-sm font-semibold text-[#AA8657] transition hover:-translate-y-0.5 hover:bg-[#280609] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AA8657] focus-visible:ring-offset-2"
                  >
                    Submit Review
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="text-sm font-semibold text-[#3C0C0F]/58 transition hover:text-[#3C0C0F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AA8657]"
                  >
                    Maybe later
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
