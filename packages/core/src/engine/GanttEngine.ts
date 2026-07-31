import type {
  GanttConfig,
  GanttTask,
  GanttLink,
  GanttMarker,
  PatchTask,
  TaskLayout,
  TimeScale,
  FlatTask,
  Result
} from "../types"
import { defaultConfig } from "../types"
import { computeLayout } from "../engines/computeLayout"
import { computeTimeScale } from "../services/computeTimeScale"
import { flattenTasks } from "../services/flattenTasks"
import { toDate, diffDays, addDays } from "../utils/date"

/**
 * 把扁平的 PatchTask 合并回嵌套的 GanttTask。
 * PatchTask 用 planStart/planEnd/actualStart/actualEnd 表示日期，
 * GanttTask 用 plan.start/end、actual.start/end 嵌套表示——这是组件层
 * 和数据层之间的桥，本该在引擎层而不是散落在各 demo 里。
 */
export function mergeTaskPatch(task: GanttTask, patch: PatchTask): GanttTask {
  return {
    ...task,
    ...patch,
    plan: {
      ...task.plan,
      start: patch.planStart ?? task.plan.start,
      end: patch.planEnd ?? task.plan.end,
      progress: patch.progress ?? task.plan.progress
    },
    actual: {
      ...task.actual,
      start: patch.actualStart ?? task.actual.start,
      end: patch.actualEnd ?? task.actual.end,
      progress: patch.progress ?? task.actual.progress
    },
    custom: patch.custom ? { ...task.custom, ...patch.custom } : task.custom
  }
}

export interface GanttEngineOptions {
  tasks?: GanttTask[]
  links?: GanttLink[]
  config?: Partial<GanttConfig>
  /** 滚动容器元素；命令式视口 API（scrollToDate / zoomToFit）需要它。纯计算场景可不传。 */
  container?: HTMLElement | null
  /** 初始折叠的任务 id */
  collapsedIds?: Iterable<string>
  /** 里程碑标记 */
  markers?: GanttMarker[]
}

export type GanttEngineEvent =
  | "ready"
  | "taskschange"
  | "taskchange"
  | "taskcreate"
  | "taskdelete"
  | "linkschange"
  | "configchange"
  | "collapsechange"
  | "previewchange"
  | "markerschange"
  | "destroy"

type Listener = (...args: unknown[]) => void

/** 命令式甘特图引擎。框架无关，可被 Vue/React/原生 各自的薄壳组件驱动。 */
export class GanttEngine {
  private tasks: GanttTask[]
  private links: GanttLink[]
  private config: GanttConfig
  private readonly container: HTMLElement | null
  private collapsedIds: Set<string>
  private dragPreview: { taskId: string; patch: PatchTask; affected?: Record<string, PatchTask> } | null = null
  private markers: GanttMarker[]
  private readonly listeners: Map<GanttEngineEvent, Set<Listener>>
  private destroyed = false

  constructor(options: GanttEngineOptions = {}) {
    this.tasks = options.tasks ? options.tasks.map((task) => ({ ...task })) : []
    this.links = options.links ? options.links.map((link) => ({ ...link })) : []
    this.config = { ...defaultConfig, ...options.config }
    this.container = options.container ?? null
    this.collapsedIds = new Set(options.collapsedIds ?? [])
    this.markers = options.markers ? options.markers.map((marker) => ({ ...marker })) : []
    this.listeners = new Map()
    // 异步发 ready，确保订阅者能在构造后、首次 emit 前注册
    queueMicrotask(() => this.emit("ready"))
  }

  // ── 状态查询 ──
  getTasks(): GanttTask[] {
    return this.tasks.map((task) => ({ ...task }))
  }
  getLinks(): GanttLink[] {
    return this.links.map((link) => ({ ...link }))
  }
  getMarkers(): GanttMarker[] {
    return this.markers.map((marker) => ({ ...marker }))
  }
  getConfig(): GanttConfig {
    return { ...this.config }
  }
  getTask(id: string): GanttTask | undefined {
    const task = this.tasks.find((item) => item.id === id)
    return task ? { ...task } : undefined
  }
  getCollapsedIds(): string[] {
    return Array.from(this.collapsedIds)
  }
  isDestroyed(): boolean {
    return this.destroyed
  }

  // ── 命令式变更（均触发对应事件） ──
  setTasks(tasks: GanttTask[]): void {
    this.assertNotDestroyed()
    this.tasks = tasks.map((task) => ({ ...task }))
    this.emit("taskschange", this.getTasks())
  }
  setLinks(links: GanttLink[]): void {
    this.assertNotDestroyed()
    this.links = links.map((link) => ({ ...link }))
    this.emit("linkschange", this.getLinks())
  }
  setMarkers(markers: GanttMarker[]): void {
    this.assertNotDestroyed()
    this.markers = markers.map((marker) => ({ ...marker }))
    this.emit("markerschange", this.getMarkers())
  }
  /** 合并配置 patch，等价于 setConfig(mergeConfig(patch)) */
  mergeConfig(patch: Partial<GanttConfig>): void {
    this.assertNotDestroyed()
    this.config = { ...this.config, ...patch }
    this.emit("configchange", this.getConfig())
  }
  setConfig(config: Partial<GanttConfig>): void {
    this.mergeConfig(config)
  }
  /** 用 mergeTaskPatch 把扁平 patch 合并回嵌套结构后更新单个任务 */
  setTask(id: string, patch: PatchTask): void {
    this.assertNotDestroyed()
    const target = this.tasks.find((task) => task.id === id)
    if (!target) {
      return
    }
    const updated = mergeTaskPatch(target, patch)
    this.tasks = this.tasks.map((task) => (task.id === id ? updated : task))
    this.emit("taskchange", id, patch, { ...updated })
  }
  addTask(task: GanttTask): void {
    this.assertNotDestroyed()
    this.tasks = [...this.tasks, { ...task }]
    this.emit("taskcreate", { ...task })
  }
  removeTask(id: string): void {
    this.assertNotDestroyed()
    const removed = this.tasks.find((task) => task.id === id)
    if (!removed) return
    this.tasks = this.tasks.filter((task) => task.id !== id)
    this.collapsedIds.delete(id)
    this.emit("taskdelete", id)
  }
  collapse(id: string, collapsed = true): void {
    this.assertNotDestroyed()
    if (collapsed) this.collapsedIds.add(id)
    else this.collapsedIds.delete(id)
    this.emit("collapsechange", this.getCollapsedIds())
  }
  toggleCollapse(id: string): void {
    this.collapse(id, !this.collapsedIds.has(id))
  }
  /** 批量折叠/展开多个任务（如"折叠全部分组"） */
  setCollapsed(ids: string[], collapsed = true): void {
    this.assertNotDestroyed()
    const next = new Set(this.collapsedIds)
    for (const id of ids) {
      if (collapsed) {
        next.add(id)
      } else {
        next.delete(id)
      }
    }
    this.collapsedIds = next
    this.emit("collapsechange", this.getCollapsedIds())
  }

  // ── 拖拽预览（交互态源；组件写入迁移到 engine，dateRange 可据此扩展） ──
  setPreview(preview: { taskId: string; patch: PatchTask; affected?: Record<string, PatchTask> }): void {
    this.assertNotDestroyed()
    this.dragPreview = {
      taskId: preview.taskId,
      patch: { ...preview.patch },
      affected: preview.affected ? { ...preview.affected } : undefined
    }
    this.emit("previewchange", this.getPreview())
  }
  clearPreview(): void {
    if (!this.dragPreview) {
      return
    }
    this.dragPreview = null
    this.emit("previewchange", null)
  }
  getPreview(): { taskId: string; patch: PatchTask; affected?: Record<string, PatchTask> } | null {
    if (!this.dragPreview) {
      return null
    }
    return {
      taskId: this.dragPreview.taskId,
      patch: { ...this.dragPreview.patch },
      affected: this.dragPreview.affected ? { ...this.dragPreview.affected } : undefined
    }
  }

  // ── 计算（delegate 到 core 纯函数） ──
  /** 数据真实日期范围（未含 viewport pad） */
  getDateRange(): { start: Date; end: Date } {
    const dates: Date[] = []
    for (const task of this.tasks) {
      dates.push(
        toDate(task.plan.start),
        toDate(task.plan.end),
        toDate(task.actual.start),
        toDate(task.actual.end)
      )
    }
    for (const marker of this.markers) {
      dates.push(toDate(marker.date))
    }
    // 合并拖拽预览：用 mergeTaskPatch 算 patch 后日期扩范围（只扩不缩）
    const preview = this.dragPreview
    if (preview) {
      const ids = [preview.taskId, ...Object.keys(preview.affected ?? {})]
      for (const id of ids) {
        const task = this.tasks.find((item) => item.id === id)
        if (!task) {
          continue
        }
        const patch = preview.taskId === id ? preview.patch : preview.affected?.[id]
        if (!patch) {
          continue
        }
        const merged = mergeTaskPatch(task, patch)
        dates.push(
          toDate(merged.plan.start),
          toDate(merged.plan.end),
          toDate(merged.actual.start),
          toDate(merged.actual.end)
        )
      }
    }
    if (!dates.length) {
      const today = toDate(new Date())
      return { start: today, end: addDays(today, 30) }
    }
    return {
      start: new Date(Math.min(...dates.map((d) => d.getTime()))),
      end: new Date(Math.max(...dates.map((d) => d.getTime())))
    }
  }
  getTimeScale(): TimeScale[] {
    const range = this.getDateRange()
    return computeTimeScale(
      range.start,
      range.end,
      this.config.viewMode,
      this.config.columnWidth,
      this.config.firstDayOfWeek
    )
  }
  getLayout(): Result<TaskLayout[]> {
    return computeLayout(
      this.tasks,
      this.links,
      this.config,
      this.collapsedIds
    )
  }
  getFlatTasks(): FlatTask[] {
    return flattenTasks(this.tasks, this.collapsedIds)
  }
  getTotalWidth(): number {
    return this.getTimeScale().reduce((sum, tick) => sum + tick.width, 0)
  }
  getTotalHeight(): number {
    const rows = this.getFlatTasks().length
    return this.config.headerHeight + rows * this.config.rowHeight
  }

  // ── 视口命令（需要 container） ──
  getScrollLeft(): number {
    return this.container?.scrollLeft ?? 0
  }
  setScrollLeft(px: number): void {
    if (!this.container) return
    const max = Math.max(0, this.container.scrollWidth - this.container.clientWidth)
    this.container.scrollLeft = Math.max(0, Math.min(max, px))
  }
  /** 把当前 scrollLeft 限制到 [0, maxScrollLeft]。
   *  拖拽预览收缩（松手/取消）后 timeline 总宽度变小，scrollLeft 可能超出新边界，
   *  导致 canvas translate 超出内容区、右侧网格未覆盖。此时调用本方法防超界。 */
  clampScrollLeft(): void {
    if (!this.container) return
    const max = Math.max(0, this.container.scrollWidth - this.container.clientWidth)
    if (this.container.scrollLeft > max) {
      this.container.scrollLeft = max
    }
  }
  getScrollTop(): number {
    return this.container?.scrollTop ?? 0
  }
  setScrollTop(px: number): void {
    if (!this.container) return
    const max = Math.max(0, this.container.scrollHeight - this.container.clientHeight)
    this.container.scrollTop = Math.max(0, Math.min(max, px))
  }
  /** 滚动到包含目标日期的 tick 列（跨 viewMode 精确） */
  scrollToDate(date: string | Date): void {
    if (!this.container) return
    const target = toDate(date)
    const scale = this.getTimeScale()
    const tick = scale.find((t) => target >= t.start && target <= t.end)
    const left = tick ? tick.left : diffDays(this.getDateRange().start, target) * this.config.columnWidth
    this.setScrollLeft(left)
  }
  scrollToTask(id: string): void {
    const layout = this.getLayout()
    if (!layout.ok) return
    const item = layout.data.find((row) => row.taskId === id)
    if (item) this.setScrollLeft(item.left)
  }
  scrollToStart(): void {
    this.setScrollLeft(0)
  }
  scrollToEnd(): void {
    if (!this.container) return
    this.setScrollLeft(this.getTotalWidth())
  }
  /** 让整个 timeline 总宽度≈视口宽度（调 columnWidth） */
  zoomToFit(padding = 1): void {
    if (!this.container) return
    const spanDays = Math.max(1, diffDays(this.getDateRange().start, this.getDateRange().end) + 1)
    const target = (this.container.clientWidth * padding) / spanDays
    this.mergeConfig({ columnWidth: this.clampColumnWidth(target) })
  }
  /** 让指定日期范围占满视口宽度（调 columnWidth） */
  zoomToRange(start: string | Date, end: string | Date): void {
    if (!this.container) return
    const span = Math.max(1, diffDays(start, end) + 1)
    const target = this.container.clientWidth / span
    this.mergeConfig({ columnWidth: this.clampColumnWidth(target) })
  }
  private clampColumnWidth(value: number): number {
    return Math.max(4, Math.min(400, Math.round(value)))
  }

  // ── 事件订阅 ──
  on(event: GanttEngineEvent, fn: Listener): () => void {
    this.assertNotDestroyed()
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(fn)
    return () => {
      const current = this.listeners.get(event)
      if (current) {
        current.delete(fn)
        if (!current.size) this.listeners.delete(event)
      }
    }
  }
  once(event: GanttEngineEvent, fn: Listener): () => void {
    const off = this.on(event, (...args: unknown[]) => {
      off()
      fn(...args)
    })
    return off
  }
  off(event: GanttEngineEvent, fn?: Listener): void {
    const set = this.listeners.get(event)
    if (!set) return
    if (fn) {
      set.delete(fn)
      if (!set.size) this.listeners.delete(event)
    } else {
      this.listeners.delete(event)
    }
  }
  emit(event: GanttEngineEvent, ...args: unknown[]): void {
    const set = this.listeners.get(event)
    if (!set) return
    // 复制遍历，避免回调中增删导致迭代错乱
    for (const fn of Array.from(set)) {
      try {
        fn(...args)
      } catch (error) {
        // 单个监听器抛错不应打断其他监听器
        if (typeof console !== "undefined") {
          console.error(`[GanttEngine] listener for "${event}" threw`, error)
        }
      }
    }
  }

  // ── 生命周期 ──
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.emit("destroy")
    this.listeners.clear()
    this.tasks = []
    this.links = []
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error("GanttEngine: operation on destroyed instance")
    }
  }
}

/** 工厂函数，对应成熟做法的 new GanttEngine(container, config) 入口 */
export function createGanttEngine(options: GanttEngineOptions = {}): GanttEngine {
  return new GanttEngine(options)
}
