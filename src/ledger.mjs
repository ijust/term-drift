// 台帳（glossary）の解決と読み取り（決定的層）。
// 解決順: .intent/glossary.md（あれば正本として優先）→ .term-drift/glossary.md → なし。
// 解決は「対象リポに配置された実体」だけを見る（node_modules・ツールキャッシュを見ない）。
// スキーマ: 3列（正規語・別表記・一行説明）＋任意2列（状態・言い換え例）。
// 状態は3値（承認済み/暫定/否認済み）。状態未記載＝暫定として読む。旧3列も常に有効（追加のみの恒久契約）。

import fs from "node:fs";
import path from "node:path";
import { isContainedRegularFile } from "./path-safety.mjs";

const STATUS_MAP = new Map([
  ["承認済み", "approved"],
  ["approved", "approved"],
  ["暫定", "provisional"],
  ["provisional", "provisional"],
  ["否認済み", "rejected"],
  ["rejected", "rejected"],
]);

/** 台帳ファイルの場所を解決する（無ければ null）。 */
export function resolveLedgerPath(dir) {
  const intentLedger = path.join(dir, ".intent", "glossary.md");
  if (isContainedRegularFile(dir, intentLedger)) return intentLedger;
  const ownLedger = path.join(dir, ".term-drift", "glossary.md");
  if (isContainedRegularFile(dir, ownLedger)) return ownLedger;
  return null;
}

/**
 * 台帳 Markdown から登録行を読み取る。
 * @returns {{ term, aliases: string[], explanation, status, statusRaw, rewording }[]}
 */
export function parseLedger(markdown) {
  const entries = [];
  for (const line of markdown.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    const cells = t.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    // 見出し行・区切り行を除外する。
    if (/^:?-+:?$/.test(cells[0])) continue;
    if (cells[0] === "正規語" || cells[0] === "Canonical term") continue;
    const statusRaw = (cells[3] ?? "").trim();
    const entry = {
      term: cells[0],
      aliases: cells[1] && cells[1] !== "—" ? cells[1].split(",").map((s) => s.trim()).filter(Boolean) : [],
      explanation: cells[2] ?? "",
      // 状態未記載（旧3列・空欄）＝暫定として読む。未知の値も暫定側に倒す（勝手に承認済み扱いしない）。
      status: STATUS_MAP.get(statusRaw) ?? "provisional",
      statusRaw,
      rewording: (cells[4] ?? "").trim(),
    };
    entries.push(entry);
  }
  return entries;
}

/** 対象リポの台帳を解決して読む。無ければ { path: null, entries: [] }（縮退は呼び手が明示）。 */
export function loadLedger(dir) {
  const p = resolveLedgerPath(dir);
  if (p === null) return { path: null, entries: [] };
  return { path: p, entries: parseLedger(fs.readFileSync(p, "utf8")) };
}
