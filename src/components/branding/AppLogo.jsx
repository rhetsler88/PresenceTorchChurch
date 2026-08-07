import React from "react";

export default function AppLogo({ className = "w-16 h-16", alt = "Presence Torch Church" }) {
  return (
    <img
      src="/logo.png"
      alt={alt}
      className={`object-contain ${className}`}
      draggable={false}
    />
  );
}
