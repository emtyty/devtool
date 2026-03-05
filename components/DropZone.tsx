import React, { useRef, useState } from 'react';

interface DropZoneProps {
  onFile: (file: File) => void;
  error: string | null;
}

const DropZone: React.FC<DropZoneProps> = ({ onFile, error }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`w-full max-w-md aspect-square rounded-[3rem] border-2 border-dashed flex flex-col items-center justify-center transition-all cursor-pointer group ${
          isDragging
            ? 'border-blue-500 bg-blue-50 scale-[1.02]'
            : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50 shadow-sm'
        }`}
      >
        <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mb-6 text-slate-400 group-hover:text-blue-500 group-hover:scale-110 group-hover:rotate-3 transition-all">
          <i className="fa-solid fa-cloud-arrow-up text-3xl"></i>
        </div>
        <h2 className="text-2xl font-bold mb-2 text-slate-800">Initialize Forensic Scan</h2>
        <p className="text-slate-500 text-sm max-w-sm text-center leading-relaxed">
          Drop any media or document to extract hidden binary metadata
        </p>
      </div>

      {error && (
        <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs flex items-center gap-3 shadow-sm">
          <i className="fa-solid fa-triangle-exclamation"></i>
          {error}
        </div>
      )}
    </div>
  );
};

export default DropZone;
