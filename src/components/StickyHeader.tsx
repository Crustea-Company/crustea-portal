"use client";

import { useEffect, useRef } from "react";

// Header aplikasi yang menempel di atas. Tingginya disimpan di variabel CSS
// --app-header-h, supaya bagian lain (mis. filter Tugas) bisa menempel tepat di bawahnya.
export default function StickyHeader({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      document.documentElement.style.setProperty("--app-header-h", `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <header ref={ref} className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      {children}
    </header>
  );
}
