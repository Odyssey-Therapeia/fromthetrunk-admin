/**
 * P2-09: Structured logger unit tests.
 *
 * Verifies:
 *   - createLogger returns { debug, info, warn, error }
 *   - JSON output in production (NODE_ENV === "production")
 *   - Human-readable output in development
 *   - Level filtering via LOG_LEVEL env var
 *   - Namespace is included in output
 *   - Meta fields are merged into JSON output
 *   - Logger NEVER throws (safe in fire-and-forget paths)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Import after environment manipulation in each test
import { createLogger } from "@/lib/log";

describe("createLogger", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  describe("return shape", () => {
    it("returns an object with debug, info, warn, error methods", () => {
      const log = createLogger("test:shape");
      expect(typeof log.debug).toBe("function");
      expect(typeof log.info).toBe("function");
      expect(typeof log.warn).toBe("function");
      expect(typeof log.error).toBe("function");
    });
  });

  describe("JSON output in production", () => {
    it("writes a JSON line when NODE_ENV=production", () => {
      vi.stubEnv("NODE_ENV", "production");
      const log = createLogger("test:json");
      log.info("hello world", { userId: "u-1" });

      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      const written = stdoutSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed.level).toBe("info");
      expect(parsed.namespace).toBe("test:json");
      expect(parsed.msg).toBe("hello world");
      expect(parsed.userId).toBe("u-1");
      expect(typeof parsed.time).toBe("string");
    });

    it("JSON line ends with newline", () => {
      vi.stubEnv("NODE_ENV", "production");
      const log = createLogger("test:newline");
      log.info("msg");

      const written = stdoutSpy.mock.calls[0][0] as string;
      expect(written.endsWith("\n")).toBe(true);
    });

    it("merges meta fields into the JSON root (not nested)", () => {
      vi.stubEnv("NODE_ENV", "production");
      const log = createLogger("test:meta");
      log.error("sink failed", { err: new Error("oops"), sinkName: "ga4" });

      const written = stdoutSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed.sinkName).toBe("ga4");
      expect(parsed.err).toBeDefined();
    });

    it("includes correct level for warn", () => {
      vi.stubEnv("NODE_ENV", "production");
      const log = createLogger("test:levels");
      log.warn("something fishy");

      const written = stdoutSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed.level).toBe("warn");
    });

    it("includes correct level for error", () => {
      vi.stubEnv("NODE_ENV", "production");
      const log = createLogger("test:levels");
      log.error("boom");

      const written = stdoutSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed.level).toBe("error");
    });
  });

  describe("human-readable output in development", () => {
    it("writes a non-JSON string in development (NODE_ENV=test)", () => {
      // NODE_ENV=test (default in vitest) => human-readable
      const log = createLogger("test:human");
      log.info("hello");

      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      const written = stdoutSpy.mock.calls[0][0] as string;
      // Should not be valid JSON at the root level (may contain structured bits)
      let isJson = false;
      try {
        JSON.parse(written.trim());
        isJson = true;
      } catch {
        isJson = false;
      }
      expect(isJson).toBe(false);
    });

    it("includes namespace in human-readable output", () => {
      const log = createLogger("my:namespace");
      log.info("test message");

      const written = stdoutSpy.mock.calls[0][0] as string;
      expect(written).toContain("my:namespace");
    });

    it("includes message in human-readable output", () => {
      const log = createLogger("test:msg");
      log.warn("check this out");

      const written = stdoutSpy.mock.calls[0][0] as string;
      expect(written).toContain("check this out");
    });
  });

  describe("level filtering via LOG_LEVEL", () => {
    it("hides debug messages when LOG_LEVEL=info (default)", () => {
      vi.stubEnv("LOG_LEVEL", "info");
      const log = createLogger("test:filter");
      log.debug("hidden debug message");

      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it("shows debug messages when LOG_LEVEL=debug", () => {
      vi.stubEnv("LOG_LEVEL", "debug");
      const log = createLogger("test:filter");
      log.debug("visible debug message");

      expect(stdoutSpy).toHaveBeenCalledTimes(1);
    });

    it("shows all levels when LOG_LEVEL=debug", () => {
      vi.stubEnv("LOG_LEVEL", "debug");
      const log = createLogger("test:filter");
      log.debug("d");
      log.info("i");
      log.warn("w");
      log.error("e");

      expect(stdoutSpy).toHaveBeenCalledTimes(4);
    });

    it("hides debug and info when LOG_LEVEL=warn", () => {
      vi.stubEnv("LOG_LEVEL", "warn");
      const log = createLogger("test:filter");
      log.debug("no");
      log.info("no");
      log.warn("yes");
      log.error("yes");

      expect(stdoutSpy).toHaveBeenCalledTimes(2);
    });

    it("hides debug, info, warn when LOG_LEVEL=error", () => {
      vi.stubEnv("LOG_LEVEL", "error");
      const log = createLogger("test:filter");
      log.debug("no");
      log.info("no");
      log.warn("no");
      log.error("yes");

      expect(stdoutSpy).toHaveBeenCalledTimes(1);
    });

    it("defaults to info level when LOG_LEVEL is unset", () => {
      // LOG_LEVEL not set — debug should be hidden
      delete process.env.LOG_LEVEL;
      const log = createLogger("test:default");
      log.debug("should not appear");
      log.info("should appear");

      expect(stdoutSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("namespace", () => {
    it("JSON output includes the exact namespace string", () => {
      vi.stubEnv("NODE_ENV", "production");
      const log = createLogger("analytics:emit");
      log.info("event fired");

      const written = stdoutSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed.namespace).toBe("analytics:emit");
    });
  });

  describe("never throws", () => {
    it("does not throw when msg is empty string", () => {
      const log = createLogger("test:safe");
      expect(() => log.error("")).not.toThrow();
    });

    it("does not throw when meta contains circular reference", () => {
      vi.stubEnv("NODE_ENV", "production");
      const log = createLogger("test:circular");
      const obj: Record<string, unknown> = {};
      obj.self = obj; // circular

      expect(() => log.error("circular", obj)).not.toThrow();
    });

    it("does not throw when meta contains an Error object", () => {
      vi.stubEnv("NODE_ENV", "production");
      const log = createLogger("test:error-meta");
      const err = new Error("something bad");
      expect(() => log.error("caught error", { err })).not.toThrow();
    });

    it("does not throw when called with no meta argument", () => {
      const log = createLogger("test:no-meta");
      expect(() => log.info("just a message")).not.toThrow();
      expect(() => log.warn("just a warning")).not.toThrow();
      expect(() => log.error("just an error")).not.toThrow();
      expect(() => log.debug("just debug")).not.toThrow();
    });

    it("does not throw inside a Promise.all catch (fire-and-forget pattern)", async () => {
      const log = createLogger("test:fff");
      const tasks = [
        Promise.reject(new Error("task 1 failed")).catch((err: unknown) => {
          log.error("Task failed", { err });
        }),
        Promise.reject(new Error("task 2 failed")).catch((err: unknown) => {
          log.error("Task failed", { err });
        }),
      ];
      await expect(Promise.all(tasks)).resolves.not.toThrow();
    });
  });
});
