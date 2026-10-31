import { resolve } from "node:path";
import { build } from "esbuild";

await build({
  entryPoints: ["src/routes/creator-cards.test.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist/creator-cards.test.cjs",
  alias: {
    "@workspace/db": "./src/routes/creator-cards-test-db.ts",
  },
  plugins: [{
    name: "creator-cards-test-storage",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^\.\.\/lib\/studio-object-storage$/ }, () => ({
        path: resolve("src/routes/creator-cards-test-storage.ts"),
      }));
    },
  }],
});
