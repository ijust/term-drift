// 免除マーカーの解析（決定的層の共有部品）。
// 書式: <!-- term-drift:allow <語> — <理由一行> -->
// 理由の無いマーカーは「無効」(invalid) として区別する（免除として効かせない・件数報告に出す）。

const MARKER_RE = /<!--\s*term-drift:allow\s+(.+?)\s*-->/g;

/**
 * テキストから免除マーカーを全て取り出す。
 * @returns {{ term: string, reason: string | null, line: number }[]}
 *   reason が null のものは無効マーカー（理由なし）。
 */
export function parseMarkers(text) {
  const markers = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(MARKER_RE)) {
      const body = m[1].trim();
      // 語と理由は em ダッシュ（—）で区切る。理由が無ければ無効。
      const sep = body.indexOf("—");
      if (sep === -1) {
        markers.push({ term: body, reason: null, line: i + 1 });
      } else {
        const term = body.slice(0, sep).trim();
        const reason = body.slice(sep + 1).trim();
        markers.push({ term, reason: reason.length > 0 ? reason : null, line: i + 1 });
      }
    }
  }
  return markers;
}

/** そのファイルで term が有効に免除されているか（理由一行つきのマーカーがあるか）。 */
export function isExempted(text, term) {
  return parseMarkers(text).some((m) => m.term === term && m.reason !== null);
}

/** 行がマーカー行か（置換・照合の対象から外すため）。 */
export function isMarkerLine(line) {
  return /<!--\s*term-drift:allow\s/.test(line);
}
