"use client";

import { useEffect, useRef, useState } from "react";

export interface Size {
  width: number;
  height: number;
}

/**
 * Tracks the rendered pixel size of a DOM element using ResizeObserver.
 *
 * Why this exists: an <svg> given a fixed width/height doesn't adapt to
 * its container. This hook gives us the container's real size so the SVG
 * (and D3's force simulation, which needs real pixel dimensions to center
 * and bound the layout) can stay correct across window resizes, sidebar
 * toggles, or any other layout change — without us hardcoding numbers.
 */
export function useContainerSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}
