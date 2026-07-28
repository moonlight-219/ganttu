import type { GanttLink } from "../types"

export function checkCyclicDependency(
  links: GanttLink[]
): { hasCycle: boolean; cyclePath?: string[] } {
  const graph = new Map<string, string[]>()

  for (const link of links) {
    const targets = graph.get(link.sourceId) ?? []
    targets.push(link.targetId)
    graph.set(link.sourceId, targets)
    if (!graph.has(link.targetId)) {
      graph.set(link.targetId, [])
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const path: string[] = []

  const dfs = (node: string): string[] | undefined => {
    if (visiting.has(node)) {
      const start = path.indexOf(node)
      return [...path.slice(start), node]
    }
    if (visited.has(node)) {
      return undefined
    }

    visiting.add(node)
    path.push(node)

    for (const next of graph.get(node) ?? []) {
      const cycle = dfs(next)
      if (cycle) {
        return cycle
      }
    }

    path.pop()
    visiting.delete(node)
    visited.add(node)
    return undefined
  }

  for (const node of graph.keys()) {
    const cyclePath = dfs(node)
    if (cyclePath) {
      return { hasCycle: true, cyclePath }
    }
  }

  return { hasCycle: false }
}
