// 承認済み置換辞書の決定的適用（書き込みが起きる唯一の場所）。
// 安全の床:
//   - approved: true の項目だけを適用する。無い項目は1バイトも書かず「拒否」として報告する。
//   - 対象が git 管理下に無ければ適用自体を拒否する（可逆性の担保・提案止まり）。
//   - git 追跡外のファイルには書かない（git から復元できないため）。スキップとして報告する。
//   - 置換は1パスの同時置換（置換結果へ別の置換を連鎖させない）。言い換え先に承認語を含む
//     交差辞書は、再適用のたびに文面が変わる（冪等性が壊れる）ため適用前に拒否する。
//   - 有効な免除マーカー（理由一行つき）を持つファイルでは、その語の置換をしない。
//   - マーカー行そのものは書き換えない。

import fs from "node:fs";
import path from "node:path";
import { collectDocs, isGitWorkTree, listTrackedFiles } from "./scan.mjs";
import { isExempted, isMarkerLine } from "./markers.mjs";

/**
 * 承認済み項目の重複・交差を検証する（違反は throw）。
 * - 同じ from の二重定義: どちらを適用すべきか決められない。
 * - 言い換え先（to）に承認語（from）が含まれる: 適用のたびに文面が変わり冪等でなくなる。
 */
export function validateApprovedReplacements(replacements) {
  const approved = replacements.filter((r) => r.approved === true);
  const seen = new Set();
  for (const r of approved) {
    if (seen.has(r.from)) {
      throw new Error(`辞書が不正です: 「${r.from}」の置換が重複しています（1語につき1項目にしてください）`);
    }
    seen.add(r.from);
  }
  for (const r of approved) {
    for (const s of approved) {
      if (r.to.includes(s.from)) {
        throw new Error(
          `辞書が不正です: 「${r.from} → ${r.to}」の言い換え先に承認語「${s.from}」が含まれます（置換が連鎖し、再適用のたびに文面が変わるため拒否します）`,
        );
      }
    }
  }
}

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
  validateApprovedReplacements(raw.replacements);
  return raw;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 1パスの同時置換。from が重なる場合は長い語を優先する（短い語が先に食わない）。
 * @returns {{ text: string, counts: Map<string, number> }}
 */
function replaceSimultaneously(text, replacements) {
  const byFrom = new Map(replacements.map((r) => [r.from, r.to]));
  const pattern = new RegExp(
    [...byFrom.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|"),
    "g",
  );
  const counts = new Map();
  const lines = text.split("\n").map((line) => {
    if (isMarkerLine(line)) return line; // 免除マーカー行は書き換えない
    return line.replace(pattern, (m) => {
      counts.set(m, (counts.get(m) || 0) + 1);
      return byFrom.get(m);
    });
  });
  return { text: lines.join("\n"), counts };
}

/**
 * 辞書を対象リポへ適用する。
 * @returns {{ applied: boolean, reason?: string, changes: {file, term, count}[], rejectedUnapproved: string[], exemptedFiles: {file, term}[], skippedUntracked: string[] }}
 */
export function applyDictionary(dict, dir) {
  validateApprovedReplacements(dict.replacements);
  const rejectedUnapproved = dict.replacements.filter((r) => r.approved !== true).map((r) => r.from);
  const approved = dict.replacements.filter((r) => r.approved === true);
  if (!isGitWorkTree(dir)) {
    // 非 git 管理下: 1バイトも書かない（提案止まり）。
    return { applied: false, reason: "not-a-git-worktree", changes: [], rejectedUnapproved, exemptedFiles: [], skippedUntracked: [] };
  }
  const tracked = listTrackedFiles(dir) ?? new Set();
  const changes = [];
  const exemptedFiles = [];
  const skippedUntracked = [];
  const { docs } = collectDocs(dir);
  for (const doc of docs) {
    const relPath = doc.path.split(path.sep).join("/");
    const abs = path.join(dir, doc.path);
    const text = fs.readFileSync(abs, "utf8");
    const active = [];
    for (const r of approved) {
      if (!text.includes(r.from)) continue;
      if (isExempted(text, r.from)) {
        exemptedFiles.push({ file: doc.path, term: r.from });
        continue;
      }
      active.push(r);
    }
    if (active.length === 0) continue;
    if (!tracked.has(relPath)) {
      // 追跡外は git から復元できない: 書かずにスキップとして報告する（INV1）。
      skippedUntracked.push(doc.path);
      continue;
    }
    const result = replaceSimultaneously(text, active);
    for (const r of active) {
      const count = result.counts.get(r.from) ?? 0;
      if (count > 0) changes.push({ file: doc.path, term: r.from, count });
    }
    if (result.text !== text) fs.writeFileSync(abs, result.text);
  }
  return { applied: true, changes, rejectedUnapproved, exemptedFiles, skippedUntracked };
}
