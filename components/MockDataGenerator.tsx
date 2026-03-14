import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus, Trash2, Download, Copy, Check, Play,
  FileJson, FileText, Database, LayoutTemplate, Save,
  Upload, UploadCloud, ChevronRight, ChevronDown,
  AlertTriangle, Settings2, Layers,
} from 'lucide-react';
import { MockField, FieldType, OutputFormat } from '../types';
import { FIELD_TYPES, generateData } from '../utils/mockDataGenerator';
import ResizableSplit from './ResizableSplit';

// ---- Syntax Highlighting ----

type Token = { type: 'key' | 'string' | 'number' | 'bool' | 'null' | 'punct' | 'plain' | 'keyword' | 'header'; text: string };

const TOKEN_COLORS: Record<Token['type'], string> = {
  key:     'text-cyan-300',
  string:  'text-emerald-300',
  number:  'text-yellow-300',
  bool:    'text-purple-400',
  null:    'text-red-400',
  punct:   'text-slate-400',
  plain:   'text-blue-100/90',
  keyword: 'text-blue-400',
  header:  'text-cyan-300',
};

const SQL_KW_RE = /^(INSERT|INTO|VALUES|SELECT|FROM|WHERE|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|INDEX|NULL|NOT|AND|OR|IN|IS|AS|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|HAVING|LIMIT|DISTINCT|UNION|ALL|CASE|WHEN|THEN|ELSE|END)$/i;

function tokenizeJson(text: string): Token[] {
  // Priority: "key": pair, "string" value, true/false, null, number, punct, whitespace/other
  const re = /"(?:[^"\\]|\\.)*"\s*:|"(?:[^"\\]|\\.)*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],]|:|[\s]+|./g;
  const tokens: Token[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[0];
    if (t.startsWith('"') && t.trimEnd().endsWith(':')) {
      tokens.push({ type: 'key', text: t });
    } else if (t.startsWith('"')) {
      tokens.push({ type: 'string', text: t });
    } else if (t === 'true' || t === 'false') {
      tokens.push({ type: 'bool', text: t });
    } else if (t === 'null') {
      tokens.push({ type: 'null', text: t });
    } else if (/^-?\d/.test(t)) {
      tokens.push({ type: 'number', text: t });
    } else if (/^[{}\[\],:]$/.test(t)) {
      tokens.push({ type: 'punct', text: t });
    } else {
      tokens.push({ type: 'plain', text: t });
    }
  }
  return tokens;
}

function tokenizeCsv(text: string): Token[] {
  const lines = text.split('\n');
  const tokens: Token[] = [];
  lines.forEach((line, lineIdx) => {
    if (lineIdx === 0) {
      // Header row
      const parts = line.split(',');
      parts.forEach((part, i) => {
        tokens.push({ type: 'header', text: part });
        if (i < parts.length - 1) tokens.push({ type: 'punct', text: ',' });
      });
    } else {
      const re = /"(?:[^""]|"")*"|[^,\n]+|,/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const t = m[0];
        if (t === ',') tokens.push({ type: 'punct', text: t });
        else if (t.startsWith('"')) tokens.push({ type: 'string', text: t });
        else if (/^-?\d+(?:\.\d+)?$/.test(t.trim())) tokens.push({ type: 'number', text: t });
        else tokens.push({ type: 'plain', text: t });
      }
    }
    if (lineIdx < lines.length - 1) tokens.push({ type: 'plain', text: '\n' });
  });
  return tokens;
}

function tokenizeSql(text: string): Token[] {
  const re = /'(?:[^'']|'')*'|-?\d+(?:\.\d+)?|\b[A-Za-z_]\w*\b|[(),;]|[\s]+|./g;
  const tokens: Token[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[0];
    if (t.startsWith("'")) {
      tokens.push({ type: 'string', text: t });
    } else if (/^-?\d/.test(t)) {
      tokens.push({ type: 'number', text: t });
    } else if (SQL_KW_RE.test(t)) {
      tokens.push({ type: 'keyword', text: t.toUpperCase() });
    } else if (/^[(),;]$/.test(t)) {
      tokens.push({ type: 'punct', text: t });
    } else {
      tokens.push({ type: 'plain', text: t });
    }
  }
  return tokens;
}

function tokenize(text: string, fmt: OutputFormat): Token[] {
  if (!text) return [];
  if (fmt === 'JSON') return tokenizeJson(text);
  if (fmt === 'CSV') return tokenizeCsv(text);
  return tokenizeSql(text);
}

const HighlightedOutput: React.FC<{ output: string; format: OutputFormat }> = ({ output, format }) => {
  const tokens = useMemo(() => tokenize(output, format), [output, format]);
  if (!output) return null;
  return (
    <pre className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap selection:bg-blue-500 selection:text-white p-6 min-h-full">
      {tokens.map((tok, i) => (
        <span key={i} className={TOKEN_COLORS[tok.type]}>{tok.text}</span>
      ))}
    </pre>
  );
};

// ---- JSON Import Tree ----

type JsonNode = {
  id: string;
  key: string;
  originalType: string;
  mappedType: FieldType;
  children?: JsonNode[];
  isLoop?: boolean;
  loopCount?: number;
  depth: number;
};

const categories = Array.from(new Set(FIELD_TYPES.map(ft => ft.category)));

const inferType = (key: string, val: any): FieldType => {
  if (typeof val === 'number') return 'Number';
  if (typeof val === 'boolean') return 'Boolean';
  const k = key.toLowerCase();
  if (k.includes('id')) return 'UUID';
  if (k.includes('email')) return 'Email';
  if (k.includes('first') && k.includes('name')) return 'FirstName';
  if (k.includes('last') && k.includes('name')) return 'LastName';
  if (k.includes('name')) return 'FullName';
  if (k.includes('phone')) return 'Phone';
  if (k.includes('city')) return 'City';
  if (k.includes('country')) return 'Country';
  if (k.includes('date') || k.includes('time') || k.includes('created')) return 'Date';
  if (k.includes('price')) return 'Price';
  if (k.includes('color')) return 'Color';
  if (typeof val === 'string' && val.length > 50) return 'Paragraph';
  return 'Word';
};

const parseJsonToTree = (data: any, key = 'root', depth = 0, visited: Set<any> = new Set()): JsonNode => {
  const id = Math.random().toString(36).substring(2, 9);
  if (data === null) return { id, key, originalType: 'null', mappedType: 'Word', depth };
  if (typeof data !== 'object') return { id, key, originalType: typeof data, mappedType: inferType(key, data), depth };
  if (visited.has(data)) return { id, key, originalType: Array.isArray(data) ? 'array' : 'object', mappedType: 'Word', depth, isLoop: true };
  const newVisited = new Set(visited);
  newVisited.add(data);
  if (Array.isArray(data)) {
    const children = data.length > 0 ? [parseJsonToTree(data[0], '[0]', depth + 1, newVisited)] : [];
    return { id, key, originalType: 'array', mappedType: 'Word', children, depth };
  }
  const children = Object.keys(data).map(k => parseJsonToTree(data[k], k, depth + 1, newVisited));
  return { id, key, originalType: 'object', mappedType: 'Word', children, depth };
};

const flattenTree = (nodes: JsonNode[], prefix = ''): MockField[] => {
  let fields: MockField[] = [];
  nodes.forEach(node => {
    if (node.isLoop) return;
    const currentPath = prefix ? `${prefix}.${node.key}` : node.key;
    if (node.originalType === 'object' && node.children) {
      fields = [...fields, ...flattenTree(node.children, currentPath)];
    } else if (node.originalType === 'array' && node.children && node.children.length > 0) {
      const child = node.children[0];
      const loopCount = node.loopCount ?? 1;
      if (child.originalType === 'object' && child.children) {
        // Array of objects: expand N times; unflattenObject merges [0],[1],... into a real array
        for (let i = 0; i < loopCount; i++) {
          fields = [...fields, ...flattenTree(child.children, `${currentPath}[${i}]`)];
        }
      } else {
        // Array of scalars: keep key name, generate an actual array via arrayCount
        fields.push({ id: child.id, name: currentPath, type: child.mappedType, options: { arrayCount: loopCount } });
      }
    } else if (node.originalType !== 'object' && node.originalType !== 'array') {
      fields.push({ id: node.id, name: currentPath, type: node.mappedType });
    }
  });
  return fields;
};

const getFlatFieldsFromTree = (root: JsonNode): MockField[] => {
  if (root.originalType === 'array' && root.children && root.children.length > 0) {
    const firstItem = root.children[0];
    if (firstItem.originalType === 'object' && firstItem.children) return flattenTree(firstItem.children, '');
  } else if (root.originalType === 'object' && root.children) {
    return flattenTree(root.children, '');
  }
  return [];
};

const TreeNodeRow: React.FC<{
  node: JsonNode;
  onUpdateType: (id: string, type: FieldType) => void;
  onUpdateLoop: (id: string, count: number) => void;
  isRoot?: boolean;
}> = ({ node, onUpdateType, onUpdateLoop, isRoot = false }) => {
  const [expanded, setExpanded] = useState(true);
  const isComplex = node.originalType === 'object' || node.originalType === 'array';
  if (isRoot && node.key === 'root') {
    return (
      <div className="flex flex-col">
        {node.children?.map(child => (
          <TreeNodeRow key={child.id} node={child} onUpdateType={onUpdateType} onUpdateLoop={onUpdateLoop} />
        ))}
      </div>
    );
  }
  const isNullType = node.originalType === 'null';
  return (
    <div className="flex flex-col">
      <div className="flex items-center py-2 border-b border-slate-100 hover:bg-slate-50">
        <div className="flex-1 flex items-center" style={{ paddingLeft: `${Math.max(0, node.depth - 1) * 1.5}rem` }}>
          {isComplex ? (
            <button onClick={() => setExpanded(!expanded)} className="p-1 mr-1 text-slate-400 hover:text-slate-600">
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : <div className="w-6" />}
          <span className="font-medium text-slate-700 text-sm">{node.key}</span>
          {node.isLoop && (
            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-700">
              <AlertTriangle size={10} /> Loop
            </span>
          )}
          {isNullType ? (
            <span className="ml-3 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-600">
              Empty
            </span>
          ) : (
            <span className="ml-3 text-[10px] text-slate-400 font-mono">{node.originalType}</span>
          )}
        </div>

        {/* Mapped Type */}
        <div className="w-44 px-4">
          {!isComplex && !node.isLoop && (
            <select
              value={node.mappedType}
              onChange={e => onUpdateType(node.id, e.target.value as FieldType)}
              className={`w-full rounded-lg px-2 py-1.5 text-xs font-black focus:ring-2 outline-none cursor-pointer ${
                isNullType
                  ? 'bg-red-50 border-2 border-red-400 text-red-700 focus:ring-red-400'
                  : 'bg-slate-50 border border-slate-200 focus:ring-blue-500'
              }`}
            >
              {categories.map(category => (
                <optgroup key={category} label={category}>
                  {FIELD_TYPES.filter(ft => ft.category === category).map(ft => (
                    <option key={ft.value} value={ft.value}>{ft.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>

        {/* Loop */}
        <div className="w-24 px-4">
          {node.originalType === 'array' && !node.isLoop ? (
            <input
              type="number" min={1} max={50}
              value={node.loopCount ?? 1}
              onChange={e => onUpdateLoop(node.id, Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
              title="Number of array items to generate"
            />
          ) : (
            <span className="text-[10px] text-slate-300 px-1">—</span>
          )}
        </div>
      </div>
      {expanded && node.children && (
        <div className="flex flex-col">
          {node.children.map(child => (
            <TreeNodeRow key={child.id} node={child} onUpdateType={onUpdateType} onUpdateLoop={onUpdateLoop} />
          ))}
        </div>
      )}
    </div>
  );
};

// ---- Presets ----

const PRESETS = {
  ecommerce: [
    { name: 'product_id', type: 'UUID' as FieldType },
    { name: 'sku', type: 'SKU' as FieldType },
    { name: 'product_name', type: 'ProductName' as FieldType },
    { name: 'description', type: 'ProductDescription' as FieldType, options: { nullPercentage: 10 } },
    { name: 'category', type: 'Department' as FieldType },
    { name: 'material', type: 'ProductMaterial' as FieldType, options: { nullPercentage: 20 } },
    { name: 'price', type: 'Price' as FieldType },
    { name: 'currency', type: 'CurrencyCode' as FieldType },
    { name: 'in_stock', type: 'Boolean' as FieldType },
    { name: 'stock_quantity', type: 'Number' as FieldType, options: { min: 0, max: 1000 } },
    { name: 'color', type: 'Color' as FieldType, options: { nullPercentage: 15 } },
    { name: 'manufacturer', type: 'Company' as FieldType },
    { name: 'rating', type: 'Number' as FieldType, options: { min: 1, max: 5, nullPercentage: 30 } },
    { name: 'created_at', type: 'Date' as FieldType },
  ],
  users: [
    { name: 'id', type: 'UUID' as FieldType },
    { name: 'first_name', type: 'FirstName' as FieldType },
    { name: 'last_name', type: 'LastName' as FieldType },
    { name: 'email', type: 'Email' as FieldType },
    { name: 'phone', type: 'Phone' as FieldType, options: { nullPercentage: 15 } },
  ],
  customizable: [
    { name: 'age', type: 'Number' as FieldType, options: { min: 18, max: 65, nullPercentage: 5 } },
    { name: 'birth_date', type: 'Date' as FieldType, options: { from: '1980-01-01', to: '2000-12-31', nullPercentage: 10 } },
    { name: 'favorite_fruit', type: 'CustomList' as FieldType, options: { customValues: 'Apple, Banana, Cherry, Mango', nullPercentage: 20 } },
    { name: 'random_score', type: 'Number' as FieldType, options: { min: 0, max: 100 } },
  ],
};

const DEFAULT_FIELDS: MockField[] = PRESETS.ecommerce.map((f, i) => ({ ...f, id: String(i + 1) }));
const newId = () => Math.random().toString(36).substring(2, 9);

// ---- Main Component ----

export default function MockDataGenerator() {
  const [fields, setFields] = useState<MockField[]>(() => {
    try {
      const saved = localStorage.getItem('mockgen:savedPresets');
      if (saved) {
        const parsed = JSON.parse(saved);
        const keys = Object.keys(parsed);
        if (keys.length > 0) {
          const lastActive = localStorage.getItem('mockgen:lastPreset');
          const keyToLoad = lastActive && parsed[lastActive] ? lastActive : keys[keys.length - 1];
          return parsed[keyToLoad].map((f: MockField) => ({ ...f, id: newId() }));
        }
      }
    } catch { /* ignore */ }
    return DEFAULT_FIELDS;
  });

  const [rows, setRows] = useState(100);
  const [format, setFormat] = useState<OutputFormat>('JSON');
  const [tableName, setTableName] = useState('users');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'generator' | 'import'>('generator');
  const [importedTree, setImportedTree] = useState<JsonNode | null>(null);

  // Import JSON tab always outputs JSON
  const effectiveFormat: OutputFormat = activeTab === 'import' ? 'JSON' : format;

  const [savedPresets, setSavedPresets] = useState<Record<string, MockField[]>>(() => {
    try {
      const saved = localStorage.getItem('mockgen:savedPresets');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const savePreset = () => {
    const name = prompt('Enter a name for this preset:');
    if (!name) return;
    const newPresets = { ...savedPresets, [name]: fields };
    setSavedPresets(newPresets);
    localStorage.setItem('mockgen:savedPresets', JSON.stringify(newPresets));
    localStorage.setItem('mockgen:lastPreset', name);
  };

  const loadSavedPreset = (key: string) => {
    if (!savedPresets[key]) return;
    setFields(savedPresets[key].map(f => ({ ...f, id: newId() })));
    localStorage.setItem('mockgen:lastPreset', key);
  };

  const loadBuiltinPreset = (key: keyof typeof PRESETS) => {
    setFields(PRESETS[key].map(f => ({ ...f, id: newId() })));
    localStorage.removeItem('mockgen:lastPreset');
  };

  const exportSchema = () => {
    const blob = new Blob([JSON.stringify(fields, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'schema.json';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const importSchema = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported) && imported.every((f: any) => f.id && f.name && f.type)) {
          setFields(imported.map((f: MockField) => ({ ...f, id: newId() })));
        } else { alert('Invalid schema file format.'); }
      } catch { alert('Failed to parse schema file.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      try {
        setImportedTree(parseJsonToTree(JSON.parse(event.target?.result as string)));
      } catch { alert('Failed to parse JSON file.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleUpdateTreeNode = (id: string, newType: FieldType) => {
    if (!importedTree) return;
    const updateNode = (nodes: JsonNode[]): JsonNode[] =>
      nodes.map(node => {
        if (node.id === id) return { ...node, mappedType: newType };
        if (node.children) return { ...node, children: updateNode(node.children) };
        return node;
      });
    if (importedTree.id === id) setImportedTree({ ...importedTree, mappedType: newType });
    else if (importedTree.children) setImportedTree({ ...importedTree, children: updateNode(importedTree.children) });
  };

  const handleUpdateTreeNodeLoop = (id: string, count: number) => {
    if (!importedTree) return;
    const updateNode = (nodes: JsonNode[]): JsonNode[] =>
      nodes.map(node => {
        if (node.id === id) return { ...node, loopCount: count };
        if (node.children) return { ...node, children: updateNode(node.children) };
        return node;
      });
    if (importedTree.id === id) setImportedTree({ ...importedTree, loopCount: count });
    else if (importedTree.children) setImportedTree({ ...importedTree, children: updateNode(importedTree.children) });
  };

  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const fieldInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const addField = () => {
    const id = newId();
    setFields(prev => [...prev, { id, name: `field_${prev.length + 1}`, type: 'Word' }]);
    setJustAddedId(id);
  };

  useEffect(() => {
    if (!justAddedId) return;
    const input = fieldInputRefs.current[justAddedId];
    if (input) {
      input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      input.focus();
      input.select();
      setJustAddedId(null);
    }
  }, [justAddedId, fields]);
  const removeField = (id: string) => setFields(prev => prev.filter(f => f.id !== id));
  const updateField = (id: string, updates: Partial<MockField>) =>
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const dataFields = activeTab === 'import' && importedTree ? getFlatFieldsFromTree(importedTree) : fields;
      setOutput(generateData(dataFields, rows, effectiveFormat, tableName));
      setIsGenerating(false);
    }, 50);
  };

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!output) return;
    const ext = effectiveFormat === 'JSON' ? 'json' : effectiveFormat === 'CSV' ? 'csv' : 'sql';
    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mock_data.${ext}`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // ---- Settings panel ----

  const settingsPanel = (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-4">
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
        <Settings2 size={14} /> Settings
      </span>

      <div className="flex gap-3 items-start">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Rows</label>
          <input
            type="number" min={1} max={50000} value={rows}
            onChange={e => setRows(Math.min(50000, Math.max(1, parseInt(e.target.value) || 1)))}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none w-24"
          />
          <span className="text-[10px] text-slate-400">Max 50k</span>
        </div>

        <div className="flex flex-col gap-1 flex-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Format</label>
          {activeTab === 'generator' ? (
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-0.5">
              {(['JSON', 'CSV', 'SQL'] as OutputFormat[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-black rounded-lg uppercase transition-all ${
                    format === f ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {f === 'JSON' && <FileJson size={12} />}
                  {f === 'CSV' && <FileText size={12} />}
                  {f === 'SQL' && <Database size={12} />}
                  {f}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                <div className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-black rounded-lg uppercase bg-white shadow-sm text-blue-600">
                  <FileJson size={12} /> JSON
                </div>
              </div>
              <span className="text-[10px] text-slate-400">API JSON always outputs JSON</span>
            </>
          )}
        </div>
      </div>

      {effectiveFormat === 'SQL' && (
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Table Name</label>
          <input
            type="text" value={tableName}
            onChange={e => setTableName(e.target.value)}
            placeholder="e.g. users"
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <span className="text-[10px] text-slate-400">Used in INSERT INTO statements</span>
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={isGenerating || (activeTab === 'generator' ? fields.length === 0 : !importedTree)}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 px-4 rounded-2xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] uppercase tracking-widest"
      >
        {isGenerating
          ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          : <Play size={14} className="fill-current" />
        }
        Generate Data
      </button>
    </section>
  );

  // ---- Left panel ----

  const leftPanel = (
    <div className="flex flex-col gap-4 max-h-[80vh] overflow-y-auto pr-1">
      {/* Tab switcher */}
      <div className="flex bg-white border border-slate-200 p-1 rounded-xl shadow-sm w-fit gap-0.5">
        {(['generator', 'import'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); if (tab === 'import') setRows(1); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === tab ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'generator' ? <Settings2 size={12} /> : <FileJson size={12} />}
            {tab === 'generator' ? 'Data Generator' : 'API JSON'}
          </button>
        ))}
      </div>

      {activeTab === 'generator' ? (
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Settings2 size={14} /> Schema Definition
              <span className="bg-blue-600 text-white px-2 py-0.5 rounded shadow-sm">{fields.length} FIELDS</span>
            </span>
            <div className="flex items-center gap-2">
              <button onClick={addField} title="Add field"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors uppercase tracking-widest">
                <Plus size={12} /> Add Field
              </button>
              <button onClick={savePreset} title="Save preset" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                <Save size={14} />
              </button>
              <button onClick={exportSchema} title="Export schema" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                <Download size={14} />
              </button>
              <label title="Import schema" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer">
                <Upload size={14} />
                <input type="file" accept=".json" className="hidden" onChange={importSchema} />
              </label>
              <div className="border-l border-slate-200 pl-2 flex items-center gap-1.5">
                <LayoutTemplate size={14} className="text-slate-400" />
                <select
                  onChange={e => {
                    const val = e.target.value;
                    if (!val) return;
                    if (val.startsWith('local:')) loadSavedPreset(val.replace('local:', ''));
                    else loadBuiltinPreset(val as keyof typeof PRESETS);
                    e.target.value = '';
                  }}
                  className="bg-transparent text-[10px] font-black text-slate-500 focus:outline-none cursor-pointer hover:text-blue-600 transition-colors"
                >
                  <option value="">Load Preset…</option>
                  <optgroup label="Built-in">
                    <option value="ecommerce">Product</option>
                    <option value="users">Users</option>
                    <option value="customizable">All Options Demo</option>
                  </optgroup>
                  {Object.keys(savedPresets).length > 0 && (
                    <optgroup label="Saved">
                      {Object.keys(savedPresets).map(key => (
                        <option key={key} value={`local:${key}`}>{key}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="grid grid-cols-12 gap-2 mb-3 px-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">
              <div className="col-span-2">Name</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-3">Options</div>
              <div className="col-span-3">Factor</div>
              <div className="col-span-1">Null %</div>
              <div className="col-span-1 text-center">Del</div>
            </div>

            <div className="space-y-2 overflow-y-auto pr-1">
              {fields.map(field => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-center group">
                  <div className="col-span-2">
                    <input
                      type="text" value={field.name} placeholder="field_name"
                      ref={el => { fieldInputRefs.current[field.id] = el; }}
                      onChange={e => updateField(field.id, { name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <select
                      value={field.type}
                      onChange={e => updateField(field.id, { type: e.target.value as FieldType })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-black focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                    >
                      {categories.map(cat => (
                        <optgroup key={cat} label={cat}>
                          {FIELD_TYPES.filter(ft => ft.category === cat).map(ft => (
                            <option key={ft.value} value={ft.value}>{ft.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3 flex items-center gap-1">
                    {field.type === 'Number' && (
                      <>
                        <input type="number" placeholder="Min" value={field.options?.min ?? ''}
                          onChange={e => updateField(field.id, { options: { ...field.options, min: e.target.value ? Number(e.target.value) : undefined } })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none" />
                        <input type="number" placeholder="Max" value={field.options?.max ?? ''}
                          onChange={e => updateField(field.id, { options: { ...field.options, max: e.target.value ? Number(e.target.value) : undefined } })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none" />
                      </>
                    )}
                    {field.type === 'Date' && (
                      <>
                        <input type="date" title="From Date" value={field.options?.from ?? ''}
                          onChange={e => updateField(field.id, { options: { ...field.options, from: e.target.value } })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none" />
                        <input type="date" title="To Date" value={field.options?.to ?? ''}
                          onChange={e => updateField(field.id, { options: { ...field.options, to: e.target.value } })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none" />
                      </>
                    )}
                    {field.type === 'CustomList' && (
                      <input type="text" placeholder="Apple, Banana, Cherry" title="Comma-separated values"
                        value={field.options?.customValues ?? ''}
                        onChange={e => updateField(field.id, { options: { ...field.options, customValues: e.target.value } })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none" />
                    )}
                    {field.type !== 'Number' && field.type !== 'Date' && field.type !== 'CustomList' && (
                      <span className="text-[10px] text-slate-300 italic px-1">—</span>
                    )}
                  </div>
                  <div className="col-span-3">
                    {(field.type === 'CustomList' || field.type === 'Number') ? (
                      <input type="text" placeholder="Apple=30, Orange=50" title="Weighted distribution"
                        value={field.options?.factor ?? ''}
                        onChange={e => updateField(field.id, { options: { ...field.options, factor: e.target.value } })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none" />
                    ) : (
                      <span className="text-[10px] text-slate-300 italic px-1">N/A</span>
                    )}
                  </div>
                  <div className="col-span-1">
                    <div className="relative">
                      <input type="number" min={0} max={100} placeholder="0" title="Percentage of null values"
                        value={field.options?.nullPercentage ?? ''}
                        onChange={e => updateField(field.id, { options: { ...field.options, nullPercentage: e.target.value ? Number(e.target.value) : undefined } })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 pr-5 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none" />
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-400">%</span>
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button onClick={() => removeField(field.id)}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                      title="Remove field">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </section>
      ) : (
        !importedTree ? (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center flex flex-col items-center gap-5">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center">
              <UploadCloud size={28} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-700 mb-1">Upload JSON Data</p>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                Upload a sample JSON file. We'll parse the structure into a tree and let you map data types.
              </p>
            </div>
            <label className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors cursor-pointer shadow-lg shadow-blue-500/20">
              <UploadCloud size={14} /> Select JSON File
              <input type="file" accept=".json" className="hidden" onChange={handleJsonUpload} />
            </label>
          </section>
        ) : (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <FileJson size={14} /> Imported JSON Structure
              </span>
              <button onClick={() => setImportedTree(null)}
                className="text-[10px] font-black text-slate-400 hover:text-slate-600 transition-colors">
                Clear
              </button>
            </div>
            <div className="flex items-center px-6 py-3 bg-slate-50 border-b border-slate-200">
              <div className="flex-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">Field / Structure</div>
              <div className="w-44 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Mapped Type</div>
              <div className="w-24 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Loop</div>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-2">
              <TreeNodeRow node={importedTree} onUpdateType={handleUpdateTreeNode} onUpdateLoop={handleUpdateTreeNodeLoop} isRoot />
            </div>
          </section>
        )
      )}

      {settingsPanel}
    </div>
  );

  // ---- Right panel — dark output with syntax highlighting, 80vh height ----

  const rightPanel = (
    <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col min-h-[80vh]">
      <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between shrink-0">
        <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
          <Layers size={14} /> Generated Output
          {output && (
            <span className="ml-1 font-mono text-[10px] font-normal normal-case tracking-normal text-slate-500">
              ({effectiveFormat})
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={handleDownload} disabled={!output}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Download file">
            <Download size={12} /> Download
          </button>
          <button onClick={handleCopy} disabled={!output}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'COPIED' : 'COPY RESULT'}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto relative">
        {output
          ? <HighlightedOutput output={output} format={effectiveFormat} />
          : (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                // Click Generate to see output
              </p>
            </div>
          )
        }
      </div>
    </section>
  );

  return <ResizableSplit left={leftPanel} right={rightPanel} defaultLeftPercent={55} storageKey="split:mock-data" />;
}
