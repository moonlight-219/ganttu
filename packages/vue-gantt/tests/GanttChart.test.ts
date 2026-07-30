import { mount } from "@vue/test-utils"
import { h, nextTick } from "vue"
import { describe, expect, it, vi } from "vitest"
import type { GanttLink, GanttMarker, GanttTask, PatchTask } from "@gantt/core"
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
  it("can render the timeline without task rows when tasks are empty", () => {
    const defaultEmpty = mount(GanttChart, {
      props: {
        tasks: [],
        config: { viewMode: "day", visibleRange: { start: "2026-07-01", end: "2026-07-10" } }
      }
    })
    expect(defaultEmpty.find(".gantt-empty").exists()).toBe(true)
    expect(defaultEmpty.find(".gantt-timeline").exists()).toBe(false)

    const timelineEmpty = mount(GanttChart, {
      props: {
        tasks: [],
        config: {
          viewMode: "day",
          showTimelineWhenEmpty: true,
          visibleRange: { start: "2026-07-01", end: "2026-07-10" }
        }
      }
    })
    expect(timelineEmpty.find(".gantt-empty").exists()).toBe(false)
    expect(timelineEmpty.find(".gantt-table").exists()).toBe(false)
    expect(timelineEmpty.find(".gantt-splitter").exists()).toBe(false)
    expect(timelineEmpty.find(".gantt-timeline").exists()).toBe(true)
    expect(timelineEmpty.find(".gantt-scale").exists()).toBe(true)
    expect(timelineEmpty.findAll(".gantt-bar")).toHaveLength(0)
    expect(timelineEmpty.findAll(".gantt-plan-bar")).toHaveLength(0)
  })

  it("exposes the image export api", () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        markers,
        config: { viewMode: "day" }
      }
    })

    expect(typeof (wrapper.vm as unknown as { exportImage?: unknown }).exportImage).toBe("function")
  })

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

  it("routes opposite-side dependencies through the row gap before entering the target", () => {
    const path = buildOrthogonalLinkPath(
      { x: 45, y: 40 },
      { x: 285, y: 82 },
      "start",
      "finish"
    )

    expect(path).toEqual([
      { x: 45, y: 40 },
      { x: 21, y: 40 },
      { x: 21, y: 61 },
      { x: 309, y: 61 },
      { x: 309, y: 82 },
      { x: 285, y: 82 }
    ])
    expect(path[4].x).toBeGreaterThan(path[5].x)
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
    expect(wrapper.find(".gantt-marker").text()).toContain("Acceptance")
    expect(wrapper.find(".gantt-marker").attributes("title")).toBeUndefined()
    expect(wrapper.find(".gantt-marker [role='tooltip']").exists()).toBe(false)
    expect(wrapper.find(".gantt-marker-group").attributes("style")).toContain("translateX(675px)")
    expect(wrapper.find(".gantt-marker-badge-group").attributes("style")).toContain("translateX(675px)")
    expect(wrapper.find(".gantt-bar.milestone").exists()).toBe(false)
    expect(wrapper.find(".gantt-bar.task").text()).toBe("")
    expect(wrapper.findAll(".gantt-plan-bar")).toHaveLength(tasks.length)
    expect(wrapper.findAll(".gantt-plan-progress")).toHaveLength(tasks.length)
    expect(wrapper.find(".gantt-bar.task .gantt-progress").exists()).toBe(false)
    expect(wrapper.find(".gantt-bar.summary .gantt-resize").exists()).toBe(false)
    expect(wrapper.find(".gantt-bar.summary .gantt-link-handle").exists()).toBe(false)
    expect(wrapper.find(".gantt-plan-bar.task").attributes("title")).toBeUndefined()
    expect(wrapper.find(".gantt-bar.task").attributes("title")).toBeUndefined()
    expect(wrapper.find(".gantt-legend").exists()).toBe(false)
    expect(wrapper.find(".gantt-actions").exists()).toBe(false)
    expect(wrapper.find(".gantt-table-scroll > .gantt-table-head").exists()).toBe(true)
    expect(wrapper.find(".gantt-table-head").attributes("style")).not.toContain("transform")
    expect(wrapper.findAll(".gantt-row")[0].classes()).toContain("summary-row")
    expect(wrapper.findAll(".gantt-name")[1].classes()).toContain("child")
    expect(wrapper.find(".gantt-scale-options").exists()).toBe(false)
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
    expect(wrapper.findAll(".gantt-row")[1].findAll(".gantt-date-cell")[2].text()).toBe("07-04")

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
    expect(wrapper.findAll(".gantt-row")[1].findAll(".gantt-date-cell")[2].text()).toBe("07-01")

    await handle.trigger("pointerup", { clientX: 90, pointerId: 1 })
    const patch = wrapper.emitted("taskChange")?.[0]?.[1] as PatchTask | undefined
    expect(dateKey(patch?.actualStart)).toBe("2026-07-01")
    expect(dateKey(patch?.actualEnd)).toBe("2026-07-09")

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it("expands the timeline range while extending actual and plan starts into an earlier week", async () => {
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0)
        return 1
      })
    const cancelAnimationFrame = vi.spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined)
    const wrapper = mount(GanttChart, {
      props: {
        tasks: [{
          id: "origin-lock",
          name: "Origin lock",
          type: "task",
          plan: { start: "2026-07-08", end: "2026-07-12" },
          actual: { start: "2026-07-08", end: "2026-07-12", progress: 30 }
        }],
        config: { viewMode: "day", columnWidth: 30 }
      }
    })

    const startHandle = wrapper.find(".gantt-bar.task .gantt-resize.start")
    await startHandle.trigger("pointerdown", { clientX: 240, pointerId: 1 })
    await startHandle.trigger("pointermove", { clientX: 60, pointerId: 1 })
    await nextTick()

    expect(wrapper.find(".gantt-tick").text()).toBe("28")
    expect(wrapper.find(".gantt-bar.task").attributes("style")).toContain("translate(120px")
    expect(wrapper.find(".gantt-bar.task").attributes("style")).toContain("width: 330px")
    wrapper.unmount()

    const planWrapper = mount(GanttChart, {
      props: {
        tasks: [{
          id: "plan-origin-lock",
          name: "Plan origin lock",
          type: "task",
          plan: { start: "2026-07-08", end: "2026-07-12" },
          actual: { start: "2026-07-08", end: "2026-07-12", progress: 30 }
        }],
        config: { viewMode: "day", columnWidth: 30, editablePlan: true }
      }
    })
    const planStartHandle = planWrapper.find(".gantt-plan-bar.task .gantt-plan-resize.start")
    await planStartHandle.trigger("pointerdown", { clientX: 240, pointerId: 2 })
    await planStartHandle.trigger("pointermove", { clientX: 60, pointerId: 2 })
    await nextTick()

    expect(planWrapper.find(".gantt-tick").text()).toBe("28")
    expect(planWrapper.find(".gantt-plan-bar.task").attributes("style")).toContain("translate(120px")
    expect(planWrapper.find(".gantt-plan-bar.task").attributes("style")).toContain("width: 330px")
    planWrapper.unmount()

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it("keeps actual and plan bars stationary after start resizing reaches one day", async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrame = vi.spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined)
    const minimumTasks: GanttTask[] = [{
      id: "minimum-width",
      name: "Minimum width",
      type: "task",
      plan: { start: "2026-07-01", end: "2026-07-05" },
      actual: { start: "2026-07-01", end: "2026-07-05", progress: 30 }
    }]
    const config = {
      viewMode: "day" as const,
      columnWidth: 30,
      editablePlan: true,
      visibleRange: { start: "2026-07-01", end: "2026-07-31" }
    }

    const actualWrapper = mount(GanttChart, { props: { tasks: minimumTasks, config } })
    const actualStartHandle = actualWrapper.find(".gantt-bar.task .gantt-resize.start")
    await actualStartHandle.trigger("pointerdown", { clientX: 100, pointerId: 1 })
    await actualStartHandle.trigger("pointermove", { clientX: 70, pointerId: 1 })
    rafCallbacks.shift()?.(0)
    await actualStartHandle.trigger("pointermove", { clientX: 400, pointerId: 1 })
    rafCallbacks.shift()?.(16)
    await nextTick()
    const minimumActualStyle = actualWrapper.find(".gantt-bar.task").attributes("style")
    expect(minimumActualStyle).toContain("width: 30px")
    expect(actualWrapper.find(".gantt-row").findAll(".gantt-date-cell").slice(2).map((cell) => cell.text())).toEqual([
      "07-05",
      "07-05"
    ])

    await actualStartHandle.trigger("pointermove", { clientX: 700, pointerId: 1 })
    rafCallbacks.shift()?.(32)
    await nextTick()
    expect(actualWrapper.find(".gantt-bar.task").attributes("style")).toBe(minimumActualStyle)
    actualWrapper.unmount()

    const planWrapper = mount(GanttChart, { props: { tasks: minimumTasks, config } })
    const planStartHandle = planWrapper.find(".gantt-plan-bar.task .gantt-plan-resize.start")
    await planStartHandle.trigger("pointerdown", { clientX: 100, pointerId: 2 })
    await planStartHandle.trigger("pointermove", { clientX: 70, pointerId: 2 })
    rafCallbacks.shift()?.(48)
    await planStartHandle.trigger("pointermove", { clientX: 400, pointerId: 2 })
    rafCallbacks.shift()?.(64)
    await nextTick()
    const minimumPlanStyle = planWrapper.find(".gantt-plan-bar.task").attributes("style")
    expect(minimumPlanStyle).toContain("width: 30px")
    expect(planWrapper.find(".gantt-row").findAll(".gantt-date-cell").slice(0, 2).map((cell) => cell.text())).toEqual([
      "07-05",
      "07-05"
    ])

    await planStartHandle.trigger("pointermove", { clientX: 700, pointerId: 2 })
    rafCallbacks.shift()?.(80)
    await nextTick()
    expect(planWrapper.find(".gantt-plan-bar.task").attributes("style")).toBe(minimumPlanStyle)
    planWrapper.unmount()

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it("keeps 100 percent plan and actual bar widths stable while moving", async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrame = vi.spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined)
    const completedTasks: GanttTask[] = [{
      id: "completed-move",
      name: "Completed move",
      type: "task",
      plan: { start: "2026-07-01", end: "2026-07-05" },
      actual: { start: "2026-07-01", end: "2026-07-05", progress: 100 }
    }]
    const config = {
      viewMode: "day" as const,
      columnWidth: 30,
      editablePlan: true,
      visibleRange: { start: "2026-07-01", end: "2026-07-31" }
    }

    const actualWrapper = mount(GanttChart, { props: { tasks: completedTasks, config } })
    const initialActualStyle = actualWrapper.find(".gantt-bar.task").attributes("style")
    const actualBar = actualWrapper.find(".gantt-bar.task")
    await actualBar.trigger("pointerdown", { clientX: 100, pointerId: 1 })
    await actualBar.trigger("pointermove", { clientX: 160, pointerId: 1 })
    rafCallbacks.shift()?.(0)
    await nextTick()

    expect(initialActualStyle).toContain("width: 150px")
    expect(actualWrapper.find(".gantt-bar.task").attributes("style")).toContain("width: 150px")
    expect(actualWrapper.find(".gantt-bar.task").attributes("style")).not.toBe(initialActualStyle)
    actualWrapper.unmount()

    const planWrapper = mount(GanttChart, { props: { tasks: completedTasks, config } })
    const initialPlanStyle = planWrapper.find(".gantt-plan-bar.task").attributes("style")
    const planBar = planWrapper.find(".gantt-plan-bar.task")
    await planBar.trigger("pointerdown", { clientX: 100, pointerId: 2 })
    await planBar.trigger("pointermove", { clientX: 160, pointerId: 2 })
    rafCallbacks.shift()?.(16)
    await nextTick()

    expect(initialPlanStyle).toContain("width: 150px")
    expect(planWrapper.find(".gantt-plan-bar.task").attributes("style")).toContain("width: 150px")
    expect(planWrapper.find(".gantt-plan-bar.task").attributes("style")).not.toBe(initialPlanStyle)
    expect(planWrapper.find(".gantt-plan-progress").attributes("style")).toContain("width: 100%")
    planWrapper.unmount()

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
    expect(wrapper.findAll(".gantt-row")[1].findAll(".gantt-date-cell")[0].text()).toBe("06-30")

    await handle.trigger("pointerup", { clientX: 60, pointerId: 1 })
    const patch = wrapper.emitted("taskChange")?.[0]?.[1] as PatchTask | undefined
    expect(dateKey(patch?.planStart)).toBe("2026-06-30")
    expect(dateKey(patch?.planEnd)).toBe("2026-07-09")

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it("updates summary plan and actual bars during child drag previews", async () => {
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0)
        return 1
      })
    const cancelAnimationFrame = vi.spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined)
    const summaryTasks: GanttTask[] = [
      {
        id: "phase",
        name: "Phase",
        type: "summary",
        plan: { start: "2026-07-01", end: "2026-07-05" },
        actual: { start: "2026-07-02", end: "2026-07-06", progress: 40 }
      },
      {
        id: "phase-child",
        name: "Phase child",
        type: "task",
        parentId: "phase",
        plan: { start: "2026-07-01", end: "2026-07-05" },
        actual: { start: "2026-07-02", end: "2026-07-06", progress: 40 }
      }
    ]
    const commonConfig = {
      viewMode: "day" as const,
      columnWidth: 30,
      editablePlan: true,
      visibleRange: { start: "2026-07-01", end: "2026-07-31" }
    }

    const actualWrapper = mount(GanttChart, {
      props: { tasks: summaryTasks, config: commonConfig }
    })
    const initialActualStyle = actualWrapper.find(".gantt-bar.summary").attributes("style")
    const childActualBar = actualWrapper.find(".gantt-bar.task")
    await childActualBar.trigger("pointerdown", { clientX: 120, pointerId: 1 })
    await childActualBar.trigger("pointermove", { clientX: 180, pointerId: 1 })
    await nextTick()

    expect(actualWrapper.find(".gantt-bar.summary").attributes("style")).not.toBe(initialActualStyle)
    expect(actualWrapper.findAll(".gantt-row")[0].findAll(".gantt-date-cell").map((cell) => cell.text())).toEqual([
      "07-01",
      "07-05",
      "07-04",
      "07-08"
    ])
    actualWrapper.unmount()

    const planWrapper = mount(GanttChart, {
      props: { tasks: summaryTasks, config: commonConfig }
    })
    const initialPlanStyle = planWrapper.find(".gantt-plan-bar.summary").attributes("style")
    const childPlanBar = planWrapper.find(".gantt-plan-bar.task")
    await childPlanBar.trigger("pointerdown", { clientX: 120, pointerId: 2 })
    await childPlanBar.trigger("pointermove", { clientX: 180, pointerId: 2 })
    await nextTick()

    expect(planWrapper.find(".gantt-plan-bar.summary").attributes("style")).not.toBe(initialPlanStyle)
    expect(planWrapper.findAll(".gantt-row")[0].findAll(".gantt-date-cell").map((cell) => cell.text())).toEqual([
      "07-03",
      "07-07",
      "07-02",
      "07-06"
    ])
    planWrapper.unmount()

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it("constrains linked plan drags while leaving actual drags independent", async () => {
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
    const actualWrapper = mount(GanttChart, {
      props: {
        tasks: linkedTasks,
        links: [{ id: "l1", sourceId: "source", targetId: "target", type: "SS" }],
        config: {
          viewMode: "day",
          columnWidth: 30,
          editablePlan: true,
          visibleRange: { start: "2026-07-01", end: "2026-07-31" }
        }
      }
    })

    const targetActualBar = actualWrapper.findAll(".gantt-bar.task")[1]
    await targetActualBar.trigger("pointerdown", { clientX: 200, pointerId: 1 })
    await targetActualBar.trigger("pointermove", { clientX: 80, pointerId: 1 })
    rafCallbacks.shift()?.(0)
    await nextTick()
    expect(actualWrapper.findAll(".gantt-bar.task")[1].attributes("style")).toContain("translate(150px")
    actualWrapper.unmount()

    const planWrapper = mount(GanttChart, {
      props: {
        tasks: linkedTasks,
        links: [{ id: "l1", sourceId: "source", targetId: "target", type: "SS" }],
        config: {
          viewMode: "day",
          columnWidth: 30,
          editablePlan: true,
          visibleRange: { start: "2026-07-01", end: "2026-07-31" }
        }
      }
    })
    const targetPlanBar = planWrapper.findAll(".gantt-plan-bar.task")[1]
    await targetPlanBar.trigger("pointerdown", { clientX: 200, pointerId: 2 })
    await targetPlanBar.trigger("pointermove", { clientX: 80, pointerId: 2 })
    rafCallbacks.shift()?.(16)
    await nextTick()
    expect(planWrapper.findAll(".gantt-plan-bar.task")[1].attributes("style")).toContain("translate(210px")
    planWrapper.unmount()

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it("keeps dependency lines aligned with the dragged plan preview", async () => {
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
          editablePlan: true,
          visibleRange: { start: "2026-07-01", end: "2026-07-31" }
        }
      }
    })

    const initialPoints = wrapper.find(".gantt-link-hit").attributes("points")
    expect(wrapper.find(".gantt-link-path").exists()).toBe(true)
    const sourceBar = wrapper.findAll(".gantt-plan-bar.task")[0]
    await sourceBar.trigger("pointerdown", { clientX: 100, pointerId: 1 })
    await sourceBar.trigger("pointermove", { clientX: 160, pointerId: 1 })
    rafCallbacks.shift()?.(0)
    await nextTick()

    expect(wrapper.find(".gantt-link-hit").attributes("points")).not.toBe(initialPoints)

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
    const overdueSegment = wrapper.find(".gantt-bar.task .gantt-overdue-segment")
    expect(overdueSegment.exists()).toBe(true)
    expect(overdueSegment.attributes("style")).toContain("left:")
    expect(overdueSegment.attributes("style")).not.toContain("width:")
  })

  it("rounds both ends when the entire actual bar is overdue", () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks: [{
          id: "fully-late",
          name: "Fully late task",
          type: "task",
          plan: { start: "2026-07-01", end: "2026-07-05" },
          actual: { start: "2026-07-06", end: "2026-07-08", progress: 60 }
        }],
        config: { viewMode: "day" }
      }
    })

    expect(wrapper.find(".gantt-overdue-segment").attributes("style")).toContain("border-radius: 999px")
  })

  it("controls plan and actual visibility and drag permissions independently", async () => {
    const links: GanttLink[] = [{
      id: "task-link",
      sourceId: "summary",
      targetId: "task-1",
      type: "FS",
      lag: 0,
      lagUnit: "calendar"
    }]
    const hiddenPlan = mount(GanttChart, {
      props: {
        tasks,
        links,
        config: { viewMode: "day", showPlanBar: false }
      }
    })
    expect(hiddenPlan.find(".gantt-plan-bar").exists()).toBe(false)
    expect(hiddenPlan.find(".gantt-link-layer").exists()).toBe(false)
    expect(hiddenPlan.find(".gantt-bar").exists()).toBe(true)

    const editablePlan = mount(GanttChart, {
      props: {
        tasks,
        config: { viewMode: "day", editablePlan: true }
      }
    })
    expect(editablePlan.find(".gantt-plan-bar.editable").exists()).toBe(true)
    expect(editablePlan.find(".gantt-plan-resize").exists()).toBe(true)

    const hiddenActual = mount(GanttChart, {
      props: {
        tasks,
        config: { viewMode: "day", showActualBar: false }
      }
    })
    expect(hiddenActual.find(".gantt-bar").exists()).toBe(false)
    expect(hiddenActual.find(".gantt-plan-bar").exists()).toBe(true)

    const lockedActual = mount(GanttChart, {
      props: {
        tasks,
        config: { viewMode: "day", editableActual: false }
      }
    })
    const actualTaskBar = lockedActual.find(".gantt-bar.task")
    expect(actualTaskBar.classes()).toContain("locked")
    await actualTaskBar.trigger("pointerdown", { clientX: 100, pointerId: 1 })
    await actualTaskBar.trigger("pointerup", { clientX: 160, pointerId: 1 })
    expect(lockedActual.emitted("taskChange")).toBeUndefined()
  })

  it("does not auto-schedule actual bars from task dependencies in the Vue chart", () => {
    const dependentTasks: GanttTask[] = [
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
        plan: { start: "2026-07-02", end: "2026-07-04" },
        actual: { start: "2026-07-02", end: "2026-07-04", progress: 20 },
        dependencies: [{
          id: "source-target",
          predecessorId: "source",
          type: "FS",
          lag: 0,
          lagUnit: "calendar"
        }]
      }
    ]
    const wrapper = mount(GanttChart, {
      props: {
        tasks: dependentTasks,
        config: {
          viewMode: "day",
          columnWidth: 20,
          autoSchedule: true,
          visibleRange: { start: "2026-07-01", end: "2026-07-31" }
        }
      }
    })
    const targetBar = wrapper.findAll(".gantt-bar.task")[1]

    expect(targetBar.attributes("style")).toContain("translate(80px")
    expect(targetBar.attributes("style")).not.toContain("translate(160px")
  })

  it("notifies when plan dragging is limited by dependency constraints", async () => {
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
          editablePlan: true,
          visibleRange: { start: "2026-07-01", end: "2026-07-31" }
        }
      }
    })

    const targetPlanBar = wrapper.findAll(".gantt-plan-bar.task")[1]
    await targetPlanBar.trigger("pointerdown", { clientX: 100, pointerId: 1 })
    await targetPlanBar.trigger("pointerup", { clientX: 40, pointerId: 1 })

    expect(wrapper.emitted("linkRejected")?.[0]?.[0]).toMatchObject({
      reason: "constraint",
      sourceId: "source",
      targetId: "target"
    })
    expect(wrapper.emitted("taskChange")).toBeUndefined()
  })

  it("keeps plan and actual bar colors independent", () => {
    const coloredTask: GanttTask = {
      ...tasks[1],
      parentId: null,
      color: "#ef4444"
    }
    const defaultColors = mount(GanttChart, {
      props: {
        tasks: [coloredTask],
        config: { viewMode: "day" }
      }
    })

    expect(defaultColors.find(".gantt-bar.task").attributes("style")).toContain("--bar-color: #ef4444")
    expect(defaultColors.find(".gantt-plan-bar.task").attributes("style")).toContain("--bar-color: #cbd5e1")
    expect(defaultColors.find(".gantt-plan-bar.task").attributes("style")).toContain("--plan-color-fade: 10%")

    const taskPlanColor = mount(GanttChart, {
      props: {
        tasks: [{ ...coloredTask, planColor: "#10b981" }],
        config: { viewMode: "day" }
      }
    })

    expect(taskPlanColor.find(".gantt-bar.task").attributes("style")).toContain("--bar-color: #ef4444")
    expect(taskPlanColor.find(".gantt-plan-bar.task").attributes("style")).toContain("--bar-color: #10b981")

    const configured = mount(GanttChart, {
      props: {
        tasks: [coloredTask],
        config: {
          viewMode: "day",
          taskColors: { plan: "#94a3b8" }
        }
      }
    })

    expect(configured.find(".gantt-plan-bar.task").attributes("style")).toContain("--bar-color: #94a3b8")
    expect(configured.find(".gantt-plan-bar.task").attributes("style")).toContain("--plan-color-fade: 10%")
  })

  it("keeps plan bars above actual bars and milestones pinned to the visible timeline body", async () => {
    const manyTasks: GanttTask[] = Array.from({ length: 30 }, (_, index) => ({
      id: `task-${index}`,
      name: `Task ${index}`,
      type: "task",
      plan: { start: "2026-07-01", end: "2026-07-02" },
      actual: { start: "2026-07-01", end: "2026-07-02", progress: 0 }
    }))
    manyTasks.push({
      id: "fixed-milestone",
      name: "Fixed milestone",
      type: "milestone",
      plan: { start: "2026-07-15", end: "2026-07-15" },
      actual: { start: "2026-07-15", end: "2026-07-15", progress: 0 }
    })
    const wrapper = mount(GanttChart, {
      props: {
        tasks: manyTasks,
        config: {
          viewMode: "day",
          columnWidth: 30,
          rowHeight: 44,
          virtualScroll: true,
          visibleRange: { start: "2026-07-01", end: "2026-07-31" }
        },
        height: 240
      }
    })

    expect(wrapper.find(".gantt-plan-bar.task").attributes("style")).toMatch(/translate\([^,]+, 5px\)/)
    expect(wrapper.find(".gantt-bar.task").attributes("style")).toMatch(/translate\([^,]+, 25px\)/)
    const milestone = wrapper.find(".gantt-bar.milestone")
    expect(milestone.exists()).toBe(true)
    expect(milestone.attributes("style")).toMatch(/translate\([^,]+, 0px\)/)

    const timeline = wrapper.find(".gantt-timeline").element as HTMLElement
    timeline.scrollTop = 440
    await wrapper.find(".gantt-timeline").trigger("scroll")
    await nextTick()

    expect(wrapper.find(".gantt-bar.milestone").attributes("style")).toMatch(/translate\([^,]+, 440px\)/)
    expect(wrapper.find(".gantt-bar.milestone").attributes("style")).not.toContain(`height: ${manyTasks.length * 44}px`)
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
    await wrapper.findAll(".gantt-plan-bar")[1].trigger("pointerup")
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
    expect(wrapper.find(".gantt-bar .gantt-link-handle").exists()).toBe(false)
    expect(wrapper.find(".gantt-plan-bar .gantt-link-handle").exists()).toBe(true)

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

  it("rejects duplicate task-pair links and reverse links that create a cycle", async () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks: linkableTasks,
        links: [{
          id: "existing",
          sourceId: "source",
          targetId: "target",
          type: "FS"
        }],
        config: { viewMode: "day" }
      }
    })
    const leftHandles = wrapper.findAll(".gantt-link-handle.in")
    const rightHandles = wrapper.findAll(".gantt-link-handle.out")

    await leftHandles[0].trigger("pointerdown", { clientX: 120, clientY: 120 })
    await rightHandles[1].trigger("pointerup")
    await rightHandles[1].trigger("pointerdown", { clientX: 180, clientY: 160 })
    await leftHandles[0].trigger("pointerup")

    expect(wrapper.emitted("linkChange")).toBeUndefined()
    expect(wrapper.emitted("linkRejected")?.map((event) => event[0])).toMatchObject([
      { reason: "duplicate", sourceId: "source", targetId: "target" },
      { reason: "cycle", sourceId: "target", targetId: "source" }
    ])
    expect(wrapper.find(".gantt-link-notice").text()).toContain("循环")
    expect(wrapper.findAll(".gantt-link-path")).toHaveLength(1)
  })

  it("does not emit successor changes after dragging a linked actual bar", async () => {
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

    expect(wrapper.emitted("taskChange")).toEqual([
      ["source", expect.objectContaining({ actualStart: expect.any(Date), actualEnd: expect.any(Date) })]
    ])

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it("previews and emits successor plan changes after dragging a linked plan bar", async () => {
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
          editablePlan: true,
          visibleRange: { start: "2026-07-01", end: "2026-07-31" }
        }
      }
    })

    const targetInitialStyle = wrapper.findAll(".gantt-plan-bar.task")[1].attributes("style")
    const sourcePlanBar = wrapper.findAll(".gantt-plan-bar.task")[0]
    await sourcePlanBar.trigger("pointerdown", { clientX: 100, pointerId: 1 })
    await sourcePlanBar.trigger("pointermove", { clientX: 160, pointerId: 1 })
    rafCallbacks.shift()?.(0)
    await nextTick()
    expect(wrapper.findAll(".gantt-plan-bar.task")[1].attributes("style")).not.toBe(targetInitialStyle)

    await sourcePlanBar.trigger("pointerup", { clientX: 160, pointerId: 1 })
    expect(wrapper.emitted("taskChange")).toEqual(expect.arrayContaining([
      ["source", expect.objectContaining({ planStart: expect.any(Date), planEnd: expect.any(Date) })],
      ["target", expect.objectContaining({ planStart: expect.any(Date), planEnd: expect.any(Date) })]
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

  it("uses the configured view mode without rendering built-in view controls", async () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        markers,
        config: { viewMode: "day" }
      }
    })

    expect(wrapper.find(".gantt-scale-options").exists()).toBe(false)
    expect(wrapper.find(".gantt-tick").exists()).toBe(true)
  })

  it("does not render demo toolbar controls in the core chart", () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        markers,
        config: { viewMode: "day" }
      }
    })

    expect(wrapper.find(".gantt-toolbar").exists()).toBe(false)
    expect(wrapper.find(".gantt-actions").exists()).toBe(false)
    expect(wrapper.find(".gantt-scale-options").exists()).toBe(false)
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
    expect(markerNodes[0].attributes("style")).toContain("top: 8px")
    expect(markerNodes[1].attributes("style")).toContain("top: 38px")

    const timeline = wrapper.find(".gantt-timeline").element as HTMLElement
    timeline.scrollTop = 120
    await wrapper.find(".gantt-timeline").trigger("scroll")
    await nextTick()

    const scrolledMarkerNodes = wrapper.findAll(".gantt-marker")
    expect(scrolledMarkerNodes[0].attributes("style")).toContain("top: 8px")
    expect(scrolledMarkerNodes[1].attributes("style")).toContain("top: 38px")
    expect(wrapper.find(".gantt-marker-badge-layer").exists()).toBe(true)

    await scrolledMarkerNodes[1].trigger("dblclick")
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
    expect(wrapper.find(".gantt-task-drawer").exists()).toBe(true)
    const input = wrapper.find(".gantt-editor input[type='text']")
    await input.setValue("Edited child task")
    const ownerInput = wrapper.findAll(".gantt-editor label")
      .find((label) => label.text().includes("负责人"))
      ?.find("input")
    await ownerInput!.setValue("Bob")
    await wrapper.find(".gantt-editor button.primary").trigger("click")

    expect(wrapper.emitted("taskChange")?.[0]).toMatchObject([
      "task-1",
      { name: "Edited child task", resources: ["Bob"] }
    ])
  })

  it("supports separate plan colors and custom date or select controls", async () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks: [{ ...tasks[1], parentId: null }],
        config: { viewMode: "day" }
      }
    })

    await wrapper.find(".gantt-row").trigger("dblclick")
    const drawer = wrapper.find(".gantt-task-drawer")
    expect(drawer.find("input[type='date']").exists()).toBe(false)
    expect(drawer.find("select").exists()).toBe(false)

    await drawer.find(".gantt-date-trigger[aria-label='计划开始']").trigger("click")
    expect(drawer.find(".gantt-date-popover").exists()).toBe(true)
    await drawer.find(".gantt-date-days button[aria-label='2026-07-16']").trigger("click")

    await drawer.find(".gantt-ui-select-trigger[aria-label='任务类型']").trigger("click")
    const summaryOption = drawer.findAll(".gantt-ui-select-menu [role='option']")
      .find((option) => option.text().includes("阶段"))
    await summaryOption!.trigger("click")

    await drawer.find(".gantt-color-swatch[aria-label='选择计划条颜色 #10b981']").trigger("click")
    await drawer.find("button.primary").trigger("click")

    expect(wrapper.emitted("taskChange")?.[0]).toMatchObject([
      "task-1",
      {
        type: "summary",
        planStart: "2026-07-16",
        planColor: "#10b981"
      }
    ])
  })

  it("opens the task editor by double-clicking either the plan or actual bar", async () => {
    const standaloneTask: GanttTask = {
      ...tasks[1],
      parentId: null
    }
    const planWrapper = mount(GanttChart, {
      props: {
        tasks: [standaloneTask],
        config: {
          viewMode: "day",
          editablePlan: false,
          editableActual: false
        }
      }
    })

    await planWrapper.find(".gantt-plan-bar.task").trigger("dblclick")
    expect(planWrapper.find(".gantt-task-drawer").exists()).toBe(true)

    const actualWrapper = mount(GanttChart, {
      props: {
        tasks: [standaloneTask],
        config: {
          viewMode: "day",
          editablePlan: false,
          editableActual: false
        }
      }
    })

    await actualWrapper.find(".gantt-bar.task").trigger("dblclick")
    expect(actualWrapper.find(".gantt-task-drawer").exists()).toBe(true)
  })

  it("lets consumers disable the built-in task editor and handle edit requests externally", async () => {
    const standaloneTask: GanttTask = {
      ...tasks[1],
      parentId: null,
      custom: { budget: 12 }
    }
    const onTaskEditRequest = vi.fn()
    const wrapper = mount(GanttChart, {
      props: {
        tasks: [standaloneTask],
        config: {
          viewMode: "day",
          builtInTaskEditor: false,
          columns: [
            { key: "name", label: "任务名称", width: 180 },
            {
              key: "budget",
              label: "预算",
              width: 90,
              editable: true,
              editor: { editable: false, type: "number" }
            }
          ],
          editorFields: [
            { key: "remark", label: "备注", type: "text", editable: true }
          ]
        },
        onTaskEditRequest
      }
    })

    await wrapper.find(".gantt-row").trigger("dblclick")

    expect(wrapper.find(".gantt-task-drawer").exists()).toBe(false)
    expect(wrapper.emitted("taskEditRequest")).toHaveLength(1)
    expect(onTaskEditRequest).toHaveBeenCalledTimes(1)
    const request = onTaskEditRequest.mock.calls[0][0]
    expect(request).toMatchObject({
      mode: "edit",
      taskType: "task",
      task: { id: "task-1" },
      draft: {
        id: "task-1",
        custom: { budget: 12 }
      }
    })
    expect(request.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "name", label: "名称" }),
      expect.objectContaining({ key: "budget", label: "预算", editable: false, type: "number" }),
      expect.objectContaining({ key: "remark", label: "备注", editable: true, type: "text" })
    ]))
  })

  it("supports replacing the built-in task and marker editors with slots or external handlers", async () => {
    const onMarkerEditRequest = vi.fn()
    const wrapper = mount(GanttChart, {
      props: {
        tasks: [{ ...tasks[1], parentId: null }],
        markers,
        config: {
          viewMode: "day",
          builtInMarkerEditor: false
        },
        onMarkerEditRequest
      },
      slots: {
        "task-editor": ({ draft }: { draft: { name: string } }) =>
          h("section", { class: "custom-task-editor" }, draft.name)
      }
    })

    await wrapper.find(".gantt-row").trigger("dblclick")
    expect(wrapper.find(".custom-task-editor").text()).toBe("Child task")
    expect(wrapper.find(".gantt-task-drawer").exists()).toBe(false)

    await wrapper.find(".gantt-marker").trigger("dblclick")
    expect(wrapper.find(".gantt-marker-editor").exists()).toBe(false)
    expect(wrapper.emitted("markerEditRequest")).toHaveLength(1)
    expect(onMarkerEditRequest).toHaveBeenCalledWith(expect.objectContaining({
      mode: "edit",
      marker: expect.objectContaining({ id: "m1" })
    }))
  })

  it("supports editor field configuration and per-field or footer slots", async () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks: [{
          ...tasks[1],
          parentId: null,
          custom: { budget: 12 }
        }],
        config: {
          viewMode: "day",
          columns: [
            { key: "name", label: "任务名称" },
            { key: "budget", label: "预算", type: "number", editable: true }
          ],
          editorFields: [
            { key: "resources", label: "负责人", visible: false },
            { key: "progress", label: "进度", editable: false }
          ]
        }
      },
      slots: {
        "editor-field-budget": ({ value }: { value: unknown }) =>
          h("output", { class: "custom-budget-editor" }, String(value)),
        "editor-footer": () =>
          h("footer", { class: "custom-editor-footer" }, "Custom actions")
      }
    })

    await wrapper.find(".gantt-row").trigger("dblclick")

    expect(wrapper.find(".custom-budget-editor").text()).toBe("12")
    expect(wrapper.find(".custom-editor-footer").text()).toBe("Custom actions")
    expect(wrapper.find(".gantt-task-drawer").text()).not.toContain("负责人")
    const progressInput = wrapper.findAll(".gantt-task-drawer label")
      .find((label) => label.text().includes("进度"))
      ?.find("input")
    expect(progressInput?.attributes("readonly")).toBeDefined()
  })

  it("supports configured columns, scoped cell slots, and custom editor values", async () => {
    const customTasks: GanttTask[] = [{
      ...tasks[1],
      parentId: null,
      resources: ["Alice"],
      custom: { budget: 12, code: "LOCKED" }
    }]
    const wrapper = mount(GanttChart, {
      props: {
        tasks: customTasks,
        config: {
          viewMode: "day",
          columns: [
            { key: "name", label: "工作项", width: 180, align: "left" },
            { key: "budget", label: "预算", width: 90, type: "number", editable: true },
            { key: "code", label: "编号", width: 90, editable: false }
          ]
        }
      },
      slots: {
        "cell-budget": ({ value }: { value: unknown }) => h("strong", { class: "budget-slot" }, `¥${value}`)
      }
    })

    expect(wrapper.find(".gantt-table-head").text()).toContain("工作项")
    expect(wrapper.find(".gantt-table-head").text()).toContain("预算")
    expect(wrapper.find(".gantt-table-head").text()).toContain("编号")
    expect(wrapper.find(".gantt-table-head").attributes("style")).toContain("180px 90px 90px")
    expect(wrapper.find(".budget-slot").text()).toBe("¥12")

    await wrapper.find(".gantt-row").trigger("dblclick")
    const customInput = wrapper.findAll(".gantt-editor label")
      .find((label) => label.text().includes("预算"))
      ?.find("input")
    expect(customInput?.exists()).toBe(true)
    expect(customInput?.attributes("readonly")).toBeUndefined()
    const readonlyInput = wrapper.findAll(".gantt-editor label")
      .find((label) => label.text().includes("编号"))
      ?.find("input")
    expect(readonlyInput?.exists()).toBe(true)
    expect(readonlyInput?.attributes("readonly")).toBeDefined()
    expect(readonlyInput?.element.value).toBe("LOCKED")
    await customInput!.setValue("25")
    await wrapper.find(".gantt-editor button.primary").trigger("click")

    expect(wrapper.emitted("taskChange")?.[0]).toMatchObject([
      "task-1",
      {
        planStart: "2026-07-01",
        planEnd: "2026-07-09",
        actualStart: "2026-07-02",
        actualEnd: "2026-07-09",
        resources: ["Alice"],
        custom: { budget: 25, code: "LOCKED" }
      }
    ])
  })

  it("expands table columns to fill the resized task list width", async () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        config: {
          viewMode: "day",
          taskListWidth: 660,
          columns: [
            { key: "name", label: "Task", width: 180, align: "left" },
            { key: "planStart", label: "Plan", width: 90 },
            { key: "progress", label: "Progress", width: 90 }
          ]
        }
      }
    })

    const tableHeadStyle = wrapper.find(".gantt-table-head").attributes("style")
    expect(tableHeadStyle).toContain("width: 660px")
    expect(tableHeadStyle).toContain("330px 165px 165px")

    await wrapper.setProps({
      config: {
        viewMode: "day",
        taskListWidth: 260,
        columns: [
          { key: "name", label: "Task", width: 180, align: "left" },
          { key: "planStart", label: "Plan", width: 90 },
          { key: "progress", label: "Progress", width: 90 }
        ]
      }
    })
    expect(wrapper.find(".gantt-table-head").attributes("style")).toContain("width: 360px")
    expect(wrapper.find(".gantt-table-head").attributes("style")).toContain("180px 90px 90px")
  })

  it("keeps the selected task row highlighted across the table and timeline", async () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        config: { viewMode: "day" }
      }
    })

    await wrapper.findAll(".gantt-row")[1].trigger("click")
    expect(wrapper.findAll(".gantt-row")[1].classes()).toContain("selected")
    expect(wrapper.find(".gantt-timeline-row[data-task-id='task-1']").classes()).toContain("selected")
    expect(wrapper.find(".gantt-plan-bar.task").classes()).not.toContain("selected")
    expect(wrapper.find(".gantt-bar.task").classes()).not.toContain("selected")

    await wrapper.find(".gantt-timeline-row[data-task-id='summary']").trigger("click")
    expect(wrapper.findAll(".gantt-row")[0].classes()).toContain("selected")
    expect(wrapper.findAll(".gantt-row")[1].classes()).not.toContain("selected")
    expect(wrapper.find(".gantt-timeline-row[data-task-id='summary']").classes()).toContain("selected")
  })

  it("updates overdue bar styling while the actual end is being dragged", async () => {
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0)
        return 1
      })
    const cancelAnimationFrame = vi.spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined)
    const wrapper = mount(GanttChart, {
      props: {
        tasks: [{
          id: "drag-overdue",
          name: "Drag overdue",
          type: "task",
          plan: { start: "2026-07-01", end: "2026-07-05" },
          actual: { start: "2026-07-01", end: "2026-07-05", progress: 50 }
        }],
        config: {
          viewMode: "day",
          columnWidth: 30,
          visibleRange: { start: "2026-07-01", end: "2026-07-31" }
        }
      }
    })

    const endHandle = wrapper.find(".gantt-bar.task .gantt-resize.end")
    expect(wrapper.find(".gantt-bar.task").classes()).not.toContain("overdue")
    await endHandle.trigger("pointerdown", { clientX: 150, pointerId: 1 })
    await endHandle.trigger("pointermove", { clientX: 180, pointerId: 1 })
    await nextTick()

    expect(wrapper.find(".gantt-bar.task").classes()).toContain("overdue")
    expect(wrapper.find(".gantt-overdue-segment").attributes("style")).not.toContain("display: none")

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it("applies chart dimensions, row height, and view-specific cell width", () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks,
        config: {
          viewMode: "day",
          width: 840,
          height: 480,
          rowHeight: 52,
          columnWidths: { day: 42 }
        }
      }
    })

    expect(wrapper.find(".gantt-chart").attributes("style")).toContain("width: 840px")
    expect(wrapper.find(".gantt-chart").attributes("style")).toContain("height: 480px")
    expect(wrapper.find(".gantt-row").attributes("style")).toContain("height: 52px")
    expect(wrapper.find(".gantt-tick").attributes("style")).toContain("width: 42px")
  })

  it("keeps the plan top spacing equal to the actual bottom spacing for custom row heights", () => {
    const wrapper = mount(GanttChart, {
      props: {
        tasks: [{ ...tasks[1], parentId: null }],
        config: {
          viewMode: "day",
          rowHeight: 40
        }
      }
    })

    expect(wrapper.find(".gantt-plan-bar.task").attributes("style")).toMatch(/translate\([^,]+, 3px\)/)
    expect(wrapper.find(".gantt-bar.task").attributes("style")).toMatch(/translate\([^,]+, 23px\)/)
    expect(wrapper.find(".gantt-bar.task").attributes("style")).toContain("height: 14px")
  })
})

