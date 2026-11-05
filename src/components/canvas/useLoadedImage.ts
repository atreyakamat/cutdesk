"use client";

import { useEffect, useState } from "react";

const cache = new Map<string, HTMLImageElement>();

/** Decode a data URL once and share the element between renders. */
export function useLoadedImage(src: string): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{ src: string; image: HTMLImageElement } | null>(null);

  useEffect(() => {
    if (cache.has(src)) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      cache.set(src, img);
      if (!cancelled) setLoaded({ src, image: img });
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return cache.get(src) ?? (loaded?.src === src ? loaded.image : null);
}
