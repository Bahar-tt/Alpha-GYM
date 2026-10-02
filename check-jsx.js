const ts = require('typescript');
const fs = require('fs');
const path = require('path');

// Find all TSX files in src/
function findTsxFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTsxFiles(fullPath));
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const srcDir = path.join(__dirname, 'src');
const files = findTsxFiles(srcDir);
console.log(`Checking ${files.length} files...`);

const program = ts.createProgram(files, {
  jsx: ts.JsxEmit.ReactJSX,
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  allowImportingTsExtensions: true,
});

const diagnostics = ts.getPreEmitDiagnostics(program);
let errorCount = 0;
diagnostics.forEach((d) => {
  if (d.file) {
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
    console.log(`${d.file.fileName}:${line + 1}:${character + 1} - ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
  } else {
    console.log(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  }
  errorCount++;
});
console.log(`\nTotal errors: ${errorCount}`);
