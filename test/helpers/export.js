const fs = require('fs');
const path = require('path');
const { buildPayload, emit } = require('../../skills/session-export/export.js');
const { redactPayload } = require('../../skills/session-export/redact.js');

// Runs the same pipeline as `node export.js <file>`: build, redact, emit.
function exportSession(mainFile, { redact = true } = {}) {
  const payload = buildPayload(mainFile);
  if (redact) redactPayload(payload);
  const html = path.join(path.dirname(mainFile), 'out.html');
  emit(payload, html);
  return { payload, html, text: fs.readFileSync(html, 'utf8') };
}

module.exports = { exportSession };
