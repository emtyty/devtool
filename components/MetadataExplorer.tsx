
import React, { useState, useMemo } from 'react';

interface MetadataExplorerProps {
  data: Record<string, any>;
}

const MetadataExplorer: React.FC<MetadataExplorerProps> = ({ data }) => {
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState('All');

  const groups = useMemo(() => {
    const s = new Set<string>(['All']);
    Object.keys(data).forEach(k => {
      const parts = k.split(':');
      if (parts.length > 1) s.add(parts[0]);
    });
    return Array.from(s).sort();
  }, [data]);

  const filtered = useMemo(() => {
    return Object.entries(data)
      .filter(([key, value]) => {
        const matchesQuery = key.toLowerCase().includes(query.toLowerCase()) || 
                             String(value).toLowerCase().includes(query.toLowerCase());
        const matchesGroup = activeGroup === 'All' || key.startsWith(`${activeGroup}:`);
        return matchesQuery && matchesGroup;
      })
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [data, query, activeGroup]);

  const groupedFiltered = useMemo(() => {
    const grouped: Record<string, [string, any][]> = {};
    filtered.forEach(([key, value]) => {
      const group = key.includes(':') ? key.split(':')[0] : 'General';
      if (!grouped[group]) {
        grouped[group] = [];
      }
      grouped[group].push([key, value]);
    });
    return grouped;
  }, [filtered]);

  const exportJson = () => {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'metadata_export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden flex flex-col min-h-[500px] shadow-sm">
      <div className="p-8 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-3 text-slate-800">
            <span className="w-2 h-8 bg-blue-600 rounded-full"></span>
            Deep Binary Stream
          </h2>
          <p className="text-slate-500 text-xs mt-1 font-medium tracking-tight">Extracted {Object.keys(data).length} discrete forensic markers</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input 
              type="text" 
              placeholder="Search tags or values..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-white border border-slate-200 focus:border-blue-500 rounded-2xl pl-10 pr-4 py-2.5 text-xs w-[240px] transition-all focus:ring-4 focus:ring-blue-500/10 outline-none font-medium text-slate-800 placeholder:text-slate-400"
            />
          </div>
          <select 
            value={activeGroup} 
            onChange={(e) => setActiveGroup(e.target.value)}
            className="bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-xs text-slate-600 outline-none focus:border-blue-500 transition-colors font-medium cursor-pointer"
          >
            {groups.map(g => <option key={g} value={g}>{g === 'All' ? 'All Channels' : `${g} Channel`}</option>)}
          </select>
          <button
            onClick={exportJson}
            className="p-2.5 bg-white hover:bg-slate-50 rounded-xl transition-colors border border-slate-200 text-slate-600 shadow-sm"
            title="Export JSON to file"
            aria-label="Export JSON to file"
          >
            <i className="fa-solid fa-download"></i>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto max-h-[600px] relative custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-white shadow-sm">
            <tr className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
              <th className="px-8 py-5 border-b border-slate-200">Forensic Tag</th>
              <th className="px-8 py-5 border-b border-slate-200">Telemetry Value</th>
              <th className="px-8 py-5 border-b border-slate-200 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Object.keys(groupedFiltered).length > 0 ? (
              Object.entries(groupedFiltered).map(([groupName, items]) => (
                <React.Fragment key={groupName}>
                  <tr className="bg-blue-50/80">
                    <td colSpan={3} className="px-8 py-3 text-xs font-black text-blue-700 uppercase tracking-widest border-y border-blue-100">
                      {groupName}
                    </td>
                  </tr>
                  {items.map(([key, value]) => {
                    const tag = key.includes(':') ? key.split(':').slice(1).join(':') : key;
                    return (
                      <tr key={key} className="group hover:bg-slate-50 transition-colors">
                        <td className="px-8 py-4 align-top">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-800 mono">{tag}</span>
                          </div>
                        </td>
                        <td className="px-8 py-4 text-[11px] text-slate-600 mono break-all leading-relaxed max-w-lg">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </td>
                        <td className="px-8 py-4 text-right">
                          <button
                            onClick={() => copy(String(value))}
                            aria-label="Copy value"
                            className="text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all transform group-hover:scale-110"
                          >
                            <i className="fa-solid fa-copy text-xs"></i>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="px-8 py-32 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-4">
                    <i className="fa-solid fa-magnifying-glass-chart text-5xl opacity-20"></i>
                    <p className="text-sm font-bold opacity-50 uppercase tracking-[0.2em]">Zero results in binary stream</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MetadataExplorer;
