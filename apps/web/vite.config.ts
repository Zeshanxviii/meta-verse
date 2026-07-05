import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    allowedHosts: true,
  },
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: {
      events: path.resolve(__dirname, "node_modules/events"),
      util: path.resolve(__dirname, "node_modules/util"),
    },
  },
});
