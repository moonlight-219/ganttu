import {
  createApp,
  defineComponent,
  h,
  shallowRef,
  type App
} from "vue"
import type {
  GanttConfig,
  GanttEngine,
  GanttLink,
  GanttMarker,
  GanttTask,
  PatchTask
} from "ct-gantt-core"
import GanttChart from "./components/GanttChart.vue"
import type {
  GanttChartExpose,
  GanttExportImageOptions,
  GanttLinkRejection,
  GanttMarkerEditRequest,
  GanttTaskEditRequest
} from "./types"

export type GanttContainer = string | HTMLElement

export interface CreateGanttOptions {
  tasks?: GanttTask[]
  links?: GanttLink[]
  markers?: GanttMarker[]
  config?: Partial<GanttConfig>
  width?: string | number
  height?: string | number
  onTaskChange?: (id: string, patch: PatchTask) => void
  onTaskCreate?: (task: GanttTask) => void
  onTaskDelete?: (id: string) => void
  onTaskEditRequest?: (request: GanttTaskEditRequest) => void
  onMarkerCreate?: (marker: GanttMarker) => void
  onMarkerChange?: (id: string, marker: GanttMarker) => void
  onMarkerDelete?: (id: string) => void
  onMarkerEditRequest?: (request: GanttMarkerEditRequest) => void
  onLinkChange?: (links: GanttLink[]) => void
  onLinkRejected?: (rejection: GanttLinkRejection) => void
}

export interface GanttInstance {
  getContainer: () => HTMLElement
  getTasks: () => GanttTask[]
  getLinks: () => GanttLink[]
  getMarkers: () => GanttMarker[]
  getConfig: () => Partial<GanttConfig>
  getEngine: () => GanttEngine | null
  setTasks: (tasks: GanttTask[]) => void
  setLinks: (links: GanttLink[]) => void
  setMarkers: (markers: GanttMarker[]) => void
  setConfig: (config: Partial<GanttConfig>) => void
  setSize: (width?: string | number, height?: string | number) => void
  setTask: (id: string, patch: PatchTask) => void
  addTask: (task: GanttTask) => void
  removeTask: (id: string) => void
  scrollToDate: (date: string | Date) => void
  scrollToTask: (id: string) => void
  zoomToFit: (padding?: number) => void
  exportImage: (options?: GanttExportImageOptions) => Promise<string>
  enterFullscreen: () => Promise<void>
  exitFullscreen: () => Promise<void>
  toggleFullscreen: () => Promise<void>
  openCreateTask: (type?: GanttTask["type"]) => void
  openCreateMarker: () => void
  isDestroyed: () => boolean
  destroy: () => void
}

const mountedInstances = new WeakMap<HTMLElement, GanttInstance>()

function resolveContainer(target: GanttContainer): HTMLElement {
  if (typeof target !== "string") {
    return target
  }
  const container = document.querySelector<HTMLElement>(target)
  if (!container) {
    throw new Error(`Gantt container not found: ${target}`)
  }
  return container
}

function cloneTasks(tasks: GanttTask[]): GanttTask[] {
  return tasks.map((task) => ({
    ...task,
    plan: { ...task.plan },
    actual: { ...task.actual },
    custom: task.custom ? { ...task.custom } : undefined
  }))
}

function applyTaskPatch(task: GanttTask, patch: PatchTask): GanttTask {
  const {
    planStart,
    planEnd,
    actualStart,
    actualEnd,
    progress,
    custom,
    ...taskFields
  } = patch
  return {
    ...task,
    ...taskFields,
    plan: {
      ...task.plan,
      start: planStart ?? task.plan.start,
      end: planEnd ?? task.plan.end
    },
    actual: {
      ...task.actual,
      start: actualStart ?? task.actual.start,
      end: actualEnd ?? task.actual.end,
      progress: progress ?? task.actual.progress
    },
    custom: custom ? { ...task.custom, ...custom } : task.custom
  }
}

export function createGantt(target: GanttContainer, options: CreateGanttOptions = {}): GanttInstance {
  if (typeof document === "undefined") {
    throw new Error("createGantt() requires a browser DOM environment")
  }

  const container = resolveContainer(target)
  const activeInstance = mountedInstances.get(container)
  if (activeInstance && !activeInstance.isDestroyed()) {
    throw new Error("A Gantt instance is already mounted in this container")
  }

  const tasks = shallowRef(cloneTasks(options.tasks ?? []))
  const links = shallowRef((options.links ?? []).map((link) => ({ ...link })))
  const markers = shallowRef((options.markers ?? []).map((marker) => ({ ...marker })))
  const config = shallowRef<Partial<GanttConfig>>({ ...options.config })
  const width = shallowRef(options.width)
  const height = shallowRef(options.height)
  const chartRef = shallowRef<GanttChartExpose | null>(null)
  const mountRoot = document.createElement("div")
  mountRoot.className = "ct-gantt-native-root"
  mountRoot.style.width = "100%"
  mountRoot.style.height = "100%"
  container.replaceChildren(mountRoot)

  let destroyed = false
  let app: App<Element> | null = null

  const setTask = (id: string, patch: PatchTask) => {
    tasks.value = tasks.value.map((task) => task.id === id ? applyTaskPatch(task, patch) : task)
  }

  const NativeGanttRoot = defineComponent({
    name: "NativeGanttRoot",
    setup() {
      return () => h(GanttChart, {
        ref: (value: unknown) => {
          chartRef.value = value as GanttChartExpose | null
        },
        tasks: tasks.value,
        links: links.value,
        markers: markers.value,
        config: config.value,
        width: width.value,
        height: height.value,
        onTaskChange: (id: string, patch: PatchTask) => {
          setTask(id, patch)
          options.onTaskChange?.(id, patch)
        },
        onTaskCreate: (task: GanttTask) => {
          tasks.value = [...tasks.value, task]
          options.onTaskCreate?.(task)
        },
        onTaskDelete: (id: string) => {
          tasks.value = tasks.value.filter((task) => task.id !== id)
          options.onTaskDelete?.(id)
        },
        onTaskEditRequest: options.onTaskEditRequest,
        onMarkerCreate: (marker: GanttMarker) => {
          markers.value = [...markers.value, marker]
          options.onMarkerCreate?.(marker)
        },
        onMarkerChange: (id: string, marker: GanttMarker) => {
          markers.value = markers.value.map((item) => item.id === id ? marker : item)
          options.onMarkerChange?.(id, marker)
        },
        onMarkerDelete: (id: string) => {
          markers.value = markers.value.filter((marker) => marker.id !== id)
          options.onMarkerDelete?.(id)
        },
        onMarkerEditRequest: options.onMarkerEditRequest,
        onLinkChange: (nextLinks: GanttLink[]) => {
          links.value = nextLinks.map((link) => ({ ...link }))
          options.onLinkChange?.(nextLinks)
        },
        onLinkRejected: options.onLinkRejected
      })
    }
  })

  function requireChart(): GanttChartExpose {
    if (destroyed || !chartRef.value) {
      throw new Error("The Gantt instance has been destroyed")
    }
    return chartRef.value
  }

  const instance: GanttInstance = {
    getContainer: () => container,
    getTasks: () => cloneTasks(tasks.value),
    getLinks: () => links.value.map((link) => ({ ...link })),
    getMarkers: () => markers.value.map((marker) => ({ ...marker })),
    getConfig: () => ({ ...config.value }),
    getEngine: () => destroyed ? null : chartRef.value?.getEngine() ?? null,
    setTasks: (nextTasks) => {
      tasks.value = cloneTasks(nextTasks)
    },
    setLinks: (nextLinks) => {
      links.value = nextLinks.map((link) => ({ ...link }))
    },
    setMarkers: (nextMarkers) => {
      markers.value = nextMarkers.map((marker) => ({ ...marker }))
    },
    setConfig: (nextConfig) => {
      config.value = { ...config.value, ...nextConfig }
    },
    setSize: (nextWidth, nextHeight) => {
      width.value = nextWidth
      height.value = nextHeight
    },
    setTask,
    addTask: (task) => {
      tasks.value = [...tasks.value, cloneTasks([task])[0]!]
    },
    removeTask: (id) => {
      tasks.value = tasks.value.filter((task) => task.id !== id)
    },
    scrollToDate: (date) => chartRef.value?.getEngine()?.scrollToDate(date),
    scrollToTask: (id) => chartRef.value?.getEngine()?.scrollToTask(id),
    zoomToFit: (padding) => {
      const engine = chartRef.value?.getEngine()
      if (!engine) return
      engine.zoomToFit(padding)
      config.value = { ...config.value, columnWidth: engine.getConfig().columnWidth }
    },
    exportImage: (exportOptions) => requireChart().exportImage(exportOptions),
    enterFullscreen: () => requireChart().enterFullscreen(),
    exitFullscreen: () => requireChart().exitFullscreen(),
    toggleFullscreen: () => requireChart().toggleFullscreen(),
    openCreateTask: (type) => requireChart().openCreateTask(type),
    openCreateMarker: () => requireChart().openCreateMarker(),
    isDestroyed: () => destroyed,
    destroy: () => {
      if (destroyed) return
      destroyed = true
      app?.unmount()
      app = null
      chartRef.value = null
      mountRoot.remove()
      mountedInstances.delete(container)
    }
  }

  app = createApp(NativeGanttRoot)
  app.mount(mountRoot)
  mountedInstances.set(container, instance)
  return instance
}
