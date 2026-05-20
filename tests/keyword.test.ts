import { describe, expect, it } from "vitest";
import { commentMatchesKeyword } from "../src/flows/keyword";

describe("commentMatchesKeyword", () => {
  it("matches exact keywords without caring about case", () => {
    expect(commentMatchesKeyword("pROMPT bang", "PROMPT")).toBe(true);
    expect(commentMatchesKeyword("send Blue Green please", "Blue Green")).toBe(true);
  });

  it("matches common one-word keyword typos flexibly", () => {
    for (const text of ["prmpt", "promp", "promt", "promptp", "promtp", "pormpt", "promo"]) {
      expect(commentMatchesKeyword(text, "PROMPT")).toBe(true);
    }

    expect(commentMatchesKeyword("promosi dong", "PROMPT")).toBe(false);
  });

  it("matches multi-word keywords when word order changes", () => {
    expect(commentMatchesKeyword("Green Blue", "Blue Green")).toBe(true);
    expect(commentMatchesKeyword("send green first, then blue", "Blue Green")).toBe(true);
  });

  it("matches small typos in multi-word keywords", () => {
    expect(commentMatchesKeyword("bue grene", "Blue Green")).toBe(true);
    expect(commentMatchesKeyword("bleu gren", "Blue Green")).toBe(true);
    expect(commentMatchesKeyword("bluee greenn", "Blue Green")).toBe(true);
  });

  it("does not match only one strong word from a multi-word keyword", () => {
    expect(commentMatchesKeyword("blue please", "Blue Green")).toBe(false);
    expect(commentMatchesKeyword("green please", "Blue Green")).toBe(false);
    expect(commentMatchesKeyword("blue blue", "Blue Green")).toBe(false);
    expect(commentMatchesKeyword("gren please", "Blue Green")).toBe(false);
  });

  it("does not match unrelated words or weak common words from a phrase", () => {
    expect(commentMatchesKeyword("red please", "Blue Green")).toBe(false);
    expect(commentMatchesKeyword("the please", "The Blue")).toBe(false);
  });
});
