export type ViewMode = "day" | "week" | "month" | "quarter" | "year"

export type LinkType = "FS" | "SS" | "FF" | "SF"
export type LagUnit = "calendar" | "working"

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: GanttError }

export interface GanttError {
  code:
    | "CYCLE_DEPENDENCY"
    | "INVALID_DATE"
    | "MISSING_TASK"
    | "ORPHAN_DEPENDENCY"
    | "INVALID_DEPENDENCY"
  message: string
  details?: unknown
}

export interface DateRange {
  start: string | Date
  end: string | Date
  progress?: number
}

export interface Dependency {
  id?: string
  predecessorId: string
  type: LinkType
  lag: number
  lagUnit: LagUnit
}

export interface GanttTask {
  id: string
  name: string
  type: "task" | "milestone" | "summary"
  plan: DateRange
  actual: Required<DateRange>
  dependencies?: Dependency[]
  parentId?: string | null
  color?: string
  calendarId?: string
  resources?: string[]
  segments?: Array<{ start: string | Date; end: string | Date }>
  constraint?: {
    type: "SNET" | "SNLT" | "MSO" | "MFO" | "ASAP" | "ALAP"
    date?: string | Date
  }
  schedulingMode?: "auto" | "manual"
  duration?: number
}

export interface GanttMarker {
  id: string
  name: string
  date: string | Date
  color?: string
}

export interface CustomColumn {
  key: string
  label: string
  width?: number
  render?: (task: GanttTask) => { text: string; className?: string }
}

export interface GanttConfig {
  viewMode: ViewMode
  rowHeight: number
  columnWidth: number
  headerHeight: number
  taskListWidth: number
  locale: string
  firstDayOfWeek: 0 | 1
  dateFormat: string
  customColumns?: CustomColumn[]
  theme?: "light" | "dark" | string
  visibleRange?: {
    start: string | Date
    end: string | Date
  }
  showPlanBar?: boolean
  editablePlan?: boolean
  enableLinkCreation?: boolean
  virtualScroll?: boolean
  taskColors?: {
    task?: string
    summary?: string
    milestone?: string
    plan?: string
    progress?: string
  }
  autoSchedule?: boolean
  editable?: boolean
}

export interface GanttLink {
  id: string
  sourceId: string
  targetId: string
  type: LinkType
  lag?: number
  lagUnit?: LagUnit
}

export interface TaskLayout {
  taskId: string
  rowIndex: number
  left: number
  width: number
  top: number
  depth: number
  isCritical: boolean
}

export interface FlatTask {
  task: GanttTask
  depth: number
  rowIndex: number
  hasChildren: boolean
  collapsed: boolean
}

export interface Calendar {
  id: string
  workingDays: number[]
  holidays: string[]
  hours: [number, number][]
}

export interface TimeScale {
  start: Date
  end: Date
  left: number
  width: number
}

export interface Viewport {
  scrollTop: number
  scrollLeft: number
  clientWidth: number
  clientHeight: number
  dpr: number
}

export interface AffectedTasks {
  changed: Array<{
    taskId: string
    actualStart: string | Date
    actualEnd: string | Date
    rowIndex: number
  }>
  conflicts: Array<{
    taskId: string
    constraintType: string
    message: string
  }>
}

export interface PatchTask {
  planStart?: string | Date
  planEnd?: string | Date
  actualStart?: string | Date
  actualEnd?: string | Date
  progress?: number
  name?: string
  type?: GanttTask["type"]
  parentId?: string | null
  color?: string
  duration?: number
  schedulingMode?: "auto" | "manual"
}

export const defaultConfig: GanttConfig = {
  viewMode: "month",
  rowHeight: 44,
  columnWidth: 30,
  headerHeight: 50,
  taskListWidth: 280,
  locale: "zh-CN",
  firstDayOfWeek: 0,
  dateFormat: "YYYY-MM-DD",
  showPlanBar: true,
  editablePlan: false,
  enableLinkCreation: true,
  virtualScroll: true,
  taskColors: {
    task: "#2563eb",
    summary: "#475467",
    milestone: "#d97706",
    plan: "#cbd5e1",
    progress: "#0f766e"
  },
  autoSchedule: true,
  editable: true
}
