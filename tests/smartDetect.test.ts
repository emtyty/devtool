import { describe, it, expect } from 'vitest';
import {
  detectJSON,
  detectSQL,
  detectJWT,
  detectStackTrace,
  detectMarkdown,
  detectList,
  detectDataFormatter,
  detectQueryPlan,
  detectEpoch,
  detectColor,
  detectCron,
  detectLog,
  detectMermaid,
  detectTextTools,
  detectAll,
  detectFile,
} from '../utils/smartDetect';

// ── JSON ────────────────────────────────────────────────────────

describe('detectJSON', () => {
  it('detects valid JSON object', () => {
    expect(detectJSON('{"name": "test", "age": 25}')).toBeGreaterThanOrEqual(90);
  });

  it('detects valid JSON array', () => {
    expect(detectJSON('[1, 2, 3]')).toBeGreaterThanOrEqual(90);
  });

  it('detects broken JSON with structure', () => {
    expect(detectJSON('{"name": "test", "age": 25')).toBeGreaterThanOrEqual(70);
  });

  it('rejects plain text', () => {
    expect(detectJSON('hello world')).toBe(0);
  });

  it('detects nested JSON', () => {
    expect(detectJSON('{"user": {"name": "John", "items": [1,2,3]}}')).toBeGreaterThanOrEqual(90);
  });

  it('detects escaped JSON string', () => {
    expect(detectJSON('{\\\"name\\\":\\\"Alice\\\",\\\"age\\\":30}')).toBeGreaterThan(0);
  });
});

// ── SQL ─────────────────────────────────────────────────────────

describe('detectSQL', () => {
  it('detects SELECT query', () => {
    expect(detectSQL('SELECT id, name FROM users WHERE active = 1 ORDER BY name')).toBeGreaterThanOrEqual(90);
  });

  it('detects INSERT query', () => {
    expect(detectSQL("INSERT INTO users (name, email) VALUES ('John', 'john@test.com')")).toBeGreaterThanOrEqual(70);
  });

  it('detects CREATE TABLE', () => {
    expect(detectSQL('CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100))')).toBeGreaterThanOrEqual(70);
  });

  it('detects complex query with JOINs', () => {
    expect(detectSQL(`
      SELECT u.name, o.total
      FROM users u
      INNER JOIN orders o ON u.id = o.user_id
      WHERE o.total > 100
      GROUP BY u.name
      ORDER BY o.total DESC
    `)).toBeGreaterThanOrEqual(90);
  });

  it('rejects plain text', () => {
    expect(detectSQL('hello world')).toBe(0);
  });

  it('gives low score for text with few SQL-ish words', () => {
    expect(detectSQL('select from where')).toBeGreaterThan(0);
  });
});

// ── JWT ─────────────────────────────────────────────────────────

describe('detectJWT', () => {
  it('detects valid JWT token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(detectJWT(jwt)).toBeGreaterThanOrEqual(90);
  });

  it('detects Bearer token', () => {
    expect(detectJWT('Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.sig')).toBeGreaterThanOrEqual(90);
  });

  it('rejects non-JWT strings', () => {
    expect(detectJWT('not-a-jwt-token')).toBe(0);
  });

  it('rejects plain base64', () => {
    expect(detectJWT('aGVsbG8gd29ybGQ=')).toBe(0);
  });
});

// ── Stack Trace ─────────────────────────────────────────────────

describe('detectStackTrace', () => {
  it('detects Python traceback', () => {
    const trace = `Traceback (most recent call last):
  File "app.py", line 42, in main
    result = process_data(data)
  File "app.py", line 15, in process_data
    return data["key"]
KeyError: 'key'`;
    expect(detectStackTrace(trace)).toBeGreaterThanOrEqual(90);
  });

  it('detects JavaScript stack trace (tool SAMPLE)', () => {
    const trace = `TypeError: Cannot read properties of null (reading 'value')
    at InputComponent.handleChange (src/components/Input.tsx:42:13)
    at processEvent (src/utils/events.ts:18:5)
    at HTMLElement.<anonymous> (webpack-internal:///./src/index.tsx:10:3)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
    at react-dom/cjs/react-dom.development.js:3990:14`;
    expect(detectStackTrace(trace)).toBeGreaterThanOrEqual(85);
  });

  it('detects .NET stack trace', () => {
    const trace = `System.NullReferenceException: Object reference not set to an instance of an object.
   at MyApp.Services.UserService.GetUser(Int32 id) in C:\\Projects\\MyApp\\Services\\UserService.cs:line 42
   at MyApp.Controllers.UserController.Get(Int32 id) in C:\\Projects\\MyApp\\Controllers\\UserController.cs:line 18`;
    expect(detectStackTrace(trace)).toBeGreaterThanOrEqual(85);
  });

  it('detects Java stack trace', () => {
    const trace = `java.lang.NullPointerException: null
    at com.example.MyService.process(MyService.java:42)
    at com.example.MyController.handle(MyController.java:18)
Caused by: java.io.IOException: Connection refused`;
    expect(detectStackTrace(trace)).toBeGreaterThanOrEqual(85);
  });

  it('detects Go panic', () => {
    const trace = `goroutine 1 [running]:
main.main()
    /home/user/app/main.go:42 +0x1a4
panic: runtime error: index out of range [5] with length 3`;
    expect(detectStackTrace(trace)).toBeGreaterThanOrEqual(85);
  });

  it('detects generic Error: prefix', () => {
    expect(detectStackTrace('TypeError: undefined is not a function')).toBeGreaterThanOrEqual(75);
  });

  it('rejects plain text', () => {
    expect(detectStackTrace('hello world')).toBe(0);
  });
});

// ── Markdown ────────────────────────────────────────────────────

describe('detectMarkdown', () => {
  it('detects rich markdown (DEFAULT_MARKDOWN style)', () => {
    const md = `# Title

## Subtitle

This is **bold** and *italic* and ~~struck~~.

- Item 1
- Item 2

[Link](https://example.com)

\`\`\`js
console.log('hello');
\`\`\`

| Name | Type |
|------|------|
| foo  | bar  |`;
    expect(detectMarkdown(md)).toBeGreaterThanOrEqual(90);
  });

  it('detects simple markdown', () => {
    expect(detectMarkdown('# Hello\n\n**bold text** here\n\n- list item')).toBeGreaterThanOrEqual(70);
  });

  it('gives low score for just a heading', () => {
    const result = detectMarkdown('# Just a heading');
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(70);
  });

  it('rejects plain text', () => {
    expect(detectMarkdown('hello world this is plain text')).toBe(0);
  });
});

// ── List ────────────────────────────────────────────────────────

describe('detectList', () => {
  it('detects simple list of items', () => {
    const list = `apple
banana
cherry
date
elderberry
fig
grape`;
    expect(detectList(list)).toBeGreaterThanOrEqual(70);
  });

  it('detects list of IDs', () => {
    const list = `user_001
user_002
user_003
user_004
user_005`;
    expect(detectList(list)).toBeGreaterThanOrEqual(70);
  });

  it('gives low score for 2-line list', () => {
    const result = detectList('apple\nbanana');
    expect(result).toBeGreaterThan(0);
  });

  it('rejects single line', () => {
    expect(detectList('just one item')).toBe(0);
  });
});

// ── Data Formatter ──────────────────────────────────────────────

describe('detectDataFormatter', () => {
  it('detects single-quoted CSV values', () => {
    expect(detectDataFormatter("'apple','banana','cherry','date'")).toBeGreaterThanOrEqual(85);
  });

  it('detects comma-separated numbers', () => {
    expect(detectDataFormatter('1,2,3,4,5')).toBeGreaterThanOrEqual(70);
  });

  it('detects tab-separated data', () => {
    const tsv = "name\tage\tcity\nJohn\t25\tNYC\nJane\t30\tSF";
    expect(detectDataFormatter(tsv)).toBeGreaterThanOrEqual(70);
  });

  it('detects GUIDs', () => {
    expect(detectDataFormatter(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890\nf0e1d2c3-b4a5-6789-0123-456789abcdef'
    )).toBeGreaterThanOrEqual(80);
  });

  it('detects space-separated items on one line', () => {
    expect(detectDataFormatter('id1 id2 id3 id4 id5')).toBeGreaterThan(0);
  });

  it('rejects plain text', () => {
    expect(detectDataFormatter('hello world')).toBe(0);
  });
});

// ── Query Plan ──────────────────────────────────────────────────

describe('detectQueryPlan', () => {
  it('detects SQL Server execution plan XML', () => {
    expect(detectQueryPlan('<ShowPlanXML xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan">')).toBeGreaterThanOrEqual(90);
  });

  it('detects QueryPlan tag', () => {
    expect(detectQueryPlan('<QueryPlan DegreeOfParallelism="1">')).toBeGreaterThanOrEqual(90);
  });

  it('rejects regular XML', () => {
    expect(detectQueryPlan('<root><item>test</item></root>')).toBe(0);
  });
});

// ── Epoch ───────────────────────────────────────────────────────

describe('detectEpoch', () => {
  it('detects 10-digit epoch (seconds)', () => {
    expect(detectEpoch('1700000000')).toBeGreaterThanOrEqual(90);
  });

  it('detects 13-digit epoch (milliseconds)', () => {
    expect(detectEpoch('1700000000000')).toBeGreaterThanOrEqual(90);
  });

  it('detects ISO 8601 date string', () => {
    expect(detectEpoch('2024-01-15T10:30:00Z')).toBeGreaterThanOrEqual(80);
  });

  it('detects date-only string', () => {
    expect(detectEpoch('2024-01-15')).toBeGreaterThan(0);
  });

  it('detects common date format', () => {
    expect(detectEpoch('01/15/2024')).toBeGreaterThan(0);
  });

  it('rejects random numbers', () => {
    expect(detectEpoch('12345')).toBe(0);
  });

  it('rejects text', () => {
    expect(detectEpoch('not a number')).toBe(0);
  });
});

// ── Color ───────────────────────────────────────────────────────

describe('detectColor', () => {
  it('detects hex color', () => {
    expect(detectColor('#ff5733')).toBeGreaterThanOrEqual(90);
  });

  it('detects short hex', () => {
    expect(detectColor('#f00')).toBeGreaterThanOrEqual(90);
  });

  it('detects rgb()', () => {
    expect(detectColor('rgb(255, 87, 51)')).toBeGreaterThanOrEqual(90);
  });

  it('detects hsl()', () => {
    expect(detectColor('hsl(11, 100%, 60%)')).toBeGreaterThanOrEqual(90);
  });

  it('detects sample color #6366F1', () => {
    expect(detectColor('#6366F1')).toBeGreaterThanOrEqual(90);
  });

  it('detects CSS named color "blue"', () => {
    expect(detectColor('blue')).toBeGreaterThanOrEqual(80);
  });

  it('detects CSS named color "coral"', () => {
    expect(detectColor('coral')).toBeGreaterThanOrEqual(80);
  });

  it('rejects plain text', () => {
    expect(detectColor('hello')).toBe(0);
  });
});

// ── Cron ────────────────────────────────────────────────────────

describe('detectCron', () => {
  it('detects standard cron', () => {
    expect(detectCron('*/5 * * * *')).toBeGreaterThanOrEqual(90);
  });

  it('detects complex cron', () => {
    expect(detectCron('0 9 1,15 * 1-5')).toBeGreaterThanOrEqual(85);
  });

  it('detects 6-field cron', () => {
    expect(detectCron('0 */5 * * * *')).toBeGreaterThanOrEqual(85);
  });

  it('detects preset: every weekday at 9am', () => {
    expect(detectCron('0 9 * * 1-5')).toBeGreaterThanOrEqual(90);
  });

  it('detects @yearly shorthand', () => {
    expect(detectCron('@yearly')).toBeGreaterThanOrEqual(85);
  });

  it('detects @hourly shorthand', () => {
    expect(detectCron('@hourly')).toBeGreaterThanOrEqual(85);
  });

  it('rejects plain text', () => {
    expect(detectCron('hello world')).toBe(0);
  });
});

// ── Log ─────────────────────────────────────────────────────────

describe('detectLog', () => {
  it('detects log lines with timestamps and levels', () => {
    const logs = `2024-01-15 10:30:00 INFO  Application started
2024-01-15 10:30:01 DEBUG Loading configuration
2024-01-15 10:30:02 WARN  Cache miss for key: user_123
2024-01-15 10:30:03 ERROR Failed to connect to database
2024-01-15 10:30:04 INFO  Retrying connection`;
    expect(detectLog(logs)).toBeGreaterThanOrEqual(80);
  });

  it('detects bracketed log format', () => {
    const logs = `[2024-01-15T10:30:00Z] INFO: Request received
[2024-01-15T10:30:01Z] ERROR: Connection timeout
[2024-01-15T10:30:02Z] WARN: Slow query detected`;
    expect(detectLog(logs)).toBeGreaterThanOrEqual(75);
  });

  it('detects JSON structured logs', () => {
    const logs = `{"timestamp":"2024-01-15T10:30:00Z","level":"INFO","message":"Started"}
{"timestamp":"2024-01-15T10:30:01Z","level":"ERROR","message":"Failed"}
{"timestamp":"2024-01-15T10:30:02Z","level":"WARN","message":"Slow"}`;
    expect(detectLog(logs)).toBeGreaterThanOrEqual(75);
  });

  it('detects Apache access logs', () => {
    const logs = `192.168.1.1 - - [15/Jan/2024:10:30:00 +0000] "GET /api/users HTTP/1.1" 200 1234
192.168.1.2 - - [15/Jan/2024:10:30:01 +0000] "POST /api/orders HTTP/1.1" 201 567`;
    expect(detectLog(logs)).toBeGreaterThanOrEqual(80);
  });

  it('rejects plain text', () => {
    expect(detectLog('hello world')).toBe(0);
  });
});

// ── Mermaid ─────────────────────────────────────────────────────

describe('detectMermaid', () => {
  it('detects flowchart', () => {
    expect(detectMermaid('graph TD\n  A[Start] --> B[Process]\n  B --> C[End]')).toBeGreaterThanOrEqual(90);
  });

  it('detects sequence diagram', () => {
    expect(detectMermaid('sequenceDiagram\n  Alice->>Bob: Hello\n  Bob->>Alice: Hi')).toBeGreaterThanOrEqual(90);
  });

  it('detects flowchart LR', () => {
    expect(detectMermaid('flowchart LR\n  A --> B --> C')).toBeGreaterThanOrEqual(90);
  });

  it('detects arrow syntax with nodes', () => {
    expect(detectMermaid('A[Start] --> B[Middle] --> C[End]')).toBeGreaterThan(0);
  });

  it('detects plain English system description (EXAMPLE_INPUT)', () => {
    const desc = 'User uploads image from mobile app. API validates auth, stores metadata in Postgres, pushes job to SQS, worker processes image and uploads to S3.';
    expect(detectMermaid(desc)).toBeGreaterThanOrEqual(70);
  });

  it('detects multi-service flow description', () => {
    const desc = 'Client sends request to API gateway. Gateway authenticates user and forwards to backend service. Service fetches data from Redis cache, falls back to Postgres database.';
    expect(detectMermaid(desc)).toBeGreaterThanOrEqual(70);
  });

  it('gives low score for partial system description', () => {
    const desc = 'User calls the API endpoint';
    const result = detectMermaid(desc);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(70);
  });

  it('rejects plain text', () => {
    expect(detectMermaid('hello world')).toBe(0);
  });
});

// ── Text Tools (Jira / AWS / Base64 / Encoded) ─────────────────

describe('detectTextTools', () => {
  it('detects Jira ticket list (JIRA_EXAMPLE)', () => {
    const jira = `LH-101 Fix login button not working on mobile devices
LH-205 Add dark mode support to user dashboard
LH-318 Update user profile page layout and styling
LH-422 Resolve race condition in payment processing`;
    expect(detectTextTools(jira)).toBeGreaterThanOrEqual(90);
  });

  it('detects 2-line Jira tickets', () => {
    const jira = `PROJ-42 Add caching layer\nPROJ-43 Fix timeout issue`;
    expect(detectTextTools(jira)).toBeGreaterThanOrEqual(80);
  });

  it('detects single Jira ticket line', () => {
    expect(detectTextTools('ABC-123 Some task description')).toBeGreaterThanOrEqual(50);
  });

  it('detects AWS CloudWatch paths (INSIGHTS_EXAMPLE)', () => {
    const paths = `/aws/lambda/my-function
/aws/apigateway/my-api-service
/aws/rds/production-db-instance
/ecs/my-app-cluster`;
    expect(detectTextTools(paths)).toBeGreaterThanOrEqual(85);
  });

  it('detects single AWS path', () => {
    expect(detectTextTools('/aws/lambda/my-function')).toBeGreaterThan(0);
  });

  it('detects URL-encoded content', () => {
    expect(detectTextTools('hello%20world%21%20this%20is%20a%20test')).toBeGreaterThanOrEqual(80);
  });

  it('detects HTML entities', () => {
    expect(detectTextTools('&lt;div&gt;hello &amp; world&lt;/div&gt;')).toBeGreaterThanOrEqual(75);
  });

  it('detects base64 content', () => {
    expect(detectTextTools('aGVsbG8gd29ybGQgdGhpcyBpcyBhIHRlc3Q=')).toBeGreaterThanOrEqual(80);
  });

  it('rejects plain text', () => {
    expect(detectTextTools('hello world')).toBe(0);
  });
});

// ── File Detection ──────────────────────────────────────────────

describe('detectFile', () => {
  it('routes image files to metadata', () => {
    const file = new File([''], 'photo.jpg', { type: 'image/jpeg' });
    const result = detectFile(file);
    expect(result?.tool).toBe('metadata');
    expect(result?.confidence).toBeGreaterThanOrEqual(90);
  });

  it('routes PDF to metadata', () => {
    const file = new File([''], 'doc.pdf', { type: 'application/pdf' });
    const result = detectFile(file);
    expect(result?.tool).toBe('metadata');
  });

  it('routes .sqlplan to query plan', () => {
    const file = new File([''], 'query.sqlplan', { type: '' });
    const result = detectFile(file);
    expect(result?.tool).toBe('queryplan');
  });

  it('returns null for text files (should read content)', () => {
    const file = new File([''], 'data.json', { type: 'application/json' });
    const result = detectFile(file);
    expect(result).toBeNull();
  });
});

// ── detectAll integration ───────────────────────────────────────

describe('detectAll', () => {
  it('returns empty for empty input', () => {
    expect(detectAll('')).toEqual([]);
  });

  it('returns JSON as top match for valid JSON', () => {
    const results = detectAll('{"name": "test"}');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].tool).toBe('jsontools');
    expect(results[0].confidence).toBeGreaterThanOrEqual(90);
  });

  it('returns JWT as top match for JWT token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const results = detectAll(jwt);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].tool).toBe('jwtdecode');
  });

  it('returns SQL as top match for SQL query', () => {
    const results = detectAll('SELECT * FROM users WHERE id = 1 ORDER BY name');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].tool).toBe('sqlformatter');
  });

  it('returns cron as top match for cron expression', () => {
    const results = detectAll('*/15 * * * *');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].tool).toBe('cron');
  });

  it('returns epoch as top match for timestamp', () => {
    const results = detectAll('1700000000');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].tool).toBe('epoch');
  });

  it('returns color as top match for hex color', () => {
    const results = detectAll('#ff5733');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].tool).toBe('color');
  });

  it('returns color for named color', () => {
    const results = detectAll('blue');
    expect(results.some(r => r.tool === 'color')).toBe(true);
  });

  it('returns texttools for Jira tickets', () => {
    const jira = `LH-101 Fix login button\nLH-205 Add dark mode\nLH-318 Update layout`;
    const results = detectAll(jira);
    expect(results[0].tool).toBe('texttools');
  });

  it('returns epoch for ISO date', () => {
    const results = detectAll('2024-01-15T10:30:00Z');
    expect(results.some(r => r.tool === 'epoch')).toBe(true);
  });

  it('returns diagram for mermaid syntax', () => {
    const results = detectAll('graph TD\n  A --> B --> C');
    expect(results[0].tool).toBe('diagram');
  });

  it('returns diagram for plain English system description', () => {
    const desc = 'User uploads image from mobile app. API validates auth, stores metadata in Postgres, pushes job to SQS, worker processes image and uploads to S3.';
    const results = detectAll(desc);
    expect(results.some(r => r.tool === 'diagram')).toBe(true);
  });

  it('includes all results with confidence > 0', () => {
    const results = detectAll('hello');
    results.forEach(r => {
      expect(r.confidence).toBeGreaterThan(0);
    });
  });

  it('returns results sorted by confidence descending', () => {
    const results = detectAll('SELECT * FROM users');
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].confidence).toBeGreaterThanOrEqual(results[i].confidence);
    }
  });
});
