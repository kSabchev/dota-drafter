import fs from "node:fs/promises";
import path from "node:path";

export async function loadMatrixSnapshot(
  app,
  file = "data/snapshots/matrix-topk.json"
) {
  try {
    const p = path.resolve(process.cwd(), file);
    const buf = await fs.readFile(p, "utf8");
    const json = JSON.parse(buf);
    if (!json?.topAllies || !json?.topOpponents) {
      throw new Error("Invalid matrix snapshot");
    }
    app.locals.matrixTopK = {
      topAllies: json.topAllies,
      topOpponents: json.topOpponents,
    };
    console.log(`[matrix-loader] Loaded snapshot: ${file}`);
    return true;
  } catch (e) {
    console.warn(
      `[matrix-loader] Could not load snapshot (${file}): ${e.message}`
    );
    app.locals.matrixTopK = { topAllies: {}, topOpponents: {} };
    return false;
  }
}
