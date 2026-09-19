#!/bin/bash
# Build the PWA and publish dist/ to the gh-pages branch (GitHub Pages).
# Usage: bash web/deploy.sh   (from anywhere)
set -euo pipefail
export PATH="/opt/data/.local/bin:$PATH"
export XDG_CONFIG_HOME=/opt/data/.config
ROOT=/opt/data/projects/hos-sandbox
cd "$ROOT/web" && node build.mjs
cd "$ROOT"
REMOTE=$(git remote get-url origin)
TMP=$(mktemp -d)
cp -r web/dist/. "$TMP"/
touch "$TMP/.nojekyll"
cd "$TMP"
git init -q -b gh-pages
git -c user.name="hos-sandbox deploy" -c user.email="deploy@users.noreply.github.com" add -A
git -c user.name="hos-sandbox deploy" -c user.email="deploy@users.noreply.github.com" commit -q -m "deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git push -q --force "$REMOTE" gh-pages:gh-pages
cd / && rm -rf "$TMP"
echo "deployed → https://loricoestrellado-jpg.github.io/hos-sandbox/"
