"use client";

import { Check } from "lucide-react";

import { ACCENT_COLORS } from "../logic";

/** Picker simple de color de acento (~8 predefinidos). */
export function AccentPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ACCENT_COLORS.map((color) => {
        const selected = color.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            aria-label={`Color ${color}`}
            aria-pressed={selected}
            onClick={() => onChange(color)}
            className="flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-[#0a0a0a] transition"
            style={{
              background: color,
              boxShadow: selected ? `0 0 0 2px ${color}` : "none",
              // @ts-expect-error CSS custom property for ring color
              "--tw-ring-color": selected ? color : "transparent",
            }}
          >
            {selected && <Check className="h-4 w-4 text-white drop-shadow" />}
          </button>
        );
      })}
    </div>
  );
}
