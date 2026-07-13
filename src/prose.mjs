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
