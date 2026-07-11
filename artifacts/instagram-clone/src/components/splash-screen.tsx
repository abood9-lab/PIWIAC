import { useEffect, useState } from "react";
import logoUrl from "@/assets/pixlr-logo.png";

const SPLASH_SESSION_KEY = "pixlr_splash_shown";
const SPLASH_DURATION_MS = 2200;

/**
 * Full-screen intro splash shown once per browser session when the app first loads.
 * Displays the Pixlr mark, the app name, and the "from PIWIAIC" attribution.
 */
export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadingOut(true), SPLASH_DURATION_MS);
    const doneTimer = setTimeout(() => onDone(), SPLASH_DURATION_MS + 400);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-orange-500 transition-opacity duration-500 ${
        fadingOut ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-700">
        <div className="h-24 w-24 rounded-3xl bg-white/15 backdrop-blur-sm shadow-2xl flex items-center justify-center ring-1 ring-white/30">
          <img src={logoUrl} alt="Pixlr" className="h-16 w-16 object-contain" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="font-serif italic text-4xl font-bold text-white tracking-tight">
            Pixlr
          </span>
          <span className="text-xs font-medium tracking-[0.2em] uppercase text-white/70">
            from PIWIAIC
          </span>
        </div>
      </div>
    </div>
  );
}

export function hasShownSplashThisSession() {
  try {
    return sessionStorage.getItem(SPLASH_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSplashShown() {
  try {
    sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}
