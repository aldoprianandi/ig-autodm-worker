import { describe, expect, it } from "vitest";
import { scheduledWorkAt } from "../src/ops/schedule";

describe("scheduled work cadence", () => {
  it("runs delivery recovery every five minutes", () => {
    expect(scheduledWorkAt(Date.UTC(2026, 8, 1, 14, 5))).toMatchObject({ recoverDeliveries: true });
    expect(scheduledWorkAt(Date.UTC(2026, 8, 1, 14, 6))).toMatchObject({ recoverDeliveries: false });
    expect(scheduledWorkAt(Date.UTC(2026, 8, 1, 14, 10))).toMatchObject({ recoverDeliveries: true });
  });

  it("runs cleanup and token maintenance hourly", () => {
    expect(scheduledWorkAt(Date.UTC(2026, 8, 1, 14, 0))).toEqual({
      recoverDeliveries: true,
      runMaintenance: true
    });
    expect(scheduledWorkAt(Date.UTC(2026, 8, 1, 14, 5))).toEqual({
      recoverDeliveries: true,
      runMaintenance: false
    });
  });
});
