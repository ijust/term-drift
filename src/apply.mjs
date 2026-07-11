// 承認済み置換辞書の決定的適用（書き込みが起きる唯一の場所）。
// 安全の床:
//   - approved: true の項目だけを適用する。無い項目は1バイトも書かず「拒否」として報告する。
//   - 対象が git 管理下に無ければ適用自体を拒否する（可逆性の担保・提案止まり）。
//   - 有効な免除マーカー（理由一行つき）を持つファイルでは、その語の置換をしない。
//   - マーカー行そのものは書き換えない。

import fs from "node:fs";
import path from "node:path";
import { collectDocs, isGitWorkTree } from "./scan.mjs";
import { isExempted, isMarkerLine } from "./markers.mjs";

/** 辞書ファイル（JSON）を読み、形を検証する。 */
export function loadDictionary(dictPath) {
  const raw = JSON.parse(fs.readFileSync(dictPath, "utf8"));
  if (!raw || !Array.isArray(raw.replacements)) {
    throw new Error("辞書の形が不正です: { \"replacements\": [{ from, to, approved }] } の形で書いてください");
  }
  for (const r of raw.replacements) {
    if (typeof r.from !== "string" || r.from.length === 0 || typeof r.to !== "string") {
      throw new Error(`辞書の項目が不正です: from と to は空でない文字列が必要です（from=${JSON.stringify(r.from)}）`);
    }
  }
  return raw;
}

function replaceOutsideMarkers(text, from, to) {
  let count = 0;
  const lines = text.split("\n").map((line) => {
    if (isMarkerLine(line)) return line; // 免除マーカー行は書き換えない
    if (!line.includes(from)) return line;
    count += line.split(from).length - 1;
    return line.split(from).join(to);
  });
  return { text: lines.join("\n"), count };
}

/**
 * 辞書を対象リポへ適用する。
 * @returns {{ applied: boolean, reason?: string, changes: {file, term, count}[], rejectedUnapproved: string[], exemptedFiles: {file, term}[] }}
 */
export function applyDictionary(dict, dir) {
  const rejectedUnapproved = dict.replacements.filter((r) => r.approved !== true).map((r) => r.from);
  const approved = dict.replacements.filter((r) => r.approved === true);
  if (!isGitWorkTree(dir)) {
    // 非 git 管理下: 1バイトも書かない（提案止まり）。
    return { applied: false, reason: "not-a-git-worktree", changes: [], rejectedUnapproved, exemptedFiles: [] };
  }
  const changes = [];
  const exemptedFiles = [];
  const { docs } = collectDocs(dir);
  for (const doc of docs) {
    const abs = path.join(dir, doc.path);
    let text = fs.readFileSync(abs, "utf8");
    let changed = false;
    for (const r of approved) {
      if (!text.includes(r.from)) continue;
      if (isExempted(text, r.from)) {
        exemptedFiles.push({ file: doc.path, term: r.from });
        continue;
      }
      const result = replaceOutsideMarkers(text, r.from, r.to);
      if (result.count > 0) {
        text = result.text;
        changed = true;
        changes.push({ file: doc.path, term: r.from, count: result.count });
      }
    }
    if (changed) fs.writeFileSync(abs, text);
  }
  return { applied: true, changes, rejectedUnapproved, exemptedFiles };
}
