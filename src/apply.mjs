// 承認済み置換辞書の決定的適用（書き込みが起きる唯一の場所）。
// 安全の床:
//   - approved: true の項目だけを適用する。無い項目は1バイトも書かず「拒否」として報告する。
//   - 対象が git 管理下に無ければ適用自体を拒否する（可逆性の担保・提案止まり）。
//   - git 追跡外のファイルには書かない（git から復元できないため）。スキップとして報告する。
//   - 承認単位は対象ファイル内の一意な文章1箇所。path の無い辞書や、同じ文章が対象内で
//     複数箇所に当たる辞書は、意味判断を一括適用しないため書き込み前に拒否する。
//   - 置換は1パスの同時置換（置換結果へ別の置換を連鎖させない）。言い換え先に承認語を含む
//     交差辞書は、再適用のたびに文面が変わる（冪等性が壊れる）ため適用前に拒否する。
//   - 理由を添えて例外として残した語は置換しない。
//   - マーカーコメント・コード・リンク先などの機械参照は書き換えない。

import fs from "node:fs";
import path from "node:path";
import { collectDocs, isGitWorkTree, listDirtyFiles, listTrackedFiles } from "./scan.mjs";
import { isExempted } from "./markers.mjs";
import { proseOccurrenceCount, proseOccurrenceLines, proseOccurrenceRanges, readUtf8File, transformProse } from "./prose.mjs";

const normalizeDictionaryPath = (value) => value.replaceAll("\\", "/");

/**
 * 承認済み項目の重複・交差を検証する（違反は throw）。
 * - 同じ from の二重定義: どちらを適用すべきか決められない。
 * - 言い換え先（to）に承認語（from）が含まれる: 適用のたびに文面が変わり冪等でなくなる。
 */
export function validateApprovedReplacements(replacements) {
  if (!Array.isArray(replacements)) throw new Error("辞書の形が不正です: replacements は配列である必要があります");
  for (const r of replacements) {
    if (!r || typeof r.path !== "string" || r.path.length === 0 || path.isAbsolute(r.path) || /^[A-Za-z]:[\\/]/.test(r.path) || r.path.split(/[\\/]/).includes("..")) {
      throw new Error(`辞書の項目が不正です: path は対象リポジトリ内の相対ファイルパスが必要です（path=${JSON.stringify(r?.path)}）`);
    }
    if (typeof r.term !== "string" || r.term.length === 0 || typeof r.from !== "string" || r.from.length === 0 || typeof r.to !== "string" || r.to.length === 0) {
      throw new Error(`辞書の項目が不正です: term・from・to は空でない文字列が必要です（term=${JSON.stringify(r?.term)}, from=${JSON.stringify(r?.from)}）`);
    }
    if (r.term_occurrences !== undefined) {
      if (!Number.isInteger(r.term_occurrences) || r.term_occurrences <= 0) {
        throw new Error(`辞書の項目が不正です: term_occurrences は正の整数が必要です（term_occurrences=${JSON.stringify(r.term_occurrences)}）`);
      }
      const actual = proseOccurrenceCount(r.from, r.path, r.term);
      if (actual !== r.term_occurrences) {
        throw new Error(`辞書の項目が不正です: ${r.path} の from にある散文上の「${r.term}」は${actual}件ですが、term_occurrences=${r.term_occurrences} です`);
      }
    }
  }
  const approved = replacements.filter((r) => r.approved === true);
  const seen = new Set();
  for (const r of approved) {
    const key = `${normalizeDictionaryPath(r.path)}\0${r.from}`;
    if (seen.has(key)) {
      throw new Error(`辞書が不正です: ${r.path} の「${r.from}」が重複しています（承認した1箇所につき1項目にしてください）`);
    }
    seen.add(key);
  }
  for (const r of approved) {
    for (const s of approved) {
      if (normalizeDictionaryPath(r.path) === normalizeDictionaryPath(s.path) && r.to.includes(s.from)) {
        throw new Error(
          `辞書が不正です: 「${r.from} → ${r.to}」の言い換え先に承認語「${s.from}」が含まれます（置換が連鎖し、再適用のたびに文面が変わるため拒否します）`,
        );
      }
    }
  }
}

/** 対象文書上で承認済み書き換え単位が重ならないことを検証する。 */
export function validateNonOverlappingRewriteUnits(text, filePath, replacements) {
  const units = [];
  for (const r of replacements) {
    const ranges = proseOccurrenceRanges(text, filePath, r.from);
    if (ranges.length === 0) continue;
    if (ranges.length > 1) {
      throw new Error(`辞書が不正です: ${filePath} の承認文章「${r.from}」が${ranges.length}箇所に一致します（1つの書き換え単位を一意にする周辺文脈を from に含めてください）`);
    }
    units.push({ replacement: r, ...ranges[0] });
  }
  units.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < units.length; i += 1) {
    const previous = units[i - 1];
    const current = units[i];
    if (current.start < previous.end) {
      throw new Error(`辞書が不正です: ${filePath} の書き換え単位「${previous.replacement.from}」と「${current.replacement.from}」が重なっています`);
    }
  }
}

/** 辞書ファイル（JSON）を読み、形を検証する。 */
export function loadDictionary(dictPath) {
  const raw = JSON.parse(fs.readFileSync(dictPath, "utf8"));
  if (!raw || !Array.isArray(raw.replacements)) {
    throw new Error("辞書の形が不正です: { \"replacements\": [{ term, path, from, to, approved }] } の形で書いてください");
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
function replaceSimultaneously(text, filePath, replacements) {
  const byFrom = new Map(replacements.map((r) => [r.from, r.to]));
  const pattern = new RegExp(
    [...byFrom.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|"),
    "g",
  );
  const counts = new Map();
  const replaced = transformProse(text, filePath, (segment) => segment.replace(pattern, (m) => {
    counts.set(m, (counts.get(m) || 0) + 1);
    return byFrom.get(m);
  }));
  return { text: replaced, counts };
}

/**
 * 辞書を対象リポへ適用する。
 * @returns {{ applied: boolean, reason?: string, changes: {file, term, count}[], rejectedUnapproved: string[], exemptedFiles: {file, term}[], skippedUntracked: string[], skippedDirty: string[], skippedInvalidUtf8: string[] }}
 */
export function applyDictionary(dict, dir) {
  validateApprovedReplacements(dict.replacements);
  const rejectedUnapproved = dict.replacements.filter((r) => r.approved !== true).map((r) => r.term);
  const approved = dict.replacements.filter((r) => r.approved === true);
  if (!isGitWorkTree(dir)) {
    // 非 git 管理下: 1バイトも書かない（提案止まり）。
    return { applied: false, reason: "not-a-git-worktree", changes: [], rejectedUnapproved, exemptedFiles: [], skippedUntracked: [], skippedDirty: [], skippedInvalidUtf8: [] };
  }
  const tracked = listTrackedFiles(dir);
  const dirty = listDirtyFiles(dir);
  if (tracked === null || dirty === null) {
    throw new Error("git の追跡・変更状態を確認できないため、安全上 apply を拒否しました");
  }
  const changes = [];
  const exemptedFiles = [];
  const skippedUntracked = [];
  const skippedDirty = [];
  const skippedInvalidUtf8 = [];
  const writes = [];
  const { docs } = collectDocs(dir);
  const docPaths = new Set(docs.map((doc) => doc.path.split(path.sep).join("/")));
  for (const r of approved) {
    const target = normalizeDictionaryPath(r.path);
    if (!docPaths.has(target)) throw new Error(`辞書が不正です: 対象文書 ${r.path} が走査対象にありません`);
  }
  for (const doc of docs) {
    const relPath = doc.path.split(path.sep).join("/");
    const abs = path.join(dir, doc.path);
    const text = readUtf8File(abs);
    if (text === null) {
      skippedInvalidUtf8.push(doc.path);
      continue;
    }
    validateNonOverlappingRewriteUnits(text, doc.path, approved.filter((r) => normalizeDictionaryPath(r.path) === relPath));
    const active = [];
    for (const r of approved) {
      if (normalizeDictionaryPath(r.path) !== relPath) continue;
      const occurrenceCount = proseOccurrenceCount(text, doc.path, r.from);
      if (occurrenceCount === 0) continue;
      if (occurrenceCount > 1) {
        throw new Error(`辞書が不正です: ${r.path} の承認文章「${r.from}」が${occurrenceCount}箇所に一致します（1箇所を一意にする周辺文脈を from に含めてください）`);
      }
      if (isExempted(text, r.term)) {
        exemptedFiles.push({ file: doc.path, term: r.term });
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
    if (dirty.has(relPath)) {
      // 未ステージ変更の適用前内容は git に残らないため触らない。
      skippedDirty.push(doc.path);
      continue;
    }
    const result = replaceSimultaneously(text, doc.path, active);
    // 置換先と周辺文字の結合で別の from が新生する境界連鎖もここで拒否する。
    for (const r of approved.filter((r) => normalizeDictionaryPath(r.path) === relPath)) {
      if (!isExempted(result.text, r.term) && proseOccurrenceLines(result.text, doc.path, r.from).length > 0) {
        throw new Error(`辞書が不正です: ${doc.path} への適用後に承認語「${r.from}」が再生成されます（再適用で文面が変わるため書き込みません）`);
      }
    }
    for (const r of active) {
      const count = result.counts.get(r.from) ?? 0;
      if (count > 0) changes.push({ file: doc.path, term: r.term, count, termOccurrences: r.term_occurrences ?? count });
    }
    if (result.text !== text) writes.push({ abs, text: result.text });
  }
  // 全ファイルの検証完了後にだけ書く。辞書不正時の途中適用を防ぐ。
  for (const write of writes) fs.writeFileSync(write.abs, write.text);
  return { applied: true, changes, rejectedUnapproved, exemptedFiles, skippedUntracked, skippedDirty, skippedInvalidUtf8 };
}
