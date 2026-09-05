import { useEffect, useState } from "react";

function readViewportWidth() {
  if (typeof window === "undefined") return 0;
  return Math.round(window.visualViewport?.width ?? window.innerWidth);
}

/** Tracks the visible viewport width (updates when Android resizes the window). */
export function useViewportWidth() {
  const [width, setWidth] = useState(() => readViewportWidth());

  useEffect(() => {
    const update = () => setWidth(readViewportWidth());
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return width;
}

/** True on ultra-narrow displays (e.g. Motorola Razr cover ~264px). */
export function useCompactLayout() {
  const width = useViewportWidth();
  return width > 0 && width < 360;
}
