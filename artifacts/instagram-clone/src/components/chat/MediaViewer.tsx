import { useEffect } from "react";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  url: string;
  type: string;
  onClose: () => void;
}

export function MediaViewer({ url, type, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex gap-2">
        <a href={url} download target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full">
            <Download className="w-5 h-5" />
          </Button>
        </a>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>
      <div onClick={e => e.stopPropagation()} className="max-w-[90vw] max-h-[90vh] flex items-center justify-center">
        {type === "video" || type?.startsWith("video/") ? (
          <video src={url} controls autoPlay className="max-h-[90vh] max-w-full rounded-lg" />
        ) : type === "voice" || type?.startsWith("audio/") ? (
          <div className="bg-card rounded-2xl p-8 shadow-xl">
            <audio src={url} controls autoPlay className="w-72" />
          </div>
        ) : (
          <img src={url} alt="media" className="max-h-[90vh] max-w-full rounded-lg object-contain" />
        )}
      </div>
    </div>
  );
}
