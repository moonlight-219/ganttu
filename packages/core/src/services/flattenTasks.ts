import type { FlatTask, GanttTask } from "../types"

export function flattenTasks(tasks: GanttTask[], collapsedIds: Set<string> = new Set()): FlatTask[] {
  const children = new Map<string | null, GanttTask[]>()

  for (const task of tasks) {
    const parentId = task.parentId ?? null
    const bucket = children.get(parentId) ?? []
    bucket.push(task)
    children.set(parentId, bucket)
  }

  const flattened: FlatTask[] = []
  const visit = (task: GanttTask, depth: number) => {
    const childTasks = children.get(task.id) ?? []
    const collapsed = collapsedIds.has(task.id)

    flattened.push({
      task,
      depth,
      rowIndex: flattened.length,
      hasChildren: childTasks.length > 0,
      collapsed
    })

    if (!collapsed) {
      for (const child of childTasks) {
        visit(child, depth + 1)
      }
    }
  }

  for (const root of children.get(null) ?? []) {
    visit(root, 0)
  }

  return flattened
}
