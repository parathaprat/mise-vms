import type { ISODate, OnboardingItem, Worker } from "@/lib/types"

export type SafetyState = "ready" | "pending" | "expired"

export function backgroundCheck(worker: Worker): OnboardingItem | undefined {
  return worker.onboarding.find((item) => item.key === "background")
}

export function backgroundCheckState(worker: Worker, onDate: ISODate): SafetyState {
  const check = backgroundCheck(worker)
  if (!check || check.status !== "Complete") return "pending"
  if (check.expiresAt && check.expiresAt < onDate) return "expired"
  return "ready"
}

export function workerSafetyReady(worker: Worker, onDate: ISODate): boolean {
  if (worker.status !== "Active") return false
  if (backgroundCheckState(worker, onDate) !== "ready") return false
  return worker.onboarding.every(
    (item) =>
      item.status === "Complete" &&
      (!item.expiresAt || item.expiresAt >= onDate)
  )
}
