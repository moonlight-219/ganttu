import type { Result } from "../types"

export const DAY_MS = 24 * 60 * 60 * 1000

export function toDate(value: string | Date): Date {
  if (value instanceof Date) {
    return startOfDay(value)
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }

  return startOfDay(new Date(value))
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: string | Date, days: number): Date {
  const next = toDate(date)
  next.setDate(next.getDate() + days)
  return startOfDay(next)
}

export function diffDays(start: string | Date, end: string | Date): number {
  return Math.round((toDate(end).getTime() - toDate(start).getTime()) / DAY_MS)
}

export function inclusiveDays(start: string | Date, end: string | Date): number {
  return Math.max(0, diffDays(start, end) + 1)
}

export function isValidDate(value: string | Date): boolean {
  const date = value instanceof Date ? value : new Date(value)
  return !Number.isNaN(date.getTime())
}

export function formatDate(date: string | Date): string {
  const value = toDate(date)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function resultInvalidDate<T>(message: string, details?: unknown): Result<T> {
  return {
    ok: false,
    error: { code: "INVALID_DATE", message, details }
  }
}
