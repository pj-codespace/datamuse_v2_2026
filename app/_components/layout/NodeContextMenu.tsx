"use client";

import { useEffect, useRef } from "react";
import type { NetworkNode } from "@/app/_lib/data/types";

interface NodeContextMenuProps {
  node: NetworkNode | null;
  x: number;
  y: number;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function NodeContextMenu({
  node,
  x,
  y,
  onView,
  onEdit,
  onDelete,
  onClose,
}: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!node) return;

    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", handlePointerDown, true); // true = capture
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true); // true = capture
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [node, onClose]);

  if (!node) return null;

  return (
    <div
      ref={menuRef}
      // Fixed, not absolute: x/y come straight from the triggering mouse
      // event's clientX/clientY (viewport-relative), so fixed positioning
      // maps onto them directly regardless of where this component sits
      // in the tree.
      style={{ position: "fixed", left: x, top: y }}
      className="z-50 w-40 overflow-hidden rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg"
    >
      <div className="truncate border-b border-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
        {node.name}
      </div>
      <MenuItem label="View" onClick={onView} />
      <MenuItem label="Edit" onClick={onEdit} />
      <MenuItem label="Delete" onClick={onDelete} destructive />
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  destructive,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left hover:bg-gray-50 ${
        destructive ? "text-red-600" : "text-gray-700"
      }`}
    >
      {label}
    </button>
  );
}
