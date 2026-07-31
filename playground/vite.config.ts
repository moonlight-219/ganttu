import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vite"

export default defineConfig({
  base: "./",
  plugins: [vue()],
  resolve: {
    alias: {
      "ct-gantt-core": new URL("../packages/core/src/index.ts", import.meta.url).pathname,
      "ct-gantt-vue": new URL("../packages/vue-gantt/src/index.ts", import.meta.url).pathname
    }
  },
  server: {
    host: "0.0.0.0",
    port: 5173
  }
})
