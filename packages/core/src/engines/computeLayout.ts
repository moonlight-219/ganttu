import type { GanttConfig, GanttLink, GanttTask, Result, TaskLayout, Viewport } from "../types"
import { defaultConfig } from "../types"
import { flattenTasks } from "../services/flattenTasks"
import { normalizeLinks } from "../services/normalizeLinks"
import { scheduleByDependencies } from "./scheduling"
import { diffDays, inclusiveDays, isValidDate, toDate } from "../utils/date"

export function computeLayout(
  tasks: GanttTask[],
  links: GanttLink[],
  config: Partial<GanttConfig>,
  collapsedIds: Set<string> = new Set(),
  viewport?: Viewport
): Result<TaskLayout[]> {
  const mergedConfig = { ...defaultConfig, ...config }

  for (const task of tasks) {
    if (!isValidDate(task.actual.start) || !isValidDate(task.actual.end)) {
      return {
        ok: false,
        error: {
          code: "INVALID_DATE",
          message: `Task ${task.id} has invalid actual dates.`
        }
      }
    }
  }

  const normalizedLinks = normalizeLinks(tasks, links)
  const scheduled = mergedConfig.autoSchedule === false
    ? { ok: true as const, data: tasks }
    : scheduleByDependencies(tasks, normalizedLinks)

  if (!scheduled.ok) {
    return scheduled
  }

  const flatTasks = flattenTasks(scheduled.data, collapsedIds)
  const firstDate = mergedConfig.visibleRange
    ? toDate(mergedConfig.visibleRange.start)
    : minDate(scheduled.data.map((task) => toDate(task.actual.start)))

  const visibleStart = viewport
    ? Math.max(0, Math.floor(viewport.scrollTop / mergedConfig.rowHeight) - 8)
    : 0
  const visibleEnd = viewport
    ? Math.ceil((viewport.scrollTop + viewport.clientHeight) / mergedConfig.rowHeight) + 8
    : Number.POSITIVE_INFINITY

  const layouts = flatTasks
    .filter((flat) => flat.rowIndex >= visibleStart && flat.rowIndex <= visibleEnd)
    .map<TaskLayout>((flat) => {
      const start = toDate(flat.task.actual.start)
      const end = toDate(flat.task.actual.end)
      const duration = flat.task.type === "milestone" ? 0 : inclusiveDays(start, end)

      return {
        taskId: flat.task.id,
        rowIndex: flat.rowIndex,
        left: diffDays(firstDate, start) * mergedConfig.columnWidth,
        width: Math.max(flat.task.type === "milestone" ? mergedConfig.columnWidth / 2 : mergedConfig.columnWidth, duration * mergedConfig.columnWidth),
        top: mergedConfig.headerHeight + flat.rowIndex * mergedConfig.rowHeight,
        depth: flat.depth,
        isCritical: false
      }
    })

  return { ok: true, data: layouts }
}

function minDate(dates: Date[]): Date {
  return new Date(Math.min(...dates.map((date) => date.getTime())))
}
