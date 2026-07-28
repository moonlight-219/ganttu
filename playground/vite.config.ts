import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@gantt/core": new URL("../packages/core/src/index.ts", import.meta.url).pathname,
      "@gantt/vue-gantt": new URL("../packages/vue-gantt/src/index.ts", import.meta.url).pathname
    }
  },
  server: {
    port: 5173
  }
})
