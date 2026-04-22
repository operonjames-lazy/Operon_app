#!/usr/bin/env bash
# Prepare a clean zip of the repo for handoff to an external tester.
#
# Why this script exists: the "shipping folder" in TESTING_GUIDE.md §0 is
# just the operator's working directory. That directory contains
# .env.local (live secrets), node_modules, .next build output, contract
# caches, and other artifacts that must never ride along to a tester.
# Doing this by hand means the one thing you forget is the one thing
# that leaks. This script produces a zip with only the files a tester
# needs to run §3.1–§3.9 of the testing guide, and refuses to proceed
# if any excluded pattern made it through.
#
# Usage (from repo root):
#   scripts/prepare-tester-package.sh
#
# Output:
#   ../operon-tester-YYYY-MM-DD.zip (one directory above the repo)
#
# Requires: bash, tar (Git Bash bundles these), powershell.exe for the
# final zip (native on Windows). Abort early if any piece is missing.

set -euo pipefail

# ─── Locate repo root ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Quick sanity — this must be the operon-dashboard root.
for required in package.json contracts docs/TESTING_GUIDE.md; do
  if [[ ! -e "$required" ]]; then
    echo "ABORT: $required not found. Run this from the operon-dashboard root." >&2
    exit 1
  fi
done

# ─── Patterns excluded from the tester package ──────────────────────
# Note: tar --exclude matches against paths relative to the tar root.
EXCLUDES=(
  # Secrets — the entire reason this script exists.
  '--exclude=.env'
  '--exclude=.env.*'
  '--exclude=*/.env'
  '--exclude=*/.env.*'
  # Install / build artifacts — tester runs pnpm install themselves.
  '--exclude=node_modules'
  '--exclude=*/node_modules'
  '--exclude=.next'
  '--exclude=*/.next'
  '--exclude=.turbo'
  '--exclude=*/.turbo'
  '--exclude=contracts/cache'
  '--exclude=contracts/artifacts'
  '--exclude=contracts/typechain-types'
  '--exclude=tsconfig.tsbuildinfo'
  '--exclude=*/tsconfig.tsbuildinfo'
  # Source control + editor state.
  '--exclude=.git'
  '--exclude=*/.git'
  '--exclude=.vscode'
  '--exclude=.idea'
  '--exclude=.claude'
  # Test / local-run artifacts that leak operator state.
  '--exclude=.playwright-mcp'
  '--exclude=*.log'
  '--exclude=coverage'
  # Internal review bookkeeping — not useful to the tester, contains
  # internal review history.
  '--exclude=review-log.md'
  '--exclude=REVIEW_ADDENDUM.md'
  # Claude Code / agent-runtime instructions — session-specific rules
  # for the coding-assistant environment, not something a tester needs.
  '--exclude=CLAUDE.md'
  '--exclude=AGENTS.md'
  # Dev-indexer cursor state (tracks last-seen block per chain).
  # Shipping the operator's cursor means the tester's indexer skips
  # events that happened before their own deploy.
  '--exclude=.indexer-cursor.json'
  # Previously-produced tester packages.
  '--exclude=operon-tester-*.zip'
  '--exclude=*.zip'
)

# ─── Stage into a temp dir we control ───────────────────────────────
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

echo "staging → $STAGING"
tar cf - "${EXCLUDES[@]}" . | (cd "$STAGING" && tar xf -)

# ─── Post-stage safety sweep ────────────────────────────────────────
# If any forbidden pattern slipped through (tar excludes can be fiddly),
# abort loudly rather than ship.
FORBIDDEN_HITS="$(find "$STAGING" \
  \( -name '.env' -o -name '.env.*' -o -name 'node_modules' -type d \
     -o -name '.git' -type d -o -name '.next' -type d \
     -o -name 'tsconfig.tsbuildinfo' -o -name 'review-log.md' \
     -o -name 'REVIEW_ADDENDUM.md' \) \
  -print 2>/dev/null || true)"

if [[ -n "$FORBIDDEN_HITS" ]]; then
  echo "ABORT: forbidden paths survived the tar exclude. Fix before shipping." >&2
  echo "$FORBIDDEN_HITS" >&2
  exit 1
fi

# Count what made it in, for eyeballing.
FILE_COUNT="$(find "$STAGING" -type f | wc -l | tr -d ' ')"
STAGE_SIZE="$(du -sh "$STAGING" | awk '{print $1}')"

# ─── Produce the zip ────────────────────────────────────────────────
DATE="$(date +%Y-%m-%d)"
OUTPUT_NAME="operon-tester-${DATE}.zip"
OUTPUT_DIR="$(dirname "$REPO_ROOT")"
OUTPUT_PATH="$OUTPUT_DIR/$OUTPUT_NAME"

# Remove any prior zip with the same name so Compress-Archive doesn't
# either error out or merge into it.
rm -f "$OUTPUT_PATH"

# Convert bash paths → Windows paths for powershell.exe. cygpath ships
# with Git Bash; abort if it's missing (would indicate a non-standard
# shell environment).
if ! command -v cygpath >/dev/null 2>&1; then
  echo "ABORT: cygpath not available. This script targets Git Bash on Windows." >&2
  exit 1
fi
STAGING_WIN="$(cygpath -w "$STAGING")"
OUTPUT_WIN="$(cygpath -w "$OUTPUT_PATH")"

echo "zipping  → $OUTPUT_PATH"
powershell.exe -NoProfile -Command \
  "Compress-Archive -Path '${STAGING_WIN}\\*' -DestinationPath '${OUTPUT_WIN}' -Force" \
  >/dev/null

# ─── Report ─────────────────────────────────────────────────────────
ZIP_SIZE="$(du -h "$OUTPUT_PATH" | awk '{print $1}')"
echo
echo "OK — tester package ready."
echo "  files : $FILE_COUNT"
echo "  staged: $STAGE_SIZE"
echo "  zipped: $ZIP_SIZE  ($OUTPUT_PATH)"
echo
echo "Top-level contents of the zip:"
find "$STAGING" -mindepth 1 -maxdepth 1 -printf '  %f\n' | sort
echo
echo "Hand off $OUTPUT_NAME along with docs/TESTING_GUIDE.md (already included)."
