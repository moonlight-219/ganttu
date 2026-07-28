import type { TimeScale, ViewMode } from "../types"
import { addDays, diffDays, startOfDay } from "../utils/date"

export function computeTimeScale(
  start: Date,
  end: Date,
  viewMode: ViewMode,
  columnWidth: number,
  firstDayOfWeek: 0 | 1
): TimeScale[] {
  const rangeStart = alignStart(start, viewMode, firstDayOfWeek)
  const endDate = startOfDay(end)
  const rangeEnd = viewMode === "day"
    ? addDays(endDate, (firstDayOfWeek + 6 - endDate.getDay() + 7) % 7)
    : endDate
  const scale: TimeScale[] = []
  let cursor = rangeStart
  let left = 0

  while (cursor.getTime() <= rangeEnd.getTime()) {
    const next = nextUnit(cursor, viewMode)
    const unitEnd = addDays(next, -1)
    const width = Math.max(1, diffDays(cursor, next)) * columnWidth

    scale.push({
      start: cursor,
      end: unitEnd,
      left,
      width
    })

    left += width
    cursor = next
  }

  return scale
}

function alignStart(date: Date, viewMode: ViewMode, firstDayOfWeek: 0 | 1): Date {
  const start = startOfDay(date)
  if (viewMode === "day" || viewMode === "week") {
    const delta = (start.getDay() - firstDayOfWeek + 7) % 7
    return addDays(start, -delta)
  }
  if (viewMode === "month") {
    return new Date(start.getFullYear(), start.getMonth(), 1)
  }
  if (viewMode === "quarter") {
    return new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1)
  }
  if (viewMode === "year") {
    return new Date(start.getFullYear(), 0, 1)
  }
  return start
}

function nextUnit(date: Date, viewMode: ViewMode): Date {
  if (viewMode === "week") {
    return addDays(date, 7)
  }
  if (viewMode === "month") {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1)
  }
  if (viewMode === "quarter") {
    return new Date(date.getFullYear(), date.getMonth() + 3, 1)
  }
  if (viewMode === "year") {
    return new Date(date.getFullYear() + 1, 0, 1)
  }
  return addDays(date, 1)
}
