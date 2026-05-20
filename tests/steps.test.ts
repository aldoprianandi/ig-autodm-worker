import { describe, expect, it } from "vitest";
import type { Campaign } from "../src/db/repository";
import { resolvePayloadAdvance, resolveTextAdvance } from "../src/flows/steps";

const campaign: Campaign = {
  id: "campaign-1",
  name: "Campaign 1",
  mediaId: "media-1",
  keyword: "PROMPT",
  openingText: "Opening",
  openingTextVariants: ["Opening"],
  buttonTitle: "SEND IT",
  buttonPayload: "campaign-1:confirm",
  dmSteps: [],
  deliveryText: "Final prompt",
  commentReplyTextVariants: [],
  openingFailureReplyText: null,
  followGateEnabled: true,
  followGateButtonTitle: "I FOLLOWED",
  enabled: true
};

describe("flow step resolver", () => {
  it("advances to final when the original button title is typed after the opening", () => {
    expect(resolveTextAdvance(campaign, "commented", "send it")).toEqual({ type: "final" });
  });

  it("advances to final when the follow-gate button title is typed after follow request", () => {
    expect(resolveTextAdvance(campaign, "follow_requested", "I FOLLOWED")).toEqual({ type: "final" });
  });

  it("accepts the shortened follow-gate title without the leading I", () => {
    expect(resolveTextAdvance(campaign, "follow_requested", "FOLLOWED")).toEqual({ type: "final" });
  });

  it("accepts common English and Indonesian manual follow retry text", () => {
    expect(resolveTextAdvance(campaign, "follow_requested", "ready")).toEqual({ type: "final" });
    expect(resolveTextAdvance(campaign, "follow_requested", "done")).toEqual({ type: "final" });
    expect(resolveTextAdvance(campaign, "follow_requested", "udah follow")).toEqual({ type: "final" });
    expect(resolveTextAdvance(campaign, "follow_requested", "sudah followed")).toEqual({ type: "final" });
  });

  it("keeps manual follow retry text inert before a follow request exists", () => {
    expect(resolveTextAdvance(campaign, "commented", "I FOLLOWED")).toBeNull();
    expect(resolveTextAdvance(campaign, "commented", "READY")).toBeNull();
  });

  it("routes the first step before final when a campaign has intermediate DM steps", () => {
    const stepped = {
      ...campaign,
      dmSteps: [{ text: "Step one", textVariants: ["Step one"], buttonTitle: "NEXT" }]
    };

    expect(resolveTextAdvance(stepped, "commented", "SEND IT")).toEqual({ type: "step", stepIndex: 0 });
    expect(resolvePayloadAdvance(stepped, "commented", "campaign-1:step:1")).toEqual({
      type: "step",
      stepIndex: 0
    });
  });

  it("only accepts the active intermediate step button", () => {
    const stepped = {
      ...campaign,
      dmSteps: [
        { text: "Step one", textVariants: ["Step one"], buttonTitle: "NEXT" },
        { text: "Step two", textVariants: ["Step two"], buttonTitle: "DONE" }
      ]
    };

    expect(resolveTextAdvance(stepped, "button_step:1", "NEXT")).toEqual({ type: "step", stepIndex: 1 });
    expect(resolveTextAdvance(stepped, "button_step:1", "DONE")).toBeNull();
    expect(resolveTextAdvance(stepped, "button_step:2", "DONE")).toEqual({ type: "final" });
    expect(resolveTextAdvance(stepped, "button_step:1", "SEND IT")).toBeNull();
    expect(resolvePayloadAdvance(stepped, "commented", "campaign-1:confirm")).toBeNull();
  });
});
