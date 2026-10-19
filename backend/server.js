const fs = require('fs');
const path = require('path');
const Module = require('module');
const partsDir = path.join(__dirname, 'server_parts');
const files = fs.readdirSync(partsDir).filter((f) => /^b\d+\.txt$/.test(f)).sort();
if (!files.length) {
  console.error('[FATAL] missing server_parts/b*.txt');
  process.exit(1);
}
const b64 = files.map((f) => fs.readFileSync(path.join(partsDir, f), 'utf8').trim()).join('');
const code = Buffer.from(b64, 'base64').toString('utf8');
const m = new Module(__filename);
m.filename = __filename;
m.paths = Module._nodeModulePaths(__dirname);
m._compile(code, __filename);
