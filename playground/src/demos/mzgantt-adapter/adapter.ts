import type { GanttLink, GanttMarker, GanttTask } from "@gantt/core"

export interface MzTask {
  UID: string
  Name: string
  Start: string
  Finish: string
  PercentComplete?: number
  ParentUID?: string
  isGroup?: boolean
  isMS?: boolean
  PredecessorUID?: string
  ConstraintType?: string
  ConstraintDate?: string
}

export const mzSampleTasks: MzTask[] = [
  { UID: "100", Name: "MZGantt 迁移一期", Start: "2026-07-01", Finish: "2026-09-18", isGroup: true, PercentComplete: 35 },
  { UID: "101", Name: "字段映射梳理", Start: "2026-07-01", Finish: "2026-07-08", ParentUID: "100", PercentComplete: 100 },
  { UID: "102", Name: "核心类型落地", Start: "2026-07-09", Finish: "2026-07-16", ParentUID: "100", PredecessorUID: "101", PercentComplete: 80 },
  { UID: "103", Name: "组件灰度接入", Start: "2026-07-18", Finish: "2026-08-18", ParentUID: "100", PredecessorUID: "102", PercentComplete: 45 },
  { UID: "104", Name: "一期验收里程碑", Start: "2026-09-18", Finish: "2026-09-18", ParentUID: "100", PredecessorUID: "103", isMS: true, PercentComplete: 0 }
]

export function toGanttTasks(mzTasks: MzTask[]): GanttTask[] {
  return mzTasks.filter((task) => !task.isMS).map((task) => ({
    id: task.UID,
    name: task.Name,
    type: task.isGroup ? "summary" : "task",
    parentId: task.ParentUID,
    plan: { start: task.Start, end: task.Finish, progress: task.PercentComplete ?? 0 },
    actual: { start: task.Start, end: task.Finish, progress: task.PercentComplete ?? 0 },
    dependencies: task.PredecessorUID ? [{
      predecessorId: task.PredecessorUID,
      type: "FS",
      lag: 0,
      lagUnit: "calendar"
    }] : [],
    constraint: task.ConstraintType ? {
      type: "ASAP",
      date: task.ConstraintDate
    } : undefined
  }))
}

export function toGanttMarkers(mzTasks: MzTask[]): GanttMarker[] {
  return mzTasks
    .filter((task) => task.isMS)
    .map((task) => ({
      id: `marker-${task.UID}`,
      name: task.Name,
      date: task.Start,
      color: "#dc2626"
    }))
}

export function toGanttLinks(mzTasks: MzTask[]): GanttLink[] {
  return mzTasks
    .filter((task) => task.PredecessorUID && !task.isMS)
    .map((task) => ({
      id: `mz-${task.PredecessorUID}-${task.UID}`,
      sourceId: task.PredecessorUID!,
      targetId: task.UID,
      type: "FS",
      lag: 0,
      lagUnit: "calendar"
    }))
}
