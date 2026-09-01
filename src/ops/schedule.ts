const MINUTE_MS = 60 * 1000;
const RECOVERY_INTERVAL_MINUTES = 5;
const MAINTENANCE_INTERVAL_MINUTES = 60;

export type ScheduledWork = {
  recoverDeliveries: boolean;
  runMaintenance: boolean;
};

export function scheduledWorkAt(scheduledTime: number): ScheduledWork {
  const scheduledMinute = Math.floor(scheduledTime / MINUTE_MS);

  return {
    recoverDeliveries: scheduledMinute % RECOVERY_INTERVAL_MINUTES === 0,
    runMaintenance: scheduledMinute % MAINTENANCE_INTERVAL_MINUTES === 0
  };
}
