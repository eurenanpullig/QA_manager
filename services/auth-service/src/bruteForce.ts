/**
 * [2.2.3] Brute Force Protection (Progressive Jailing)
 * Failed Attempt Threshold: 5 failed authentications.
 * Progressive Suspension Timeline:
 * Stage 1: 5 min -> Stage 2: 15 min -> Stage 3: 45 min -> Stage 4: 2 hours -> Stage 5: 24 hours
 */

export const FAILED_ATTEMPTS_THRESHOLD = 5;

export const SUSPENSION_STAGES_MINUTES: readonly number[] = [
  5, // Stage 1: 5 minutes
  15, // Stage 2: 15 minutes
  45, // Stage 3: 45 minutes
  120, // Stage 4: 2 hours
  1440, // Stage 5: 24 hours
];

export interface LockoutEvaluation {
  newFailedAttempts: number;
  newSuspensionLevel: number;
  suspendedUntil: Date | null;
  locked: boolean;
  lockDurationMinutes: number;
}

export function evaluateFailedAttempt(
  currentFailedAttempts: number,
  currentSuspensionLevel: number,
  now: Date = new Date(),
): LockoutEvaluation {
  const nextFailedAttempts = currentFailedAttempts + 1;

  if (nextFailedAttempts < FAILED_ATTEMPTS_THRESHOLD) {
    return {
      newFailedAttempts: nextFailedAttempts,
      newSuspensionLevel: currentSuspensionLevel,
      suspendedUntil: null,
      locked: false,
      lockDurationMinutes: 0,
    };
  }

  // Threshold reached (5 consecutive failed attempts): escalate suspension stage
  const nextSuspensionLevel = Math.min(
    currentSuspensionLevel + 1,
    SUSPENSION_STAGES_MINUTES.length,
  );
  const stageIndex = Math.max(0, nextSuspensionLevel - 1);
  const lockDurationMinutes = SUSPENSION_STAGES_MINUTES[stageIndex] ?? 1440;
  const suspendedUntil = new Date(now.getTime() + lockDurationMinutes * 60 * 1000);

  return {
    // Reset failed_attempts counter to 0 once a stage lockout is triggered so next stage requires 5 new failures,
    // or keep at 5 so any further attempt after lockout expiry or threshold is tracked cleanly.
    // Let's keep failed_attempts = nextFailedAttempts (>= 5) and escalate stage every 5 attempts or on threshold.
    newFailedAttempts: nextFailedAttempts,
    newSuspensionLevel: nextSuspensionLevel,
    suspendedUntil,
    locked: true,
    lockDurationMinutes,
  };
}
