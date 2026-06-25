import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { defineConfig } from "vitest/config";

function resolveTsFromJsImports() {
  return {
    name: "resolve-ts-from-js-imports",
    resolveId(source: string, importer?: string) {
      if (!importer || !source.startsWith(".") || !source.endsWith(".js")) {
        return null;
      }
      const tsSource = source.replace(/\.js$/, ".ts");
      const baseDir = dirname(importer);
      const tsPath = resolve(baseDir, tsSource);
      if (existsSync(tsPath)) {
        return tsPath;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [resolveTsFromJsImports()],
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
