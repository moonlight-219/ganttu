import { mount } from "@vue/test-utils"
import { nextTick } from "vue"
import { describe, expect, it, vi } from "vitest"
import type { GanttMarker, GanttTask, PatchTask } from "@gantt/core"
import GanttChart from "../src/components/GanttChart.vue"
import { buildOrthogonalLinkPath, drawLinks } from "../src/rendering/canvas/links"

const tasks: GanttTask[] = [
  {
    id: "summary",
    name: "Summary",
    type: "summary",
    plan: { start: "2026-07-01", end: "2026-07-20" },
    actual: { start: "2026-07-01", end: "2026-07-20", progress: 40 }
  },
  {
    id: "task-1",
    name: "Child task",
    type: "task",
    parentId: "summary",
    plan: { start: "2026-07-01", end: "2026-07-09" },
    actual: { start: "2026-07-02", end: "2026-07-09", progress: 50 }
  }
]

const markers: GanttMarker[] = [
  { id: "m1", name: "Acceptance", date: "2026-07-20", color: "#dc2626" }
]
const linkableTasks: GanttTask[] = [
  {
    id: "source",
    name: "Source",
    type: "task",
    plan: { start: "2026-07-01", end: "2026-07-05" },
    actual: { start: "2026-07-01", end: "2026-07-05", progress: 50 }
  },
  {
    id: "target",
    name: "Target",
    type: "task",
    plan: { start: "2026-07-08", end: "2026-07-10" },
    actual: { start: "2026-07-08", end: "2026-07-10", progress: 20 }
  }
]

function dateKey(value: string | Date | undefined) {
  if (!value) {
    return ""
  }
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

describe("GanttChart", () => {
  it("draws dependency links relative to the timeline body, not the header", () => {
    const calls: Array<[string, ...number[]]> = []
    const context = {
      canvas: { width: 300, height: 200 },
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(() => calls.push(["beginPath"])),
      moveTo: vi.fn((x: number, y: number) => calls.push(["moveTo", x, y])),
      lineTo: vi.fn((x: number, y: number) => calls.push(["lineTo", x, y])),
      stroke: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 0
    } as unknown as CanvasRenderingContext2D

    drawLinks(
      context,
      [{ id: "l1", sourceId: "a", targetId: "b", type: "FS" }],
      [
        { taskId: "a", rowIndex: 0, left: 20, width: 80, top: 50, depth: 0, isCritical: false },
        { taskId: "b", rowIndex: 1, left: 160, width: 80, top: 90, depth: 0, isCritical: false }
      ],
      40,
      50,
      22,
      11,
      0,
      0
    )

    expect(calls).toContainEqual(["moveTo", 100, 27.5])
    expect(calls).toContainEqual(["lineTo", 160, 67.5])
  })

  it("routes dependency paths with only horizontal and vertical segments", () => {
    const path = buildOrthogonalLinkPath(
      { x: 100, y: 24 },
      { x: 40, y: 96 },
      "finish",
      "start"
    )

    expect(path).toHaveLength(6)
    for (let index = 1; index < path.length; index += 1) {
      expect(path[index].x === path[index - 1].x || path[index].y === path[index - 1].y).toBe(true)
    }
  })

  it("renders table data, marker nodes, and text-free task bars", () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        markers,
        config: { viewMode: "day", columnWidth: 30 }
      }
    })

    expect(wrapper.findAll(".gantt-table-head span").length).toBeGreaterThan(0)
    expect(wrapper.findAll(".gantt-status").length).toBeGreaterThan(0)
    expect(wrapper.findAll(".gantt-owner-cell").length).toBeGreaterThan(0)
    expect(wrapper.findAll(".gantt-progress-cell").length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain("Child task")
    expect(wrapper.find(".gantt-progress-cell").exists()).toBe(true)
    expect(wrapper.find(".gantt-status").text().length).toBeGreaterThan(0)
    expect(wrapper.find(".gantt-owner-cell").attributes("title")?.length).toBeGreaterThan(0)
    expect(wrapper.find(".gantt-marker").exists()).toBe(true)
    expect(wrapper.find(".gantt-marker").attributes("aria-label")).toContain("2026-07-20")
    expect(wrapper.find(".gantt-marker [role='tooltip']").text()).toContain("Acceptance")
    expect(wrapper.find(".gantt-bar.milestone").exists()).toBe(false)
    expect(wrapper.find(".gantt-bar.task").text()).toBe("")
    expect(wrapper.findAll(".gantt-plan-bar")).toHaveLength(tasks.length)
    expect(wrapper.findAll(".gantt-plan-progress")).toHaveLength(tasks.length)
    expect(wrapper.find(".gantt-bar.task .gantt-progress").exists()).toBe(false)
    expect(wrapper.find(".gantt-bar.summary .gantt-resize").exists()).toBe(false)
    expect(wrapper.find(".gantt-bar.summary .gantt-link-handle").exists()).toBe(false)
    expect(wrapper.find(".gantt-plan-bar.task").attributes("title")).toBeUndefined()
    expect(wrapper.find(".gantt-bar.task").attributes("title")).toBeUndefined()
    expect(wrapper.find(".gantt-legend").text().length).toBeGreaterThan(0)
    expect(wrapper.findAll(".gantt-legend span").length).toBeGreaterThan(0)
    expect(wrapper.find(".gantt-actions .primary").text().length).toBeGreaterThan(0)
    expect(wrapper.find(".gantt-table-scroll > .gantt-table-head").exists()).toBe(true)
    expect(wrapper.find(".gantt-table-head").attributes("style")).not.toContain("transform")
    expect(wrapper.findAll(".gantt-row")[0].classes()).toContain("summary-row")
    expect(wrapper.findAll(".gantt-name")[1].classes()).toContain("child")
    expect(wrapper.find(".gantt-scale-options").text().length).toBeGreaterThan(0)
    expect(wrapper.findAll(".gantt-scale-options input")).toHaveLength(4)
    expect(wrapper.find(".gantt-month").text()).toBe("2026-06-28")
    expect(wrapper.find(".gantt-tick").text()).toBe("28")
  })

  it("keeps the grid canvas aligned with the scrolled timeline viewport", async () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        config: { viewMode: "day", columnWidth: 30 }
      }
    })
    const timeline = wrapper.find(".gantt-timeline").element as HTMLElement

    timeline.scrollLeft = 240
    timeline.scrollTop = 120
    await wrapper.find(".gantt-timeline").trigger("scroll")
    await nextTick()

    expect(wrapper.find(".gantt-canvas").attributes("style")).toContain("transform: translate(240px, 120px)")
  })

  it("moves the task bar during drag preview instead of waiting for pointerup", async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrame = vi.spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined)
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        markers,
        config: {
          viewMode: "day",
          columnWidth: 30,
          visibleRange: { start: "2026-07-01", end: "2026-07-31" }
        }
      }
    })

    const taskBar = wrapper.find(".gantt-bar.task")
    const planBarStyle = wrapper.find(".gantt-plan-bar.task").attributes("style")
    expect(taskBar.attributes("style")).toContain("translate(120px")

    await taskBar.trigger("pointerdown", { clientX: 100, pointerId: 1 })
    await taskBar.trigger("pointermove", { clientX: 114, pointerId: 1 })
    expect(rafCallbacks).toHaveLength(0)
    rafCallbacks.shift()?.(0)
    await nextTick()
    expect(wrapper.find(".gantt-bar.task").attributes("style")).toContain("translate(120px")
    expect(wrapper.find(".gantt-plan-bar.task").attributes("style")).toBe(planBarStyle)
    expect(wrapper.find(".gantt-drag-preview").exists()).toBe(false)

    await taskBar.trigger("pointermove", { clientX: 160, pointerId: 1 })
    rafCallbacks.shift()?.(16)
    await nextTick()

    expect(wrapper.find(".gantt-bar.task").attributes("style")).toContain("translate(180px")
    expect(wrapper.find(".gantt-plan-bar.task").attributes("style")).toBe(planBarStyle)

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it("keeps summary bars read-only because they are rolled up from child tasks", async () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        markers,
        config: {
          viewMode: "day",
          editablePlan: true,
          visibleRange: { start: "2026-07-01", end: "2026-07-31" }
        }
      }
    })

    await wrapper.find(".gantt-bar.summary").trigger("pointerdown", { clientX: 100, pointerId: 1 })
    await wrapper.find(".gantt-bar.summary").trigger("pointerup", { clientX: 160, pointerId: 1 })
    await wrapper.find(".gantt-plan-bar.summary").trigger("pointerdown", { clientX: 100, pointerId: 1 })
    await wrapper.find(".gantt-plan-bar.summary").trigger("pointerup", { clientX: 160, pointerId: 1 })

    expect(wrapper.emitted("taskChange")).toBeUndefined()
    expect(wrapper.find(".gantt-plan-bar.summary .gantt-plan-resize").exists()).toBe(false)
  })

  it("extends the actual bar when dragging the start handle left", async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrame = vi.spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined)
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        markers,
        config: {
          viewMode: "day",
          columnWidth: 30,
          visibleRange: { start: "2026-07-01", end: "2026-07-31" }
        }
      }
    })

    const handle = wrapper.find(".gantt-bar.task .gantt-resize.start")
    await handle.trigger("pointerdown", { clientX: 120, pointerId: 1 })
    await handle.trigger("pointermove", { clientX: 90, pointerId: 1 })
    rafCallbacks.shift()?.(0)
    await nextTick()

    expect(wrapper.find(".gantt-bar.task").attributes("style")).toContain("translate(90px")
    expect(wrapper.find(".gantt-bar.task").attributes("style")).toContain("width: 270px")

    await handle.trigger("pointerup", { clientX: 90, pointerId: 1 })
    const patch = wrapper.emitted("taskChange")?.[0]?.[1] as PatchTask | undefined
    expect(dateKey(patch?.actualStart)).toBe("2026-07-01")
    expect(dateKey(patch?.actualEnd)).toBe("2026-07-09")

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it("extends the plan bar when dragging the start handle left", async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrame = vi.spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined)
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        markers,
        config: {
          viewMode: "day",
          columnWidth: 30,
          editablePlan: true,
          visibleRange: { start: "2026-07-01", end: "2026-07-31" }
        }
      }
    })

    const handle = wrapper.find(".gantt-plan-bar.task .gantt-plan-resize.start")
    await handle.trigger("pointerdown", { clientX: 90, pointerId: 1 })
    await handle.trigger("pointermove", { clientX: 60, pointerId: 1 })
    rafCallbacks.shift()?.(0)
    await nextTick()

    expect(wrapper.find(".gantt-plan-bar.task").attributes("style")).toContain("translate(60px")
    expect(wrapper.find(".gantt-plan-bar.task").attributes("style")).toContain("width: 300px")

    await handle.trigger("pointerup", { clientX: 60, pointerId: 1 })
    const patch = wrapper.emitted("taskChange")?.[0]?.[1] as PatchTask | undefined
    expect(dateKey(patch?.planStart)).toBe("2026-06-30")
    expect(dateKey(patch?.planEnd)).toBe("2026-07-09")

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it("keeps constrained successor drags at the allowed dependency boundary", async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrame = vi.spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined)
    const linkedTasks: GanttTask[] = [
      {
        id: "source",
        name: "Source",
        type: "task",
        plan: { start: "2026-07-05", end: "2026-07-07" },
        actual: { start: "2026-07-05", end: "2026-07-07", progress: 40 }
      },
      {
        id: "target",
        name: "Target",
        type: "task",
        plan: { start: "2026-07-07", end: "2026-07-09" },
        actual: { start: "2026-07-07", end: "2026-07-09", progress: 20 }
      }
    ]
    const wrapper = mount(GanttChart, {
      props: {
        tasks: linkedTasks,
        links: [{ id: "l1", sourceId: "source", targetId: "target", type: "SS" }],
        config: {
          viewMode: "day",
          columnWidth: 30,
          visibleRange: { start: "2026-07-01", end: "2026-07-31" }
        }
      }
    })

    const targetBar = wrapper.findAll(".gantt-bar.task")[1]
    await targetBar.trigger("pointerdown", { clientX: 200, pointerId: 1 })
    await targetBar.trigger("pointermove", { clientX: 80, pointerId: 1 })
    rafCallbacks.shift()?.(0)
    await nextTick()

    expect(wrapper.findAll(".gantt-bar.task")[1].attributes("style")).toContain("translate(210px")

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it("keeps dependency lines aligned with the dragged task preview", async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrame = vi.spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined)
    const linkedTasks: GanttTask[] = [
      {
        id: "source",
        name: "Source",
        type: "task",
        plan: { start: "2026-07-01", end: "2026-07-05" },
        actual: { start: "2026-07-01", end: "2026-07-05", progress: 50 }
      },
      {
        id: "target",
        name: "Target",
        type: "task",
        plan: { start: "2026-07-08", end: "2026-07-10" },
        actual: { start: "2026-07-08", end: "2026-07-10", progress: 20 }
      }
    ]
    const wrapper = mount(GanttChart, {
      props: {
        tasks: linkedTasks,
        links: [{ id: "l1", sourceId: "source", targetId: "target", type: "FS" }],
        config: {
          viewMode: "day",
          columnWidth: 30,
          visibleRange: { start: "2026-07-01", end: "2026-07-31" }
        }
      }
    })

    const initialPoints = wrapper.find(".gantt-link-hit").attributes("points")
    expect(wrapper.find(".gantt-link-path").exists()).toBe(true)
    const sourceBar = wrapper.findAll(".gantt-bar.task")[0]
    await sourceBar.trigger("pointerdown", { clientX: 100, pointerId: 1 })
    await sourceBar.trigger("pointermove", { clientX: 160, pointerId: 1 })
    rafCallbacks.shift()?.(0)
    await nextTick()

    expect(wrapper.find(".gantt-link-hit").attributes("points")).not.toBe(initialPoints)
    expect(wrapper.find(".gantt-link-hit").attributes("points")?.startsWith("300,")).toBe(true)

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it("highlights weekend columns and exposes a resizable table separator", async () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        markers,
        config: { viewMode: "day", columnWidth: 30, taskListWidth: 660 }
      }
    })

    expect(wrapper.findAll(".gantt-weekend-layer span")).toHaveLength(8)
    expect(wrapper.findAll(".gantt-tick.weekend")).toHaveLength(8)

    const splitter = wrapper.find(".gantt-splitter")
    expect(splitter.attributes("role")).toBe("separator")
    await splitter.trigger("keydown", { key: "ArrowLeft" })
    expect(wrapper.find(".gantt-table").attributes("style")).toContain("width: 640px")

    await wrapper.setProps({
      config: { viewMode: "month", columnWidth: 30, taskListWidth: 660 }
    })
    expect(wrapper.findAll(".gantt-weekend-layer span")).toHaveLength(0)
    expect(wrapper.findAll(".gantt-tick.weekend")).toHaveLength(0)
  })

  it("shows a themed task detail card when hovering table rows and timeline bars", async () => {
    vi.useFakeTimers()
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        markers,
        config: { viewMode: "day", columnWidth: 30 }
      }
    })

    await wrapper.findAll(".gantt-row")[1].trigger("mouseenter", { clientX: 120, clientY: 260 })
    expect(wrapper.find(".gantt-task-popover").exists()).toBe(false)
    vi.advanceTimersByTime(220)
    await nextTick()
    expect(wrapper.find(".gantt-task-popover").exists()).toBe(true)
    expect(wrapper.find(".gantt-task-popover").text()).toContain(tasks[1].name)

    await wrapper.findAll(".gantt-row")[1].trigger("mouseleave")
    expect(wrapper.find(".gantt-task-popover").exists()).toBe(false)

    await wrapper.find(".gantt-bar.task").trigger("mouseenter", { clientX: 860, clientY: 280 })
    vi.advanceTimersByTime(220)
    await nextTick()
    expect(wrapper.find(".gantt-task-popover").exists()).toBe(true)

    await wrapper.find(".gantt-timeline").trigger("pointermove", { clientX: 20, clientY: 90 })
    expect(wrapper.find(".gantt-task-popover").exists()).toBe(false)
    vi.useRealTimers()
  })

  it("rolls summary dates and progress up from child tasks", () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks: [
          {
            id: "phase",
            name: "Phase",
            type: "summary",
            plan: { start: "2026-07-10", end: "2026-07-10" },
            actual: { start: "2026-07-10", end: "2026-07-10", progress: 0 }
          },
          {
            id: "child-a",
            name: "Child A",
            type: "task",
            parentId: "phase",
            plan: { start: "2026-07-01", end: "2026-07-03" },
            actual: { start: "2026-07-02", end: "2026-07-04", progress: 100 }
          },
          {
            id: "child-b",
            name: "Child B",
            type: "task",
            parentId: "phase",
            plan: { start: "2026-07-08", end: "2026-07-12" },
            actual: { start: "2026-07-09", end: "2026-07-13", progress: 0 }
          }
        ],
        config: { viewMode: "day" }
      }
    })

    const summaryRow = wrapper.findAll(".gantt-row")[0]
    expect(summaryRow.findAll(".gantt-date-cell").map((cell) => cell.text())).toEqual([
      "07-01",
      "07-12",
      "07-02",
      "07-13"
    ])
    expect(summaryRow.find(".gantt-progress-cell b").text()).toBe("38%")
  })

  it("marks unfinished tasks as overdue when actual end exceeds plan end", () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks: [{
          id: "late",
          name: "Late task",
          type: "task",
          plan: { start: "2026-07-01", end: "2026-07-05" },
          actual: { start: "2026-07-01", end: "2026-07-08", progress: 60 }
        }],
        config: { viewMode: "day" }
      }
    })

    expect(wrapper.find(".gantt-bar.task").classes()).toContain("overdue")
    expect(wrapper.find(".gantt-bar.task .gantt-overdue-segment").exists()).toBe(true)
  })

  it("supports hiding plan bars and exposing editable plan handles", () => {
    const hidden = mount(GanttChart, {
      props: {
        tasks,
        config: { viewMode: "day", showPlanBar: false }
      }
    })
    expect(hidden.find(".gantt-plan-bar").exists()).toBe(false)

    const editable = mount(GanttChart, {
      props: {
        tasks,
        config: { viewMode: "day", editablePlan: true }
      }
    })
    expect(editable.find(".gantt-plan-bar.editable").exists()).toBe(true)
    expect(editable.find(".gantt-plan-resize").exists()).toBe(true)
  })

  it("emits dependency links from manual link handles", async () => {
    vi.useFakeTimers()
    const wrapper = mount(GanttChart, {
      props: {
        tasks: linkableTasks,
        config: { viewMode: "day" }
      }
    })

    await wrapper.find(".gantt-bar.task").trigger("mouseenter", { clientX: 140, clientY: 120 })
    await wrapper.find(".gantt-link-handle.out").trigger("pointerdown", { clientX: 120, clientY: 120 })
    vi.advanceTimersByTime(220)
    await nextTick()
    expect(wrapper.find(".gantt-task-popover").exists()).toBe(false)
    await wrapper.find(".gantt-timeline").trigger("pointermove", { clientX: 180, clientY: 160 })
    expect(wrapper.find(".gantt-link-draft polyline").exists()).toBe(true)
    expect(wrapper.find(".gantt-link-draft polyline").attributes("points")?.split(" ")).toHaveLength(6)
    await wrapper.findAll(".gantt-bar")[1].trigger("pointerup")
    expect(wrapper.emitted("linkChange")?.[0]?.[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: "source", targetId: "target", type: "FS" })
    ]))
    vi.useRealTimers()
  })

  it("supports dependency links from both task anchors", async () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks: linkableTasks,
        config: { viewMode: "day" }
      }
    })
    const leftHandles = wrapper.findAll(".gantt-link-handle.in")
    const rightHandles = wrapper.findAll(".gantt-link-handle.out")

    await leftHandles[0].trigger("pointerdown", { clientX: 120, clientY: 120 })
    await leftHandles[1].trigger("pointerup")
    expect(wrapper.emitted("linkChange")?.[0]?.[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: "source", targetId: "target", type: "SS" })
    ]))

    await rightHandles[0].trigger("pointerdown", { clientX: 180, clientY: 120 })
    await rightHandles[1].trigger("pointerup")
    expect(wrapper.emitted("linkChange")?.[1]?.[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: "source", targetId: "target", type: "FF" })
    ]))
  })

  it("emits impacted successor dates after dragging a linked task", async () => {
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0)
        return 1
      })
    const cancelAnimationFrame = vi.spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined)
    const linkedTasks: GanttTask[] = [
      {
        id: "source",
        name: "Source",
        type: "task",
        plan: { start: "2026-07-01", end: "2026-07-05" },
        actual: { start: "2026-07-01", end: "2026-07-05", progress: 50 }
      },
      {
        id: "target",
        name: "Target",
        type: "task",
        plan: { start: "2026-07-06", end: "2026-07-08" },
        actual: { start: "2026-07-06", end: "2026-07-08", progress: 20 }
      }
    ]
    const wrapper = mount(GanttChart, {
      props: {
        tasks: linkedTasks,
        links: [{ id: "l1", sourceId: "source", targetId: "target", type: "FS" }],
        config: {
          viewMode: "day",
          columnWidth: 30,
          visibleRange: { start: "2026-07-01", end: "2026-07-31" }
        }
      }
    })

    const sourceBar = wrapper.findAll(".gantt-bar.task")[0]
    await sourceBar.trigger("pointerdown", { clientX: 100, pointerId: 1 })
    await sourceBar.trigger("pointerup", { clientX: 160, pointerId: 1 })

    expect(wrapper.emitted("taskChange")).toEqual(expect.arrayContaining([
      ["source", expect.objectContaining({ actualStart: expect.any(Date), actualEnd: expect.any(Date) })],
      ["target", expect.objectContaining({ actualStart: expect.any(Date), actualEnd: expect.any(Date) })]
    ]))

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it("virtualizes table rows for large task lists", async () => {
    const manyTasks: GanttTask[] = Array.from({ length: 120 }, (_, index) => ({
      id: `task-${index}`,
      name: `Task ${index}`,
      type: "task",
      plan: { start: "2026-07-01", end: "2026-07-02" },
      actual: { start: "2026-07-01", end: "2026-07-02", progress: index % 100 }
    }))
    const wrapper = mount(GanttChart, {
      props: {
        tasks: manyTasks,
        height: 240,
        config: { viewMode: "day", rowHeight: 30, headerHeight: 50 }
      }
    })

    expect(wrapper.findAll(".gantt-row").length).toBeLessThan(manyTasks.length)
    expect(wrapper.find(".gantt-row-spacer").exists()).toBe(true)
  })

  it("renders year with week, month, and quarter scale units", async () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        markers,
        config: {
          viewMode: "week",
          visibleRange: { start: "2026-07-01", end: "2026-10-31" }
        }
      }
    })

    expect(wrapper.findAll(".gantt-month").length).toBeGreaterThan(1)
    expect(wrapper.findAll(".gantt-month").every((header) => header.text() === "2026")).toBe(true)
    expect(wrapper.find(".gantt-tick").text()).toBe("6-28")

    await wrapper.setProps({
      config: {
        viewMode: "month",
        visibleRange: { start: "2026-07-01", end: "2026-10-31" }
      }
    })
    expect(wrapper.findAll(".gantt-month")).toHaveLength(4)
    expect(wrapper.find(".gantt-tick").text().length).toBeGreaterThan(0)

    await wrapper.setProps({
      config: {
        viewMode: "quarter",
        visibleRange: { start: "2026-07-01", end: "2026-10-31" }
      }
    })
    expect(wrapper.findAll(".gantt-month")).toHaveLength(2)
    expect(wrapper.findAll(".gantt-tick")).toHaveLength(2)
  })

  it("collapses and expands summary tasks", async () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        markers,
        config: { viewMode: "day" }
      }
    })

    expect(wrapper.find(".gantt-chevron").classes()).not.toContain("collapsed")
    await wrapper.find(".gantt-collapse").trigger("click")
    expect(wrapper.text()).not.toContain("Child task")
    expect(wrapper.find(".gantt-chevron").classes()).toContain("collapsed")

    await wrapper.find(".gantt-collapse").trigger("click")
    expect(wrapper.text()).toContain("Child task")
    expect(wrapper.find(".gantt-chevron").classes()).not.toContain("collapsed")
  })

  it("emits view mode changes", async () => {
    const onViewModeChange = vi.fn()
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        markers,
        config: { viewMode: "day" },
        onViewModeChange
      }
    })

    await wrapper.findAll(".gantt-scale-options input")[2].trigger("change")
    expect(wrapper.emitted("viewModeChange")).toBeTruthy()
    expect(onViewModeChange).toHaveBeenCalledWith("month")
    expect(onViewModeChange).toHaveBeenCalledTimes(1)
  })

  it("creates milestone markers from the toolbar", async () => {
    const onMarkerCreate = vi.fn()
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        markers,
        config: { viewMode: "day" },
        onMarkerCreate
      }
    })

    await wrapper.findAll(".gantt-actions button")[2].trigger("click")
    await wrapper.find(".gantt-editor button.primary").trigger("click")

    const created = wrapper.emitted("markerCreate")?.[0]?.[0] as GanttMarker
    expect(created.name).toBeTruthy()
    expect(created.date).toBeTruthy()
    expect(wrapper.emitted("markerCreate")).toHaveLength(1)
    expect(onMarkerCreate).toHaveBeenCalledTimes(1)
  })

  it("keeps colors independent for markers on the same date", async () => {
    const sameDateMarkers: GanttMarker[] = [
      { id: "m1", name: "Acceptance one", date: "2026-07-20", color: "#dc2626" },
      { id: "m2", name: "Acceptance two", date: "2026-07-20", color: "#2563eb" }
    ]
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        markers: sameDateMarkers,
        config: { viewMode: "day" }
      }
    })

    const markerNodes = wrapper.findAll(".gantt-marker")
    expect(markerNodes[0].attributes("style")).toContain("--marker-color: #dc2626")
    expect(markerNodes[1].attributes("style")).toContain("--marker-color: #2563eb")

    await markerNodes[1].trigger("dblclick")
    await wrapper.find(".gantt-editor input[type='color']").setValue("#16a34a")
    await wrapper.find(".gantt-editor button.primary").trigger("click")
    expect(wrapper.emitted("markerChange")?.[0]).toMatchObject([
      "m2",
      { color: "#16a34a" }
    ])
  })

  it("saves edits as a task patch", async () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        markers,
        config: { viewMode: "day" }
      }
    })

    await wrapper.findAll(".gantt-row")[1].trigger("dblclick")
    const input = wrapper.find(".gantt-editor input[type='text']")
    await input.setValue("Edited child task")
    await wrapper.find(".gantt-editor button.primary").trigger("click")

    expect(wrapper.emitted("taskChange")?.[0]).toMatchObject([
      "task-1",
      { name: "Edited child task" }
    ])
  })
})

