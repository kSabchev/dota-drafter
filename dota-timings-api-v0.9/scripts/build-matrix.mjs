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
  const tmpFile = path.join(outDir, "matrix-topk.tmp.json");

  await fs.mkdir(outDir, { recursive: true });

  console.log("[matrix] Building Top-K matrices via OpenDota sync...");
  const { matrix } = await syncOpenDotaAndBuildMatrices();
  const { topAllies, topOpponents, topCounteredBy } = matrix;

  const payload = {
    schema: "matrix-topk/v2",
    generatedAt: new Date().toISOString(),
    source: "OpenDota",
    topAllies,
    topOpponents,
    topCounteredBy,
  };

  // atomic write
  await fs.writeFile(tmpFile, JSON.stringify(payload), "utf8");
  await fs.rename(tmpFile, outFile);
  console.log(`[matrix] Snapshot saved: ${outFile}`);
}

main().catch((e) => {
  console.error("[matrix] Build failed:", e);
  process.exit(1);
});
