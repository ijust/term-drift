// 決定的再検査: 承認済み置換の残存を照合する（read-only・書き込みなし）。
// - 残存: 承認済み置換の from が文書にまだ現れる箇所（例外指定のコメントは数えない）。
// - 理由を添えて例外として残した語は指摘に出さない（冪等）。
// - 理由の無いマーカーは無効: 例外として扱わず、無効マーカーとして件数・位置を報告する。

import path from "node:path";
import { collectCommits, collectDocs, listTrackedFiles } from "./scan.mjs";
import { parseMarkers, isExempted } from "./markers.mjs";
import { proseOccurrenceLines, readUtf8File } from "./prose.mjs";
import { validateApprovedReplacements, validateNonOverlappingRewriteUnits } from "./apply.mjs";

const normalizeDictionaryPath = (value) => value.replaceAll("\\", "/");

/**
 * @returns {{ remaining: {term, file, line}[], exempted: {file, term}[], invalidMarkers: {file, line, term}[], skippedUntracked: string[], skippedInvalidUtf8: string[], historicalAcknowledged: {term, subject}[] }}
 */
export function recheckDictionary(dict, dir) {
  validateApprovedReplacements(dict.replacements);
  const approved = dict.replacements.filter((r) => r.approved === true);
  const remaining = [];
  const exempted = [];
  const invalidMarkers = [];
  const skippedUntracked = [];
  const skippedInvalidUtf8 = [];
  const historicalAcknowledged = [];
  const historicalSeen = new Set();
  // apply と同じ範囲で照合する: 追跡外は適用対象外なので残存に数えず、別枠で報告する（非 git なら全件照合）。
  const tracked = listTrackedFiles(dir);
  const { docs } = collectDocs(dir);
  for (const doc of docs) {
    const relPath = doc.path.split(path.sep).join("/");
    const abs = path.join(dir, doc.path);
    const text = readUtf8File(abs);
    if (text === null) {
      skippedInvalidUtf8.push(doc.path);
      continue;
    }
    validateNonOverlappingRewriteUnits(text, doc.path, approved.filter((r) => normalizeDictionaryPath(r.path) === relPath));
    const relevant = approved.some((r) => normalizeDictionaryPath(r.path) === relPath && proseOccurrenceLines(text, doc.path, r.from).length > 0);
    if (tracked !== null && !tracked.has(relPath)) {
      if (relevant) skippedUntracked.push(doc.path);
      continue;
    }
    for (const m of parseMarkers(text)) {
      if (m.reason === null) invalidMarkers.push({ file: doc.path, line: m.line, term: m.term });
    }
    for (const r of approved) {
      if (normalizeDictionaryPath(r.path) !== relPath) continue;
      if (!text.includes(r.from)) continue;
      if (isExempted(text, r.term)) {
        exempted.push({ file: doc.path, term: r.term });
        continue;
      }
      for (const line of proseOccurrenceLines(text, doc.path, r.from)) remaining.push({ term: r.term, file: doc.path, line });
    }
  }
  // コミット履歴は不変なので書き換えない。承認辞書がその語の人による処置を示すため、
  // 再検査では「残存」ではなく確認済みの履歴として別枠にする。
  for (const subject of collectCommits(dir)) {
    for (const r of approved) {
      const key = `${r.term}\0${subject}`;
      if (subject.includes(r.term) && !historicalSeen.has(key)) {
        historicalSeen.add(key);
        historicalAcknowledged.push({ term: r.term, subject });
      }
    }
  }
  return { remaining, exempted, invalidMarkers, skippedUntracked, skippedInvalidUtf8, historicalAcknowledged };
}
