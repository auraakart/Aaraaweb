export type ServiceRequest = (path: string, init?: RequestInit) => Promise<unknown>
export type QualityItem = { id: string; label: string; required: boolean }
export type QualityTemplate = { offeringId: string; version: number; items: QualityItem[] }
export const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid service response')
  return value as Record<string, unknown>
}
export function qualityItems(value: unknown): QualityItem[] {
  if (!Array.isArray(value) || value.length > 20) throw Error('At most 20 checklist steps are allowed')
  const seen = new Set<string>()
  return value.map(raw => {
    const item = record(raw)
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    const label = typeof item.label === 'string' ? item.label.trim() : ''
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(id) || label.length < 2 || label.length > 120 ||
        typeof item.required !== 'boolean' || seen.has(id)) throw Error('Use unique step keys, labels of 2–120 characters and an explicit required setting')
    seen.add(id)
    return { id, label, required: item.required }
  })
}
export function qualityTemplate(value: unknown, offeringId: string): QualityTemplate {
  const data = record(value)
  if (data.offeringId !== offeringId || !Number.isSafeInteger(data.version) ||
      Number(data.version) < 0 || Number(data.version) > 2147483647) throw Error('Checklist identity or version mismatch')
  return { offeringId, version: Number(data.version), items: qualityItems(data.items) }
}
export function qualitySummary(value: unknown) {
  const data = record(value)
  if (data.periodDays !== 90 || data.reviewOnly !== true || data.qualityScore !== null ||
      data.publicRankingEnabled !== false || data.automaticPenaltyEnabled !== false) throw Error('Quality summary is unavailable')
  for (const key of ['completedBookings', 'completedWithChecklist', 'reworkRequests', 'openReworkRequests']) {
    if (!Number.isSafeInteger(data[key]) || Number(data[key]) < 0) throw Error('Invalid quality activity')
  }
  if (Number(data.completedWithChecklist) > Number(data.completedBookings) ||
      Number(data.openReworkRequests) > Number(data.reworkRequests)) throw Error('Inconsistent quality activity')
  return data
}
