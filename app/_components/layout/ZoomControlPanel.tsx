"use client";

interface ZoomControlPanelProps {
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

export default function ZoomControlPanel({
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onReset,
}: ZoomControlPanelProps) {
  return (
    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-gray-200 bg-white/90 p-1 shadow-md backdrop-blur">
      <button
        type="button"
        onClick={onZoomOut}
        aria-label="Zoom out"
        className="flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
      >
        −
      </button>
      <span className="w-14 text-center text-xs font-medium tabular-nums text-gray-700">
        {Math.round(zoomPercent)}%
      </span>
      <button
        type="button"
        onClick={onZoomIn}
        aria-label="Zoom in"
        className="flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
      >
        +
      </button>
      <div className="mx-1 h-5 w-px bg-gray-200" />
      <button
        type="button"
        onClick={onReset}
        className="rounded-md px-2 text-xs font-medium text-gray-600 hover:bg-gray-100"
      >
        Reset
      </button>
    </div>
  );
}
