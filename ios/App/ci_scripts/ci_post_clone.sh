#!/bin/sh
# Xcode Cloud: CapApp-SPM paths point at node_modules; install JS deps before SPM resolves.
set -e

cd "${CI_PRIMARY_REPOSITORY_PATH}"

if ! command -v node >/dev/null 2>&1; then
  export HOMEBREW_NO_INSTALL_CLEANUP=TRUE
  brew install node
fi

echo "Node $(node -v) · npm $(npm -v)"

# Avoid occasional Xcode Cloud npm registry concurrency issues.
npm config set maxsockets 3
npm ci

node scripts/fix-spm-paths.cjs

if [ ! -d node_modules/@capacitor/haptics ]; then
  echo "error: node_modules/@capacitor/haptics missing after npm ci" >&2
  exit 1
fi

echo "ci_post_clone: npm dependencies and SPM paths ready."
