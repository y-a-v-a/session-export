// Shared secret-redaction pass for the exporters (Claude + Codex).
// Best-effort scan for well-known credential shapes. Runs over message
// text/thinking, tool inputs (recursively), and tool results so anything
// printed by a shell or pasted into a prompt gets caught too.
// Order matters: private-key blocks first (so their base64 body isn't
// re-matched by other rules), anthropic before openai (both start "sk-"),
// stripe before openai (sk_live_ vs sk-).

const REDACTION_RULES = [
  { name: "private-key-block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: "anthropic-key",     re: /sk-ant-[A-Za-z0-9_-]{30,}/g },
  { name: "stripe-key",        re: /\b(?:sk|pk|rk)_(?:live|test)_[0-9a-zA-Z]{20,}\b/g },
  { name: "openai-key",        re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: "aws-access-key",    re: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[0-9A-Z]{16}\b/g },
  { name: "github-token",      re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: "slack-token",       re: /\bxox[abopsr]-[A-Za-z0-9-]{10,}\b/g },
  { name: "google-api-key",    re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "jwt",               re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_.+/=-]{8,}\b/g },
];

function redactString(s, counts) {
  if (typeof s !== 'string' || !s) return s;
  for (const rule of REDACTION_RULES) {
    s = s.replace(rule.re, () => {
      counts[rule.name] = (counts[rule.name] || 0) + 1;
      return `[REDACTED:${rule.name}]`;
    });
  }
  return s;
}

function redactObject(obj, counts) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'string') obj[k] = redactString(v, counts);
    else if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        if (typeof v[i] === 'string') v[i] = redactString(v[i], counts);
        else if (v[i] && typeof v[i] === 'object') redactObject(v[i], counts);
      }
    } else if (v && typeof v === 'object') redactObject(v, counts);
  }
}

function redactEntries(entries, counts) {
  for (const e of entries) {
    if (!e || !e.message) continue;
    const c = e.message.content;
    if (typeof c === 'string') {
      e.message.content = redactString(c, counts);
    } else if (Array.isArray(c)) {
      for (const b of c) {
        if (!b || typeof b !== 'object') continue;
        if (b.type === 'text' && typeof b.text === 'string') {
          b.text = redactString(b.text, counts);
        } else if (b.type === 'thinking' && typeof b.thinking === 'string') {
          b.thinking = redactString(b.thinking, counts);
        } else if (b.type === 'tool_use') {
          redactObject(b.input, counts);
        } else if (b.type === 'tool_result') {
          if (typeof b.content === 'string') {
            b.content = redactString(b.content, counts);
          } else if (Array.isArray(b.content)) {
            for (const sub of b.content) {
              if (sub && typeof sub.text === 'string') sub.text = redactString(sub.text, counts);
            }
          }
        }
      }
    }
  }
}

// Mutates payload in place; records per-kind hit counts on header.redactions.
function redactPayload(payload) {
  const counts = {};
  redactEntries(payload.entries, counts);
  for (const sa of Object.values(payload.subagents || {})) {
    redactEntries(sa.entries || [], counts);
  }
  payload.header.redactions = counts;
}

module.exports = { redactPayload, redactEntries, redactString, REDACTION_RULES };
