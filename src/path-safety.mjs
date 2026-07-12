import fs from "node:fs";
import path from "node:path";

/** candidate の実体が root の内側にあるか。存在しないパスは false。 */
export function isExistingPathInside(root, candidate) {
  if (!fs.existsSync(candidate)) return false;
  const realRoot = fs.realpathSync(root);
  const realCandidate = fs.realpathSync(candidate);
  const rel = path.relative(realRoot, realCandidate);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}

/** 既存パスが通常ファイルで、かつ root 内に実体を持つか。 */
export function isContainedRegularFile(root, candidate) {
  return isExistingPathInside(root, candidate) && fs.statSync(candidate).isFile();
}
