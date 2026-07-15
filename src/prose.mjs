// 文書中の「散文」だけを扱う共有部品。
// Markdown のコードフェンス・インラインコード・HTML コメント・リンク先は識別子や機械参照を
// 含み得るため、用語置換・残存照合の対象から外す。

import fs from "node:fs";
import path from "node:path";

const MARKDOWN_EXTS = new Set([".md", ".mdx"]);
const INLINE_PROTECTED_RE = /<!--.*?-->|`+[^`\n]*`+|\]\([^\n)]*\)|<https?:\/\/[^>\n]+>/g;

function transformOutsideInlineProtected(line, transform) {
  let out = "";
  let offset = 0;
  for (const match of line.matchAll(INLINE_PROTECTED_RE)) {
    const index = match.index ?? 0;
    out += transform(line.slice(offset, index));
    out += match[0];
    offset = index + match[0].length;
  }
  return out + transform(line.slice(offset));
}

/** Markdown の保護領域を残し、散文部分だけ transform に渡す。 */
export function transformProse(text, filePath, transform) {
  const markdown = MARKDOWN_EXTS.has(path.extname(filePath).toLowerCase());
  if (!markdown) return text.split("\n").map((line) => transformOutsideInlineProtected(line, transform)).join("\n");

  let fence = null;
  return text.split("\n").map((line) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence !== null) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      return line;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      return line;
    }
    return transformOutsideInlineProtected(line, transform);
  }).join("\n");
}

function rawOccurrenceRanges(text, needle) {
  if (needle.length === 0) return [];
  const ranges = [];
  let offset = 0;
  while (true) {
    const start = text.indexOf(needle, offset);
    if (start === -1) break;
    ranges.push({ start, end: start + needle.length });
    offset = start + needle.length;
  }
  return ranges;
}

/**
 * 書き換え単位の完全一致範囲を返す。
 * 周辺文脈にはインラインコード・リンク先・改行を含めてよいが、候補語そのものが
 * 散文として現れる一致だけを対象にする。コード内だけの同文は一致に数えない。
 */
export function rewriteUnitOccurrenceRanges(text, filePath, rewriteUnit, term) {
  const expectedTermOccurrences = proseOccurrenceCount(rewriteUnit, filePath, term);
  if (expectedTermOccurrences === 0) return [];
  const proseTermRanges = proseOccurrenceRanges(text, filePath, term);
  return rawOccurrenceRanges(text, rewriteUnit).filter(({ start, end }) => (
    proseTermRanges.filter((range) => range.start >= start && range.end <= end).length === expectedTermOccurrences
  ));
}

/** 書き換え単位が始まる行番号を返す。 */
export function rewriteUnitOccurrenceLines(text, filePath, rewriteUnit, term) {
  return rewriteUnitOccurrenceRanges(text, filePath, rewriteUnit, term).map(({ start }) => (
    text.slice(0, start).split("\n").length
  ));
}

/**
 * 散文書き換えで保持すべきコード・コメント・リンク先・コードフェンス内容を返す。
 * 改行は区切りとして扱い、保護された文字列自体の同一性を比較できる形にする。
 */
export function protectedFragments(text, filePath) {
  const mask = transformProse(text, filePath, (segment) => "\0".repeat(segment.length));
  const fragments = [];
  let current = "";
  const flush = () => {
    if (current.length > 0) fragments.push(current);
    current = "";
  };
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "\n" && mask[i] !== "\0") current += text[i];
    else flush();
  }
  flush();
  return fragments;
}

/** 散文部分に term が現れる行番号を返す。 */
export function proseOccurrenceLines(text, filePath, term) {
  const lines = [];
  const visible = transformProse(text, filePath, (segment) => segment.includes(term) ? "\u0001" : "");
  for (const [index, line] of visible.split("\n").entries()) {
    if (line.includes("\u0001")) lines.push(index + 1);
  }
  return lines;
}

/** 散文部分に term が現れる実数を返す（同じ行の複数出現も別々に数える）。 */
export function proseOccurrenceCount(text, filePath, term) {
  let count = 0;
  transformProse(text, filePath, (segment) => {
    let offset = 0;
    while (true) {
      const index = segment.indexOf(term, offset);
      if (index === -1) break;
      count += 1;
      offset = index + term.length;
    }
    return segment;
  });
  return count;
}

/** 散文部分に現れる term の UTF-16 範囲を返す（同じ行の複数出現も別々に返す）。 */
export function proseOccurrenceRanges(text, filePath, term) {
  if (term.length === 0) return [];
  // transformProse は保護領域を元の文字列のまま残す。散文だけを同じ長さの NUL に
  // 置き換えることで、元テキストと同じ offset の散文マスクを作る。
  const mask = transformProse(text, filePath, (segment) => "\0".repeat(segment.length));
  const ranges = [];
  let offset = 0;
  while (true) {
    const start = text.indexOf(term, offset);
    if (start === -1) break;
    const end = start + term.length;
    if ([...mask.slice(start, end)].every((char) => char === "\0")) ranges.push({ start, end });
    offset = end;
  }
  return ranges;
}

/** UTF-8 として妥当なファイルだけを文字列にする。妥当でなければ null。 */
export function readUtf8File(filePath) {
  const bytes = fs.readFileSync(filePath);
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  return bytes.toString("utf8");
}
