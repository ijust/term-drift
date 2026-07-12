// 決定的再検査: 承認済み置換の残存を照合する（read-only・書き込みなし）。
// - 残存: 承認済み置換の from が文書にまだ現れる箇所（免除マーカー行は数えない）。
// - 有効な免除（理由一行つき）を持つファイルの残存は「免除済み」として数え、指摘に出さない（冪等）。
// - 理由の無いマーカーは無効: 免除として効かせず、無効マーカーとして件数・位置を報告する。

import fs from "node:fs";
import path from "node:path";
import { collectDocs, listTrackedFiles } from "./scan.mjs";
import { parseMarkers, isExempted, isMarkerLine } from "./markers.mjs";

/**
 * @returns {{ remaining: {term, file, line}[], exempted: {file, term}[], invalidMarkers: {file, line, term}[], skippedUntracked: string[] }}
 */
export function recheckDictionary(dict, dir) {
  const approved = dict.replacements.filter((r) => r.approved === true);
  const remaining = [];
  const exempted = [];
  const invalidMarkers = [];
  const skippedUntracked = [];
  // apply と同じ範囲で照合する: 追跡外は適用対象外なので残存に数えず、別枠で報告する（非 git なら全件照合）。
  const tracked = listTrackedFiles(dir);
  const { docs } = collectDocs(dir);
  for (const doc of docs) {
    if (tracked !== null && !tracked.has(doc.path.split(path.sep).join("/"))) {
      skippedUntracked.push(doc.path);
      continue;
    }
    const abs = path.join(dir, doc.path);
    const text = fs.readFileSync(abs, "utf8");
    for (const m of parseMarkers(text)) {
      if (m.reason === null) invalidMarkers.push({ file: doc.path, line: m.line, term: m.term });
    }
    const lines = text.split("\n");
    for (const r of approved) {
      if (!text.includes(r.from)) continue;
      if (isExempted(text, r.from)) {
        exempted.push({ file: doc.path, term: r.from });
        continue;
      }
      for (let i = 0; i < lines.length; i++) {
        if (isMarkerLine(lines[i])) continue;
        if (lines[i].includes(r.from)) remaining.push({ term: r.from, file: doc.path, line: i + 1 });
      }
    }
  }
  return { remaining, exempted, invalidMarkers, skippedUntracked };
}
