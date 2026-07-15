// 対象リポジトリへ .term-drift/ と agent skill を非破壊に配置する。
// 配置先の判断は LLM に委ねず、この決定表だけを正本にする。

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initTermDrift, resolveLocalRules } from "./init.mjs";
import { isExistingPathInside } from "./path-safety.mjs";

const PACKAGE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGED_SKILL = path.join(PACKAGE_ROOT, "skills", "term-drift");
const PACKAGED_GEMINI_COMMAND = path.join(PACKAGE_ROOT, "integrations", "gemini", "commands", "term-drift.toml");
const PACKAGE_VERSION = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")).version;
const VERSION_FILE = path.join(".term-drift", "version.json");

export const AGENT_SKILL_PATHS = Object.freeze({
  claude: path.join(".claude", "skills", "term-drift"),
  codex: path.join(".agents", "skills", "term-drift"),
  gemini: path.join(".gemini", "skills", "term-drift"),
});

export const AGENT_COMMAND_PATHS = Object.freeze({
  gemini: path.join(".gemini", "commands", "term-drift.toml"),
});

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function pathEntryExists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function listTree(root) {
  const entries = [];
  function visit(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, item.name);
      const rel = path.relative(root, full);
      if (item.isSymbolicLink()) throw new Error(`skill 配布物に symlink は置けません: ${rel}`);
      if (item.isDirectory()) {
        entries.push({ rel, type: "dir" });
        visit(full);
      } else if (item.isFile()) {
        entries.push({ rel, type: "file", content: fs.readFileSync(full) });
      } else {
        throw new Error(`skill 配布物に通常ファイル以外は置けません: ${rel}`);
      }
    }
  }
  visit(root);
  return entries;
}

function identicalTree(source, target) {
  const expected = listTree(source);
  const actual = listTree(target);
  if (expected.length !== actual.length) return false;
  return expected.every((entry, index) => {
    const other = actual[index];
    return entry.rel === other.rel && entry.type === other.type &&
      (entry.type === "dir" || entry.content.equals(other.content));
  });
}

function validateExistingDirectory(root, dir, label) {
  const stat = fs.lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory() || !isExistingPathInside(root, dir)) {
    throw new Error(`安全のためインストールを拒否しました: ${label} は対象リポ内の通常ディレクトリである必要があります`);
  }
}

function ensureDirectoriesInside(root, dir, createdDirs) {
  const rel = path.relative(root, dir);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error("安全のためインストールを拒否しました: skill の配置先が対象リポ外です");
  }
  let current = root;
  for (const part of rel.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current)) {
      validateExistingDirectory(root, current, path.relative(root, current));
    } else {
      fs.mkdirSync(current);
      createdDirs.push(current);
    }
  }
}

function copySkill(source, target, root, createdFiles, createdDirs) {
  ensureDirectoriesInside(root, target, createdDirs);
  for (const entry of listTree(source)) {
    const dest = path.join(target, entry.rel);
    if (entry.type === "dir") {
      ensureDirectoriesInside(root, dest, createdDirs);
    } else {
      ensureDirectoriesInside(root, path.dirname(dest), createdDirs);
      fs.writeFileSync(dest, entry.content, { flag: "wx" });
      createdFiles.push(dest);
    }
  }
}

function copyFile(source, target, root, createdFiles, createdDirs) {
  ensureDirectoriesInside(root, path.dirname(target), createdDirs);
  fs.writeFileSync(target, fs.readFileSync(source), { flag: "wx" });
  createdFiles.push(target);
}

function agentExtraAssets(agent) {
  if (agent !== "gemini") return [];
  return [{
    source: PACKAGED_GEMINI_COMMAND,
    targetRel: AGENT_COMMAND_PATHS.gemini,
  }];
}

function rollback(paths, dirs) {
  for (const file of [...paths].reverse()) {
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
  }
  for (const dir of [...dirs].reverse()) {
    try { if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch {}
  }
}

/**
 * @param {string} dir target repository
 * @param {"claude"|"codex"|"gemini"} agent
 */
export function installTermDrift(dir, agent = "claude") {
  const skillRel = AGENT_SKILL_PATHS[agent];
  if (!skillRel) throw new Error(`未対応の agent です: ${agent}`);

  const skillTarget = path.join(dir, skillRel);
  const extraAssets = agentExtraAssets(agent);
  const versionTarget = path.join(dir, VERSION_FILE);
  const managedAssets = {
    ".term-drift/rules/detect.md": sha256(fs.readFileSync(path.join(PACKAGE_ROOT, "rules", "detect.md"))),
    ".term-drift/rules/workflow.md": sha256(fs.readFileSync(path.join(PACKAGE_ROOT, "rules", "workflow.md"))),
  };
  for (const entry of listTree(PACKAGED_SKILL).filter((entry) => entry.type === "file")) {
    managedAssets[path.join(skillRel, entry.rel).split(path.sep).join("/")] = sha256(entry.content);
  }
  for (const asset of extraAssets) {
    managedAssets[asset.targetRel.split(path.sep).join("/")] = sha256(fs.readFileSync(asset.source));
  }
  const versionContent = `${JSON.stringify({ package: "term-drift", version: PACKAGE_VERSION, agent, assets: managedAssets }, null, 2)}\n`;

  let versionAlreadyInstalled = false;
  if (fs.existsSync(versionTarget)) {
    if (!fs.lstatSync(versionTarget).isFile() || !isExistingPathInside(dir, versionTarget)) {
      throw new Error(`安全のためインストールを拒否しました: ${VERSION_FILE} は対象リポ内の通常ファイルである必要があります`);
    }
    if (fs.readFileSync(versionTarget, "utf8") !== versionContent) {
      throw new Error(`既存のバージョン記録と異なるため上書きしません: ${VERSION_FILE}`);
    }
    versionAlreadyInstalled = true;
  }

  let skillAlreadyInstalled = false;
  if (fs.existsSync(skillTarget)) {
    validateExistingDirectory(dir, skillTarget, skillRel);
    if (!identicalTree(PACKAGED_SKILL, skillTarget)) {
      throw new Error(`既存の skill と内容が異なるため上書きしません: ${skillRel}`);
    }
    skillAlreadyInstalled = true;
  }

  const existingExtraAssets = new Set();
  for (const asset of extraAssets) {
    const target = path.join(dir, asset.targetRel);
    if (!pathEntryExists(target)) continue;
    if (!fs.lstatSync(target).isFile() || !isExistingPathInside(dir, target)) {
      throw new Error(`安全のためインストールを拒否しました: ${asset.targetRel} は対象リポ内の通常ファイルである必要があります`);
    }
    if (!fs.readFileSync(target).equals(fs.readFileSync(asset.source))) {
      throw new Error(`既存の Gemini CLI command と内容が異なるため上書きしません: ${asset.targetRel}`);
    }
    existingExtraAssets.add(asset.targetRel);
  }

  const createdFiles = [];
  const createdDirs = [];
  const markerExisted = fs.existsSync(path.join(dir, ".term-drift"));
  const rulesExisted = fs.existsSync(path.join(dir, ".term-drift", "rules"));

  try {
    const initialized = initTermDrift(dir);
    for (const rel of initialized.created) {
      const full = path.join(dir, rel.replace(/[\\/]$/, ""));
      if (rel.endsWith("/") || rel.endsWith(path.sep)) createdDirs.push(full);
      else createdFiles.push(full);
    }

    if (!versionAlreadyInstalled) {
      fs.writeFileSync(versionTarget, versionContent, { flag: "wx" });
      createdFiles.push(versionTarget);
    }

    if (!skillAlreadyInstalled) copySkill(PACKAGED_SKILL, skillTarget, dir, createdFiles, createdDirs);
    for (const asset of extraAssets) {
      if (!existingExtraAssets.has(asset.targetRel)) {
        copyFile(asset.source, path.join(dir, asset.targetRel), dir, createdFiles, createdDirs);
      }
    }

    const localRules = resolveLocalRules(dir);
    const extraAssetsValid = extraAssets.every((asset) => {
      const target = path.join(dir, asset.targetRel);
      return fs.existsSync(target) && fs.readFileSync(target).equals(fs.readFileSync(asset.source));
    });
    if (!localRules || !fs.existsSync(path.join(skillTarget, "SKILL.md")) || !extraAssetsValid || fs.readFileSync(versionTarget, "utf8") !== versionContent) {
      throw new Error("必須ファイルを検証できなかったため、インストールは未完了です");
    }
    if (!identicalTree(PACKAGED_SKILL, skillTarget)) {
      throw new Error("配置した skill の内容が配布物と一致しないため、インストールは未完了です");
    }

    const created = [...new Set([
      ...initialized.created,
      ...(versionAlreadyInstalled ? [] : [VERSION_FILE]),
      ...(skillAlreadyInstalled ? [] : [skillRel]),
      ...extraAssets.filter((asset) => !existingExtraAssets.has(asset.targetRel)).map((asset) => asset.targetRel),
    ])];
    const skipped = [...new Set([
      ...initialized.skipped,
      ...(versionAlreadyInstalled ? [VERSION_FILE] : []),
      ...(skillAlreadyInstalled ? [skillRel] : []),
      ...extraAssets.filter((asset) => existingExtraAssets.has(asset.targetRel)).map((asset) => asset.targetRel),
    ])];
    return {
      installed: true,
      agent,
      version: PACKAGE_VERSION,
      skill: skillRel,
      commands: extraAssets.map((asset) => asset.targetRel),
      ledger: initialized.ledger,
      created,
      skipped,
      notes: initialized.notes,
    };
  } catch (error) {
    rollback(createdFiles, createdDirs);
    if (!rulesExisted) {
      const rulesDir = path.join(dir, ".term-drift", "rules");
      try { if (fs.existsSync(rulesDir) && fs.readdirSync(rulesDir).length === 0) fs.rmdirSync(rulesDir); } catch {}
    }
    if (!markerExisted) {
      const markerDir = path.join(dir, ".term-drift");
      try { if (fs.existsSync(markerDir) && fs.readdirSync(markerDir).length === 0) fs.rmdirSync(markerDir); } catch {}
    }
    throw error;
  }
}
