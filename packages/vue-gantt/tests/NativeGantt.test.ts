import { nextTick } from "vue"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { GanttTask } from "ct-gantt-core"
import { createGantt } from "../src"

const tasks: GanttTask[] = [
  {
    id: "task-1",
    name: "Initial task",
    type: "task",
    plan: { start: "2026-08-03", end: "2026-08-07" },
    actual: { start: "2026-08-03", end: "2026-08-07", progress: 30 }
  }
]

afterEach(() => {
  document.body.replaceChildren()
})

describe("createGantt", () => {
  it("mounts into an element and updates data through the instance API", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    const gantt = createGantt(container, { tasks, height: 500 })

    await nextTick()
    expect(container.querySelector(".gantt-chart")).not.toBeNull()
    expect(container.textContent).toContain("Initial task")

    gantt.setTask("task-1", { name: "Updated task", progress: 75 })
    gantt.addTask({
      id: "task-2",
      name: "Second task",
      type: "task",
      plan: { start: "2026-08-08", end: "2026-08-10" },
      actual: { start: "2026-08-08", end: "2026-08-10", progress: 0 }
    })
    await nextTick()

    expect(gantt.getTasks()).toHaveLength(2)
    expect(gantt.getTasks()[0]?.actual.progress).toBe(75)
    expect(container.textContent).toContain("Updated task")
    expect(container.textContent).toContain("Second task")

    gantt.destroy()
    expect(gantt.isDestroyed()).toBe(true)
    expect(container.querySelector(".gantt-chart")).toBeNull()
  })

  it("supports selectors and rejects duplicate mounts", () => {
    const container = document.createElement("div")
    container.id = "native-gantt"
    document.body.append(container)
    const gantt = createGantt("#native-gantt", { tasks })

    expect(() => createGantt(container, { tasks })).toThrow(/already mounted/)
    gantt.destroy()
    expect(() => createGantt("#missing", { tasks })).toThrow(/not found/)
  })

  it("keeps imperative zoom configuration in sync", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    const gantt = createGantt(container, { tasks })
    await nextTick()

    const engine = gantt.getEngine()
    expect(engine).not.toBeNull()
    const zoom = vi.spyOn(engine!, "zoomToFit")
    Object.defineProperty(container.querySelector(".gantt-timeline"), "clientWidth", {
      configurable: true,
      value: 600
    })
    gantt.zoomToFit()

    expect(zoom).toHaveBeenCalledOnce()
    expect(gantt.getConfig().columnWidth).toBe(engine!.getConfig().columnWidth)
    gantt.destroy()
  })
})
