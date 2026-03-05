
import React from 'react';

interface MetadataCardProps {
  title: string;
  icon: string;
  children: React.ReactNode;
  className?: string;
}

const MetadataCard: React.FC<MetadataCardProps> = ({ title, icon, children, className = "" }) => {
  return (
    <div className={`bg-white border border-slate-200 rounded-3xl p-6 transition-all hover:bg-slate-50 shadow-sm ${className}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 text-xs">
          <i className={`fa-solid ${icon}`}></i>
        </div>
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{title}</h3>
      </div>
      <div className="space-y-3.5">
        {children}
      </div>
    </div>
  );
};

export const MetadataItem: React.FC<{ label: string; value: string | number | undefined }> = ({ label, value }) => {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex justify-between items-start border-b border-slate-100 pb-2.5 last:border-0 last:pb-0">
      <span className="text-slate-500 text-[10px] font-bold uppercase tracking-tight">{label}</span>
      <span className="text-slate-800 text-[11px] font-bold text-right max-w-[200px] leading-tight truncate-multiline">
        {value}
      </span>
    </div>
  );
};

export default MetadataCard;
