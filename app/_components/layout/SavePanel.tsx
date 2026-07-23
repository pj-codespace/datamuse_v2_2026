"use client";

export default function SavePanel() {
  return (
    <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-lg border border-gray-200 bg-white/90 p-1 shadow-md backdrop-blur">
      {/* Placeholders — no persistence layer exists yet, so these are no-ops for now. */}
      <button
        type="button"
        className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
      >
        Save
      </button>
      <button
        type="button"
        className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
      >
        Export
      </button>
    </div>
  );
}
