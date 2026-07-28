import type { GanttLink, GanttTask, LinkType, Result } from "../types"
import { addDays, diffDays, inclusiveDays, toDate } from "../utils/date"
import { checkCyclicDependency } from "../services/checkCyclicDependency"

export function scheduleByDependencies(tasks: GanttTask[], links: GanttLink[]): Result<GanttTask[]> {
  const cycle = checkCyclicDependency(links)
  if (cycle.hasCycle) {
    return {
      ok: false,
      error: {
        code: "CYCLE_DEPENDENCY",
        message: "Dependency graph contains a cycle.",
        details: cycle.cyclePath
      }
    }
  }

  const taskMap = new Map(tasks.map((task) => [task.id, cloneTask(task)]))
  const incoming = new Map<string, GanttLink[]>()
  const outgoing = new Map<string, GanttLink[]>()

  for (const link of links) {
    const source = taskMap.get(link.sourceId)
    const target = taskMap.get(link.targetId)
    if (!source || !target) {
      return {
        ok: false,
        error: {
          code: "ORPHAN_DEPENDENCY",
          message: `Dependency ${link.id} references a missing task.`
        }
      }
    }
    incoming.set(link.targetId, [...(incoming.get(link.targetId) ?? []), link])
    outgoing.set(link.sourceId, [...(outgoing.get(link.sourceId) ?? []), link])
  }

  const ordered = topologicalOrder(tasks.map((task) => task.id), links)

  for (const taskId of ordered) {
    const task = taskMap.get(taskId)
    if (!task || task.schedulingMode === "manual") {
      continue
    }

    const linksToTask = incoming.get(taskId) ?? []
    let start = toDate(task.actual.start)
    let end = toDate(task.actual.end)
    const duration = Math.max(0, task.duration ?? inclusiveDays(start, end))

    for (const link of linksToTask) {
      const source = taskMap.get(link.sourceId)
      if (!source) {
        continue
      }

      const candidate = applyDependency(source, start, end, duration, link.type, link.lag ?? 0)
      if (candidate.start.getTime() > start.getTime()) {
        start = candidate.start
      }
      if (candidate.end.getTime() > end.getTime()) {
        end = candidate.end
      }
    }

    const normalizedEnd = task.type === "milestone" ? start : addDays(start, Math.max(0, duration - 1))
    task.actual = {
      ...task.actual,
      start,
      end: normalizedEnd
    }
  }

  return { ok: true, data: tasks.map((task) => taskMap.get(task.id) ?? task) }
}

function applyDependency(
  source: GanttTask,
  currentStart: Date,
  currentEnd: Date,
  duration: number,
  type: LinkType,
  lag: number
): { start: Date; end: Date } {
  const sourceStart = toDate(source.actual.start)
  const sourceEnd = toDate(source.actual.end)
  const span = Math.max(0, duration - 1)

  if (type === "FS") {
    const start = addDays(sourceEnd, lag + 1)
    return { start, end: addDays(start, span) }
  }

  if (type === "SS") {
    const start = addDays(sourceStart, lag)
    return { start, end: addDays(start, span) }
  }

  if (type === "FF") {
    const end = addDays(sourceEnd, lag)
    return { start: addDays(end, -span), end }
  }

  const end = addDays(sourceStart, lag)
  return { start: addDays(end, -span), end: end.getTime() > currentEnd.getTime() ? end : currentEnd }
}

function topologicalOrder(ids: string[], links: GanttLink[]): string[] {
  const indegree = new Map(ids.map((id) => [id, 0]))
  const outgoing = new Map<string, string[]>()

  for (const link of links) {
    indegree.set(link.targetId, (indegree.get(link.targetId) ?? 0) + 1)
    outgoing.set(link.sourceId, [...(outgoing.get(link.sourceId) ?? []), link.targetId])
  }

  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0)
  const ordered: string[] = []

  while (queue.length) {
    const current = queue.shift()!
    ordered.push(current)
    for (const target of outgoing.get(current) ?? []) {
      indegree.set(target, (indegree.get(target) ?? 1) - 1)
      if (indegree.get(target) === 0) {
        queue.push(target)
      }
    }
  }

  return ordered.length === ids.length ? ordered : ids
}

function cloneTask(task: GanttTask): GanttTask {
  return {
    ...task,
    plan: { ...task.plan },
    actual: { ...task.actual },
    dependencies: task.dependencies?.map((dependency) => ({ ...dependency }))
  }
}

export function shiftTask(task: GanttTask, start: string | Date): GanttTask {
  const currentStart = toDate(task.actual.start)
  const nextStart = toDate(start)
  const delta = diffDays(currentStart, nextStart)
  return {
    ...task,
    actual: {
      ...task.actual,
      start: nextStart,
      end: addDays(toDate(task.actual.end), delta)
    }
  }
}
