import { useRef, useState } from 'react';
import { useStore } from '../state/store';

export function ImportDropzone() {
  const loadFile = useStore((s) => s.loadFile);
  const status = useStore((s) => s.status);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) void loadFile(file);
  }

  function browse() {
    inputRef.current?.click();
  }

  return (
    // The whole landing area is the drop target, so a file can be dropped
    // anywhere in the grey space - not just on the dashed box.
    <div
      className={`dropzone-area${dragging ? ' dropzone-area--active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        // Moving onto a child (the dashed box) fires dragleave on the area; only
        // clear when the cursor has actually left the area, to avoid flicker.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".kicad_pcb,.xml,.cvg,.tgz,.tar.gz,.zip"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div
        className={`dropzone${dragging ? ' dropzone--active' : ''}`}
        onClick={browse}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            browse();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <strong>Drop a PCB design file here, or click to browse...</strong>
        <span>KiCAD .kicad_pcb, IPC-2581 .xml, or ODB++ .zip/.tgz</span>
        {status === 'parsing' && <span className="muted">Parsing…</span>}
        <span className="muted small">Files stay in your browser - nothing is uploaded.</span>
      </div>
    </div>
  );
}
