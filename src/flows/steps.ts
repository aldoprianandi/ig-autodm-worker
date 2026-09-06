import type { Campaign } from "../db/repository";

export const MAX_DM_STEPS = 3;

export type ButtonAdvance =
  | { type: "step"; stepIndex: number }
  | { type: "final" };

export function stepPayload(campaignId: string, stepIndex: number): string {
  return `${campaignId}:step:${stepIndex + 1}`;
}

export function openingButtonPayload(campaign: Campaign): string {
  return campaign.dmSteps.length ? stepPayload(campaign.id, 0) : campaign.buttonPayload;
}

export function stepButtonPayload(campaign: Campaign, stepIndex: number): string {
  return stepIndex + 1 < campaign.dmSteps.length
    ? stepPayload(campaign.id, stepIndex + 1)
    : campaign.buttonPayload;
}

export function stepDeliveryType(stepIndex: number): string {
  return `button_step:${stepIndex + 1}`;
}

export function parseStepDeliveryType(value: string): number | undefined {
  const match = /^button_step:(\d+)$/.exec(value);
  if (!match) return undefined;

  const stepNumber = Number.parseInt(match[1], 10);
  return Number.isInteger(stepNumber) && stepNumber > 0 ? stepNumber - 1 : undefined;
}

export function resolvePayloadAdvance(campaign: Campaign, state: string, payload: string): ButtonAdvance | null {
  if (payload === campaign.buttonPayload) {
    return canConfirmFinal(campaign, state) ? { type: "final" } : null;
  }

  const stepIndex = parseStepPayload(campaign.id, payload);
  if (stepIndex === undefined) return null;
  if (!campaign.dmSteps[stepIndex]) return null;
  if (!canRequestStep(state, stepIndex)) return null;

  return { type: "step", stepIndex };
}

export function resolveTextAdvance(campaign: Campaign, state: string, text: string): ButtonAdvance | null {
  const normalizedText = normalizeButtonText(text);
  if (!normalizedText) return null;

  if (state === "follow_requested" && isFollowRetryText(campaign, normalizedText)) {
    return { type: "final" };
  }

  if ((state === "commented" || state === "follow_requested") && normalizedText === normalizeButtonText(campaign.buttonTitle)) {
    return campaign.dmSteps.length ? { type: "step", stepIndex: 0 } : { type: "final" };
  }

  if (
    state === "follow_requested" &&
    campaign.followGateButtonTitle &&
    normalizedText === normalizeButtonText(campaign.followGateButtonTitle)
  ) {
    return { type: "final" };
  }

  const sentStepIndex = parseSentStepState(state);
  if (sentStepIndex === undefined) return null;

  const sentStep = campaign.dmSteps[sentStepIndex];
  if (!sentStep || normalizedText !== normalizeButtonText(sentStep.buttonTitle)) return null;

  return sentStepIndex + 1 < campaign.dmSteps.length
    ? { type: "step", stepIndex: sentStepIndex + 1 }
    : { type: "final" };
}

function parseStepPayload(campaignId: string, payload: string): number | undefined {
  const prefix = `${campaignId}:step:`;
  if (!payload.startsWith(prefix)) return undefined;

  const suffix = payload.slice(prefix.length);
  if (!/^[1-9]\d*$/.test(suffix)) return undefined;
  const stepNumber = Number(suffix);
  return Number.isInteger(stepNumber) && stepNumber > 0 ? stepNumber - 1 : undefined;
}

function canRequestStep(state: string, stepIndex: number): boolean {
  if (stepIndex === 0) return state === "commented";
  return state === sentStepState(stepIndex - 1);
}

function canConfirmFinal(campaign: Campaign, state: string): boolean {
  if (state === "follow_requested") return true;
  if (!campaign.dmSteps.length) return state === "commented";
  return state === sentStepState(campaign.dmSteps.length - 1);
}

export function sentStepState(stepIndex: number): string {
  return `button_step:${stepIndex + 1}`;
}

function parseSentStepState(state: string): number | undefined {
  const match = /^button_step:(\d+)$/.exec(state);
  if (!match) return undefined;

  const stepNumber = Number.parseInt(match[1], 10);
  return Number.isInteger(stepNumber) && stepNumber > 0 ? stepNumber - 1 : undefined;
}

function normalizeButtonText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isFollowRetryText(campaign: Campaign, normalizedText: string): boolean {
  const configuredTitles = [campaign.buttonTitle, campaign.followGateButtonTitle ?? ""]
    .map(normalizeButtonText)
    .filter(Boolean);

  for (const title of configuredTitles) {
    if (normalizedText === title) return true;
    if (title.startsWith("i ") && normalizedText === title.slice(2)) return true;
  }

  return FOLLOW_RETRY_TEXTS.has(normalizedText);
}

const FOLLOW_RETRY_TEXTS = new Set([
  "ready",
  "done",
  "done sir",
  "followed",
  "i followed",
  "i have followed",
  "already followed",
  "folowed",
  "i folowed",
  "follow",
  "i follow",
  "udah",
  "udah follow",
  "udah followed",
  "sudah",
  "sudah follow",
  "sudah followed"
]);
