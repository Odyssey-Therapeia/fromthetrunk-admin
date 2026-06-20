/**
 * components/admin/product-stepper/_render-log.ts
 *
 * TEMPORARY debugging instrumentation. Delete this file (and the imports in
 * stepper.tsx / step-details.tsx / live-preview-card.tsx) once the typing-lag
 * cause is found.
 *
 * React 19 forbids touching refs during render, so ALL ref work here happens
 * inside useEffect — which is allowed and runs once per committed render.
 *
 * Filter the browser console by "[render]", "[event]", or "[profiler]".
 */
import { useEffect, useRef } from "react";
import type { ProfilerOnRenderCallback } from "react";

const now = () => performance.now().toFixed(0);

// Module-level (not a ref) so logEvent and useRenderLog can correlate the last
// keystroke with the render it triggered.
let lastEventAt = 0;
let lastEventName = "";

/**
 * Logs every committed render of a component with a counter + timestamp, how
 * long after the last logged event it rendered, and which watched values got a
 * NEW reference since the previous render (unstable props that defeat memo).
 *
 * The counter distinguishes re-render (#2, #3, …) from remount (resets to #1).
 */
export function useRenderLog(name: string, watch?: Record<string, unknown>) {
  const count = useRef(0);
  const prev = useRef<Record<string, unknown> | undefined>(undefined);

  // No dependency array → runs after every commit. All ref reads/writes are
  // here, inside the effect, which React permits.
  useEffect(() => {
    count.current += 1;

    let refNote = "";
    if (watch) {
      if (prev.current) {
        const changed = Object.keys(watch).filter(
          (key) => !Object.is(watch[key], prev.current![key]),
        );
        refNote = changed.length
          ? ` | new ref -> ${changed.join(", ")}`
          : " | (no watched ref changed)";
      }
      prev.current = watch;
    }

    const sinceEvent =
      lastEventAt > 0
        ? ` | ${(performance.now() - lastEventAt).toFixed(0)}ms after "${lastEventName}"`
        : "";

    console.log(
      `[render] ${name} #${count.current} @ ${now()}ms${refNote}${sinceEvent}`,
    );
  });
}

/** Logs a discrete event (e.g. a keystroke) and timestamps it for latency math. */
export function logEvent(name: string, detail?: unknown) {
  lastEventAt = performance.now();
  lastEventName = name;
  console.log(`[event] ${name} @ ${now()}ms`, detail ?? "");
}

/** Pass to <Profiler onRender={...}>. Logs the committed render duration. */
export const onRenderProfiler: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
) => {
  console.log(`[profiler] ${id} -- ${phase} -- ${actualDuration.toFixed(1)}ms`);
};
