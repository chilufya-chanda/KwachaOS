export type TaskStatus =
  | "queued"
  | "running"
  | "retrying"
  | "waiting_for_approval"
  | "done"
  | "failed"
  | "blocked";

export const MAX_TASK_ATTEMPTS = 3;

export const EXECUTABLE_TASK_STATUSES: TaskStatus[] = [
  "queued",
  "retrying",
];

export const ACTIVE_WORK_STATUSES: TaskStatus[] = [
  "queued",
  "running",
  "retrying",
  "waiting_for_approval",
];

export function isDeterministicFailure(message: string): boolean {
  const value = message.toLowerCase();

  return [
    "invalid json schema",
    "invalid schema",
    "tool schema validation",
    "permission denied",
    "api key is missing",
    "is not configured",
    "no ai providers are configured",
  ].some((needle) => value.includes(needle));
}

export function nextTaskStatusAfterError(params: {
  message: string;
  attemptCount: number;
  waitingForApproval?: boolean;
}): TaskStatus {
  if (params.waitingForApproval) {
    return "waiting_for_approval";
  }

  if (
    isDeterministicFailure(params.message) ||
    params.attemptCount >= MAX_TASK_ATTEMPTS
  ) {
    return isDeterministicFailure(params.message) ? "blocked" : "failed";
  }

  return "retrying";
}

export function canExecuteTask(status: string): boolean {
  return EXECUTABLE_TASK_STATUSES.includes(status as TaskStatus);
}
