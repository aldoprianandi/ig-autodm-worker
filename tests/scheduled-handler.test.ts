import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { pollCampaignComments } from "../src/poller/comments";
import { recoverStaleDeliveries } from "../src/queue/recovery";
import { runScheduledMaintenance } from "../src/ops/maintenance";

vi.mock("../src/poller/comments", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/poller/comments")>(),
  pollCampaignComments: vi.fn().mockResolvedValue({})
}));
vi.mock("../src/queue/recovery", () => ({ recoverStaleDeliveries: vi.fn().mockResolvedValue(0) }));
vi.mock("../src/ops/maintenance", () => ({ runScheduledMaintenance: vi.fn().mockResolvedValue({}) }));

describe("scheduled handler wiring", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps expensive jobs out of ordinary minute ticks", async () => {
    const pending: Promise<unknown>[] = [];
    worker.scheduled({ scheduledTime: Date.UTC(2026, 8, 6, 1, 1) } as ScheduledController,
      { AUTOMATION_ENABLED: "true" } as never,
      { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as unknown as ExecutionContext);
    await Promise.all(pending);
    expect(pollCampaignComments).toHaveBeenCalledOnce();
    expect(recoverStaleDeliveries).not.toHaveBeenCalled();
    expect(runScheduledMaintenance).not.toHaveBeenCalled();
  });

  it("keeps maintenance running with the kill switch while suppressing recovery", async () => {
    const pending: Promise<unknown>[] = [];
    worker.scheduled({ scheduledTime: Date.UTC(2026, 8, 6, 1, 0) } as ScheduledController,
      { AUTOMATION_ENABLED: "false" } as never,
      { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as unknown as ExecutionContext);
    await Promise.all(pending);
    expect(recoverStaleDeliveries).not.toHaveBeenCalled();
    expect(runScheduledMaintenance).toHaveBeenCalledOnce();
  });
});
