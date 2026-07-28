import type { TimeScale } from "@gantt/core"

export function drawGrid(
  context: CanvasRenderingContext2D,
  scale: TimeScale[],
  rowHeight: number,
  width: number,
  height: number,
  scrollLeft: number,
  scrollTop: number
): void {
  context.save()
  context.clearRect(0, 0, width, height)
  context.strokeStyle = "#e6ebf3"
  context.lineWidth = 1

  context.beginPath()
  for (const tick of scale) {
    const x = Math.round(tick.left - scrollLeft) + 0.5
    if (x < -1 || x > width + 1) {
      continue
    }
    context.moveTo(x, 0)
    context.lineTo(x, height)
  }
  context.stroke()

  const rowOffset = -(scrollTop % rowHeight)
  context.beginPath()
  for (let y = rowOffset; y < height; y += rowHeight) {
    context.moveTo(0, Math.round(y) + 0.5)
    context.lineTo(width, Math.round(y) + 0.5)
  }
  context.stroke()

  context.restore()
}
