import type {
  GanttEditorField,
  GanttMarker,
  GanttTask
} from "@gantt/core"

export interface GanttTaskEditorDraft {
  id: string
  name: string
  type: GanttTask["type"]
  parentId: string
  planStart: string
  planEnd: string
  actualStart: string
  actualEnd: string
  progress: number
  color: string
  planColor: string
  resources: string
  calendarId: string
  duration: number
  schedulingMode: NonNullable<GanttTask["schedulingMode"]>
  custom: Record<string, unknown>
}

export interface GanttTaskEditRequest {
  mode: "create" | "edit"
  task?: GanttTask
  taskType: GanttTask["type"]
  draft: GanttTaskEditorDraft
  fields: GanttEditorField[]
}

export interface GanttMarkerEditorDraft {
  id: string
  name: string
  date: string
  color: string
}

export interface GanttMarkerEditRequest {
  mode: "create" | "edit"
  marker?: GanttMarker
  draft: GanttMarkerEditorDraft
}
