import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const ProjectRoot = path.resolve(import.meta.dirname, "..");

function formatBytes(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} KB`;
  return `${Math.round(bytes)} B`;
}

async function getPathSize(targetPath) {
  try {
    const stat = await fs.stat(targetPath);
    if (!stat.isDirectory()) return stat.size;
  } catch {
    return 0;
  }

  let total = 0;
  const stack = [targetPath];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        stack.push(full);
      } else if (entry.isFile()) {
        try {
          total += (await fs.stat(full)).size;
        } catch {
          /* ignore unreadable files */
        }
      }
    }
  }
  return total;
}

async function sizeRow(label, targetPath) {
  const bytes = await getPathSize(targetPath);
  return { label, size: formatBytes(bytes), bytes, path: targetPath };
}

async function topFiles(root, limit = 20) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        stack.push(full);
      } else if (entry.isFile()) {
        try {
          files.push({ size: (await fs.stat(full)).size, path: full });
        } catch {
          /* ignore */
        }
      }
    }
  }
  return files.sort((a, b) => b.size - a.size).slice(0, limit);
}

async function topDirs(root, limit = 20) {
  const dirs = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    dirs.push(dir);
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        stack.push(path.join(dir, entry.name));
      }
    }
  }

  const measured = [];
  for (const dir of dirs) {
    const bytes = await getPathSize(dir);
    measured.push({ size: formatBytes(bytes), bytes, path: dir });
  }
  return measured.sort((a, b) => b.bytes - a.bytes).slice(0, limit);
}

function printTable(rows, columns) {
  const widths = columns.map((col) => col.length);
  const data = rows.map((row) => columns.map((col) => String(row[col] ?? "")));
  for (const row of data) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i], cell.length);
    });
  }
  const header = columns.map((col, i) => col.padEnd(widths[i])).join("  ");
  const separator = widths.map((w) => "-".repeat(w)).join("  ");
  console.log(header);
  console.log(separator);
  for (const row of data) {
    console.log(row.map((cell, i) => cell.padEnd(widths[i])).join("  "));
  }
}

const rows = await Promise.all([
  sizeRow("Project total", ProjectRoot),
  sizeRow("node_modules", path.join(ProjectRoot, "node_modules")),
  sizeRow("src-tauri/target", path.join(ProjectRoot, "src-tauri", "target")),
  sizeRow("src-tauri/target/debug", path.join(ProjectRoot, "src-tauri", "target", "debug")),
  sizeRow("src-tauri/target/release", path.join(ProjectRoot, "src-tauri", "target", "release")),
  sizeRow("dist", path.join(ProjectRoot, "dist")),
  sizeRow("artifacts", path.join(ProjectRoot, "artifacts")),
  sizeRow("src", path.join(ProjectRoot, "src")),
  sizeRow("src-tauri/src", path.join(ProjectRoot, "src-tauri", "src"))
]);

console.log("=== Ome Music Size Audit ===");
printTable(
  [...rows].sort((a, b) => b.bytes - a.bytes),
  ["label", "size", "path"]
);

console.log("\n=== User Data Hints ===");
const userDataRoots = [
  process.env.APPDATA && path.join(process.env.APPDATA, "com.ome.music"),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "com.ome.music"),
  process.env.APPDATA && path.join(process.env.APPDATA, "ome")
].filter(Boolean);
const userDataRows = await Promise.all(userDataRoots.map((p) => sizeRow("User data", p)));
printTable(
  [...userDataRows].sort((a, b) => b.bytes - a.bytes),
  ["label", "size", "path"]
);

console.log("\n=== Top Directories ===");
const dirRows = (await topDirs(ProjectRoot, 20)).map(({ size, path: p }) => ({ size, path: p }));
console.table(dirRows.length ? dirRows : []);

console.log("\n=== Top Files ===");
const fileRows = (await topFiles(ProjectRoot, 20)).map(({ size, path: p }) => ({
  size: formatBytes(size),
  path: p
}));
console.table(fileRows.length ? fileRows : []);
