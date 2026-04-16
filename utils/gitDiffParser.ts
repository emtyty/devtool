// ── Types ──────────────────────────────────────────────────────────────────────

export type FileStatus = 'added' | 'deleted' | 'modified' | 'renamed' | 'binary';
export type LineType = 'add' | 'del' | 'context' | 'meta';

export interface DiffLine {
  type: LineType;
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffFile {
  oldPath: string;
  newPath: string;
  status: FileStatus;
  isBinary: boolean;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

export interface ParsedDiff {
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
}

// ── Parser ─────────────────────────────────────────────────────────────────────

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseGitDiff(input: string): ParsedDiff {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const files: DiffFile[] = [];

  let current: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldLineNo = 0;
  let newLineNo = 0;

  const pushFile = () => {
    if (current) {
      if (hunk) current.hunks.push(hunk);
      files.push(current);
    }
    current = null;
    hunk = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // New file block header
    if (line.startsWith('diff --git ')) {
      pushFile();
      const m = /diff --git "?a\/(.+?)"? "?b\/(.+?)"?\s*$/.exec(line);
      current = {
        oldPath: m?.[1] ?? '',
        newPath: m?.[2] ?? '',
        status: 'modified',
        isBinary: false,
        hunks: [],
        additions: 0,
        deletions: 0,
      };
      continue;
    }

    if (!current) continue;

    // File metadata lines
    if (line.startsWith('new file mode')) { current.status = 'added'; continue; }
    if (line.startsWith('deleted file mode')) { current.status = 'deleted'; continue; }
    if (line.startsWith('rename from ')) {
      current.status = 'renamed';
      current.oldPath = line.slice('rename from '.length);
      continue;
    }
    if (line.startsWith('rename to ')) {
      current.newPath = line.slice('rename to '.length);
      continue;
    }
    if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) {
      current.isBinary = true;
      current.status = 'binary';
      continue;
    }
    if (line.startsWith('index ') || line.startsWith('similarity index ') ||
        line.startsWith('---') || line.startsWith('+++') || line.startsWith('old mode') || line.startsWith('new mode')) {
      // Parse old/new path from --- / +++ if missing
      if (line.startsWith('--- ') && !current.oldPath) {
        current.oldPath = line.replace(/^--- (?:a\/)?/, '').trim();
      }
      if (line.startsWith('+++ ') && !current.newPath) {
        current.newPath = line.replace(/^\+\+\+ (?:b\/)?/, '').trim();
      }
      continue;
    }

    // Hunk header
    if (line.startsWith('@@')) {
      if (hunk) current.hunks.push(hunk);
      const m = HUNK_RE.exec(line);
      if (m) {
        hunk = {
          header: line,
          oldStart: parseInt(m[1], 10),
          oldLines: m[2] ? parseInt(m[2], 10) : 1,
          newStart: parseInt(m[3], 10),
          newLines: m[4] ? parseInt(m[4], 10) : 1,
          lines: [],
        };
        oldLineNo = hunk.oldStart;
        newLineNo = hunk.newStart;
      }
      continue;
    }

    // Skip "\ No newline at end of file" marker
    if (line.startsWith('\\ ')) continue;

    // Content lines within a hunk
    if (!hunk) continue;

    const prefix = line[0];
    const content = line.slice(1);

    if (prefix === '+') {
      hunk.lines.push({ type: 'add', content, newLineNo });
      newLineNo++;
      current.additions++;
    } else if (prefix === '-') {
      hunk.lines.push({ type: 'del', content, oldLineNo });
      oldLineNo++;
      current.deletions++;
    } else {
      // Context line (leading space) or blank — treat blank as context
      hunk.lines.push({ type: 'context', content: line.startsWith(' ') ? content : line, oldLineNo, newLineNo });
      oldLineNo++;
      newLineNo++;
    }
  }

  pushFile();

  return {
    files,
    totalAdditions: files.reduce((s, f) => s + f.additions, 0),
    totalDeletions: files.reduce((s, f) => s + f.deletions, 0),
  };
}

// ── Word-level diff (for inline intra-line highlighting) ──────────────────────

export type WordSegment = { type: 'equal' | 'removed' | 'added'; text: string };

const TOKEN_RE = /\s+|\w+|[^\s\w]+/g;

function tokenize(s: string): string[] {
  return s.match(TOKEN_RE) ?? [];
}

function mergeSegments(segs: WordSegment[]): WordSegment[] {
  const out: WordSegment[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.type === s.type) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

/**
 * Computes word-level LCS diff between two strings.
 * Returns segment arrays for the "old" (left) and "new" (right) sides.
 * Skips work for very long lines to avoid O(m*n) performance issues.
 */
export function diffWords(oldText: string, newText: string): { left: WordSegment[]; right: WordSegment[] } {
  if (oldText === newText) {
    return {
      left: [{ type: 'equal', text: oldText }],
      right: [{ type: 'equal', text: newText }],
    };
  }
  if (oldText.length > 500 || newText.length > 500) {
    return {
      left: [{ type: 'removed', text: oldText }],
      right: [{ type: 'added', text: newText }],
    };
  }

  const a = tokenize(oldText);
  const b = tokenize(newText);
  const m = a.length;
  const n = b.length;
  const w = n + 1;
  const dp = new Uint16Array((m + 1) * w);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i * w + j] = a[i - 1] === b[j - 1]
        ? dp[(i - 1) * w + j - 1] + 1
        : Math.max(dp[(i - 1) * w + j], dp[i * w + j - 1]);
    }
  }

  const left: WordSegment[] = [];
  const right: WordSegment[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      left.unshift({ type: 'equal', text: a[i - 1] });
      right.unshift({ type: 'equal', text: b[j - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i * w + j - 1] >= dp[(i - 1) * w + j])) {
      right.unshift({ type: 'added', text: b[j - 1] });
      j--;
    } else {
      left.unshift({ type: 'removed', text: a[i - 1] });
      i--;
    }
  }

  return { left: mergeSegments(left), right: mergeSegments(right) };
}

// ── Language detection by file extension ──────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', rb: 'ruby', java: 'java', kt: 'kotlin', scala: 'scala',
  go: 'go', rs: 'rust', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
  hpp: 'cpp', cs: 'csharp', php: 'php', swift: 'swift',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml', svelte: 'xml',
  css: 'css', scss: 'scss', less: 'less',
  json: 'json', yaml: 'yaml', yml: 'yaml',
  md: 'markdown', mdx: 'markdown',
  sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  graphql: 'graphql', gql: 'graphql',
  toml: 'ini', ini: 'ini', conf: 'ini', env: 'ini',
};

export function getLanguageFromPath(path: string): string | null {
  const name = path.split('/').pop()?.toLowerCase() ?? '';
  if (name === 'dockerfile' || name.endsWith('.dockerfile')) return 'dockerfile';
  if (name === 'makefile') return 'makefile';
  const dot = name.lastIndexOf('.');
  if (dot === -1) return null;
  const ext = name.slice(dot + 1);
  return EXT_TO_LANG[ext] ?? null;
}

// ── Whitespace-only file detection ────────────────────────────────────────────

/**
 * True if every change in the file is whitespace-only
 * (each deletion pairs with an addition whose non-whitespace content is identical).
 */
export function isWhitespaceOnlyFile(file: DiffFile): boolean {
  if (file.additions === 0 && file.deletions === 0) return false;
  if (file.additions !== file.deletions) return false;
  if (file.status === 'added' || file.status === 'deleted' || file.status === 'binary') return false;

  for (const hunk of file.hunks) {
    const dels: string[] = [];
    const adds: string[] = [];
    for (const line of hunk.lines) {
      if (line.type === 'del') dels.push(line.content);
      else if (line.type === 'add') adds.push(line.content);
    }
    if (dels.length !== adds.length) return false;
    for (let k = 0; k < dels.length; k++) {
      if (dels[k].replace(/\s+/g, '') !== adds[k].replace(/\s+/g, '')) return false;
    }
  }
  return true;
}

// ── Side-by-side alignment ─────────────────────────────────────────────────────

export interface SideBySideRow {
  left: DiffLine | null;   // old side
  right: DiffLine | null;  // new side
}

/**
 * Converts a hunk's sequential lines into side-by-side rows:
 * - Context lines: same line appears on both sides.
 * - Del lines: appear on left only.
 * - Add lines: appear on right only, paired with a del line if possible.
 */
export function hunkToSideBySide(hunk: DiffHunk): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  const { lines } = hunk;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.type === 'context') {
      rows.push({ left: line, right: line });
      i++;
      continue;
    }

    // Collect a run of dels then adds
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i].type === 'del') { dels.push(lines[i]); i++; }
    while (i < lines.length && lines[i].type === 'add') { adds.push(lines[i]); i++; }

    const pairs = Math.max(dels.length, adds.length);
    for (let p = 0; p < pairs; p++) {
      rows.push({ left: dels[p] ?? null, right: adds[p] ?? null });
    }
  }

  return rows;
}

// ── Sample diffs by language ──────────────────────────────────────────────────

export interface DiffSample {
  label: string;
  code: string;
}

export const SAMPLES: Record<string, DiffSample> = {
  dotnet: {
    label: '.NET / C#',
    code: `diff --git a/Controllers/UsersController.cs b/Controllers/UsersController.cs
index 1a2b3c4..5d6e7f8 100644
--- a/Controllers/UsersController.cs
+++ b/Controllers/UsersController.cs
@@ -1,28 +1,41 @@
 using Microsoft.AspNetCore.Mvc;
+using Microsoft.Extensions.Logging;
+using System.Threading.Tasks;

 namespace Example.Api.Controllers;

 [ApiController]
 [Route("api/[controller]")]
-public class UsersController : ControllerBase
+public class UsersController(IUserService service, ILogger<UsersController> logger) : ControllerBase
 {
-    private readonly IUserService _service;
-
-    public UsersController(IUserService service)
-    {
-        _service = service;
-    }
-
     [HttpGet("{id:int}")]
-    public IActionResult GetUser(int id)
+    public async Task<IActionResult> GetUserAsync(int id, CancellationToken ct)
     {
-        var user = _service.FindById(id);
-        if (user == null) return NotFound();
-        return Ok(user);
+        if (id < 1)
+        {
+            return BadRequest(new { error = "Invalid id" });
+        }
+
+        var user = await service.FindByIdAsync(id, ct);
+        if (user is null)
+        {
+            logger.LogWarning("User {Id} not found", id);
+            return NotFound();
+        }
+        return Ok(user);
     }

-    [HttpGet]
-    public IActionResult GetAll() => Ok(_service.FindAll());
+    [HttpGet]
+    public async Task<IActionResult> GetAllAsync(
+        [FromQuery] int page = 1,
+        [FromQuery] int limit = 20,
+        CancellationToken ct = default)
+    {
+        var users = await service.FindAllAsync(page, limit, ct);
+        return Ok(new
+        {
+            data = users,
+            page,
+            limit,
+        });
+    }
 }
diff --git a/Services/UserService.cs b/Services/UserService.cs
index aaa1111..bbb2222 100644
--- a/Services/UserService.cs
+++ b/Services/UserService.cs
@@ -1,12 +1,18 @@
+using System.Collections.Generic;
+using System.Threading;
+using System.Threading.Tasks;
+
 namespace Example.Api.Services;

 public interface IUserService
 {
-    User? FindById(int id);
-    IEnumerable<User> FindAll();
+    Task<User?> FindByIdAsync(int id, CancellationToken ct);
+    Task<IReadOnlyList<User>> FindAllAsync(int page, int limit, CancellationToken ct);
 }
`,
  },

  typescript: {
    label: 'TypeScript / React',
    code: `diff --git a/src/utils/formatter.ts b/src/utils/formatter.ts
index a1b2c3d..e4f5g6h 100644
--- a/src/utils/formatter.ts
+++ b/src/utils/formatter.ts
@@ -10,7 +10,9 @@ export function formatCurrency(amount: number, currency = 'USD'): string {
   if (amount == null) return '';
-  return amount.toLocaleString('en-US', {
+  return new Intl.NumberFormat('en-US', {
     style: 'currency',
     currency,
+    minimumFractionDigits: 2,
+    maximumFractionDigits: 2,
-  });
+  }).format(amount);
 }
@@ -25,5 +27,12 @@ export function parseNumber(input: string): number {
-export function slugify(str: string): string {
-  return str.toLowerCase().replace(/\\s+/g, '-');
+export function slugify(str: string, options: { maxLength?: number } = {}): string {
+  const slug = str
+    .toLowerCase()
+    .trim()
+    .replace(/[^\\w\\s-]/g, '')
+    .replace(/[\\s_-]+/g, '-')
+    .replace(/^-+|-+$/g, '');
+  return options.maxLength ? slug.slice(0, options.maxLength) : slug;
 }
diff --git a/src/components/Button.tsx b/src/components/Button.tsx
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/components/Button.tsx
@@ -0,0 +1,18 @@
+import React from 'react';
+
+interface ButtonProps {
+  label: string;
+  onClick: () => void;
+  variant?: 'primary' | 'secondary';
+}
+
+export function Button({ label, onClick, variant = 'primary' }: ButtonProps) {
+  const classes = variant === 'primary'
+    ? 'bg-blue-600 text-white'
+    : 'bg-gray-200 text-gray-900';
+  return (
+    <button onClick={onClick} className={\`\${classes} px-4 py-2 rounded\`}>
+      {label}
+    </button>
+  );
+}
diff --git a/src/old-helper.ts b/src/old-helper.ts
deleted file mode 100644
index 5f6a7b8..0000000
--- a/src/old-helper.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-export function legacyHelper() {
-  // No longer used after v2 migration
-  console.log('deprecated');
-  return null;
-}
`,
  },

  python: {
    label: 'Python / Flask',
    code: `diff --git a/app/routes.py b/app/routes.py
index 2a1b4c..7d9e8f 100644
--- a/app/routes.py
+++ b/app/routes.py
@@ -1,18 +1,26 @@
-from flask import Flask, jsonify
+from flask import Flask, jsonify, request
+from typing import Any
+import logging

 app = Flask(__name__)
+logger = logging.getLogger(__name__)

-@app.route('/users')
-def get_users():
-    users = query_users()
-    return jsonify(users)
+@app.route('/users', methods=['GET'])
+def get_users() -> Any:
+    page = int(request.args.get('page', 1))
+    limit = int(request.args.get('limit', 20))
+    users = query_users(page=page, limit=limit)
+    return jsonify({'data': users, 'page': page, 'limit': limit})

-def query_users():
-    return db.query('SELECT * FROM users')
+def query_users(page: int = 1, limit: int = 20) -> list:
+    offset = (page - 1) * limit
+    logger.info(f'Querying users: page={page} limit={limit}')
+    return db.query(
+        'SELECT * FROM users ORDER BY id LIMIT ? OFFSET ?',
+        [limit, offset]
+    )
diff --git a/tests/test_routes.py b/tests/test_routes.py
new file mode 100644
index 0000000..1a2b3c4
--- /dev/null
+++ b/tests/test_routes.py
@@ -0,0 +1,12 @@
+import pytest
+from app.routes import app
+
+@pytest.fixture
+def client():
+    with app.test_client() as c:
+        yield c
+
+def test_get_users_pagination(client):
+    response = client.get('/users?page=2&limit=10')
+    assert response.status_code == 200
+    assert response.json['page'] == 2
`,
  },

  go: {
    label: 'Go / HTTP Handler',
    code: `diff --git a/handlers/users.go b/handlers/users.go
index a1b2c3d..d4e5f6a 100644
--- a/handlers/users.go
+++ b/handlers/users.go
@@ -1,22 +1,32 @@
 package handlers

 import (
 	"encoding/json"
+	"errors"
 	"net/http"
+
+	"example.com/app/db"
 )

-func GetUser(w http.ResponseWriter, r *http.Request) {
-	id := r.URL.Query().Get("id")
-	user, err := db.FindUser(id)
-	if err != nil {
-		http.Error(w, "not found", 404)
-		return
-	}
-	json.NewEncoder(w).Encode(user)
+// GetUser fetches a single user by ID query parameter.
+func GetUser(w http.ResponseWriter, r *http.Request) {
+	id := r.URL.Query().Get("id")
+	if id == "" {
+		http.Error(w, "missing id parameter", http.StatusBadRequest)
+		return
+	}
+
+	user, err := db.FindUser(r.Context(), id)
+	if errors.Is(err, db.ErrNotFound) {
+		http.Error(w, "user not found", http.StatusNotFound)
+		return
+	}
+	if err != nil {
+		http.Error(w, "internal error", http.StatusInternalServerError)
+		return
+	}
+
+	w.Header().Set("Content-Type", "application/json")
+	json.NewEncoder(w).Encode(user)
 }
`,
  },

  sql: {
    label: 'SQL / Migration',
    code: `diff --git a/migrations/001_create_users.sql b/migrations/001_create_users.sql
index aaa1234..bbb5678 100644
--- a/migrations/001_create_users.sql
+++ b/migrations/001_create_users.sql
@@ -1,7 +1,9 @@
 CREATE TABLE users (
     id         SERIAL PRIMARY KEY,
-    name       VARCHAR(100),
+    name       VARCHAR(100) NOT NULL,
+    email      VARCHAR(255) UNIQUE NOT NULL,
+    role       VARCHAR(50)  NOT NULL DEFAULT 'user',
     created_at TIMESTAMP DEFAULT NOW()
 );

-CREATE INDEX idx_users_name ON users(name);
+CREATE INDEX idx_users_email ON users(email);
diff --git a/migrations/002_create_orders.sql b/migrations/002_create_orders.sql
new file mode 100644
index 0000000..ccc9012
--- /dev/null
+++ b/migrations/002_create_orders.sql
@@ -0,0 +1,15 @@
+-- Migration: add orders and order_items tables
+CREATE TABLE orders (
+    id          SERIAL PRIMARY KEY,
+    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
+    total       DECIMAL(10,2) NOT NULL,
+    status      VARCHAR(50)  NOT NULL DEFAULT 'pending',
+    created_at  TIMESTAMP DEFAULT NOW()
+);
+
+CREATE INDEX idx_orders_user_id ON orders(user_id);
+CREATE INDEX idx_orders_status  ON orders(status);
+
+-- Common query: fetch a user's recent orders
+-- SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 10;
`,
  },

};

