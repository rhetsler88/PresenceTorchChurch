import { useEffect, useState } from "react";
import {
  getEffectiveViewportWidth,
  getViewportSnapshot,
} from "@/lib/viewportSync";

/** Tracks the visible viewport width (visualViewport when available). */
export function useViewportWidth() {
  const [width, setWidth] = useState(() => getEffectiveViewportWidth());

  useEffect(() => {
    const update = (event) => {
      const next = event?.detail?.width;
      setWidth(typeof next === "number" && next > 0 ? next : getEffectiveViewportWidth());
    };
    update();
    window.addEventListener("appviewportchange", update);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("appviewportchange", update);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  return width;
}

/** True on ultra-narrow displays (e.g. Motorola Razr cover ~264px). */
export function useCompactLayout() {
  const width = useViewportWidth();
  const isCover = useCoverDisplay();
  return isCover || (width > 0 && width < 360);
}

/** True when layout viewport exceeds visible width (cover / fold mismatch). */
export function useCoverDisplay() {
  const [isCover, setIsCover] = useState(
    () => getViewportSnapshot().isCoverDisplay
  );

  useEffect(() => {
    const update = (event) => {
      setIsCover(
        typeof event?.detail?.isCoverDisplay === "boolean"
          ? event.detail.isCoverDisplay
          : getViewportSnapshot().isCoverDisplay
      );
    };
    update();
    window.addEventListener("appviewportchange", update);
    return () => window.removeEventListener("appviewportchange", update);
  }, []);

  return isCover;
}
