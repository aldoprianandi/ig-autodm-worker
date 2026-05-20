import { describe, expect, it } from "vitest";
import { isOpeningRetryComment } from "../src/flows/opening-retry";

describe("isOpeningRetryComment", () => {
  it("recognizes Indonesian comments from users whose DM did not arrive", () => {
    expect(isOpeningRetryComment("@example_creator belum ada ah min")).toBe(true);
    expect(isOpeningRetryComment("DM belum masuk bang")).toBe(true);
    expect(isOpeningRetryComment("dm nya gak ada di inbox")).toBe(true);
    expect(isOpeningRetryComment("nggak masuk min")).toBe(true);
  });

  it("recognizes English comments from users whose DM did not arrive", () => {
    expect(isOpeningRetryComment("no DM yet")).toBe(true);
    expect(isOpeningRetryComment("I did not get the message")).toBe(true);
    expect(isOpeningRetryComment("can't see it in my inbox")).toBe(true);
  });

  it("does not treat normal comments or trigger comments as opening retries", () => {
    expect(isOpeningRetryComment("PROMPT")).toBe(false);
    expect(isOpeningRetryComment("makasih min")).toBe(false);
    expect(isOpeningRetryComment("bus")).toBe(false);
  });
});
