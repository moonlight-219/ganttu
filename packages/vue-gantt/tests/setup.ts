import { vi } from "vitest"

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: vi.fn(function (this: HTMLCanvasElement) {
    return {
      canvas: this,
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      setTransform: vi.fn(),
      stroke: vi.fn()
    }
  })
})
