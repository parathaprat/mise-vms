export interface Rng {
  next: () => number
  int: (min: number, max: number) => number
  float: (min: number, max: number) => number
  chance: (p: number) => boolean
  pick: <T>(items: readonly T[]) => T
  weighted: <T>(items: readonly (readonly [T, number])[]) => T
  shuffle: <T>(items: readonly T[]) => T[]
  sample: <T>(items: readonly T[], n: number) => T[]
}

export function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function createRng(seed: number | string): Rng {
  let state = typeof seed === "string" ? hashString(seed) : seed >>> 0

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (min: number, max: number) =>
    Math.floor(next() * (max - min + 1)) + min

  const float = (min: number, max: number) => next() * (max - min) + min

  const chance = (p: number) => next() < p

  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(next() * items.length)]

  const weighted = <T>(items: readonly (readonly [T, number])[]): T => {
    const total = items.reduce((sum, [, w]) => sum + w, 0)
    let roll = next() * total
    for (const [item, weight] of items) {
      roll -= weight
      if (roll <= 0) return item
    }
    return items[items.length - 1][0]
  }

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }

  const sample = <T>(items: readonly T[], n: number): T[] =>
    shuffle(items).slice(0, Math.max(0, n))

  return { next, int, float, chance, pick, weighted, shuffle, sample }
}

/** Stable pseudo-random value in [0, 1) derived from a string key. */
export function stableUnit(key: string): number {
  return hashString(key) / 4294967296
}
