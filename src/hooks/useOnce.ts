import { useEffect, useRef } from "react";

export function useOnce(effect: () => void | (() => void)) {
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const cleanup = effect();
    return cleanup;
  }, []);
}
