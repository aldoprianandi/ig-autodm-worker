import { describe, expect, it } from "vitest";
import { commentMatchesKeyword } from "../src/flows/keyword";

describe("commentMatchesKeyword", () => {
  it("matches exact keywords without caring about case", () => {
    expect(commentMatchesKeyword("pROMPT bang", "PROMPT")).toBe(true);
    expect(commentMatchesKeyword("mau Blue Green dong", "Blue Green")).toBe(true);
  });

  it("matches common one-word keyword typos flexibly", () => {
    for (const text of ["prmpt", "promp", "promt", "promptp", "promtp", "pormpt", "promo"]) {
      expect(commentMatchesKeyword(text, "PROMPT")).toBe(true);
    }

    expect(commentMatchesKeyword("promosi dong", "PROMPT")).toBe(false);
  });

  it("matches multi-word keywords when word order changes", () => {
    expect(commentMatchesKeyword("Green Blue", "Blue Green")).toBe(true);
    expect(commentMatchesKeyword("ambil yang green dulu terus blue", "Blue Green")).toBe(true);
  });

  it("matches small typos in multi-word keywords", () => {
    expect(commentMatchesKeyword("blu grene", "Blue Green")).toBe(true);
    expect(commentMatchesKeyword("blue gren", "Blue Green")).toBe(true);
    expect(commentMatchesKeyword("bluee greenn", "Blue Green")).toBe(true);
  });

  it("matches a strong standalone word from a multi-word keyword", () => {
    expect(commentMatchesKeyword("blue aja", "Blue Green")).toBe(true);
    expect(commentMatchesKeyword("green aja", "Blue Green")).toBe(true);
    expect(commentMatchesKeyword("blue blue", "Blue Green")).toBe(true);
    expect(commentMatchesKeyword("gren dong", "Blue Green")).toBe(true);
  });

  it("does not match unrelated words or weak common words from a phrase", () => {
    expect(commentMatchesKeyword("merah aja", "Blue Green")).toBe(false);
    expect(commentMatchesKeyword("the dong", "The Green")).toBe(false);
  });
});
