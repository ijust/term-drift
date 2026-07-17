// 走査対象の収集（決定的層・read-only）。
// 部位優先: コミットメッセージ → 計画文書 → ルート文書（README/AGENTS 等） → その他 docs。
// 秘密ファイル（.env・鍵・認証情報）は収集段階で除外し、収集出力に載せない。
// 対象リポの全文を読み込まない: 出力は「読むべきパスの優先順リスト」であり、文書本文は含めない
// （コミットメッセージのみ本文を含む＝git の外に実体が無いため）。

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const EXCLUDED_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", "coverage", "vendor",
  ".next", ".cache", ".term-drift",
]);

const SECRET_PATTERNS = [
  /^\.env(\..+)?$/i,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /^id_(rsa|ed25519|ecdsa)(\.pub)?$/,
  /credential/i,
  /secret/i,
  /password/i,
  /passwd/i,
  /private[-_. ]?keys?/i,
  /api[-_. ]?keys?/i,
  /auth[-_. ]?(data|info|notes?)/i,
  /^(keys?|auth|authentication)$/i,
  /^\.npmrc$/,
  /^\.netrc$/,
  /token/i,
];

const DOC_EXTS = new Set([".md", ".mdx", ".txt", ".rst", ".adoc"]);

/** 秘密ファイルとして除外すべきファイル名か。 */
export function isSecretName(name) {
  return SECRET_PATTERNS.some((re) => re.test(name));
}

/** 文書ファイルの優先度（小さいほど先に読む）。 */
export function docPriority(relPath) {
  const lower = relPath.toLowerCase();
  const base = path.basename(lower);
  const parts = lower.split(/[\\/]/);
  const inDir = (name) => parts.includes(name);
  if (inDir(".intent") || inDir("specs") || inDir("plans") || inDir("plan") || inDir("spec") || base === "plan.md" || base.startsWith("plan-")) return 1; // 計画文書（造語密度の実測最上位）
  const rootDocs = ["readme.md", "agents.md", "claude.md", "contributing.md", "context.md", "gemini.md"];
  if (!/[\\/]/.test(relPath) && rootDocs.includes(base)) return 2; // ルートの正本文書
  if (inDir("docs") || inDir("doc")) return 3;
  return 4;
}

/** 対象リポの git 管理下判定（read-only）。 */
export function isGitWorkTree(dir) {
  const r = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: dir, encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() === "true";
}

/**
 * git 追跡済みファイルの集合（リポ相対・スラッシュ区切り）。非 git 管理下なら null。read-only。
 * 適用の可逆性（INV1）は「git から復元できること」なので、worktree 内かではなく追跡済みかで判定する。
 */
export function listTrackedFiles(dir) {
  const r = spawnSync("git", ["ls-files", "-z"], { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  return new Set(r.stdout.split("\0").filter((p) => p.length > 0));
}

/** git index と異なる未ステージファイルの集合。非 git 管理下なら null。 */
export function listDirtyFiles(dir) {
  const r = spawnSync("git", ["diff", "--name-only", "-z", "--", "."], { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  return new Set(r.stdout.split("\0").filter((p) => p.length > 0));
}

/** コミットメッセージの収集（git が無い/非管理下なら空）。read-only。 */
export function collectCommits(dir, limit = 200) {
  if (!isGitWorkTree(dir)) return [];
  // 対象が worktree の部分ディレクトリでも、親リポの無関係な履歴を混ぜない。
  const r = spawnSync("git", ["log", `-n`, String(limit), "--format=%s", "--", "."], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) return [];
  return r.stdout.split("\n").filter((l) => l.trim().length > 0);
}

/** 文書ファイルの収集（優先度つき・秘密除外・再帰）。 */
export function collectDocs(dir) {
  const docs = [];
  const excludedSecrets = [];
  const walk = (rel) => {
    const abs = path.join(dir, rel);
    for (const name of fs.readdirSync(abs)) {
      const relChild = rel ? path.join(rel, name) : name;
      const absChild = path.join(dir, relChild);
      const stat = fs.lstatSync(absChild);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        if (EXCLUDED_DIRS.has(name) || (name.startsWith(".") && ![".intent", ".agents"].includes(name))) continue;
        if (isSecretName(name)) {
          // 秘密名のディレクトリ（secrets/・credentials/ 等）は配下ごと収集しない（INV3）。
          excludedSecrets.push(relChild);
          continue;
        }
        walk(relChild);
        continue;
      }
      const normalized = relChild.split(path.sep).join("/");
      // 台帳は ledger が別経路で読む正本なので、走査・一括置換には載せない。
      if (normalized === ".intent/glossary.md") continue;
      if (isSecretName(name)) {
        excludedSecrets.push(relChild);
        continue;
      }
      if (DOC_EXTS.has(path.extname(name).toLowerCase())) {
        docs.push({ path: relChild, priority: docPriority(relChild) });
      }
    }
  };
  walk("");
  docs.sort((a, b) => a.priority - b.priority || a.path.localeCompare(b.path));
  return { docs, excludedSecrets };
}

/** 走査の入口。読むべき素材の優先順リストを返す（本文はコミットメッセージのみ）。 */
export function scan(dir, { commitLimit = 200 } = {}) {
  const git = isGitWorkTree(dir);
  const commits = collectCommits(dir, commitLimit);
  const { docs, excludedSecrets } = collectDocs(dir);
  return { git, commits, docs, excludedSecrets };
}
