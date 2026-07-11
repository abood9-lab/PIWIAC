import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

const EMOJIS = ["❤️", "👍", "😂", "🔥", "😮", "😢", "👎", "🎉"];

interface Props {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  align?: "left" | "right";
}

export function ReactionPicker({ onSelect, onClose, align = "right" }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={cn(
        "absolute z-50 bottom-full mb-2 bg-card border border-border shadow-xl rounded-full px-2 py-1.5 flex gap-1",
        align === "right" ? "right-0" : "left-0"
      )}
    >
      {EMOJIS.map(emoji => (
        <button
          key={emoji}
          onClick={() => { onSelect(emoji); onClose(); }}
          className="text-lg hover:scale-125 transition-transform active:scale-95 w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
