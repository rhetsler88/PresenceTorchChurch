// Rewrites Windows backslashes to forward slashes in the Capacitor-generated
// iOS SPM manifest. `npx cap sync` on Windows writes paths like
// "..\\..\\..\\node_modules\\...", which are invalid escape sequences in Swift
// and break every iOS cloud build. Safe to run any time; idempotent.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'ios', 'App', 'CapApp-SPM', 'Package.swift');
if (!fs.existsSync(file)) { console.log('fix-spm-paths: Package.swift not found, skipping.'); process.exit(0); }
const before = fs.readFileSync(file, 'utf8');
const after = before.replace(/(path:\s*")([^"]*)(")/g, (m, open, p, close) => open + p.replace(/\\/g, '/') + close);
if (after !== before) { fs.writeFileSync(file, after); console.log('fix-spm-paths: converted backslashes to forward slashes.'); }
else { console.log('fix-spm-paths: already clean, nothing to do.'); }
