const { build } = require("esbuild");
const path = require("path");
const fs = require("fs");

const OUT_DIR = path.join(__dirname, "dist");
const WEB_DIR = path.resolve(__dirname, "..", "bridge", "web");

fs.mkdirSync(OUT_DIR, { recursive: true });

build({
  entryPoints: [path.join(__dirname, "server.js")],
  bundle: true,
  platform: "node",
  target: "node18",
  outfile: path.join(OUT_DIR, "server.js"),
  format: "cjs",
  banner: {
    js: "// BambuStudio Bridge v5.31.4 - Bundled\n",
  },
  external: [
    "bonjour-service",
  ],
  logLevel: "info",
}).then(() => {
  const webTarget = path.join(OUT_DIR, "web");
  if (fs.existsSync(webTarget)) fs.rmSync(webTarget, { recursive: true });
  if (fs.existsSync(WEB_DIR)) {
    fs.cpSync(WEB_DIR, webTarget, { recursive: true });
    console.log("Copied web dir to dist/web");
  }

  const pkg = {
    name: "bambustudio-bridge",
    version: "5.31.3",
    main: "server.js",
    type: "commonjs",
    scripts: { start: "node server.js" },
    dependencies: {},
  };
  fs.writeFileSync(path.join(OUT_DIR, "package.json"), JSON.stringify(pkg, null, 2));

  console.log("Build complete!");
  console.log(`Output: ${OUT_DIR}`);
  console.log("To run: cd dist && node server.js");
}).catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
