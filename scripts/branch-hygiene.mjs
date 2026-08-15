import { execFileSync } from "node:child_process";

const DEFAULT_BASE_REF =
  process.env.DEFAULT_BASE_REF || "origin/claude/domner-app-build-91gz3x";
const STATIC_SHELL_FILES = new Set(["app.js", "index.html", "styles.css"]);

function runGit(args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: options.cwd || process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stderr =
      typeof error.stderr === "string" ? error.stderr.trim() : "git command failed";
    throw new Error(stderr || "git command failed");
  }
}

function parseArgs(argv) {
  let ref = "HEAD";
  let base = DEFAULT_BASE_REF;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--ref") {
      ref = argv[index + 1] || ref;
      index += 1;
      continue;
    }

    if (arg === "--base") {
      base = argv[index + 1] || base;
      index += 1;
    }
  }

  return { ref, base };
}

function unique(items) {
  return [...new Set(items)];
}

function main() {
  const { ref, base } = parseArgs(process.argv.slice(2));

  runGit(["rev-parse", "--verify", ref]);
  runGit(["rev-parse", "--verify", base]);

  let mergeBase = "";
  try {
    mergeBase = runGit(["merge-base", ref, base]);
  } catch {
    mergeBase = "";
  }

  if (!mergeBase) {
    console.error(`FAIL: ${ref} has no shared history with ${base}.`);
    console.error("Create a new branch from the default branch and replay only the intended changes.");
    process.exit(1);
  }

  const changedFilesOutput = runGit(["diff", "--name-only", `${mergeBase}..${ref}`]);
  const changedFiles = changedFilesOutput
    ? unique(changedFilesOutput.split(/\r?\n/).map((file) => file.trim()).filter(Boolean))
    : [];

  console.log(`OK: ${ref} shares history with ${base} at ${mergeBase}.`);

  if (changedFiles.length === 0) {
    console.log("No committed file changes found on this branch.");
    return;
  }

  console.log(`Changed files: ${changedFiles.length}`);

  const onlyStaticShellFiles = changedFiles.every((file) => STATIC_SHELL_FILES.has(file));
  if (onlyStaticShellFiles) {
    console.error("WARN: this branch changes only root static shell files:");
    for (const file of changedFiles) {
      console.error(` - ${file}`);
    }
    console.error("Verify these files are intentionally part of the deployed app before opening a PR.");
    process.exit(2);
  }

  const staticShellFiles = changedFiles.filter((file) => STATIC_SHELL_FILES.has(file));
  if (staticShellFiles.length > 0) {
    console.log("Heads-up: this branch also touches the root static shell files:");
    for (const file of staticShellFiles) {
      console.log(` - ${file}`);
    }
  }
}

main();
