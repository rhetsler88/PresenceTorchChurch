// Installs a pre-commit hook that auto-fixes Package.swift backslashes.
const fs = require('fs');
const path = require('path');
const hookDir = path.join(__dirname, '..', '.git', 'hooks');
if (!fs.existsSync(hookDir)) { console.log('install-hooks: no .git directory, skipping.'); process.exit(0); }
const hookFile = path.join(hookDir, 'pre-commit');
const hook = '#!/bin/sh\n# Auto-fix Windows backslashes in the Capacitor SPM manifest before commit.\nnode scripts/fix-spm-paths.cjs\ngit add ios/App/CapApp-SPM/Package.swift 2>/dev/null || true\n';
fs.writeFileSync(hookFile, hook.trimStart());
fs.chmodSync(hookFile, 0o755);
console.log('install-hooks: pre-commit hook installed.');
