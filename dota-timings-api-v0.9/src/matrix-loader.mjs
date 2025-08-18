import fs from "node:fs/promises";
import path from "node:path";

function isNonEmpty(json) {
  if (!json) return false;
  const a = json.topAllies && Object.keys(json.topAllies).length;
  const b = json.topOpponents && Object.keys(json.topOpponents).length;
  return a > 0 && b > 0;
}

export async function loadMatrixSnapshot(
  app,
  file = "data/snapshots/matrix-topk.json"
) {
  try {
    const p = path.resolve(process.cwd(), file);
    const buf = await fs.readFile(p, "utf8");
    const json = JSON.parse(buf);

    if (!isNonEmpty(json)) throw new Error("matrix snapshot is empty/invalid");

    app.locals.matrixTopK = {
      topAllies: json.topAllies,
      topOpponents: json.topOpponents,
      _meta: {
        schema: json.schema ?? "matrix-topk/v1",
        generatedAt: json.generatedAt ?? new Date().toISOString(),
        source: json.source ?? "OpenDota",
      },
    };
    console.log(
      `[matrix-loader] Loaded snapshot: ${p} (${
        Object.keys(json.topAllies).length
      } heroes)`
    );
    return true;
  } catch (e) {
    console.warn(`[matrix-loader] Could not load snapshot: ${e.message}`);
    app.locals.matrixTopK = { topAllies: {}, topOpponents: {}, _meta: null };
    return false;
  }
}
