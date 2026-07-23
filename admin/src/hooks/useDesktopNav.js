import { useEffect, useState } from "react";

const DESKTOP_NAV_QUERY = "(min-width: 768px) and (hover: hover) and (pointer: fine)";

function getDesktopNav() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(DESKTOP_NAV_QUERY).matches;
}

export default function useDesktopNav() {
  const [desktopNav, setDesktopNav] = useState(getDesktopNav);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_NAV_QUERY);
    const update = () => setDesktopNav(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return desktopNav;
}
