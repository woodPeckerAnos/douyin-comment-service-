import { describe, expect, it } from "vitest";
import { extractPidFromLockName } from "../src/utils/profile-lock.js";

// Re-export helper for test - actually extractPidFromLockName is not exported
// Test via module internals - export the function

describe("profile-lock helpers", () => {
  it("extracts pid from SingletonLock target name", () => {
    expect(extractPidFromLockName("woodpeckeranosdeMacBook-Pro.local-19602")).toBe(
      19602,
    );
    expect(extractPidFromLockName("invalid")).toBeNull();
  });
});
