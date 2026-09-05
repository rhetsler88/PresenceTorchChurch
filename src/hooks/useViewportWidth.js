import { useEffect, useState } from "react";
import { getFlipScreenDetail } from "@/lib/flipScreen";

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
    window.addEventListener("flipscreenchange", update);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("flipscreenchange", update);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return width;
}

/** True on Motorola Razr cover / other flip outer displays. */
export function useCoverScreen() {
  const [isCover, setIsCover] = useState(() => getFlipScreenDetail().isCover);

  useEffect(() => {
    const update = (event) => {
      setIsCover(
        typeof event?.detail?.isCover === "boolean"
          ? event.detail.isCover
          : getFlipScreenDetail().isCover
      );
    };
    update();
    window.addEventListener("flipscreenchange", update);
    return () => window.removeEventListener("flipscreenchange", update);
  }, []);

  return isCover;
}

/** True on ultra-narrow displays (cover screen or width < 360px). */
export function useCompactLayout() {
  const width = useViewportWidth();
  const isCover = useCoverScreen();
  return isCover || (width > 0 && width < 360);
}
