/**
 * Smart Detect Engine
 * Pure utility functions — no React dependency.
 * Each detector returns a confidence score 0-100.
 */

export interface DetectResult {
  tool: string;
  confidence: number;
  label: string;
}

// ── Individual detectors ────────────────────────────────────────

export function detectJSON(input: string): number {
  const t = input.trim();
  if (!t) return 0;

  // Try strict parse
  try { JSON.parse(t); return 95; } catch { /* continue */ }

  // Looks like JSON object or array
  if (/^\s*[\{\[]/.test(t) && /[\}\]]\s*$/.test(t)) {
    if (/"[\w$]+":\s/.test(t)) return 85;
    return 75;
  }

  // Has JSON-ish patterns but may be broken
  if (/"[\w$]+":\s/.test(t) && (t.includes('{') || t.includes('['))) return 70;

  // Escaped JSON string: {\"key\":\"value\"}
  if (/\{\\"[\w$]+\\":\s*\\"/.test(t)) return 65;

  return 0;
}

export function detectSQL(input: string): number {
  const t = input.trim();
  if (!t) return 0;

  // EF Core / APM log format with embedded SQL
  if (/^\[Parameters=\[/.test(t)) return 95;

  const sqlKeywords = /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|MERGE|WITH|EXEC|EXECUTE|DECLARE|BEGIN|SET\s|USE\s|TRUNCATE|GRANT|REVOKE)/im;
  const sqlPatterns = /\b(FROM|WHERE|JOIN|GROUP\s+BY|ORDER\s+BY|HAVING|UNION|INTO|VALUES|SET|ON|AND|OR|INNER|LEFT|RIGHT|OUTER|CROSS|LIMIT|OFFSET|TOP|DISTINCT)\b/gi;

  if (sqlKeywords.test(t)) {
    const keywordCount = (input.match(sqlPatterns) || []).length;
    if (keywordCount >= 3) return 95;
    if (keywordCount >= 1) return 85;
    return 75;
  }

  // Just has SQL-like patterns but doesn't start with keyword
  const patternCount = (input.match(sqlPatterns) || []).length;
  if (patternCount >= 4) return 70;
  if (patternCount >= 2) return 40;

  return 0;
}

export function detectJWT(input: string): number {
  const t = input.trim();
  if (!t) return 0;

  // JWT: three base64url parts separated by dots, starts with eyJ
  if (/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t)) return 98;
  if (/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+/.test(t)) return 90;
  // Might be partial JWT
  if (/^eyJ[A-Za-z0-9_-]{10,}/.test(t)) return 75;
  // Bearer token prefix
  if (/^Bearer\s+eyJ/i.test(t)) return 92;

  return 0;
}

export function detectStackTrace(input: string): number {
  const t = input.trim();
  if (!t) return 0;

  let score = 0;

  // .NET
  if (/at\s+[\w.]+\.\w+\(.*\)\s*(in\s+|$)/m.test(t)) score = Math.max(score, 90);
  if (/System\.\w+Exception/i.test(t)) score = Math.max(score, 85);
  if (/Unhandled exception/i.test(t)) score = Math.max(score, 85);

  // Java
  if (/^\s*at\s+[\w.$]+\([\w.]+:\d+\)/m.test(t)) score = Math.max(score, 90);
  if (/^[\w.$]+Exception:/m.test(t)) score = Math.max(score, 85);
  if (/Caused by:/m.test(t)) score = Math.max(score, 85);

  // Python
  if (/Traceback \(most recent call last\)/i.test(t)) score = Math.max(score, 95);
  if (/File ".*", line \d+/m.test(t)) score = Math.max(score, 90);

  // JavaScript / Node
  if (/at\s+[\w.<>]+\s+\(.*:\d+:\d+\)/m.test(t)) score = Math.max(score, 90);
  if (/at\s+.*\((?:node:|internal\/)/m.test(t)) score = Math.max(score, 85);

  // Go
  if (/^goroutine\s+\d+\s+\[/m.test(t)) score = Math.max(score, 95);
  if (/panic:/m.test(t)) score = Math.max(score, 85);

  // Ruby
  if (/from\s+.*:\d+:in\s+`/m.test(t)) score = Math.max(score, 90);

  // Generic Error/Exception prefix (like the StackTrace SAMPLE)
  if (/^(TypeError|ReferenceError|SyntaxError|RangeError|Error|Exception):/m.test(t)) {
    score = Math.max(score, 80);
  }

  // webpack/node_modules paths in stack
  if (/webpack-internal:\/\/|node_modules\//.test(t)) score = Math.max(score, 75);

  // Generic stack-like lines
  const stackLines = t.split('\n').filter(l => /^\s*at\s+/.test(l) || /:\d+:\d+/.test(l));
  if (stackLines.length >= 3 && score < 50) score = 50;

  return score;
}

export function detectMarkdown(input: string): number {
  const t = input.trim();
  if (!t) return 0;

  let signals = 0;

  if (/^#{1,6}\s+.+/m.test(t)) signals++;               // headings
  if (/\*\*[^*]+\*\*/m.test(t)) signals++;              // bold
  if (/(?<!\*)\*[^*\n]+\*(?!\*)/m.test(t)) signals++;   // italic (not bold)
  if (/^[-*+]\s+/m.test(t)) signals++;                  // list
  if (/^\d+\.\s+/m.test(t)) signals++;                  // ordered list
  if (/^>\s+/m.test(t)) signals++;                       // blockquote
  if (/```[\s\S]*?```/m.test(t)) signals += 2;          // code block
  if (/\[.+\]\(.+\)/.test(t)) signals += 2;             // links
  if (/!\[.*\]\(.+\)/.test(t)) signals++;                // images
  if (/^-{3,}$/m.test(t)) signals++;                     // horizontal rule
  if (/- \[[ x]\]/m.test(t)) signals++;                  // task list
  if (/\|.+\|.+\|/m.test(t)) signals++;                 // table
  if (/~~.+~~/m.test(t)) signals++;                      // strikethrough (GFM)

  if (signals >= 5) return 90;
  if (signals >= 3) return 80;
  if (signals >= 2) return 70;
  if (signals >= 1) return 40;

  return 0;
}

export function detectList(input: string): number {
  const t = input.trim();
  if (!t) return 0;

  const lines = t.split('\n').filter(l => l.trim());
  if (lines.length < 2) return 0;

  // Check if most lines are short, similar items (plain list)
  const avgLen = lines.reduce((sum, l) => sum + l.trim().length, 0) / lines.length;
  const allShort = avgLen < 80;
  const noKeyValue = !lines.some(l => /^\s*["']?\w+["']?\s*[:=]/.test(l));

  if (lines.length >= 3 && allShort && noKeyValue) {
    if (lines.length >= 10) return 85;
    if (lines.length >= 5) return 78;
    return 72;
  }

  // 2 lines, short, no structure
  if (lines.length === 2 && allShort && noKeyValue) return 50;

  return 0;
}

export function detectDataFormatter(input: string): number {
  const t = input.trim();
  if (!t) return 0;

  // Comma-separated quoted values: 'a','b','c'
  if (/^'[^']*'(\s*,\s*'[^']*'){2,}$/m.test(t)) return 92;
  // Double-quoted CSV-like
  if (/^"[^"]*"(\s*,\s*"[^"]*"){2,}$/m.test(t)) return 88;
  // Tab-separated multi-column data
  if (/^[^\t\n]+\t[^\t\n]+/m.test(t)) {
    const tabLines = t.split('\n').filter(l => l.includes('\t'));
    if (tabLines.length >= 2) return 85;
    return 60;
  }
  // Numbers separated by commas: 1,2,3,4
  if (/^\d+(\s*,\s*\d+){2,}$/.test(t)) return 82;
  // GUIDs/UUIDs separated by newlines or commas
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(t)) {
    const guidCount = (t.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || []).length;
    if (guidCount >= 2) return 85;
    return 55;
  }
  // Space-separated words on one line (mixed items like IDs)
  const words = t.split(/[\s,]+/).filter(Boolean);
  if (words.length >= 3 && !t.includes('\n') && words.every(w => w.length < 40)) {
    // Looks like a flat list of items (IDs, keywords, etc.)
    if (words.length >= 5) return 60;
    return 40;
  }

  return 0;
}

export function detectQueryPlan(input: string): number {
  const t = input.trim();
  if (!t) return 0;

  if (/<ShowPlanXML/i.test(t)) return 98;
  if (/<QueryPlan/i.test(t)) return 95;
  if (/<RelOp\s/i.test(t)) return 90;
  if (/<StmtSimple/i.test(t)) return 85;

  return 0;
}

export function detectEpoch(input: string): number {
  const t = input.trim();
  if (!t) return 0;

  // Pure epoch: 10 digits (seconds) or 13 digits (milliseconds)
  if (/^\d{10}$/.test(t)) {
    const num = parseInt(t);
    if (num >= 946684800 && num <= 4102444800) return 95;
    return 80;
  }
  if (/^\d{13}$/.test(t)) {
    const num = parseInt(t);
    if (num >= 946684800000 && num <= 4102444800000) return 95;
    return 80;
  }
  // Multiple epochs on separate lines
  if (/^\d{10,13}(\s*\n\s*\d{10,13})+$/.test(t)) return 85;

  // ISO 8601 date strings → toEpoch mode
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(t)) return 88;
  // Date-only ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return 75;
  // Common date formats: 01/15/2024, 15-01-2024
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(t)) return 65;

  return 0;
}

const CSS_NAMED_COLORS = new Set([
  'aliceblue','antiquewhite','aqua','aquamarine','azure','beige','bisque','black',
  'blanchedalmond','blue','blueviolet','brown','burlywood','cadetblue','chartreuse',
  'chocolate','coral','cornflowerblue','cornsilk','crimson','cyan','darkblue',
  'darkcyan','darkgoldenrod','darkgray','darkgreen','darkgrey','darkkhaki',
  'darkmagenta','darkolivegreen','darkorange','darkorchid','darkred','darksalmon',
  'darkseagreen','darkslateblue','darkslategray','darkslategrey','darkturquoise',
  'darkviolet','deeppink','deepskyblue','dimgray','dimgrey','dodgerblue','firebrick',
  'floralwhite','forestgreen','fuchsia','gainsboro','ghostwhite','gold','goldenrod',
  'gray','green','greenyellow','grey','honeydew','hotpink','indianred','indigo',
  'ivory','khaki','lavender','lavenderblush','lawngreen','lemonchiffon','lightblue',
  'lightcoral','lightcyan','lightgoldenrodyellow','lightgray','lightgreen','lightgrey',
  'lightpink','lightsalmon','lightseagreen','lightskyblue','lightslategray',
  'lightslategrey','lightsteelblue','lightyellow','lime','limegreen','linen','magenta',
  'maroon','mediumaquamarine','mediumblue','mediumorchid','mediumpurple',
  'mediumseagreen','mediumslateblue','mediumspringgreen','mediumturquoise',
  'mediumvioletred','midnightblue','mintcream','mistyrose','moccasin','navajowhite',
  'navy','oldlace','olive','olivedrab','orange','orangered','orchid','palegoldenrod',
  'palegreen','paleturquoise','palevioletred','papayawhip','peachpuff','peru','pink',
  'plum','powderblue','purple','rebeccapurple','red','rosybrown','royalblue',
  'saddlebrown','salmon','sandybrown','seagreen','seashell','sienna','silver',
  'skyblue','slateblue','slategray','slategrey','snow','springgreen','steelblue',
  'tan','teal','thistle','tomato','turquoise','violet','wheat','white','whitesmoke',
  'yellow','yellowgreen',
]);

export function detectColor(input: string): number {
  const t = input.trim().toLowerCase();
  if (!t) return 0;

  // Hex color
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(t)) return 95;
  // rgb/rgba
  if (/^rgba?\(\s*\d+/.test(t)) return 95;
  // hsl/hsla
  if (/^hsla?\(\s*\d+/.test(t)) return 95;
  // oklch
  if (/^oklch\(/.test(t)) return 95;
  // Multiple hex colors
  if (/^#[0-9a-f]{3,8}(\s*\n\s*#[0-9a-f]{3,8})+$/.test(t)) return 85;
  // CSS named colors
  if (CSS_NAMED_COLORS.has(t)) return 88;

  return 0;
}

export function detectCron(input: string): number {
  const t = input.trim();
  if (!t) return 0;

  // Standard cron: 5 fields (minute hour day month weekday)
  // Extended cron: 6 fields (second minute hour day month weekday)
  const cronRegex = /^(\*|[\d,\-\/]+|\*\/\d+)(\s+(\*|[\d,\-\/]+|\*\/\d+)){4,5}$/;
  if (cronRegex.test(t)) return 95;

  // Partial/relaxed cron with special chars (L, W, #, ?)
  const fields = t.split(/\s+/);
  if (fields.length >= 5 && fields.length <= 6 && fields.every(f => /^[\d*,\-\/\?LW#]+$/.test(f))) {
    return 85;
  }

  // Named cron presets
  if (/^@(yearly|annually|monthly|weekly|daily|midnight|hourly|reboot)$/i.test(t)) return 90;

  return 0;
}

export function detectLog(input: string): number {
  const t = input.trim();
  if (!t) return 0;

  const lines = t.split('\n');
  if (lines.length < 2) return 0;

  // Count lines that look like log entries
  const logLinePattern = /(\d{4}[-\/]\d{2}[-\/]\d{2}[T ]\d{2}:\d{2}|\d{2}:\d{2}:\d{2}|^\[\d{4}|\b(INFO|WARN|WARNING|ERROR|DEBUG|TRACE|FATAL|CRITICAL)\b)/i;
  const matchingLines = lines.filter(l => logLinePattern.test(l));
  const ratio = matchingLines.length / lines.length;

  if (ratio >= 0.6 && matchingLines.length >= 3) return 92;
  if (ratio >= 0.4 && matchingLines.length >= 3) return 80;
  if (matchingLines.length >= 5) return 75;

  // JSON structured logs: {"level":"INFO", "timestamp": ...}
  const jsonLogLines = lines.filter(l => {
    const trimmed = l.trim();
    return trimmed.startsWith('{') && /"(level|severity|timestamp|time|msg|message)"/i.test(trimmed);
  });
  if (jsonLogLines.length >= 2) {
    const jsonRatio = jsonLogLines.length / lines.length;
    if (jsonRatio >= 0.5) return 90;
    return 75;
  }

  // Syslog format: "Mon DD HH:MM:SS hostname"
  const syslogPattern = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/;
  const syslogLines = lines.filter(l => syslogPattern.test(l.trim()));
  if (syslogLines.length >= 2) return 85;

  // Apache/Nginx access log: IP - - [timestamp] "METHOD /path"
  const accessLogPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\s.*\[.+\]\s*"/;
  const accessLogLines = lines.filter(l => accessLogPattern.test(l.trim()));
  if (accessLogLines.length >= 2) return 88;

  return 0;
}

export function detectMermaid(input: string): number {
  const t = input.trim();
  if (!t) return 0;

  // Mermaid syntax keywords
  const mermaidKeywords = /^(graph\s+(TD|TB|BT|RL|LR)|sequenceDiagram|classDiagram|stateDiagram|erDiagram|flowchart\s+(TD|TB|BT|RL|LR)|gantt|pie|gitgraph|journey|mindmap|timeline)/m;
  if (mermaidKeywords.test(t)) return 95;

  // Has mermaid-like arrow syntax with node shapes
  if (/-->|==>|-.->/.test(t) && /\[.*\]|\{.*\}|\(.*\)/.test(t)) {
    const arrowCount = (t.match(/-->|==>|-\.->|-->/g) || []).length;
    if (arrowCount >= 2) return 75;
    return 55;
  }

  // Plain English system/flow description (DiagramGenerator's primary input)
  // Match descriptions that mention actions between system components
  const flowVerbs = /\b(sends?|receives?|calls?|returns?|uploads?|downloads?|stores?|fetches?|pushes?|pulls?|redirects?|validates?|processes?|triggers?|notifies?|forwards?|connects?|authenticat\w+|authoriz\w+|routes?|queues?|publishes?|subscribes?|streams?|transforms?|renders?|deploys?|executes?|invokes?|requests?|responds?)\b/gi;
  const systemNouns = /\b(API|server|client|database|db|queue|worker|service|microservice|cache|proxy|gateway|load\s*balancer|CDN|S3|SQS|SNS|Lambda|Kafka|Redis|Postgres|MySQL|MongoDB|Elasticsearch|nginx|docker|kubernetes|k8s|frontend|backend|browser|mobile\s*app|user|webhook|endpoint|REST|GraphQL|gRPC)\b/gi;

  const verbCount = (t.match(flowVerbs) || []).length;
  const nounCount = (t.match(systemNouns) || []).length;

  if (verbCount >= 3 && nounCount >= 3) return 82;
  if (verbCount >= 2 && nounCount >= 2) return 72;
  if (verbCount >= 1 && nounCount >= 2) return 55;

  return 0;
}

export function detectCsp(input: string): number {
  const t = input.trim();
  if (!t) return 0;

  // CSP header patterns: directive-name value1 value2; directive-name value3
  const cspDirectives = /\b(default-src|script-src|style-src|img-src|font-src|connect-src|media-src|object-src|frame-src|child-src|worker-src|base-uri|form-action|frame-ancestors|report-uri|report-to|upgrade-insecure-requests|block-all-mixed-content)\b/gi;
  const matches = t.match(cspDirectives) || [];
  const unique = new Set(matches.map(m => m.toLowerCase()));

  // Multiple CSP directives with semicolon separation = very likely CSP
  if (unique.size >= 3 && t.includes(';')) return 95;
  if (unique.size >= 2 && t.includes(';')) return 88;
  if (unique.size >= 1 && (t.includes("'self'") || t.includes("'none'") || t.includes("'unsafe-inline'"))) return 85;

  // CSP violation console logs
  if (/violates the following Content Security Policy directive/i.test(t)) return 92;
  if (/Content[- ]Security[- ]Policy:.*blocked/i.test(t)) return 90;
  if (/Refused to (?:load|execute|apply).*Content Security Policy/i.test(t)) return 90;

  return 0;
}

export function detectTextTools(input: string): number {
  const t = input.trim();
  if (!t) return 0;

  let score = 0;

  const lines = t.split('\n').filter(l => l.trim());

  // Jira ticket pattern: PROJ-123 description (multiple lines)
  const jiraPattern = /^[A-Z]{2,10}-\d+\s+.+/;
  const jiraLines = lines.filter(l => jiraPattern.test(l.trim()));
  if (jiraLines.length >= 2 && jiraLines.length / lines.length >= 0.5) {
    score = Math.max(score, jiraLines.length >= 3 ? 92 : 85);
  } else if (jiraLines.length >= 1) {
    score = Math.max(score, 70);
  }

  // AWS CloudWatch Log Insights paths: /aws/lambda/..., /aws/rds/..., /ecs/...
  const awsPathPattern = /^\/(aws|ecs|eks)\//;
  const awsLines = lines.filter(l => awsPathPattern.test(l.trim()));
  if (awsLines.length >= 2 && awsLines.length / lines.length >= 0.5) {
    score = Math.max(score, awsLines.length >= 3 ? 90 : 82);
  } else if (awsLines.length >= 1) {
    score = Math.max(score, 65);
  }

  // URL-encoded content (%XX patterns)
  const urlEncoded = (t.match(/%[0-9A-Fa-f]{2}/g) || []).length;
  if (urlEncoded >= 3 && urlEncoded / t.length > 0.05) score = Math.max(score, 85);

  // HTML entities
  if (/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi.test(t)) {
    const entityCount = (t.match(/&[^;]+;/g) || []).length;
    if (entityCount >= 3) score = Math.max(score, 80);
  }

  // Base64 (long string of base64 chars, not JWT which is caught earlier)
  if (/^[A-Za-z0-9+\/]+=*$/.test(t) && t.length >= 20) {
    try {
      if (typeof atob === 'function') {
        atob(t);
      } else {
        Buffer.from(t, 'base64');
      }
      score = Math.max(score, 82);
    } catch {
      // not valid base64
    }
  }

  return score;
}

// ── File detection ──────────────────────────────────────────────

export function detectFile(file: File): DetectResult | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mime = file.type;

  // Binary files → Metadata
  if (mime.startsWith('image/') || mime.startsWith('audio/') || mime.startsWith('video/') || mime === 'application/pdf') {
    return { tool: 'metadata', confidence: 95, label: 'Binary Metadata' };
  }

  // SQL plan files
  if (ext === 'sqlplan') {
    return { tool: 'queryplan', confidence: 95, label: 'Query Plan' };
  }

  // Text files → return null to signal "read content & detectAll"
  return null;
}

// Map of known text file extensions to hint tools (optional boost)
const EXT_HINTS: Record<string, string> = {
  json: 'jsontools',
  sql: 'sqlformatter',
  md: 'markdown',
  markdown: 'markdown',
  log: 'logs',
  csv: 'dataformatter',
  tsv: 'dataformatter',
  xml: 'queryplan',
};

export function getExtHint(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_HINTS[ext] ?? null;
}

// ── Main entry ──────────────────────────────────────────────────

const DETECTORS: { tool: string; label: string; detect: (input: string) => number }[] = [
  { tool: 'jwtdecode',      label: 'JWT Decode',         detect: detectJWT },
  { tool: 'queryplan',      label: 'Query Plan',         detect: detectQueryPlan },
  { tool: 'csptools',       label: 'CSP Tools',          detect: detectCsp },
  { tool: 'cron',           label: 'Cron Builder',       detect: detectCron },
  { tool: 'epoch',          label: 'Epoch Converter',    detect: detectEpoch },
  { tool: 'color',          label: 'Color Converter',    detect: detectColor },
  { tool: 'jsontools',      label: 'JSON',               detect: detectJSON },
  { tool: 'stacktrace',     label: 'Stack Trace',        detect: detectStackTrace },
  { tool: 'diagram',        label: 'Diagram Generator',  detect: detectMermaid },
  { tool: 'sqlformatter',   label: 'SQL',                detect: detectSQL },
  { tool: 'logs',           label: 'Log Analyzer',       detect: detectLog },
  { tool: 'markdown',       label: 'Markdown',           detect: detectMarkdown },
  { tool: 'dataformatter',  label: 'Data Formatter',     detect: detectDataFormatter },
  { tool: 'listcleaner',    label: 'List Cleaner',       detect: detectList },
  { tool: 'texttools',      label: 'Text Tools',         detect: detectTextTools },
];

/**
 * Run all detectors against `input`, return results sorted by confidence (descending).
 * Returns all results with confidence > 0.
 */
export function detectAll(input: string): DetectResult[] {
  if (!input.trim()) return [];

  const results: DetectResult[] = [];

  for (const { tool, label, detect } of DETECTORS) {
    const confidence = detect(input);
    if (confidence > 0) {
      results.push({ tool, confidence, label });
    }
  }

  // Sort by confidence descending, then by detector priority (index order)
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}
