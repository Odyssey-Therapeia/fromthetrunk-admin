"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const INTRO_VIDEO_SRC = "/Welcoming.mp4";
const INTRO_FADE_MS = 800;
const INTRO_MAX_MS = 9500;

type IntroPhase = "playing" | "revealing" | "done";

const HomeIntroReadyContext = createContext(true);

export function useHomeIntroReady() {
  return useContext(HomeIntroReadyContext);
}

interface HomeIntroGateProps {
  children: ReactNode;
}

export function HomeIntroGate({ children }: HomeIntroGateProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<IntroPhase>("playing");

  const shouldShowOverlay = phase !== "done";
  const isIntroReady = phase === "done";

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.setTimeout(() => setPhase("done"), 0);
      return;
    }

    const reveal = () => {
      setPhase((current) => (current === "done" ? current : "revealing"));
    };

    const maxTimer = window.setTimeout(reveal, INTRO_MAX_MS);
    const cleanupTimer = window.setTimeout(() => {
      setPhase((current) => (current === "revealing" ? "done" : current));
    }, INTRO_MAX_MS + INTRO_FADE_MS);

    const video = videoRef.current;
    if (video) {
      video.muted = true;
      video.play().catch(reveal);
    }

    return () => {
      window.clearTimeout(maxTimer);
      window.clearTimeout(cleanupTimer);
    };
  }, []);

  useEffect(() => {
    if (phase !== "revealing") return;

    const timer = window.setTimeout(() => {
      setPhase("done");
    }, INTRO_FADE_MS);

    return () => window.clearTimeout(timer);
  }, [phase]);

  const reveal = () => {
    setPhase((current) => (current === "done" ? current : "revealing"));
  };

  return (
    <HomeIntroReadyContext.Provider value={isIntroReady}>
      <div
        className={cn(
          "transition-opacity duration-700 ease-out",
          shouldShowOverlay ? "opacity-0" : "opacity-100",
        )}
      >
        {children}
      </div>

      {shouldShowOverlay && (
        <div
          className={cn(
            "fixed inset-0 z-100 flex items-center justify-center overflow-hidden bg-[#F8F4EF] transform-[translateZ(0)] transition-opacity duration-700 ease-out",
            phase === "revealing" && "pointer-events-none opacity-0",
          )}
        >
          <video
            ref={videoRef}
            aria-hidden="true"
            className="h-full w-full object-cover"
            src={INTRO_VIDEO_SRC}
            muted
            autoPlay
            playsInline
            preload="metadata"
            onEnded={reveal}
            onError={reveal}
          />
          <button
            type="button"
            onClick={reveal}
            aria-label="Skip intro video"
            className="fixed bottom-6 right-6 z-10 inline-flex items-center gap-2 rounded-full border border-[#AA8657]/50 bg-[#3C0C0F]/70 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-[#F8F4EF] backdrop-blur-md transition duration-300 hover:border-[#AA8657] hover:bg-[#3C0C0F]/90 hover:text-[#AA8657] sm:bottom-8 sm:right-8"
          >
            Skip Intro
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M5 5v14l8-7-8-7Zm9 0v14h2V5h-2Z" />
            </svg>
          </button>
        </div>
      )}
    </HomeIntroReadyContext.Provider>
  );
}
