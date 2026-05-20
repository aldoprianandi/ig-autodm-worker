import { describe, expect, it } from "vitest";
import { runScheduledMaintenance } from "../src/ops/maintenance";

describe("scheduled maintenance", () => {
  it("cleans old rows and records maintenance only when cleanup removed data", async () => {
    const calls: string[] = [];
    const events: Array<Record<string, unknown>> = [];
    const repo = {
      async cleanupOldOperationalData() {
        calls.push("cleanup");
        return {
          webhookEvents: 2,
          deliveries: 1,
          contactStates: 0,
          adminRateLimits: 3,
          adminSessions: 1,
          adminAuditLogs: 0,
          operationalEvents: 0,
          outboundRateLimits: 4
        };
      },
      async insertOperationalEvent(input: Record<string, unknown>) {
        calls.push(`event:${input.eventType}`);
        events.push(input);
      }
    };
    const tokenRefresher = async () => {
      calls.push("token");
      return { attempted: false, refreshed: false, source: "stored" as const, expiresAt: "2026-07-01T00:00:00.000Z" };
    };

    const result = await runScheduledMaintenance(repo, tokenRefresher, {
      now: new Date("2026-05-08T00:00:00.000Z")
    });

    expect(result.cleanup).toEqual({
      webhookEvents: 2,
      deliveries: 1,
      contactStates: 0,
      adminRateLimits: 3,
      adminSessions: 1,
      adminAuditLogs: 0,
      operationalEvents: 0,
      outboundRateLimits: 4
    });
    expect(calls).toEqual(["cleanup", "token", "event:maintenance_completed"]);
    expect(events).toMatchObject([
      {
        eventType: "maintenance_completed",
        status: "ok",
        metadata: {
          cleanup: {
            webhookEvents: 2,
            deliveries: 1,
            adminRateLimits: 3,
            adminSessions: 1,
            outboundRateLimits: 4
          }
        }
      }
    ]);
  });

  it("does not write a maintenance event for an every-minute no-op pass", async () => {
    const calls: string[] = [];
    const repo = {
      async cleanupOldOperationalData() {
        calls.push("cleanup");
        return {
          webhookEvents: 0,
          deliveries: 0,
          contactStates: 0,
          adminRateLimits: 0,
          adminSessions: 0,
          adminAuditLogs: 0,
          operationalEvents: 0,
          outboundRateLimits: 0
        };
      },
      async insertOperationalEvent(input: Record<string, unknown>) {
        calls.push(`event:${input.eventType}`);
      }
    };
    const tokenRefresher = async () => {
      calls.push("token");
      return { attempted: false, refreshed: false, source: "stored" as const, expiresAt: "2026-07-01T00:00:00.000Z" };
    };

    const result = await runScheduledMaintenance(repo, tokenRefresher, {
      now: new Date("2026-05-08T00:00:00.000Z")
    });

    expect(result.cleanup).toEqual({
      webhookEvents: 0,
      deliveries: 0,
      contactStates: 0,
      adminRateLimits: 0,
      adminSessions: 0,
      adminAuditLogs: 0,
      operationalEvents: 0,
      outboundRateLimits: 0
    });
    expect(calls).toEqual(["cleanup", "token"]);
  });
});
