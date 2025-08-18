// scripts/build-matrix.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncOpenDotaAndBuildMatrices } from "../src/opendota-sync.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const outDir = path.resolve(__dirname, "../data/snapshots");
  const outFile = path.join(outDir, "matrix-topk.json");

  await fs.mkdir(outDir, { recursive: true });

  console.log("[matrix] Building Top-K matrices via OpenDota sync...");
  const { topAllies, topOpponents } = await syncOpenDotaAndBuildMatrices({
    // you can pass flags here if your sync supports them (e.g., useExplorer: true)
  });

  const payload = { topAllies, topOpponents };
  await fs.writeFile(outFile, JSON.stringify(payload), "utf8");
  console.log(`[matrix] Snapshot saved: ${outFile}`);
}

main().catch((e) => {
  console.error("[matrix] Build failed:", e);
  process.exit(1);
});
