/**
 * P6-05: Packing slip regression test.
 *
 * Asserts that:
 *   1. The packing-slip page module does NOT export a function component
 *      that directly contains onClick on a host element (RSC safety check).
 *   2. The PrintControls client component is a separate module with "use client".
 *   3. The page module is a Server Component (async function, no "use client").
 *
 * This catches the REPAIR-1 defect: an RSC with onClick throws at request time
 * in Next 16's RSC flight serializer (event handlers cannot be passed to Client
 * Component props). The build passes because the route is dynamic; tsc and lint
 * do not detect it; the crash only fires when an admin opens the packing slip.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const PACKING_SLIP_PAGE = resolve(
  process.cwd(),
  "app/(admin)/orders/[id]/packing-slip/page.tsx"
);

const PRINT_CONTROLS = resolve(
  process.cwd(),
  "app/(admin)/orders/[id]/packing-slip/print-controls.tsx"
);

describe("packing-slip RSC safety (REPAIR-1)", () => {
  it("page.tsx does NOT contain an onClick attribute on a host element", () => {
    const source = readFileSync(PACKING_SLIP_PAGE, "utf-8");
    // Must not have onClick directly on <button> or any JSX host element
    // inside this file (only allowed in a "use client" child)
    expect(source).not.toMatch(/onClick=\{/);
  });

  it("page.tsx does NOT contain 'use client' directive (it is an async RSC)", () => {
    const source = readFileSync(PACKING_SLIP_PAGE, "utf-8");
    expect(source).not.toMatch(/^["']use client["']/m);
  });

  it("page.tsx imports PrintControls from ./print-controls", () => {
    const source = readFileSync(PACKING_SLIP_PAGE, "utf-8");
    expect(source).toMatch(/PrintControls/);
    expect(source).toMatch(/print-controls/);
  });

  it("print-controls.tsx has 'use client' directive at the top", () => {
    const source = readFileSync(PRINT_CONTROLS, "utf-8");
    expect(source).toMatch(/^["']use client["']/m);
  });

  it("print-controls.tsx contains onClick for window.print()", () => {
    const source = readFileSync(PRINT_CONTROLS, "utf-8");
    expect(source).toMatch(/onClick/);
    expect(source).toMatch(/window\.print\(\)/);
  });
});
