import { useState, useEffect, useCallback } from "react";

export interface CompareItem { id: number; title: string }

const KEY = "compare_ids";
const MAX = 4;

function read(): CompareItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

function write(items: CompareItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("compare-change"));
}

export function useCompare() {
  const [items, setItems] = useState<CompareItem[]>(read);

  useEffect(() => {
    function onchange() { setItems(read()); }
    window.addEventListener("compare-change", onchange);
    return () => window.removeEventListener("compare-change", onchange);
  }, []);

  const add = useCallback((item: CompareItem) => {
    const current = read();
    if (current.some((c) => c.id === item.id)) return;
    write([...current, item].slice(-MAX));
  }, []);

  const remove = useCallback((id: number) => {
    write(read().filter((c) => c.id !== id));
  }, []);

  const clear = useCallback(() => write([]), []);

  const ids = items.map((c) => c.id);

  return { items, ids, add, remove, clear };
}
