export type DoctorCheckLevel = "pass" | "warn" | "fail";

export type DoctorCheck = {
  level: DoctorCheckLevel;
  id: string;
  message: string;
};

export type DoctorInput = {
  nodeVersion: string;
  wranglerText: string | null;
  devVarsText: string | null;
  migrationCount: number;
  wranglerInstalled: boolean;
  gitAvailable: boolean;
  gitTrackingChecked: boolean;
  trackedPrivatePaths: string[];
  ignoredPrivatePaths: string[];
};

export type DoctorReport = {
  checks: DoctorCheck[];
  ok: boolean;
};

export function parseDotEnv(text: string): {
  values: Map<string, string>;
  duplicates: string[];
  malformed: string[];
};

export function evaluateSetup(input: DoctorInput): DoctorReport;

export function formatReport(report: DoctorReport): string;

export function exitCode(report: DoctorReport): 0 | 1;

export function isPrivateTrackedPath(path: string): boolean;
