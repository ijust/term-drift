// 走査の収集（C-td1・INV3）の判別テスト。
// 秘密除外・部位優先・非 git での縮退（コミット空）。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scan, isSecretName, collectDocs } from "../src/scan.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, "fixtures", "scan-repo");

// フィクスチャは term-drift 自身の git 内にあるため、git 判定を汚さない一時コピーで検査する。
function tmpCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "term-drift-scan-"));
  fs.cpSync(FIX, dir, { recursive: true });
  return dir;
}

test("秘密ファイルは収集されず、除外として報告される（INV3）", () => {
  const dir = tmpCopy();
  const result = scan(dir);
  const collected = result.docs.map((d) => d.path);
  assert.ok(!collected.some((p) => p.includes(".env")), ".env が収集されない");
  assert.ok(!collected.some((p) => p.endsWith(".key")), "鍵ファイルが収集されない");
  assert.ok(result.excludedSecrets.includes(".env"), ".env が除外として報告される");
  assert.ok(result.excludedSecrets.includes("private.key"), "private.key が除外として報告される");
  // 収集結果のどこにも秘密の中身が現れない（パス一覧のみの出力）。
  assert.ok(!JSON.stringify(result).includes("do-not-collect-me"), "秘密の中身が出力に混入しない");
});

test("秘密名のディレクトリは配下ごと収集されない（INV3）", () => {
  const dir = tmpCopy();
  fs.mkdirSync(path.join(dir, "secrets"));
  fs.writeFileSync(path.join(dir, "secrets", "deployment.md"), "do-not-collect-me-in-secret-dir");
  fs.mkdirSync(path.join(dir, "credentials"));
  fs.writeFileSync(path.join(dir, "credentials", "notes.txt"), "do-not-collect-me-in-secret-dir");
  const result = scan(dir);
  const collected = result.docs.map((d) => d.path);
  assert.ok(!collected.some((p) => p.startsWith("secrets")), "secrets/ 配下が収集されない");
  assert.ok(!collected.some((p) => p.startsWith("credentials")), "credentials/ 配下が収集されない");
  assert.ok(result.excludedSecrets.includes("secrets"), "secrets/ が除外として報告される");
  assert.ok(result.excludedSecrets.includes("credentials"), "credentials/ が除外として報告される");
  assert.ok(!JSON.stringify(result).includes("do-not-collect-me-in-secret-dir"), "秘密の中身が出力に混入しない");
});

test("部位優先: 計画文書 → ルート文書 → docs → その他 の順で並ぶ", () => {
  const { docs } = collectDocs(tmpCopy());
  const order = docs.map((d) => d.path);
  assert.ok(order.indexOf(path.join("specs", "plan.md")) < order.indexOf("README.md"), "計画文書がルート文書より先");
  assert.ok(order.indexOf("README.md") < order.indexOf(path.join("docs", "guide.md")), "ルート文書が docs より先");
  assert.ok(order.indexOf(path.join("docs", "guide.md")) < order.indexOf("notes.md"), "docs がその他より先");
});

test("非 git のリポではコミット収集が空で縮退する（エラーにしない）", () => {
  const result = scan(tmpCopy());
  assert.equal(result.git, false);
  assert.deepEqual(result.commits, []);
});

test("isSecretName が代表的な秘密ファイル名を判定する", () => {
  for (const name of [".env", ".env.local", "server.pem", "id_rsa", "credentials.json", "secret-notes.md", ".npmrc"]) {
    assert.ok(isSecretName(name), `${name} は秘密`);
  }
  for (const name of ["README.md", "plan.md", "guide.txt"]) {
    assert.ok(!isSecretName(name), `${name} は秘密でない`);
  }
});
