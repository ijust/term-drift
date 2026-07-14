// 既存の公式配布資産だけを、利用者の変更を壊さず一括更新する。

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_SKILL_PATHS } from "./install.mjs";
import { isContainedRegularFile, isExistingPathInside } from "./path-safety.mjs";

const PACKAGE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_VERSION = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")).version;
const PACKAGED_RULES = path.join(PACKAGE_ROOT, "rules");
const PACKAGED_SKILL = path.join(PACKAGE_ROOT, "skills", "term-drift");

// asset単位で照合するため、公式版が混在した不完全インストールも安全に修復できる。
const KNOWN_OFFICIAL_HASHES = Object.freeze({
  "rules/detect.md": new Set([
    "a0d80e5265aaec69f8ac39bd88bc868e820c5101d2d0a55afeb80f531eccefcf", // 0.2.0
    "303644de1f60c05f2a2a52948d84072fc023e38cfcadc4898d3212fac5193bfe", // 0.2.1
    "3c21b9fa6a5e2498f13713648945d2e4a61e0e664a1af9f7e16204a7e922728b", // 0.2.3
    "2a8dc9cbe27f026e06efe2088b2bd11dee89405f37a6d000f20f231f28ffb630", // 0.2.4
  ]),
  "rules/workflow.md": new Set([
    "5c15268586becc71192a4638e0819736aab88af128ad301e74fa3fb9e3292f16", // 0.2.0
    "60522e3e4a371d7f47ea0da92c0418d0704618a8654fa7e3af9444becc085e86", // 0.2.1
    "cf5d5475539b24fbfb4fe330b56505fdf2ce94df3c2eea0a08a2e88547ae7945", // 0.2.3
    "ce133509e027a1f6651267c3c4912f201931c14109381b851a3ab4caa2b31185", // 0.2.4
  ]),
  "skill/SKILL.md": new Set([
    "c6100a57266615b298bccefa5a4023c2fc0d6dccee37da4c242fc02d1742f40b", // 0.2.0
    "c006def08324ad50e749b36bfa31b7a747a32607561cd20768f64a48440266cb", // 0.2.1
    "1cf49ed084ad5c182d67f22cab9fc9cffa0403fe87e15681347c3906744bde0f", // 0.2.3
    "4f1e31fbf5bbf6158374a8853dd341eb67811c64aecb4449369f0d1f8d542175", // 0.2.4
  ]),
  "skill/agents/openai.yaml": new Set([
    "e35e3820b0fc52bec4e8f033a6519ed05b9deebd24fe0b4f4fa0269f627e94d7",
  ]),
});

function hash(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function regularFile(root, file, label) {
  if (!isContainedRegularFile(root, file)) throw new Error(`安全のため更新を拒否しました: ${label} は対象リポ内の通常ファイルである必要があります`);
}

function listFiles(root) {
  const files = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`安全のため更新を拒否しました: symlinkを含みます: ${path.relative(root, full)}`);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) files.push(path.relative(root, full));
      else throw new Error(`安全のため更新を拒否しました: 通常ファイル以外を含みます: ${path.relative(root, full)}`);
    }
  }
  visit(root);
  return files;
}

function expectedAssets(agent) {
  const skillRel = AGENT_SKILL_PATHS[agent];
  if (!skillRel) throw new Error(`未対応の agent です: ${agent}`);
  const assets = [
    { key: "rules/detect.md", targetRel: path.join(".term-drift", "rules", "detect.md"), source: path.join(PACKAGED_RULES, "detect.md") },
    { key: "rules/workflow.md", targetRel: path.join(".term-drift", "rules", "workflow.md"), source: path.join(PACKAGED_RULES, "workflow.md") },
  ];
  for (const rel of listFiles(PACKAGED_SKILL)) {
    assets.push({ key: `skill/${rel.split(path.sep).join("/")}`, targetRel: path.join(skillRel, rel), source: path.join(PACKAGED_SKILL, rel) });
  }
  return { skillRel, assets };
}

function versionContent(agent, assets) {
  const recorded = {};
  for (const asset of assets) recorded[asset.targetRel.split(path.sep).join("/")] = hash(fs.readFileSync(asset.source));
  return `${JSON.stringify({ package: "term-drift", version: PACKAGE_VERSION, agent, assets: recorded }, null, 2)}\n`;
}

/** 安全な更新。testHookはrollbackの判別テスト専用。 */
export function updateTermDrift(dir, agent, { testHook } = {}) {
  const versionTarget = path.join(dir, ".term-drift", "version.json");
  regularFile(dir, versionTarget, ".term-drift/version.json");
  let oldVersion;
  try { oldVersion = JSON.parse(fs.readFileSync(versionTarget, "utf8")); } catch { throw new Error("更新を拒否しました: version.json が不正です"); }
  if (oldVersion.package !== "term-drift" || !/^\d+\.\d+\.\d+$/.test(oldVersion.version ?? "")) {
    throw new Error("更新を拒否しました: version.json のpackageまたはversionが不正です");
  }

  const { skillRel, assets } = expectedAssets(agent);
  const skillTarget = path.join(dir, skillRel);
  if (!fs.existsSync(skillTarget) || fs.lstatSync(skillTarget).isSymbolicLink() || !fs.lstatSync(skillTarget).isDirectory() || !isExistingPathInside(dir, skillTarget)) {
    throw new Error(`安全のため更新を拒否しました: ${skillRel} は対象リポ内の通常ディレクトリである必要があります`);
  }
  const expectedSkillFiles = assets.filter((a) => a.key.startsWith("skill/")).map((a) => a.key.slice(6)).sort();
  const actualSkillFiles = listFiles(skillTarget).map((p) => p.split(path.sep).join("/")).sort();
  if (JSON.stringify(actualSkillFiles) !== JSON.stringify(expectedSkillFiles)) {
    throw new Error(`既存の skill に公式配布物と異なるファイル構成があるため上書きしません: ${skillRel}`);
  }

  const snapshots = new Map();
  for (const asset of assets) {
    const target = path.join(dir, asset.targetRel);
    regularFile(dir, target, asset.targetRel);
    const content = fs.readFileSync(target);
    const known = KNOWN_OFFICIAL_HASHES[asset.key] ?? new Set();
    const recordedHash = oldVersion.assets?.[asset.targetRel.split(path.sep).join("/")];
    if (!known.has(hash(content)) && recordedHash !== hash(content) && hash(content) !== hash(fs.readFileSync(asset.source))) {
      throw new Error(`利用者が変更した可能性があるため上書きしません: ${asset.targetRel}`);
    }
    snapshots.set(target, content);
  }
  snapshots.set(versionTarget, fs.readFileSync(versionTarget));

  const nextVersion = versionContent(agent, assets);
  try {
    for (const asset of assets) fs.writeFileSync(path.join(dir, asset.targetRel), fs.readFileSync(asset.source));
    testHook?.();
    fs.writeFileSync(versionTarget, nextVersion);
    for (const asset of assets) {
      if (!fs.readFileSync(path.join(dir, asset.targetRel)).equals(fs.readFileSync(asset.source))) throw new Error(`更新後の検証に失敗しました: ${asset.targetRel}`);
    }
    if (fs.readFileSync(versionTarget, "utf8") !== nextVersion) throw new Error("更新後のversion検証に失敗しました");
  } catch (error) {
    for (const [target, content] of snapshots) fs.writeFileSync(target, content);
    throw new Error(`更新を完了できなかったため元に戻しました: ${error.message}`);
  }
  return { updated: true, fromVersion: oldVersion.version, version: PACKAGE_VERSION, agent, skill: skillRel, assets: assets.map((a) => a.targetRel) };
}
