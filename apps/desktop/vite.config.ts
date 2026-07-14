import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";

const host = process.env.TAURI_DEV_HOST;
const tauriDevPort = 1420;

// Refresh public/codex-pets from the repo-root `pets/` source of truth before
// Vite serves or bundles. Runs once at config resolution so it covers dev,
// dev:tauri, and build:playground without per-script pre-hooks.
function syncPetAssets(): Plugin {
  return {
    name: "sync-pet-assets",
    config() {
      const script = fileURLToPath(new URL("../../scripts/sync-pet-assets.mjs", import.meta.url));
      execFileSync(process.execPath, [script, "desktop"], {
        stdio: "inherit",
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const isTauri = mode === "tauri";

  return {
    plugins: [syncPetAssets(), react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    clearScreen: false,
    server: {
      port: isTauri ? tauriDevPort : undefined,
      strictPort: isTauri,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        ignored: ["**/src-tauri/**"],
      },
    },
    envPrefix: ["VITE_", "TAURI_ENV_*"],
    build: {
      target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
      minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
      sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
      rollupOptions: {
        input: {
          main: "index.html",
          playground: "playground.html",
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./tests/setup.ts"],
      include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    },
  };
});
