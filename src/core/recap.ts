import type { RecapData, TimelineEntry } from './types'

export function computeRecap(
  entries: TimelineEntry[],
  blurredAt: number,
  now: number,
  minGapMs: number,
  statusKind: string,
): RecapData | undefined {
  if (now - blurredAt < minGapMs) return undefined
  const fresh = entries.filter((e) => e.ts >= blurredAt && e.completed)
  if (fresh.length === 0) return undefined
  return {
    minutes: Math.round((now - blurredAt) / 60_000),
    entries: fresh,
    stillWorking: statusKind === 'working',
  }
}
