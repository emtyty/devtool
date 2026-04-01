import { useState, useEffect, useCallback, useMemo } from 'react';
import { Code2, Layers, Copy, Check, Minimize2, Maximize2, FileCode2 } from 'lucide-react';
import { format as prettyPrintSql } from 'sql-formatter';
import ResizableSplit from './ResizableSplit';

// ── SQL Syntax Highlighter ──────────────────────────────────────────────────

const SQL_KEYWORDS = /\b(SELECT|FROM|WHERE|AND|OR|NOT|NULL|AS|ON|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|APPLY|INTO|VALUES|UPDATE|SET|DELETE|INSERT|CREATE|DROP|ALTER|TABLE|INDEX|VIEW|DATABASE|SCHEMA|WITH|UNION|ALL|DISTINCT|ORDER|BY|GROUP|HAVING|LIMIT|TOP|OFFSET|FETCH|NEXT|ROWS|ONLY|CASE|WHEN|THEN|ELSE|END|BEGIN|COMMIT|ROLLBACK|DECLARE|EXEC|EXECUTE|PROCEDURE|FUNCTION|RETURN|IS|IN|BETWEEN|LIKE|EXISTS|PRIMARY|KEY|FOREIGN|REFERENCES|CONSTRAINT|DEFAULT|UNIQUE|CHECK|INT|INTEGER|BIGINT|SMALLINT|TINYINT|VARCHAR|NVARCHAR|NCHAR|CHAR|TEXT|NTEXT|DECIMAL|NUMERIC|FLOAT|REAL|BIT|DATETIME|DATETIME2|DATE|TIME|UNIQUEIDENTIFIER|XML|BINARY|VARBINARY|CAST|CONVERT|COALESCE|ISNULL|NULLIF|COUNT|SUM|AVG|MIN|MAX|ROW_NUMBER|RANK|DENSE_RANK|NTILE|LAG|LEAD|OVER|PARTITION|NOLOCK|READPAST|UPDLOCK|ASC|DESC|PIVOT|UNPIVOT|MERGE|USING|MATCHED|OUTPUT|INSERTED|DELETED|TRUNCATE|PRINT|GOTO|BREAK|CONTINUE|WHILE|IF|ELSE|TRY|CATCH|THROW|RAISERROR|TRANSACTION|TRAN|SAVEPOINT)\b/gi;

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightSql(sql: string): string {
  const result: string[] = [];
  let i = 0;

  while (i < sql.length) {
    // Line comment
    if (sql[i] === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const chunk = end === -1 ? sql.slice(i) : sql.slice(i, end);
      result.push(`<span style="color:#64748b;font-style:italic">${escHtml(chunk)}</span>`);
      i = end === -1 ? sql.length : end;
      continue;
    }
    // Block comment
    if (sql[i] === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const chunk = end === -1 ? sql.slice(i) : sql.slice(i, end + 2);
      result.push(`<span style="color:#64748b;font-style:italic">${escHtml(chunk)}</span>`);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    // String literal (single-quoted, '' escape)
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j++; break; }
        j++;
      }
      result.push(`<span style="color:#86efac">${escHtml(sql.slice(i, j))}</span>`);
      i = j;
      continue;
    }
    // Quoted identifier [...]
    if (sql[i] === '[') {
      const end = sql.indexOf(']', i);
      const chunk = end === -1 ? sql.slice(i) : sql.slice(i, end + 1);
      result.push(`<span style="color:#e2e8f0">${escHtml(chunk)}</span>`);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    // Plain code — accumulate until next special char
    let j = i;
    while (j < sql.length && sql[j] !== "'" && sql[j] !== '[' &&
           !(sql[j] === '-' && sql[j + 1] === '-') &&
           !(sql[j] === '/' && sql[j + 1] === '*')) {
      j++;
    }
    if (j > i) {
      let chunk = escHtml(sql.slice(i, j));
      chunk = chunk.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#fdba74">$1</span>');
      chunk = chunk.replace(SQL_KEYWORDS, '<span style="color:#93c5fd;font-weight:600">$1</span>');
      chunk = chunk.replace(/@\w+/g, '<span style="color:#f9a8d4;font-weight:600">$&</span>');
      result.push(chunk);
      i = j;
    }
  }

  return result.join('');
}

// ── Dialect definitions ──────────────────────────────────────────────────────

type Dialect = { id: string; label: string; sample: string };

const DIALECTS: Dialect[] = [
  {
    id: 'tsql',
    label: 'T-SQL',
    sample: `SELECT TOP 10
  e.EmployeeID,
  e.FirstName + ' ' + e.LastName AS FullName,
  d.DepartmentName,
  s.Salary
FROM Employees e
INNER JOIN Departments d ON e.DepartmentID = d.DepartmentID
LEFT JOIN Salaries s ON e.EmployeeID = s.EmployeeID
WHERE e.HireDate >= '2020-01-01' AND s.Salary > 50000
ORDER BY s.Salary DESC`,
  },
  {
    id: 'postgresql',
    label: 'PostgreSQL',
    sample: `SELECT e.employee_id,
  e.first_name || ' ' || e.last_name AS full_name,
  d.department_name,
  s.salary,
  RANK() OVER (PARTITION BY d.department_id ORDER BY s.salary DESC) AS salary_rank
FROM employees e
JOIN departments d USING (department_id)
LEFT JOIN salaries s USING (employee_id)
WHERE e.hire_date >= '2020-01-01'::date AND s.salary > 50000
ORDER BY salary_rank
LIMIT 10`,
  },
  {
    id: 'mysql',
    label: 'MySQL',
    sample: `SELECT e.employee_id,
  CONCAT(e.first_name, ' ', e.last_name) AS full_name,
  d.department_name,
  s.salary
FROM employees e
INNER JOIN departments d ON e.department_id = d.department_id
LEFT JOIN salaries s ON e.employee_id = s.employee_id
WHERE e.hire_date >= '2020-01-01' AND s.salary > 50000
ORDER BY s.salary DESC
LIMIT 10`,
  },
  {
    id: 'mariadb',
    label: 'MariaDB',
    sample: `SELECT e.employee_id,
  CONCAT(e.first_name, ' ', e.last_name) AS full_name,
  d.department_name,
  s.salary
FROM employees e
INNER JOIN departments d ON e.department_id = d.department_id
LEFT JOIN salaries s ON e.employee_id = s.employee_id
WHERE e.hire_date >= '2020-01-01' AND s.salary > 50000
ORDER BY s.salary DESC
LIMIT 10`,
  },
  {
    id: 'sqlite',
    label: 'SQLite',
    sample: `SELECT e.employee_id,
  e.first_name || ' ' || e.last_name AS full_name,
  d.department_name,
  s.salary
FROM employees e
JOIN departments d ON e.department_id = d.department_id
LEFT JOIN salaries s ON e.employee_id = s.employee_id
WHERE e.hire_date >= '2020-01-01' AND s.salary > 50000
ORDER BY s.salary DESC
LIMIT 10`,
  },
  {
    id: 'plsql',
    label: 'PL/SQL',
    sample: `SELECT e.employee_id,
  e.first_name || ' ' || e.last_name AS full_name,
  d.department_name,
  s.salary
FROM employees e
INNER JOIN departments d ON e.department_id = d.department_id
LEFT JOIN salaries s ON e.employee_id = s.employee_id
WHERE e.hire_date >= DATE '2020-01-01' AND s.salary > 50000
ORDER BY s.salary DESC
FETCH FIRST 10 ROWS ONLY`,
  },
  {
    id: 'bigquery',
    label: 'BigQuery',
    sample: 'SELECT\n  e.employee_id,\n  CONCAT(e.first_name, \' \', e.last_name) AS full_name,\n  d.department_name,\n  s.salary,\n  RANK() OVER (PARTITION BY d.department_id ORDER BY s.salary DESC) AS salary_rank\nFROM `project.dataset.employees` e\nJOIN `project.dataset.departments` d USING (department_id)\nLEFT JOIN `project.dataset.salaries` s USING (employee_id)\nWHERE e.hire_date >= \'2020-01-01\'\nORDER BY salary_rank\nLIMIT 10',
  },
  {
    id: 'redshift',
    label: 'Redshift',
    sample: `SELECT e.employee_id,
  e.first_name || ' ' || e.last_name AS full_name,
  d.department_name,
  s.salary,
  RANK() OVER (PARTITION BY d.department_id ORDER BY s.salary DESC) AS salary_rank
FROM employees e
JOIN departments d USING (department_id)
LEFT JOIN salaries s USING (employee_id)
WHERE e.hire_date >= '2020-01-01'
ORDER BY salary_rank
LIMIT 10`,
  },
  {
    id: 'snowflake',
    label: 'Snowflake',
    sample: `SELECT e.employee_id,
  e.first_name || ' ' || e.last_name AS full_name,
  d.department_name,
  s.salary,
  RANK() OVER (PARTITION BY d.department_id ORDER BY s.salary DESC) AS salary_rank
FROM employees e
JOIN departments d USING (department_id)
LEFT JOIN salaries s USING (employee_id)
WHERE e.hire_date >= '2020-01-01'::date
ORDER BY salary_rank
LIMIT 10`,
  },
  {
    id: 'spark',
    label: 'Spark SQL',
    sample: `SELECT e.employee_id,
  CONCAT(e.first_name, ' ', e.last_name) AS full_name,
  d.department_name,
  s.salary,
  RANK() OVER (PARTITION BY d.department_id ORDER BY s.salary DESC) AS salary_rank
FROM employees e
JOIN departments d ON e.department_id = d.department_id
LEFT JOIN salaries s ON e.employee_id = s.employee_id
WHERE e.hire_date >= '2020-01-01'
ORDER BY salary_rank
LIMIT 10`,
  },
  {
    id: 'sql',
    label: 'Standard SQL',
    sample: `SELECT e.employee_id,
  e.first_name || ' ' || e.last_name AS full_name,
  d.department_name,
  s.salary
FROM employees AS e
INNER JOIN departments AS d ON e.department_id = d.department_id
LEFT JOIN salaries AS s ON e.employee_id = s.employee_id
WHERE e.hire_date >= '2020-01-01' AND s.salary > 50000
ORDER BY s.salary DESC`,
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function SqlFormatter({ initialData }: { initialData?: string | null }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [sqlMode, setSqlMode] = useState<'format' | 'minify'>('format');
  const [dialect, setDialect] = useState<string>('tsql');

  useEffect(() => { if (initialData) setInput(initialData); }, [initialData]);

  const updateOutput = useCallback(() => {
    if (!input.trim()) { setOutput(''); return; }
    if (sqlMode === 'minify') {
      setOutput(input.replace(/\s+/g, ' ').trim());
      return;
    }
    try {
      setOutput(prettyPrintSql(input, { language: dialect as Parameters<typeof prettyPrintSql>[1]['language'], tabWidth: 2 }));
    } catch {
      setOutput(`-- Error formatting SQL --\n${input}`);
    }
  }, [input, sqlMode, dialect]);

  useEffect(() => { updateOutput(); }, [updateOutput]);

  const highlightedOutput = useMemo(() => highlightSql(output), [output]);

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const loadSample = () => {
    const found = DIALECTS.find(d => d.id === dialect);
    if (found) setInput(found.sample);
  };

  const leftPanel = (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[400px] h-full">
      {/* Header row 1: label + mode toggle */}
      <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <Code2 size={14} className="text-slate-400" /> SQL Input
        </span>
        <div className="flex bg-slate-200 p-0.5 rounded-lg gap-0.5">
          <button
            onClick={() => setSqlMode('format')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all ${
              sqlMode === 'format' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Maximize2 size={11} /> Format
          </button>
          <button
            onClick={() => setSqlMode('minify')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all ${
              sqlMode === 'minify' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Minimize2 size={11} /> Minify
          </button>
        </div>
      </div>

      {/* Header row 2: dialect picker + sample button */}
      <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
        <select
          value={dialect}
          onChange={(e: { target: HTMLSelectElement }) => setDialect(e.target.value)}
          className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
        >
          {DIALECTS.map(d => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
        <button
          onClick={loadSample}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-slate-100 hover:bg-blue-50 text-slate-500 hover:text-blue-600 border border-slate-200 hover:border-blue-300 transition-all whitespace-nowrap"
        >
          <FileCode2 size={11} /> Load Sample
        </button>
      </div>

      <textarea
        className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed"
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="Paste raw SQL here..."
      />
    </section>
  );

  const rightPanel = (
    <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden min-h-[500px]">
      <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
        <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
          <Layers size={14} /> {sqlMode === 'minify' ? 'Minified SQL' : 'Formatted SQL'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'COPIED' : 'COPY RESULT'}
        </button>
      </div>
      <div className="flex-1 p-6 overflow-auto">
        {output
          ? <pre
              className="font-mono text-[13px] text-slate-200 whitespace-pre-wrap leading-relaxed selection:bg-blue-500 selection:text-white"
              dangerouslySetInnerHTML={{ __html: highlightedOutput }}
            />
          : <pre className="font-mono text-[13px] text-slate-600 whitespace-pre-wrap leading-relaxed">{'// Output will appear here...'}</pre>
        }
      </div>
    </section>
  );

  return <ResizableSplit left={leftPanel} right={rightPanel} storageKey="split:sql-formatter" />;
}
