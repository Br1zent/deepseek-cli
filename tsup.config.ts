import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli/index.ts"],
  format: ["esm"],
  outDir: "dist",
  dts: true,
  sourcemap: true,
  clean: true,
  shims: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
