// ── Types ──────────────────────────────────────────────────────────────────────

export interface DbColumn {
  name: string;
  type: string;
  isPK: boolean;
  isFK: boolean;
  isNullable: boolean;
  isUnique: boolean;
}

export interface DbRelation {
  fromTable: string;
  fromCol: string;
  toTable: string;
  toCol: string;
  nullable: boolean;
}

export interface DbTable {
  name: string;
  columns: DbColumn[];
}

export interface ParsedSchema {
  tables: DbTable[];
  relations: DbRelation[];
  inputFormat: 'sql' | 'prisma' | 'dbdiagram' | 'unknown';
}

// ── Format detection ───────────────────────────────────────────────────────────

export function detectInputFormat(input: string): 'sql' | 'prisma' | 'dbdiagram' | 'unknown' {
  if (/CREATE\s+TABLE/i.test(input)) return 'sql';
  if (/^\s*model\s+\w+\s*\{/m.test(input)) return 'prisma';
  if (/^\s*Table\s+\w+\s*\{/m.test(input)) return 'dbdiagram';
  return 'unknown';
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function simplifyType(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/\(.*\)/, '').trim();
  if (/^(int|integer|bigint|smallint|tinyint|serial|bigserial|int2|int4|int8)$/.test(t)) return 'int';
  if (/^(varchar|nvarchar|char|nchar|text|tinytext|mediumtext|longtext|string|citext)$/.test(t)) return 'string';
  if (/^(float|double|real|numeric|decimal|money|number)$/.test(t)) return 'float';
  if (/^(bool|boolean|bit)$/.test(t)) return 'boolean';
  if (/^date$/.test(t)) return 'date';
  if (/^(datetime|timestamp|timestamptz|datetime2)$/.test(t)) return 'datetime';
  if (/^time/.test(t)) return 'time';
  if (/^(uuid|uniqueidentifier|guid)$/.test(t)) return 'uuid';
  if (/^(json|jsonb)$/.test(t)) return 'json';
  if (/^(blob|bytea|binary|varbinary|image|bytes)$/.test(t)) return 'bytes';
  return t.replace(/\s+/, '_') || 'string';
}

function unquote(s: string): string {
  return s.trim().replace(/^[`"\[]|[`"\]]$/g, '');
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Split a comma-separated list respecting nested parentheses. */
function splitTopLevel(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function extractParenList(s: string): string[] {
  const m = /\(([^)]+)\)/.exec(s);
  if (!m) return [];
  return m[1].split(',').map(c => unquote(c.trim())).filter(Boolean);
}

// ── SQL DDL parser ─────────────────────────────────────────────────────────────

function parseSql(input: string): ParsedSchema {
  const clean = stripSqlComments(input);
  const tables: DbTable[] = [];
  const relations: DbRelation[] = [];

  const createTableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\[]?[\w.]+[`"\]]?)\s*\(/gi;
  let match: RegExpExecArray | null;

  while ((match = createTableRe.exec(clean)) !== null) {
    const tableName = unquote(match[1]).split('.').pop()!;

    // Collect body between balanced parentheses
    let depth = 1;
    let i = match.index + match[0].length;
    let body = '';
    while (i < clean.length && depth > 0) {
      if (clean[i] === '(') depth++;
      else if (clean[i] === ')') { depth--; if (depth === 0) break; }
      body += clean[i];
      i++;
    }

    const columns: DbColumn[] = [];
    const tableLevelPKs: string[] = [];
    const tableLevelFKs: { col: string; refTable: string; refCol: string }[] = [];
    const fkColNames = new Set<string>();

    for (const part of splitTopLevel(body)) {
      const line = part.trim();
      if (!line) continue;

      // Table-level PRIMARY KEY
      if (/^PRIMARY\s+KEY/i.test(line)) {
        tableLevelPKs.push(...extractParenList(line));
        continue;
      }

      // Table-level FOREIGN KEY (inline or CONSTRAINT … FOREIGN KEY)
      if (/FOREIGN\s+KEY/i.test(line)) {
        const colM = /FOREIGN\s+KEY\s*\(([^)]+)\)/i.exec(line);
        const refM = /REFERENCES\s+([`"\[]?[\w.]+[`"\]]?)\s*\(([^)]+)\)/i.exec(line);
        if (colM && refM) {
          const col = unquote(colM[1].trim());
          const refTable = unquote(refM[1]).split('.').pop()!;
          const refCol = unquote(refM[2].trim());
          tableLevelFKs.push({ col, refTable, refCol });
          fkColNames.add(col);
        }
        continue;
      }

      // Table-level UNIQUE constraint line (not a column definition)
      if (/^UNIQUE\s*\(/i.test(line)) continue;

      // MySQL KEY / INDEX lines
      if (/^(INDEX|KEY)\b/i.test(line)) continue;

      // Skip standalone CONSTRAINT lines that are PKs (handled above indirectly)
      if (/^CONSTRAINT\b/i.test(line)) {
        if (/PRIMARY\s+KEY/i.test(line)) {
          tableLevelPKs.push(...extractParenList(line.replace(/.*PRIMARY\s+KEY/i, '')));
        } else if (/FOREIGN\s+KEY/i.test(line)) {
          const colM = /FOREIGN\s+KEY\s*\(([^)]+)\)/i.exec(line);
          const refM = /REFERENCES\s+([`"\[]?[\w.]+[`"\]]?)\s*\(([^)]+)\)/i.exec(line);
          if (colM && refM) {
            const col = unquote(colM[1].trim());
            const refTable = unquote(refM[1]).split('.').pop()!;
            const refCol = unquote(refM[2].trim());
            tableLevelFKs.push({ col, refTable, refCol });
            fkColNames.add(col);
          }
        }
        continue;
      }

      // Column definition: name type [constraints...]
      const colM = /^([`"\[]?[\w]+[`"\]]?)\s+(\w[\w\s()]*?)(?:\s+(.*))?$/.exec(line);
      if (!colM) continue;

      const colName = unquote(colM[1]);
      if (['PRIMARY', 'FOREIGN', 'UNIQUE', 'INDEX', 'KEY', 'CONSTRAINT', 'CHECK'].includes(colName.toUpperCase())) continue;

      const rawType = colM[2].replace(/\([\d, ]+\)/, '').trim();
      const rest = ((colM[3] ?? '') + ' ' + colM[2]).toUpperCase();

      const isPK = /\bPRIMARY\s+KEY\b/.test(rest);
      const isNullable = !/\bNOT\s+NULL\b/.test(rest) && !isPK;
      const isUnique = /\bUNIQUE\b/.test(rest);

      // Inline REFERENCES
      const inlineRef = /REFERENCES\s+([`"\[]?[\w.]+[`"\]]?)\s*\(([^)]+)\)/i.exec(line);
      let isFK = false;
      if (inlineRef) {
        isFK = true;
        fkColNames.add(colName);
        const refTable = unquote(inlineRef[1]).split('.').pop()!;
        const refCol = unquote(inlineRef[2].trim());
        tableLevelFKs.push({ col: colName, refTable, refCol });
      }

      if (isPK) tableLevelPKs.push(colName);

      columns.push({ name: colName, type: simplifyType(rawType), isPK, isFK, isNullable, isUnique });
    }

    // Apply table-level PK/FK markers
    for (const pk of tableLevelPKs) {
      const col = columns.find(c => c.name === pk);
      if (col) col.isPK = true;
    }
    for (const { col } of tableLevelFKs) {
      const c = columns.find(x => x.name === col);
      if (c) c.isFK = true;
    }

    tables.push({ name: tableName, columns });

    for (const { col, refTable, refCol } of tableLevelFKs) {
      const srcCol = columns.find(c => c.name === col);
      relations.push({ fromTable: tableName, fromCol: col, toTable: refTable, toCol: refCol, nullable: srcCol?.isNullable ?? true });
    }
  }

  // ALTER TABLE ADD FOREIGN KEY statements
  const alterRe = /ALTER\s+TABLE\s+([`"\[]?[\w.]+[`"\]]?)\s+ADD\s+(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+([`"\[]?[\w.]+[`"\]]?)\s*\(([^)]+)\)/gi;
  while ((match = alterRe.exec(clean)) !== null) {
    const fromTable = unquote(match[1]).split('.').pop()!;
    const fromCol = unquote(match[2].trim());
    const toTable = unquote(match[3]).split('.').pop()!;
    const toCol = unquote(match[4].trim());
    const table = tables.find(t => t.name === fromTable);
    const col = table?.columns.find(c => c.name === fromCol);
    if (col) col.isFK = true;
    relations.push({ fromTable, fromCol, toTable, toCol, nullable: col?.isNullable ?? true });
  }

  return { tables, relations, inputFormat: 'sql' };
}

// ── Prisma schema parser ───────────────────────────────────────────────────────

function parsePrisma(input: string): ParsedSchema {
  const tables: DbTable[] = [];
  const relations: DbRelation[] = [];

  // Collect all model names first (to distinguish relation fields from scalars)
  const modelNames = new Set<string>();
  for (const m of input.matchAll(/^model\s+(\w+)\s*\{/gm)) modelNames.add(m[1]);

  const SCALARS = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes']);

  for (const m of input.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)) {
    const modelName = m[1];
    const body = m[2];
    const columns: DbColumn[] = [];
    const fkFields = new Set<string>();

    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;

      const fM = /^(\w+)\s+(\w+)(\?)?((\[\])?)\s*(.*)$/.exec(trimmed);
      if (!fM) continue;

      const [, name, type, optional, , isArray, attrs = ''] = fM;

      if (modelNames.has(type)) {
        // Relation field
        if (!isArray) {
          const relAttr = /@relation\s*\([^)]*fields:\s*\[([^\]]+)\][^)]*references:\s*\[([^\]]+)\][^)]*\)/.exec(attrs);
          if (relAttr) {
            const fromCols = relAttr[1].split(',').map(s => s.trim());
            const toCols = relAttr[2].split(',').map(s => s.trim());
            fromCols.forEach(fc => fkFields.add(fc));
            relations.push({ fromTable: modelName, fromCol: fromCols[0] ?? '', toTable: type, toCol: toCols[0] ?? 'id', nullable: !!optional });
          }
        }
        continue;
      }

      if (!SCALARS.has(type) && /^[A-Z]/.test(type)) continue; // Enum — skip

      columns.push({
        name,
        type: simplifyType(type.toLowerCase()),
        isPK: /@id\b/.test(attrs),
        isFK: false,
        isNullable: !!optional,
        isUnique: /@unique\b/.test(attrs),
      });
    }

    for (const col of columns) { if (fkFields.has(col.name)) col.isFK = true; }
    tables.push({ name: modelName, columns });
  }

  return { tables, relations, inputFormat: 'prisma' };
}

// ── dbdiagram.io parser ────────────────────────────────────────────────────────

function parseDbdiagram(input: string): ParsedSchema {
  const tables: DbTable[] = [];
  const relations: DbRelation[] = [];

  for (const m of input.matchAll(/Table\s+(\w+)(?:\s+as\s+\w+)?\s*\{([^}]*)\}/g)) {
    const tableName = m[1];
    const columns: DbColumn[] = [];

    for (const line of m[2].split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('Note')) continue;

      const cM = /^(\w+)\s+(\w+)\s*(?:\[([^\]]*)\])?/.exec(trimmed);
      if (!cM) continue;

      const [, name, type, attrs = ''] = cM;
      const isPK = /\bpk\b/i.test(attrs);
      const isUnique = /\bunique\b/i.test(attrs);
      const isNullable = /\bnot\s+null\b/i.test(attrs) ? false : !isPK;

      const refM = /ref:\s*[<>-]\s*(\w+)\.(\w+)/i.exec(attrs);
      let isFK = false;
      if (refM) {
        isFK = true;
        relations.push({ fromTable: tableName, fromCol: name, toTable: refM[1], toCol: refM[2], nullable: isNullable });
      }

      columns.push({ name, type: simplifyType(type), isPK, isFK, isNullable, isUnique });
    }

    tables.push({ name: tableName, columns });
  }

  // Standalone Ref statements: Ref: table1.col > table2.col
  for (const m of input.matchAll(/^Ref(?::\s*\w+)?\s*:\s*(\w+)\.(\w+)\s*[<>-]+\s*(\w+)\.(\w+)/gm)) {
    const fromTable = m[1], fromCol = m[2], toTable = m[3], toCol = m[4];
    relations.push({ fromTable, fromCol, toTable, toCol, nullable: true });
    const col = tables.find(t => t.name === fromTable)?.columns.find(c => c.name === fromCol);
    if (col) col.isFK = true;
  }

  return { tables, relations, inputFormat: 'dbdiagram' };
}

// ── Main entry point ───────────────────────────────────────────────────────────

export function parseSchema(input: string): ParsedSchema {
  const format = detectInputFormat(input.trim());
  if (format === 'sql') return parseSql(input);
  if (format === 'prisma') return parsePrisma(input);
  if (format === 'dbdiagram') return parseDbdiagram(input);
  // Fallback: try SQL
  const tried = parseSql(input);
  if (tried.tables.length > 0) return tried;
  return { tables: [], relations: [], inputFormat: 'unknown' };
}

// ── Mermaid erDiagram generator ────────────────────────────────────────────────

export function schemaToMermaid(schema: ParsedSchema): string {
  if (schema.tables.length === 0) return '';

  const lines: string[] = ['erDiagram'];
  const tableNames = new Set(schema.tables.map(t => t.name));

  for (const table of schema.tables) {
    lines.push(`    ${table.name} {`);
    for (const col of table.columns) {
      const annotations: string[] = [];
      if (col.isPK) annotations.push('PK');
      if (col.isFK) annotations.push('FK');
      if (col.isUnique && !col.isPK) annotations.push('UK');
      const safeName = col.name.replace(/[^a-zA-Z0-9_]/g, '_');
      const suffix = annotations.length ? ` "${annotations.join(',')}"` : '';
      lines.push(`        ${col.type} ${safeName}${suffix}`);
    }
    lines.push('    }');
  }

  // Relations — deduplicated, only between known tables
  const seen = new Set<string>();
  for (const rel of schema.relations) {
    if (!tableNames.has(rel.toTable)) continue;
    const key = `${rel.toTable}->${rel.fromTable}:${rel.fromCol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const arrow = rel.nullable ? '||--o{' : '||--|{';
    lines.push(`    ${rel.toTable} ${arrow} ${rel.fromTable} : "${rel.fromCol}"`);
  }

  return lines.join('\n');
}

// ── Sample schemas ─────────────────────────────────────────────────────────────

export const SAMPLES: Record<string, { label: string; format: string; code: string }> = {
  sql: {
    label: 'E-Commerce (SQL)',
    format: 'sql',
    code: `CREATE TABLE users (
  id         SERIAL PRIMARY KEY,
  email      VARCHAR(255) UNIQUE NOT NULL,
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE addresses (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line1      VARCHAR(255) NOT NULL,
  city       VARCHAR(100) NOT NULL,
  country    VARCHAR(100) NOT NULL,
  is_default BOOLEAN DEFAULT FALSE
);

CREATE TABLE products (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(200) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock INT DEFAULT 0
);

CREATE TABLE reviews (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  rating     INT NOT NULL,
  body       TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders (
  id             SERIAL PRIMARY KEY,
  user_id        INT NOT NULL REFERENCES users(id),
  address_id     INT REFERENCES addresses(id),
  total          DECIMAL(10,2) NOT NULL,
  status         VARCHAR(50) DEFAULT 'pending',
  created_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE order_items (
  id          SERIAL PRIMARY KEY,
  order_id    INT NOT NULL REFERENCES orders(id),
  product_id  INT NOT NULL REFERENCES products(id),
  quantity    INT NOT NULL,
  unit_price  DECIMAL(10,2) NOT NULL
);`,
  },
  prisma: {
    label: 'Blog (Prisma)',
    format: 'prisma',
    code: `model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String
  posts     Post[]
  comments  Comment[]
  likes     Like[]
  profile   Profile?
  createdAt DateTime @default(now())
}

model Profile {
  id     Int    @id @default(autoincrement())
  bio    String?
  avatar String?
  userId Int    @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Post {
  id        Int       @id @default(autoincrement())
  title     String
  content   String?
  published Boolean   @default(false)
  authorId  Int
  author    User      @relation(fields: [authorId], references: [id])
  comments  Comment[]
  tags      PostTag[]
  likes     Like[]
  createdAt DateTime  @default(now())
}

model Comment {
  id        Int      @id @default(autoincrement())
  content   String
  postId    Int
  authorId  Int
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  author    User     @relation(fields: [authorId], references: [id])
  createdAt DateTime @default(now())
}

model Tag {
  id    Int       @id @default(autoincrement())
  name  String    @unique
  posts PostTag[]
}

model PostTag {
  postId Int
  tagId  Int
  post   Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  tag    Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([postId, tagId])
}

model Like {
  id       Int  @id @default(autoincrement())
  postId   Int
  userId   Int
  post     Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  user     User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([postId, userId])
}`,
  },
  dbdiagram: {
    label: 'CMS (dbdiagram)',
    format: 'dbdiagram',
    code: `Table users {
  id         int [pk]
  email      varchar [unique]
  name       varchar
  role       varchar
  created_at datetime
}

Table posts {
  id         int [pk]
  title      varchar
  content    text
  author_id  int [ref: > users.id]
  created_at datetime
}

Table tags {
  id   int [pk]
  name varchar [unique]
}

Table post_tags {
  post_id int [ref: > posts.id]
  tag_id  int [ref: > tags.id]
}

Table comments {
  id        int [pk]
  body      text
  post_id   int [ref: > posts.id]
  author_id int [ref: > users.id]
}`,
  },
};
