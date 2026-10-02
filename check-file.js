const ts = require('typescript');
const fs = require('fs');

const file = 'src/pages/Attendance.tsx';
const code = fs.readFileSync(file, 'utf8');

const result = ts.transpileModule(code, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
  },
  reportDiagnostics: true,
  fileName: file,
});

const diagnostics = result.diagnostics || [];
console.log(`Diagnostics: ${diagnostics.length}`);
diagnostics.forEach((d) => {
  const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
  console.log(`${d.file.fileName}:${line + 1}:${character + 1} - ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
});

if (diagnostics.length === 0) {
  console.log('No diagnostics - file is valid!');
}
