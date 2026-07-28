import type { AffectedTasks, GanttConfig, GanttLink, GanttTask, PatchTask, Result } from "../types"
import { flattenTasks } from "../services/flattenTasks"
import { scheduleByDependencies, shiftTask } from "./scheduling"
import { addDays, inclusiveDays, toDate } from "../utils/date"

export function computeImpact(
  taskId: string,
  patch: PatchTask,
  tasks: GanttTask[],
  links: GanttLink[],
  config: Partial<GanttConfig>
): Result<AffectedTasks> {
  const target = tasks.find((task) => task.id === taskId)
  if (!target) {
    return {
      ok: false,
      error: {
        code: "MISSING_TASK",
        message: `Task ${taskId} does not exist.`
      }
    }
  }

  const patchedTasks = tasks.map((task) => {
    if (task.id !== taskId) {
      return task
    }

    let next = { ...task, actual: { ...task.actual } }
    if (patch.actualStart) {
      next = shiftTask(next, patch.actualStart)
    }
    if (patch.actualEnd) {
      next.actual.end = patch.actualEnd
    }
    if (typeof patch.progress === "number") {
      next.actual.progress = patch.progress
    }
    if (patch.duration) {
      next.duration = patch.duration
      next.actual.end = addDays(toDate(next.actual.start), Math.max(0, patch.duration - 1))
    }
    if (patch.name) {
      next.name = patch.name
    }
    if (patch.type) {
      next.type = patch.type
    }
    if ("parentId" in patch) {
      next.parentId = patch.parentId
    }
    if (patch.color) {
      next.color = patch.color
    }
    if (patch.schedulingMode) {
      next.schedulingMode = patch.schedulingMode
    }
    return next
  })

  const scheduled = config.autoSchedule === false
    ? { ok: true as const, data: patchedTasks }
    : scheduleByDependencies(patchedTasks, links)

  if (!scheduled.ok) {
    return scheduled
  }

  const rows = new Map(flattenTasks(scheduled.data).map((flat) => [flat.task.id, flat.rowIndex]))
  const originalById = new Map(tasks.map((task) => [task.id, task]))
  const changed = scheduled.data
    .filter((task) => {
      const original = originalById.get(task.id)
      return original && (
        String(original.actual.start) !== String(task.actual.start) ||
        String(original.actual.end) !== String(task.actual.end)
      )
    })
    .map((task) => ({
      taskId: task.id,
      actualStart: task.actual.start,
      actualEnd: task.actual.end,
      rowIndex: rows.get(task.id) ?? 0
    }))

  const conflicts = scheduled.data
    .filter((task) => task.constraint?.date && inclusiveDays(task.actual.start, task.constraint.date) < 0)
    .map((task) => ({
      taskId: task.id,
      constraintType: task.constraint!.type,
      message: "Task violates its configured constraint date."
    }))

  return { ok: true, data: { changed, conflicts } }
}
