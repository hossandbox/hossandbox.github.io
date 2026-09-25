#!/bin/bash
# Build the PWA and publish dist/ to the gh-pages branch (GitHub Pages).
# Usage: bash web/deploy.sh   (from anywhere)
set -euo pipefail
export PATH="/opt/data/.local/bin:$PATH"
export XDG_CONFIG_HOME=/opt/data/.config
ROOT=/opt/data/projects/hos-sandbox

# --- Safety gate -------------------------------------------------------------------------------
# This script builds from the WORKING TREE and then FORCE-pushes the result. Two ways that goes
# wrong silently: uncommitted or untracked files get built and published untested, and a commit
# that is not on origin/main publishes code main does not have — so the live site stops being
# reproducible from the repository. Refuse rather than guess. (Raised by Opus 5.5, 2026-09-25.)
cd "$ROOT"
git fetch -q origin
DIRTY=$(git status --porcelain)
if [ -n "$DIRTY" ]; then
  echo "deploy.sh: REFUSING — the working tree is dirty, so the build would include untested changes:" >&2
  echo "$DIRTY" >&2
  echo "Commit, stash or discard them first (reviews/ and build output are gitignored by design)." >&2
  exit 1
fi
HEAD_SHA=$(git rev-parse HEAD)
MAIN_SHA=$(git rev-parse origin/main)
if [ "$HEAD_SHA" != "$MAIN_SHA" ]; then
  echo "deploy.sh: REFUSING — HEAD ($HEAD_SHA) is not origin/main ($MAIN_SHA)." >&2
  echo "Push (or reset) so the live build is reproducible from main." >&2
  exit 1
fi

cd "$ROOT/web" && node build.mjs
cd "$ROOT"
REMOTE=$(git remote get-url origin)
TMP=$(mktemp -d)
cp -r web/dist/. "$TMP"/
touch "$TMP/.nojekyll"
cd "$TMP"
git init -q -b gh-pages
git -c user.name="hos-sandbox deploy" -c user.email="deploy@users.noreply.github.com" add -A
git -c user.name="hos-sandbox deploy" -c user.email="deploy@users.noreply.github.com" commit -q -m "deploy $(date -u +%Y-%m-%dT%H:%MZ) from ${HEAD_SHA:0:7}"
git push -q --force "$REMOTE" gh-pages:gh-pages
cd / && rm -rf "$TMP"
echo "deployed ${HEAD_SHA:0:7} → https://hossandbox.github.io/"
