import React from "react";
import { Check } from "lucide-react";
import { CHANNEL_COLORS } from "@/lib/channelColors";

export default function ColorPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {CHANNEL_COLORS.map(color => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
            value === color
              ? "ring-2 ring-offset-2 ring-ring scale-110"
              : "hover:scale-110"
          }`}
          style={{ backgroundColor: color }}
        >
          {value === color && <Check className="w-4 h-4 text-white" />}
        </button>
      ))}
    </div>
  );
}