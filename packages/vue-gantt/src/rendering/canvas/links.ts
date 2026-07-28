import type { GanttLink, TaskLayout } from "@gantt/core"

export type LinkAnchor = "start" | "finish"

export interface LinkPoint {
  x: number
  y: number
}

export function linkAnchorsForType(type: GanttLink["type"]): { source: LinkAnchor; target: LinkAnchor } {
  return {
    source: type === "SS" || type === "SF" ? "start" : "finish",
    target: type === "SS" || type === "FS" ? "start" : "finish"
  }
}

export function taskAnchorPoint(
  layout: TaskLayout,
  anchor: LinkAnchor,
  headerHeight: number,
  barTopOffset: number,
  barHeight: number,
  scrollLeft = 0,
  scrollTop = 0
): LinkPoint {
  return {
    x: (anchor === "start" ? layout.left : layout.left + layout.width) - scrollLeft,
    y: layout.top - headerHeight + barTopOffset + barHeight / 2 - scrollTop
  }
}

export function buildOrthogonalLinkPath(
  start: LinkPoint,
  end: LinkPoint,
  sourceAnchor: LinkAnchor,
  targetAnchor: LinkAnchor
): LinkPoint[] {
  const gap = 18
  const sourceDirection = sourceAnchor === "start" ? -1 : 1
  const targetDirection = targetAnchor === "start" ? -1 : 1
  const exitX = start.x + sourceDirection * gap
  const entryX = end.x + targetDirection * gap
  const midX = sourceDirection === targetDirection
    ? sourceDirection === 1
      ? Math.max(exitX, entryX) + gap
      : Math.min(exitX, entryX) - gap
    : (exitX + entryX) / 2

  return [
    start,
    { x: exitX, y: start.y },
    { x: midX, y: start.y },
    { x: midX, y: end.y },
    { x: entryX, y: end.y },
    end
  ]
}

export function drawLinks(
  context: CanvasRenderingContext2D,
  links: GanttLink[],
  layouts: TaskLayout[],
  _rowHeight: number,
  headerHeight: number,
  barTopOffset: number,
  barHeight: number,
  scrollLeft: number,
  scrollTop: number
): void {
  const byId = new Map(layouts.map((layout) => [layout.taskId, layout]))
  context.save()
  context.strokeStyle = "#667085"
  context.fillStyle = "#667085"
  context.lineWidth = 1.25

  for (const link of links) {
    const source = byId.get(link.sourceId)
    const target = byId.get(link.targetId)
    if (!source || !target) {
      continue
    }

    const { source: sourceAnchor, target: targetAnchor } = linkAnchorsForType(link.type)
    const start = taskAnchorPoint(source, sourceAnchor, headerHeight, barTopOffset, barHeight, scrollLeft, scrollTop)
    const end = taskAnchorPoint(target, targetAnchor, headerHeight, barTopOffset, barHeight, scrollLeft, scrollTop)
    const path = buildOrthogonalLinkPath(start, end, sourceAnchor, targetAnchor)
    const direction = targetAnchor === "start" ? -1 : 1

    context.beginPath()
    context.moveTo(path[0].x, path[0].y)
    for (const point of path.slice(1)) {
      context.lineTo(point.x, point.y)
    }
    context.stroke()

    context.beginPath()
    context.moveTo(end.x, end.y)
    context.lineTo(end.x + direction * 6, end.y - 4)
    context.lineTo(end.x + direction * 6, end.y + 4)
    context.closePath()
    context.fill()
  }

  context.restore()
}
