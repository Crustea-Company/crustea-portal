import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Test otomatis untuk logika murni (tanpa database). Alias "@/" sama dengan tsconfig.json.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
