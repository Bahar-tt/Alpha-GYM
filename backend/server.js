const fs = require('fs');
const path = require('path');
const Module = require('module');
const partsDir = path.join(__dirname, 'server_parts');
const files = fs.readdirSync(partsDir).filter((f) => /^x\d+\.js$/.test(f)).sort();
if (!files.length) {
  console.error('[FATAL] no server_parts/x*.js found');
  process.exit(1);
}
const code = files.map((f) => fs.readFileSync(path.join(partsDir, f), 'utf8')).join('');
const m = new Module(__filename);
m.filename = __filename;
m.paths = Module._nodeModulePaths(__dirname);
m._compile(code, __filename);
