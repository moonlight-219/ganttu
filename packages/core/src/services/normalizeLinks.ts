import type { GanttLink, GanttTask } from "../types"
import { checkCyclicDependency } from "./checkCyclicDependency"

export function normalizeLinks(tasks: GanttTask[], standaloneLinks: GanttLink[] = []): GanttLink[] {
  const taskIds = new Set(tasks.map((task) => task.id))
  const byKey = new Map<string, GanttLink>()

  const append = (link: GanttLink) => {
    if (!taskIds.has(link.sourceId) || !taskIds.has(link.targetId)) {
      return
    }

    const normalized: GanttLink = {
      ...link,
      id: link.id || `link-${link.sourceId}-${link.targetId}`,
      lag: link.lag ?? 0,
      lagUnit: link.lagUnit ?? "calendar"
    }
    const key = `${normalized.sourceId}|${normalized.targetId}|${normalized.type}|${normalized.lag}|${normalized.lagUnit}`
    byKey.set(key, normalized)
  }

  for (const task of tasks) {
    for (const dependency of task.dependencies ?? []) {
      append({
        id: dependency.id || `link-${dependency.predecessorId}-${task.id}`,
        sourceId: dependency.predecessorId,
        targetId: task.id,
        type: dependency.type,
        lag: dependency.lag,
        lagUnit: dependency.lagUnit
      })
    }
  }

  for (const link of standaloneLinks) {
    append(link)
  }

  const links = [...byKey.values()]
  const cycle = checkCyclicDependency(links)
  return cycle.hasCycle ? [] : links
}
