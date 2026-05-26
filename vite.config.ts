import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";

function codexPetsPlugin(): Plugin {
  return {
    name: "codex-pets",
    async configureServer(server) {
      const [{ default: fs }, { default: os }, { default: path }] =
        await Promise.all([
          import("node:fs"),
          import("node:os"),
          import("node:path"),
        ]);
      const petsRoot = path.join(os.homedir(), ".codex", "pets");

      server.middlewares.use("/codex-pets", (request, response, next) => {
        const url = request.url?.split("?")[0] ?? "";
        const normalizedUrl = decodeURIComponent(url).replace(/^\/+/, "");
        const filePath = path.resolve(petsRoot, normalizedUrl);

        if (!filePath.startsWith(petsRoot + path.sep)) {
          response.statusCode = 403;
          response.end("Forbidden");
          return;
        }

        fs.stat(filePath, (statError, stat) => {
          if (statError || !stat.isFile()) {
            next();
            return;
          }

          if (filePath.endsWith(".webp")) {
            response.setHeader("Content-Type", "image/webp");
          }
          fs.createReadStream(filePath).pipe(response);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), codexPetsPlugin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
