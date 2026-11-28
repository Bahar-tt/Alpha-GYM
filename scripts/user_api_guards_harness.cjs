'use strict';

// Minimal stdin/stdout harness so pytest can call the Node guards without node_modules.
const guards = require('../backend/userApiGuards');

const calls = {
  apiError: (a) => guards.apiError(a.status, a.errorCode, a.message, a.extra || {}),
  classifyCreateError: (a) => guards.classifyCreateError(a.err, a.fallbackMessage || undefined),
  buildFingerprintSummary: (a) => guards.buildFingerprintSummary(a),
  fingerprintMessage: (a) => guards.fingerprintMessage(a.summary, a.subjectType),
  decideEnrollFailure: (a) => guards.decideEnrollFailure(a.row, a.nowText),
};

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw || '{}');
    const call = calls[input.action];
    if (typeof call !== 'function') throw new Error('unknown action: ' + input.action);
    process.stdout.write(JSON.stringify({ ok: true, result: call(input.args || {}) }));
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
  }
});
