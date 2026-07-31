import { describe, expect, it, vi } from "vitest"
import {
  createGanttEngine,
  GanttEngine,
  mergeTaskPatch,
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

const taskA: GanttTask = {
  id: "a",
  name: "Design",
  type: "task",
  plan: { start: "2026-07-01", end: "2026-07-05", progress: 100 },
  actual: { start: "2026-07-01", end: "2026-07-05", progress: 100 }
}

const taskB: GanttTask = {
  id: "b",
  name: "Build",
  type: "task",
  plan: { start: "2026-07-06", end: "2026-07-12", progress: 50 },
  actual: { start: "2026-07-06", end: "2026-07-12", progress: 50 }
}

function makeEngine(options?: ConstructorParameters<typeof GanttEngine>[0]) {
  return createGanttEngine({ tasks: [taskA, taskB], config: baseConfig, ...options })
}

describe("mergeTaskPatch", () => {
  it("把扁平 patch 合并回嵌套 plan/actual，未给字段保留原值", () => {
    const merged = mergeTaskPatch(taskA, { actualEnd: "2026-07-08", progress: 80 })
    expect(merged.actual.end).toBe("2026-07-08")
    expect(merged.actual.progress).toBe(80)
    expect(merged.actual.start).toBe("2026-07-01") // 未给保留原值
    expect(merged.plan.end).toBe("2026-07-05") // plan 不受 actual 字段影响
  })

  it("custom 字段做浅合并而非整体覆盖", () => {
    const task = { ...taskA, custom: { priority: "high", risk: "中" } }
    const merged = mergeTaskPatch(task, { custom: { risk: "高" } })
    expect(merged.custom?.priority).toBe("high")
    expect(merged.custom?.risk).toBe("高")
  })
})

describe("GanttEngine 构造与状态查询", () => {
  it("构造后内部存副本，外部改动不影响引擎", () => {
    const original = [taskA]
    const engine = makeEngine({ tasks: original, config: baseConfig })
    original.push(taskB)
    expect(engine.getTasks()).toHaveLength(1)
  })

  it("getTask 返回副本", () => {
    const engine = makeEngine()
    const got = engine.getTask("a")!
    got.name = "mutated"
    expect(engine.getTask("a")?.name).toBe("Design")
  })

  it("ready 事件异步触发一次", async () => {
    const onReady = vi.fn()
    const engine = makeEngine()
    engine.on("ready", onReady)
    await new Promise((r) => setTimeout(r, 0))
    expect(onReady).toHaveBeenCalledTimes(1)
  })
})

describe("GanttEngine 命令式变更与事件", () => {
  it("setTasks 触发 taskschange 并更新", () => {
    const engine = makeEngine()
    const spy = vi.fn()
    engine.on("taskschange", spy)
    engine.setTasks([taskA])
    expect(engine.getTasks()).toHaveLength(1)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toHaveLength(1)
  })

  it("setTask 用 mergeTaskPatch 合并嵌套字段并触发 taskchange(id, patch, merged)", () => {
    const engine = makeEngine()
    const spy = vi.fn()
    engine.on("taskchange", spy)
    engine.setTask("a", { actualEnd: "2026-07-10", progress: 70 })
    const updated = engine.getTask("a")!
    expect(updated.actual.end).toBe("2026-07-10")
    expect(updated.actual.progress).toBe(70)
    expect(updated.actual.start).toBe("2026-07-01")
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe("a")
    expect(spy.mock.calls[0][1]).toMatchObject({ actualEnd: "2026-07-10", progress: 70 })
    expect(spy.mock.calls[0][2].actual.end).toBe("2026-07-10")
  })

  it("setTask 对不存在的 id 静默不触发事件", () => {
    const engine = makeEngine()
    const spy = vi.fn()
    engine.on("taskchange", spy)
    engine.setTask("nope", { progress: 10 })
    expect(spy).not.toHaveBeenCalled()
  })

  it("addTask / removeTask 触发对应事件", () => {
    const engine = makeEngine()
    const onCreate = vi.fn()
    const onDelete = vi.fn()
    engine.on("taskcreate", onCreate)
    engine.on("taskdelete", onDelete)
    engine.addTask({ ...taskB, id: "c" })
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(engine.getTasks()).toHaveLength(3)
    engine.removeTask("c")
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(engine.getTasks()).toHaveLength(2)
  })

  it("removeTask 不存在的 id 不触发事件", () => {
    const engine = makeEngine()
    const spy = vi.fn()
    engine.on("taskdelete", spy)
    engine.removeTask("nope")
    expect(spy).not.toHaveBeenCalled()
  })

  it("mergeConfig / setConfig 触发 configchange", () => {
    const engine = makeEngine()
    const spy = vi.fn()
    engine.on("configchange", spy)
    engine.mergeConfig({ columnWidth: 60 })
    expect(engine.getConfig().columnWidth).toBe(60)
    expect(spy).toHaveBeenCalledTimes(1)
    engine.setConfig({ rowHeight: 50 })
    expect(engine.getConfig().rowHeight).toBe(50)
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

describe("GanttEngine 事件订阅语义", () => {
  it("on 返回的 unsubscribe 调一次即移除", () => {
    const engine = makeEngine()
    const fn = vi.fn()
    const off = engine.on("taskchange", fn)
    engine.setTask("a", { progress: 10 })
    expect(fn).toHaveBeenCalledTimes(1)
    off()
    engine.setTask("a", { progress: 20 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("once 只触发一次", () => {
    const engine = makeEngine()
    const fn = vi.fn()
    engine.once("taskchange", fn)
    engine.setTask("a", { progress: 10 })
    engine.setTask("a", { progress: 20 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("off(event) 移除该事件全部监听器", () => {
    const engine = makeEngine()
    const a = vi.fn()
    const b = vi.fn()
    engine.on("taskchange", a)
    engine.on("taskchange", b)
    engine.off("taskchange")
    engine.setTask("a", { progress: 10 })
    expect(a).not.toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()
  })

  it("一个监听器抛错不阻断其他监听器", () => {
    const engine = makeEngine()
    const good = vi.fn()
    engine.on("taskchange", () => {
      throw new Error("boom")
    })
    engine.on("taskchange", good)
    engine.setTask("a", { progress: 10 })
    expect(good).toHaveBeenCalledTimes(1)
  })
})

describe("GanttEngine 计算 API（delegate 纯函数）", () => {
  it("getDateRange 从任务日期算 min/max", () => {
    const engine = makeEngine()
    const range = engine.getDateRange()
    expect(range.start.getTime()).toBe(new Date(2026, 6, 1).getTime())
    expect(range.end.getTime()).toBe(new Date(2026, 6, 12).getTime())
  })

  it("getTimeScale 返回非空刻度且 left 单调递增", () => {
    const engine = makeEngine()
    const scale = engine.getTimeScale()
    expect(scale.length).toBeGreaterThan(0)
    for (let i = 1; i < scale.length; i += 1) {
      expect(scale[i].left).toBeGreaterThanOrEqual(scale[i - 1].left)
    }
  })

  it("getTotalWidth 等于 scale 各 tick.width 之和", () => {
    const engine = makeEngine()
    const sum = engine.getTimeScale().reduce((s, t) => s + t.width, 0)
    expect(engine.getTotalWidth()).toBe(sum)
  })

  it("getLayout 返回每个任务的行布局", () => {
    const engine = makeEngine()
    const result = engine.getLayout()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toHaveLength(2)
      expect(result.data[0].taskId).toBe("a")
      expect(result.data[1].taskId).toBe("b")
    }
  })
})

describe("GanttEngine 视口命令（需 container）", () => {
  function makeContainer(width: number, scrollWidth: number): HTMLElement {
    const el = {
      scrollLeft: 0,
      scrollTop: 0,
      scrollWidth,
      scrollHeight: 1000,
      clientWidth: width,
      clientHeight: 400
    } as unknown as HTMLElement
    return el
  }

  it("无 container 时视口命令 no-op 不报错", () => {
    const engine = makeEngine()
    expect(() => engine.scrollToDate("2026-07-05")).not.toThrow()
    expect(engine.getScrollLeft()).toBe(0)
  })

  it("scrollToDate 调整 container.scrollLeft 到包含该日期的 tick", () => {
    const container = makeContainer(400, 2000)
    const engine = makeEngine({ container, config: baseConfig })
    engine.scrollToDate("2026-07-08")
    expect(container.scrollLeft).toBeGreaterThan(0)
    // 2026-07-08 距离 start(07-01) 7 天 × 40 = 280
    expect(container.scrollLeft).toBeGreaterThanOrEqual(200)
  })

  it("setScrollLeft 做边界 clamp（不超 scrollWidth-clientWidth）", () => {
    const container = makeContainer(400, 1000)
    const engine = makeEngine({ container, config: baseConfig })
    engine.setScrollLeft(99999)
    expect(container.scrollLeft).toBe(600) // 1000 - 400
    engine.setScrollLeft(-50)
    expect(container.scrollLeft).toBe(0)
  })

  it("clampScrollLeft 把超界 scrollLeft 限制到 maxScrollLeft", () => {
    const container = makeContainer(400, 1000)
    const engine = makeEngine({ container, config: baseConfig })
    container.scrollLeft = 999
    engine.clampScrollLeft()
    expect(container.scrollLeft).toBe(600)
    container.scrollLeft = 200
    engine.clampScrollLeft()
    expect(container.scrollLeft).toBe(200)
  })

  it("zoomToFit 调整 columnWidth 使 totalWidth≈clientWidth", () => {
    const container = makeContainer(480, 9999)
    const engine = makeEngine({ container, config: baseConfig })
    engine.zoomToFit()
    // 跨度 12 天，480/12 ≈ 40，clamp 后约 40
    expect(engine.getConfig().columnWidth).toBeGreaterThanOrEqual(38)
    expect(engine.getConfig().columnWidth).toBeLessThanOrEqual(42)
  })
})

describe("GanttEngine 折叠", () => {
  it("collapse / toggleCollapse 触发 collapsechange 并更新集合", () => {
    const engine = makeEngine()
    const spy = vi.fn()
    engine.on("collapsechange", spy)
    engine.collapse("a")
    expect(engine.getCollapsedIds()).toContain("a")
    expect(spy).toHaveBeenCalledTimes(1)
    engine.toggleCollapse("a")
    expect(engine.getCollapsedIds()).not.toContain("a")
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it("setCollapsed 批量折叠/展开多个 id", () => {
    const engine = makeEngine()
    const spy = vi.fn()
    engine.on("collapsechange", spy)
    engine.setCollapsed(["a", "b"], true)
    expect(engine.getCollapsedIds()).toEqual(expect.arrayContaining(["a", "b"]))
    expect(spy).toHaveBeenCalledTimes(1)
    engine.setCollapsed(["a"], true)
    expect(engine.getCollapsedIds()).toEqual(expect.arrayContaining(["a", "b"]))
    engine.setCollapsed(["a", "b"], false)
    expect(engine.getCollapsedIds()).toHaveLength(0)
  })
})

describe("GanttEngine 拖拽预览", () => {
  it("setPreview/clearPreview 触发 previewchange 并更新 getPreview", () => {
    const engine = makeEngine()
    const spy = vi.fn()
    engine.on("previewchange", spy)
    engine.setPreview({ taskId: "a", patch: { actualEnd: "2026-07-10" } })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(engine.getPreview()?.taskId).toBe("a")
    expect(engine.getPreview()?.patch.actualEnd).toBe("2026-07-10")
    engine.clearPreview()
    expect(spy).toHaveBeenCalledTimes(2)
    expect(engine.getPreview()).toBeNull()
  })

  it("getPreview 返回副本，外部修改不影响内部", () => {
    const engine = makeEngine()
    engine.setPreview({ taskId: "a", patch: { progress: 50 } })
    const preview = engine.getPreview()!
    preview.patch.progress = 99
    expect(engine.getPreview()?.patch.progress).toBe(50)
  })

  it("clearPreview 无 preview 时不触发事件", () => {
    const engine = makeEngine()
    const spy = vi.fn()
    engine.on("previewchange", spy)
    engine.clearPreview()
    expect(spy).not.toHaveBeenCalled()
  })

  it("setPreview 后 getDateRange 用 patch 后日期扩范围", () => {
    const engine = makeEngine()
    const base = engine.getDateRange()
    engine.setPreview({ taskId: "b", patch: { actualEnd: "2026-08-20" } })
    const extended = engine.getDateRange()
    expect(extended.end.getTime()).toBeGreaterThan(base.end.getTime())
    expect(extended.end.getTime()).toBe(new Date(2026, 7, 20).getTime())
  })

  it("setMarkers 扩展 getDateRange + 触发 markerschange", () => {
    const engine = makeEngine()
    const spy = vi.fn()
    engine.on("markerschange", spy)
    engine.setMarkers([{ id: "m1", name: "里程碑", date: "2026-09-15", color: "#f00" }])
    expect(spy).toHaveBeenCalledTimes(1)
    const range = engine.getDateRange()
    expect(range.end.getTime()).toBe(new Date(2026, 8, 15).getTime())
  })
})

describe("GanttEngine 生命周期", () => {
  it("destroy 后 isDestroyed 为真、listeners 清空", () => {
    const engine = makeEngine()
    const spy = vi.fn()
    engine.on("destroy", spy)
    engine.destroy()
    expect(engine.isDestroyed()).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("destroy 后调用变更 API 抛错", () => {
    const engine = makeEngine()
    engine.destroy()
    expect(() => engine.setTasks([taskA])).toThrow(/destroyed/)
    expect(() => engine.setTask("a", { progress: 10 })).toThrow(/destroyed/)
    expect(() => engine.mergeConfig({ columnWidth: 50 })).toThrow(/destroyed/)
  })

  it("destroy 可重复调用不报错", () => {
    const engine = makeEngine()
    engine.destroy()
    expect(() => engine.destroy()).not.toThrow()
  })
})
