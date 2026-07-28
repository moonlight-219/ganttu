import type { GanttTask } from "@gantt/core"
import { addDays, formatDate } from "@gantt/core"

export function createBasicTasks(): GanttTask[] {
  const phases = [
    { id: "p1", name: "需求与方案", start: "2026-07-01", days: 18, owner: "张晨" },
    { id: "p2", name: "核心引擎", start: "2026-07-18", days: 26, owner: "陈宇" },
    { id: "p3", name: "Vue 组件", start: "2026-08-12", days: 30, owner: "王蕾" },
    { id: "p4", name: "验收与压测", start: "2026-09-01", days: 18, owner: "赵峰" }
  ]
  const owners = ["张晨", "李然", "王蕾", "刘洋"]

  const tasks: GanttTask[] = []
  for (const phase of phases) {
    tasks.push(makeTask(phase.id, phase.name, "summary", phase.start, phase.days, undefined, undefined, 45, phase.owner))
    for (let index = 0; index < 5; index += 1) {
      const start = addDays(phase.start, index * 4)
      const end = addDays(start, 3 + (index % 3))
      tasks.push({
        id: `${phase.id}-${index + 1}`,
        name: `${phase.name} / 子任务 ${index + 1}`,
        type: "task",
        parentId: phase.id,
        plan: { start, end },
        actual: { start, end, progress: Math.min(100, 20 + index * 18) },
        resources: [owners[index % owners.length]],
        dependencies: []
      })
    }
  }

  return tasks
}

export function createLargeDataset(count: number): GanttTask[] {
  const tasks: GanttTask[] = []
  const rootCount = Math.ceil(count / 25)

  for (let group = 0; group < rootCount; group += 1) {
    const groupId = `group-${group + 1}`
    const groupStart = addDays("2026-07-01", group % 40)
    tasks.push(makeTask(groupId, `项目包 ${group + 1}`, "summary", formatDate(groupStart), 26, undefined, undefined, 35, `负责人 ${group % 12 + 1}`))

    for (let item = 0; item < 24 && tasks.length < count; item += 1) {
      const id = `${groupId}-task-${item + 1}`
      const start = addDays(groupStart, item % 18)
      const end = addDays(start, 2 + (item % 6))
      tasks.push({
        id,
        name: `任务 ${tasks.length}`,
        type: "task",
        parentId: groupId,
        plan: { start, end },
        actual: { start, end, progress: (item * 7) % 100 },
        resources: [`成员 ${item % 8 + 1}`],
        dependencies: []
      })
    }
  }

  return tasks.slice(0, count)
}

function makeTask(
  id: string,
  name: string,
  type: GanttTask["type"],
  start: string,
  days: number,
  parentId?: string,
  color?: string,
  progress = 0,
  owner?: string
): GanttTask {
  const end = addDays(start, Math.max(0, days - 1))
  return {
    id,
    name,
    type,
    parentId,
    plan: { start, end },
    actual: { start, end, progress },
    color,
    resources: owner ? [owner] : undefined
  }
}
