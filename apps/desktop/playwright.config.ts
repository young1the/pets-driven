import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  webServer: {
    // Vite directly, not the `dev` script: that one is `tauri dev`, which hands
    // these flags to `cargo run` and dies on them ("unexpected argument
    // '--host'"), taking the whole suite with it before a test can run.
    command: "pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
