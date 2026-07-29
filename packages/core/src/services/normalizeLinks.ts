import type { GanttLink, GanttTask } from "../types"

export function normalizeLinks(tasks: GanttTask[], standaloneLinks: GanttLink[] = []): GanttLink[] {
  const taskIds = new Set(tasks.map((task) => task.id))
  const byTaskPair = new Map<string, GanttLink>()
  const outgoing = new Map<string, Set<string>>()

  const createsCycle = (sourceId: string, targetId: string): boolean => {
    const pending = [targetId]
    const visited = new Set<string>()
    while (pending.length > 0) {
      const current = pending.pop()!
      if (current === sourceId) {
        return true
      }
      if (visited.has(current)) {
        continue
      }
      visited.add(current)
      pending.push(...(outgoing.get(current) ?? []))
    }
    return false
  }

  const append = (link: GanttLink) => {
    if (
      !taskIds.has(link.sourceId)
      || !taskIds.has(link.targetId)
      || link.sourceId === link.targetId
    ) {
      return
    }

    const normalized: GanttLink = {
      ...link,
      id: link.id || `link-${link.sourceId}-${link.targetId}`,
      lag: link.lag ?? 0,
      lagUnit: link.lagUnit ?? "calendar"
    }
    const pairKey = `${normalized.sourceId}|${normalized.targetId}`
    if (byTaskPair.has(pairKey) || createsCycle(normalized.sourceId, normalized.targetId)) {
      return
    }

    byTaskPair.set(pairKey, normalized)
    const targets = outgoing.get(normalized.sourceId) ?? new Set<string>()
    targets.add(normalized.targetId)
    outgoing.set(normalized.sourceId, targets)
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

  return [...byTaskPair.values()]
}
