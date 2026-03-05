import React, { useRef } from 'react';
import { getTag, formatExposure } from '../utils/metadataUtils';
import { getGPSData } from '../utils/exifParser';
import MetadataCard, { MetadataItem } from './MetadataCard';

interface MetadataSidebarProps {
  file: File;
  metadata: Record<string, any>;
  onReupload: () => void;
}

const MetadataSidebar: React.FC<MetadataSidebarProps> = ({ file, metadata, onReupload }) => {
  const gps = getGPSData(metadata);

  const tag = (key: string) => getTag(metadata, key);

  return (
    <div className="xl:col-span-4 space-y-6">
      <div className="no-print pb-6 border-b border-slate-200 space-y-3">
        <button
          onClick={onReupload}
          className="w-full bg-blue-50 hover:bg-blue-100 text-blue-600 py-3 rounded-2xl font-bold text-[10px] transition-all uppercase tracking-widest"
        >
          <i className="fa-solid fa-rotate mr-2"></i> Re-upload File
        </button>
      </div>

      <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset Identification</h3>
          <i className="fa-solid fa-circle-check text-blue-500 text-sm"></i>
        </div>
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold">Filename</span>
            <span className="text-sm font-bold text-slate-800 truncate">{file.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Filesize</span>
              <span className="text-sm font-bold text-slate-800">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Format</span>
              <span className="text-sm font-bold text-slate-800 truncate uppercase">{file.type.split('/')[1] || 'BIN'}</span>
            </div>
          </div>
        </div>
      </div>

      <MetadataCard title="Hardware Profile" icon="fa-camera">
        <MetadataItem label="Manufacturer" value={tag('Make')} />
        <MetadataItem label="Model" value={tag('Model')} />
        <MetadataItem label="Lens" value={tag('LensModel') || tag('Lens')} />
        <MetadataItem label="Software" value={tag('Software')} />
      </MetadataCard>

      <MetadataCard title="Optical Telemetry" icon="fa-eye">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Exposure', value: formatExposure(tag('ExposureTime')) },
            { label: 'Aperture', value: tag('FNumber') ? `f/${tag('FNumber')}` : '--' },
            { label: 'ISO', value: String(tag('ISO') ?? '--') },
            { label: 'Focal', value: tag('FocalLength') ? `${tag('FocalLength')}mm` : '--' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 hover:border-blue-300 transition-colors">
              <span className="block text-[9px] uppercase font-black text-slate-400 mb-1">{label}</span>
              <span className="text-lg mono font-bold text-slate-800">{value}</span>
            </div>
          ))}
        </div>
      </MetadataCard>

      {gps && (
        <div className="bg-blue-50 border border-blue-200 p-6 rounded-3xl animate-in zoom-in duration-500 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/30">
              <i className="fa-solid fa-location-crosshairs"></i>
            </div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Geolocation Verified</h3>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-[10px] mono text-slate-600">
              <span>LAT: {gps.lat.toFixed(6)}</span>
              <span>LON: {gps.lon.toFixed(6)}</span>
            </div>
            <a
              href={gps.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black rounded-xl transition-all shadow-lg shadow-blue-600/20 uppercase tracking-[0.2em]"
            >
              <i className="fa-solid fa-map-location-dot"></i> Deploy Intel Map
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default MetadataSidebar;
