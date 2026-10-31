import { resolve } from "node:path";
import { build } from "esbuild";

await build({
  entryPoints: ["src/routes/move-submissions.test.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist/move-submissions.test.cjs",
  alias: {
    "@workspace/db": "./src/routes/move-submissions-test-db.ts",
  },
  plugins: [{
    name: "move-submissions-test-storage",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^\.\.\/lib\/studio-object-storage$/ }, () => ({
        path: resolve("src/routes/move-submissions-test-storage.ts"),
      }));
    },
  }],
});
