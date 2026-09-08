import type { ProgressionProfileV1 } from '@progression/model'

export function memoryStorage(seed: Record<string, string> = {}): Storage & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed))
  return {
    map,
    get length() { return map.size },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  }
}

export function refusingStorage(name = 'QuotaExceededError'): Storage {
  const boom = () => {
    const error = new Error('denied')
    error.name = name
    throw error
  }
  return { length: 0, clear: boom, getItem: boom, key: boom, removeItem: boom, setItem: boom } as unknown as Storage
}

export function profile(overrides: Partial<ProgressionProfileV1> = {}): ProgressionProfileV1 {
  return {
    version: 1,
    sparks: 0,
    ownedUpgradeIds: [],
    equipped: {},
    nextOfferNonce: 0,
    recentClaimIds: [],
    ...overrides,
  }
}
