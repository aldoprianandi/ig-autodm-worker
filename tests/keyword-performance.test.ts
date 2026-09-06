import { describe, expect, it } from "vitest";
import { commentMatchesKeyword } from "../src/flows/keyword";

describe("keyword matching under repetitive input", () => {
  it("finishes a repetitive phrase without enumerating token permutations", () => {
    const comment = Array(500).fill("abcdefghij").join(" ");
    const keyword = "abcdefghij abcdefghij abcdefghij abcdefghij abcdefghij xy";
    const start = performance.now();
    expect(commentMatchesKeyword(comment, keyword)).toBe(false);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
