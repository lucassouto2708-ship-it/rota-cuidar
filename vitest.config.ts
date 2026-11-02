import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    fileParallelism: false,
    env: { DATABASE_URL: process.env.DATABASE_URL_TEST ?? "postgres://rota:rota@localhost:5432/rota_test" },
  },
});
