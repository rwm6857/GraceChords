import plan from './data/mcheyne.plan.json'
import type { PlanEntry } from './types'

const PLAN = plan as PlanEntry[]
const planByMmdd = new Map<string, { entry: PlanEntry, index: number }>(
  PLAN.map((p, i) => [p.mmdd, { entry: p, index: i }])
)

export function mmddFromDate(date: Date){
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${mm}${dd}`
}

export function addDays(date: Date, delta: number){
  const next = new Date(date)
  next.setDate(next.getDate() + delta)
  return next
}

function dayOfYear(date: Date){
  const start = new Date(date.getFullYear(), 0, 1)
  const diff = date.getTime() - start.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export function getPlanForDate(date: Date){
  const mmdd = mmddFromDate(date)
  const direct = planByMmdd.get(mmdd)
  if (direct){
    return {
      mmdd,
      readings: direct.entry.readings,
      index: direct.index,
    }
  }

  // Fallback for dates not in MMDD table (e.g., leap day)
  const idx = dayOfYear(date) % PLAN.length
  const entry = PLAN[idx]
  return {
    mmdd: entry.mmdd,
    readings: entry.readings,
    index: idx,
  }
}
