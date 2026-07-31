import { describe, expect, it } from "vitest"
import {
  checkCyclicDependency,
  computeImpact,
  computeLayout,
  computeTimeScale,
  flattenTasks,
  formatDate,
  normalizeLinks,
  scheduleByDependencies,
  type GanttConfig,
  type GanttTask
} from "../src"

const baseConfig: Partial<GanttConfig> = {
  viewMode: "day",
  rowHeight: 36,
  columnWidth: 40,
  headerHeight: 50,
  taskListWidth: 280,
  firstDayOfWeek: 1
}

const tasks: GanttTask[] = [
  {
    id: "1",
    name: "Design",
    type: "task",
    plan: { start: "2026-07-01", end: "2026-07-05", progress: 100 },
    actual: { start: "2026-07-01", end: "2026-07-05", progress: 100 }
  },
  {
    id: "2",
    name: "Build",
    type: "task",
    plan: { start: "2026-07-06", end: "2026-07-12", progress: 50 },
    actual: { start: "2026-07-06", end: "2026-07-12", progress: 50 },
    dependencies: [{ predecessorId: "1", type: "FS", lag: 0, lagUnit: "calendar" }]
  },
  {
    id: "3",
    name: "Test",
    type: "task",
    plan: { start: "2026-07-13", end: "2026-07-15", progress: 0 },
    actual: { start: "2026-07-13", end: "2026-07-15", progress: 0 },
    dependencies: [{ predecessorId: "2", type: "FS", lag: 0, lagUnit: "calendar" }]
  }
]

describe("ct-gantt-core", () => {
  it("normalizes embedded dependencies and removes duplicates", () => {
    const links = normalizeLinks(tasks, [
      { id: "manual-duplicate", sourceId: "1", targetId: "2", type: "SS", lag: 2, lagUnit: "working" }
    ])

    expect(links).toHaveLength(2)
    expect(links[0]).toMatchObject({
      sourceId: "1",
      targetId: "2",
      type: "FS",
      lag: 0,
      lagUnit: "calendar"
    })
  })

  it("keeps existing dependencies when a later link would create a cycle", () => {
    const links = normalizeLinks(tasks.map((task) => ({ ...task, dependencies: [] })), [
      { id: "a", sourceId: "1", targetId: "2", type: "FS" },
      { id: "b", sourceId: "2", targetId: "3", type: "FS" },
      { id: "cycle", sourceId: "3", targetId: "1", type: "FS" }
    ])

    expect(links.map((link) => link.id)).toEqual(["a", "b"])
  })

  it("detects cycles", () => {
    const result = checkCyclicDependency([
      { id: "a", sourceId: "1", targetId: "2", type: "FS" },
      { id: "b", sourceId: "2", targetId: "1", type: "FS" }
    ])

    expect(result.hasCycle).toBe(true)
    expect(result.cyclePath).toContain("1")
  })

  it("flattens task trees with collapsed summaries", () => {
    const tree: GanttTask[] = [
      { ...tasks[0], id: "root", type: "summary" },
      { ...tasks[1], id: "child", parentId: "root", dependencies: [] }
    ]

    expect(flattenTasks(tree)).toHaveLength(2)
    expect(flattenTasks(tree, new Set(["root"]))).toHaveLength(1)
  })

  it("computes a day scale and Appendix A layout", () => {
    const scale = computeTimeScale(new Date(2026, 6, 1), new Date(2026, 6, 15), "day", 40, 1)
    expect(scale).toHaveLength(21)
    expect(formatDate(scale[0].start)).toBe("2026-06-29")
    expect(formatDate(scale[20].end)).toBe("2026-07-19")

    const layout = computeLayout(tasks, [], baseConfig)
    expect(layout.ok).toBe(true)
    if (layout.ok) {
      expect(layout.data).toEqual([
        { taskId: "1", rowIndex: 0, left: 0, width: 200, top: 50, depth: 0, isCritical: false },
        { taskId: "2", rowIndex: 1, left: 200, width: 280, top: 86, depth: 0, isCritical: false },
        { taskId: "3", rowIndex: 2, left: 480, width: 120, top: 122, depth: 0, isCritical: false }
      ])
    }
  })

  it("supports FS, SS, FF, and SF scheduling", () => {
    const scheduled = scheduleByDependencies(
      [
        { ...tasks[0], id: "a", actual: { start: "2026-07-01", end: "2026-07-05", progress: 0 } },
        { ...tasks[1], id: "b", actual: { start: "2026-07-01", end: "2026-07-03", progress: 0 }, dependencies: [] }
      ],
      [{ id: "ss", sourceId: "a", targetId: "b", type: "SS", lag: 2, lagUnit: "calendar" }]
    )

    expect(scheduled.ok).toBe(true)
    if (scheduled.ok) {
      expect(scheduled.data.find((task) => task.id === "b")?.actual.start).toEqual(new Date(2026, 6, 3))
    }
  })

  it("computes downstream impact after dragging a task", () => {
    const links = normalizeLinks(tasks)
    const impact = computeImpact("1", { actualStart: "2026-07-03" }, tasks, links, baseConfig)

    expect(impact.ok).toBe(true)
    if (impact.ok) {
      expect(impact.data.changed.map((item) => item.taskId)).toEqual(["1", "2", "3"])
    }
  })
})
