export interface CanvasViewport {
  canvas: HTMLCanvasElement
  width: number
  height: number
  dpr: number
}

export function setupCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasViewport {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(width * dpr))
  canvas.height = Math.max(1, Math.floor(height * dpr))
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const context = canvas.getContext("2d")
  if (context) {
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)
  }

  return { canvas, width, height, dpr }
}
