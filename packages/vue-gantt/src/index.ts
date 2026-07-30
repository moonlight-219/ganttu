import "./styles/gantt.css"
import GanttChart from "./components/GanttChart.vue"
import GanttDialog from "./components/GanttDialog.vue"

export { GanttChart }
export { GanttDialog }
export default GanttChart
export type {
  CustomColumn,
  GanttEditorField,
  GanttConfig,
  GanttLink,
  GanttMarker,
  GanttTask,
  PatchTask,
  ViewMode
} from "@gantt/core"
export type {
  GanttChartExpose,
  GanttExportImageOptions,
  GanttLinkRejection,
  GanttMarkerEditRequest,
  GanttMarkerEditorDraft,
  GanttTaskEditRequest,
  GanttTaskEditorDraft
} from "./types"
