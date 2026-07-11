export const DEFAULT_ACCENT_HEX = "#0095f6";
export const ACCENT_STORAGE_KEY = "pixlr-accent-color";

export const PRESET_COLORS = [
  { name: "Instagram Blue", hex: "#0095f6" },
  { name: "Discord Blurple", hex: "#5865f2" },
  { name: "Purple", hex: "#9333ea" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Red", hex: "#ef4444" },
  { name: "Orange", hex: "#f97316" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Green", hex: "#22c55e" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Indigo", hex: "#6366f1" },
  { name: "Rose", hex: "#f43f5e" },
];

export const UI_PALETTE_PRESETS = [
  { name: "Neutral", hue: null, swatch: "#6b7280" },
  { name: "Blurple", hue: 235, swatch: "#5865f2" },
  { name: "Midnight", hue: 220, swatch: "#3b5bdb" },
  { name: "Lavender", hue: 270, swatch: "#9333ea" },
  { name: "Rose", hue: 340, swatch: "#f43f5e" },
  { name: "Sunset", hue: 15, swatch: "#f97316" },
  { name: "Forest", hue: 140, swatch: "#22c55e" },
  { name: "Ocean", hue: 195, swatch: "#06b6d4" },
  { name: "Gold", hue: 42, swatch: "#f59e0b" },
  { name: "Crimson", hue: 355, swatch: "#ef4444" },
  { name: "Emerald", hue: 160, swatch: "#10b981" },
  { name: "Slate", hue: 215, swatch: "#64748b" },
];

export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return null;

  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToHex(h: number, s: number, l: number): string {
  const sl = s / 100;
  const ll = l / 100;
  const a = sl * Math.min(ll, 1 - ll);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function applyAccentColor(hex: string) {
  const root = document.documentElement;
  const hsl = hexToHsl(hex);
  if (!hsl) return;

  const { h, s, l } = hsl;
  const isDark = root.classList.contains("dark");
  const clampedL = isDark
    ? Math.min(Math.max(l, 50), 68)
    : Math.min(Math.max(l, 38), 58);

  const hslStr = `${h} ${s}% ${clampedL}%`;
  const fg = clampedL > 60 ? "0 0% 9%" : "0 0% 100%";

  root.style.setProperty("--primary", hslStr);
  root.style.setProperty("--primary-foreground", fg);
  root.style.setProperty("--ring", hslStr);
  root.style.setProperty("--sidebar-primary", hslStr);
  root.style.setProperty("--sidebar-primary-foreground", fg);
  root.style.setProperty("--sidebar-ring", hslStr);
}

export function removeAccentColor() {
  const root = document.documentElement;
  root.style.removeProperty("--primary");
  root.style.removeProperty("--primary-foreground");
  root.style.removeProperty("--ring");
  root.style.removeProperty("--sidebar-primary");
  root.style.removeProperty("--sidebar-primary-foreground");
  root.style.removeProperty("--sidebar-ring");
}

const UI_PALETTE_VARS = [
  "--background", "--foreground",
  "--card", "--card-foreground", "--card-border",
  "--sidebar", "--sidebar-foreground", "--sidebar-border",
  "--sidebar-accent", "--sidebar-accent-foreground",
  "--popover", "--popover-foreground", "--popover-border",
  "--secondary", "--secondary-foreground",
  "--muted", "--muted-foreground",
  "--accent", "--accent-foreground",
  "--border", "--input",
];

export function applyUiPalette(hue: number, isDark: boolean) {
  const root = document.documentElement;

  if (isDark) {
    const s = 15;
    root.style.setProperty("--background",            `${hue} ${s}% 7%`);
    root.style.setProperty("--foreground",            `${hue} 5% 96%`);
    root.style.setProperty("--card",                  `${hue} ${s - 3}% 10%`);
    root.style.setProperty("--card-foreground",       `${hue} 5% 96%`);
    root.style.setProperty("--card-border",           `${hue} 8% 21%`);
    root.style.setProperty("--sidebar",               `${hue} ${s}% 8%`);
    root.style.setProperty("--sidebar-foreground",    `${hue} 5% 96%`);
    root.style.setProperty("--sidebar-border",        `${hue} 8% 20%`);
    root.style.setProperty("--sidebar-accent",        `${hue} 10% 15%`);
    root.style.setProperty("--sidebar-accent-foreground", `${hue} 5% 96%`);
    root.style.setProperty("--popover",               `${hue} ${s - 3}% 10%`);
    root.style.setProperty("--popover-foreground",    `${hue} 5% 96%`);
    root.style.setProperty("--popover-border",        `${hue} 8% 21%`);
    root.style.setProperty("--secondary",             `${hue} 10% 14%`);
    root.style.setProperty("--secondary-foreground",  `${hue} 5% 96%`);
    root.style.setProperty("--muted",                 `${hue} 10% 13%`);
    root.style.setProperty("--muted-foreground",      `${hue} 8% 55%`);
    root.style.setProperty("--accent",                `${hue} 10% 14%`);
    root.style.setProperty("--accent-foreground",     `${hue} 5% 96%`);
    root.style.setProperty("--border",                `${hue} 8% 20%`);
    root.style.setProperty("--input",                 `${hue} 8% 22%`);
  } else {
    const s = 10;
    root.style.setProperty("--background",            `${hue} ${s}% 99%`);
    root.style.setProperty("--foreground",            `${hue} 10% 9%`);
    root.style.setProperty("--card",                  `${hue} ${s}% 100%`);
    root.style.setProperty("--card-foreground",       `${hue} 10% 9%`);
    root.style.setProperty("--card-border",           `${hue} 8% 87%`);
    root.style.setProperty("--sidebar",               `${hue} ${s}% 97%`);
    root.style.setProperty("--sidebar-foreground",    `${hue} 10% 9%`);
    root.style.setProperty("--sidebar-border",        `${hue} 8% 87%`);
    root.style.setProperty("--sidebar-accent",        `${hue} ${s}% 93%`);
    root.style.setProperty("--sidebar-accent-foreground", `${hue} 10% 9%`);
    root.style.setProperty("--popover",               `${hue} ${s}% 100%`);
    root.style.setProperty("--popover-foreground",    `${hue} 10% 9%`);
    root.style.setProperty("--popover-border",        `${hue} 8% 87%`);
    root.style.setProperty("--secondary",             `${hue} ${s}% 94%`);
    root.style.setProperty("--secondary-foreground",  `${hue} 10% 9%`);
    root.style.setProperty("--muted",                 `${hue} ${s}% 95%`);
    root.style.setProperty("--muted-foreground",      `${hue} 5% 45%`);
    root.style.setProperty("--accent",                `${hue} ${s}% 94%`);
    root.style.setProperty("--accent-foreground",     `${hue} 10% 9%`);
    root.style.setProperty("--border",                `${hue} 8% 87%`);
    root.style.setProperty("--input",                 `${hue} 8% 87%`);
  }
}

export function removeUiPalette() {
  UI_PALETTE_VARS.forEach((v) => document.documentElement.style.removeProperty(v));
}

export function getIsDark(): boolean {
  return document.documentElement.classList.contains("dark");
}
