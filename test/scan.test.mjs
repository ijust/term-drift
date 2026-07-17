// 走査の収集（C-td1・INV3）の判別テスト。
// 秘密除外・部位優先・非 git での縮退（コミット空）。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scan, isSecretName, collectCommits, collectDocs, docPriority } from "../src/scan.mjs";

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
  for (const name of [".env", ".env.local", "server.pem", "id_rsa", "credentials.json", "secret-notes.md", "passwords.md", "keys", ".npmrc"]) {
    assert.ok(isSecretName(name), `${name} は秘密`);
  }
  for (const name of ["README.md", "plan.md", "guide.txt"]) {
    assert.ok(!isSecretName(name), `${name} は秘密でない`);
  }
});

test("keys/passwords.md のような明白な認証情報パスは配下ごと除外する", () => {
  const dir = tmpCopy();
  fs.mkdirSync(path.join(dir, "keys"));
  fs.writeFileSync(path.join(dir, "keys", "passwords.md"), "do-not-read");
  const result = scan(dir);
  assert.ok(!result.docs.some((d) => d.path.includes("passwords")));
  assert.ok(result.excludedSecrets.includes("keys"));
});

test(".intent の計画文書は優先走査し、台帳だけは別経路のため除外する", () => {
  const dir = tmpCopy();
  fs.mkdirSync(path.join(dir, ".intent", "packets"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".intent", "packets", "plan.md"), "plan");
  fs.writeFileSync(path.join(dir, ".intent", "glossary.md"), "ledger");
  const { docs } = collectDocs(dir);
  const plan = docs.find((d) => d.path.endsWith(path.join(".intent", "packets", "plan.md")));
  assert.equal(plan?.priority, 1);
  assert.ok(!docs.some((d) => d.path.endsWith(path.join(".intent", "glossary.md"))));
});

test(".agents 配下のスキル文書は走査し、その他の隠しディレクトリは除外する", () => {
  const dir = tmpCopy();
  fs.mkdirSync(path.join(dir, ".agents", "skills", "intent-status"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".agents", "skills", "intent-status", "SKILL.md"), "status skill");
  fs.mkdirSync(path.join(dir, ".hidden"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".hidden", "notes.md"), "hidden notes");

  const { docs } = collectDocs(dir);
  const collected = docs.map((doc) => doc.path);

  assert.ok(collected.includes(path.join(".agents", "skills", "intent-status", "SKILL.md")));
  assert.ok(!collected.includes(path.join(".hidden", "notes.md")));
});

test("部分ディレクトリのコミット収集に親リポの無関係な履歴を混ぜない", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "term-drift-history-"));
  const child = path.join(root, "child");
  fs.mkdirSync(child);
  fs.writeFileSync(path.join(child, "doc.md"), "child");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "child initial"], { cwd: root });
  fs.writeFileSync(path.join(root, "parent.md"), "parent only");
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "PARENT_SECRET_COMMIT"], { cwd: root });
  assert.ok(!collectCommits(child).includes("PARENT_SECRET_COMMIT"));
  assert.ok(collectCommits(child).includes("child initial"));
});

test("Windows 区切りでも計画文書とルート文書の優先度を誤判定しない", () => {
  assert.equal(docPriority("specs\\plan.md"), 1);
  assert.notEqual(docPriority("docs\\README.md"), 2, "入れ子のREADMEをルート扱いしない");
});
