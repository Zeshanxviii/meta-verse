import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    allowedHosts: true,
  },
  define: {
    global: "globalThis",
  },
});
