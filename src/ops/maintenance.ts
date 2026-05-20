import type { CleanupCounts } from "../db/repository";
import type { TokenRefreshResult } from "../token/manager";

type MaintenanceRepository = {
  cleanupOldOperationalData(now?: Date): Promise<CleanupCounts>;
  insertOperationalEvent(input: {
    eventType: string;
    status: string;
    message?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
};

export async function runScheduledMaintenance(
  repo: MaintenanceRepository,
  tokenRefresher: () => Promise<TokenRefreshResult>,
  options: { now?: Date } = {}
): Promise<{ cleanup: CleanupCounts; token: TokenRefreshResult }> {
  const now = options.now ?? new Date();
  const cleanup = await repo.cleanupOldOperationalData(now);
  const token = await tokenRefresher();

  if (cleanupDeletedRows(cleanup)) {
    await repo.insertOperationalEvent({
      eventType: "maintenance_completed",
      status: "ok",
      metadata: {
        cleanup,
        token,
        ranAt: now.toISOString()
      }
    });
  }

  return { cleanup, token };
}

function cleanupDeletedRows(cleanup: CleanupCounts): boolean {
  return Object.values(cleanup).some((count) => count > 0);
}
