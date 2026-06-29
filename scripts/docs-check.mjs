// Lightweight documentation consistency checker for Ome Music.
//
// Runs as `npm run docs:check` and in CI on every pull request. Keeps the
// open-source repository honest about version numbers, broken links, missing
// screenshots, and accidental credential leaks without pulling in heavy deps.
//
// Exit code is non-zero if any check fails. Designed to be readable and
// maintainable rather than exhaustive.

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const ProjectRoot = path.resolve(import.meta.dirname, "..");

const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

async function readFile(relativePath) {
  try {
    return await fs.readFile(path.resolve(ProjectRoot, relativePath), "utf8");
  } catch (error) {
    fail(`Could not read ${relativePath}: ${error.message}`);
    return null;
  }
}

async function pathExists(relativePath) {
  try {
    await fs.access(path.resolve(ProjectRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

function extractJsonVersion(text, field) {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed[field] === "string" ? parsed[field] : null;
  } catch (error) {
    fail(`Could not parse JSON for ${field}: ${error.message}`);
    return null;
  }
}

// Match markdown links of the form [text](target). Captures the target so we can
// resolve local files and ignore http(s) links.
const MarkdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/g;

function collectLocalLinks(markdown) {
  const links = [];
  let match;
  while ((match = MarkdownLinkPattern.exec(markdown)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;
    if (/^(https?:|mailto:|#)/i.test(raw)) continue;
    // Strip optional anchors like ./file.md#section
    const [filePath] = raw.split("#");
    if (filePath) links.push(filePath);
  }
  return links;
}

async function checkRequiredFiles() {
  const required = [
    "README.md",
    "README.zh-CN.md",
    "docs/BUILD.md",
    "docs/CHANGELOG.md",
    "docs/CONFIGURATION.md",
    "docs/TROUBLESHOOTING.md",
    "docs/MAINTENANCE.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "LICENSE",
  ];
  for (const file of required) {
    if (!(await pathExists(file))) {
      fail(`Required file missing: ${file}`);
    }
  }
}

async function checkReadmeCrossLinks() {
  const english = await readFile("README.md");
  const chinese = await readFile("README.zh-CN.md");
  if (!english || !chinese) return;

  if (!/\]\(\.\/README\.zh-CN\.md\)/.test(english)) {
    fail("English README does not link to ./README.zh-CN.md.");
  }
  if (!/\]\(\.\/README\.md\)/.test(chinese)) {
    fail("Chinese README does not link back to ./README.md.");
  }
}

async function checkScreenshots() {
  const english = await readFile("README.md");
  if (!english) return;
  const referenced = [
    ...english.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g),
  ].map((match) => match[1]);

  for (const ref of referenced) {
    if (await pathExists(ref)) continue;
    fail(`README references missing image: ${ref}`);
  }
}

async function checkVersionConsistency() {
  const packageJson = await readFile("package.json");
  const cargoToml = await readFile("src-tauri/Cargo.toml");
  const tauriConf = await readFile("src-tauri/tauri.conf.json");
  const readme = await readFile("README.md");
  const readmeZh = await readFile("README.zh-CN.md");
  const buildGuide = await readFile("docs/BUILD.md");
  const changelog = await readFile("docs/CHANGELOG.md");

  const packageVersion = packageJson ? extractJsonVersion(packageJson, "version") : null;
  const tauriVersion = tauriConf ? extractJsonVersion(tauriConf, "version") : null;
  const cargoMatch = cargoToml ? cargoToml.match(/^version\s*=\s*"([^"]+)"/m) : null;
  const cargoVersion = cargoMatch ? cargoMatch[1] : null;

  const sources = [
    { name: "package.json", value: packageVersion },
    { name: "src-tauri/Cargo.toml", value: cargoVersion },
    { name: "src-tauri/tauri.conf.json", value: tauriVersion },
  ];

  const canonical = sources.find((entry) => entry.value)?.value;
  if (!canonical) {
    fail("Could not determine a canonical project version.");
    return;
  }

  for (const entry of sources) {
    if (entry.value && entry.value !== canonical) {
      fail(`Version mismatch: ${entry.name}=${entry.value} but expected ${canonical}.`);
    }
  }

  // README / BUILD / CHANGELOG should reference the canonical version at least once.
  const docsToCheck = [
    { name: "README.md", text: readme, optional: false },
    { name: "README.zh-CN.md", text: readmeZh, optional: false },
    { name: "docs/BUILD.md", text: buildGuide, optional: false },
    { name: "docs/CHANGELOG.md", text: changelog, optional: false },
  ];

  for (const doc of docsToCheck) {
    if (!doc.text) continue;
    if (!doc.text.includes(canonical)) {
      fail(`${doc.name} does not reference the canonical version ${canonical}.`);
    }
  }

  // Detect obvious stale installer filenames. We allow the canonical version
  // and the immediately preceding one (for the previous release notes block).
  const staleVersionPattern = /Ome\.Music_0\.(1|2)\.\d+_x64-setup\.exe/;
  for (const doc of docsToCheck) {
    if (!doc.text) continue;
    if (staleVersionPattern.test(doc.text)) {
      fail(`${doc.name} references a stale installer filename (pre-0.3.x).`);
    }
  }
}

async function checkDocsLinks() {
  const markdownFiles = [
    "README.md",
    "README.zh-CN.md",
    "docs/BUILD.md",
    "docs/CONFIGURATION.md",
    "docs/TROUBLESHOOTING.md",
    "docs/MAINTENANCE.md",
    "docs/CHANGELOG.md",
    "docs/PRIVACY.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
  ];

  for (const file of markdownFiles) {
    const text = await readFile(file);
    if (!text) continue;
    const links = collectLocalLinks(text);
    for (const link of links) {
      const resolved = path.resolve(path.dirname(path.resolve(ProjectRoot, file)), link);
      const relative = path.relative(ProjectRoot, resolved);
      if (!(await pathExists(relative))) {
        fail(`${file} links to missing file: ${link}`);
      }
    }
  }
}

async function checkSensitiveText() {
  // We scan tracked docs and READMEs only. Code is covered by lint + review.
  // These tokens are case-sensitive on purpose: matches like "token" inside
  // normal prose are not flagged, but actual credential-shaped strings are.
  const files = [
    "README.md",
    "README.zh-CN.md",
    "docs/BUILD.md",
    "docs/CONFIGURATION.md",
    "docs/TROUBLESHOOTING.md",
    "docs/MAINTENANCE.md",
    "docs/CHANGELOG.md",
    "docs/PRIVACY.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
  ];

  const forbiddenPatterns = [
    { name: "MUSIC_U cookie", pattern: /MUSIC_U[=:][A-Za-z0-9%]{16,}/ },
    { name: "SESSDATA cookie", pattern: /SESSDATA[=:][A-Za-z0-9%]{16,}/ },
    { name: "bili_jct cookie", pattern: /bili_jct[=:][A-Za-z0-9]{16,}/ },
    { name: "DedeUserID", pattern: /DedeUserID[=:]\d{6,}/ },
    { name: "Bearer token", pattern: /Bearer\s+[A-Za-z0-9._-]{20,}/ },
    { name: "API_KEY assignment", pattern: /API_KEY[=:]["'][A-Za-z0-9_\-]{16,}/ },
    { name: "Authorization header", pattern: /Authorization[=:]["']Bearer\s+[A-Za-z0-9._-]{16,}/ },
    { name: "Windows user path", pattern: /[Cc]:\\Users\\/ },
    { name: "drive D reference", pattern: /D:\\[A-Za-z]/ },
    { name: "gmail address", pattern: /[a-zA-Z0-9._%+-]+@gmail\.com/ },
  ];

  for (const file of files) {
    const text = await readFile(file);
    if (!text) continue;
    for (const { name, pattern } of forbiddenPatterns) {
      if (pattern.test(text)) {
        fail(`Potential sensitive text in ${file}: ${name}`);
      }
    }
  }
}

async function main() {
  await checkRequiredFiles();
  await checkReadmeCrossLinks();
  await checkScreenshots();
  await checkVersionConsistency();
  await checkDocsLinks();
  await checkSensitiveText();

  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of warnings) console.log(`  - ${warning}`);
  }

  if (failures.length === 0) {
    console.log("docs:check passed. README, versions, links, screenshots, and sensitive text all clean.");
    return 0;
  }

  console.error("docs:check failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  return 1;
}

const exitCode = await main();
process.exit(exitCode);
