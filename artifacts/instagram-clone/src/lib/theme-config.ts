export type ThemeMode = "light" | "dark" | "system";
export type FontSize = "sm" | "md" | "lg";
export type BorderRadius = "sharp" | "soft" | "round";
export type Density = "compact" | "comfortable";

export interface ThemeConfig {
  accent: string;
  mode: ThemeMode;
  fontSize: FontSize;
  radius: BorderRadius;
  density: Density;
  uiHue: number | null;
}

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  accent: "#0095f6",
  mode: "system",
  fontSize: "md",
  radius: "soft",
  density: "comfortable",
  uiHue: null,
};

export const FONT_SIZE_VALUES: Record<FontSize, string> = {
  sm: "13px",
  md: "15px",
  lg: "17px",
};

export const RADIUS_VALUES: Record<BorderRadius, string> = {
  sharp: "0.25rem",
  soft: "0.75rem",
  round: "1.5rem",
};

export const THEME_EXTRAS_KEY = "pixlr-theme-extras";

export function applyFontSize(size: FontSize) {
  document.documentElement.style.setProperty("--ui-font-size", FONT_SIZE_VALUES[size]);
}

export function applyRadius(radius: BorderRadius) {
  document.documentElement.style.setProperty("--radius", RADIUS_VALUES[radius]);
}

export function applyDensity(density: Density) {
  document.documentElement.setAttribute("data-density", density);
}

export function applyThemeExtras(config: Pick<ThemeConfig, "fontSize" | "radius" | "density">) {
  applyFontSize(config.fontSize);
  applyRadius(config.radius);
  applyDensity(config.density);
}

export function encodeTheme(config: ThemeConfig): string {
  try {
    return btoa(JSON.stringify({
      a: config.accent,
      m: config.mode,
      f: config.fontSize,
      r: config.radius,
      d: config.density,
      h: config.uiHue,
    }));
  } catch {
    return "";
  }
}

export function decodeTheme(code: string): ThemeConfig | null {
  try {
    const raw = JSON.parse(atob(code));
    const valid =
      typeof raw.a === "string" && /^#[0-9a-f]{6}$/i.test(raw.a) &&
      ["light", "dark", "system"].includes(raw.m) &&
      ["sm", "md", "lg"].includes(raw.f) &&
      ["sharp", "soft", "round"].includes(raw.r) &&
      ["compact", "comfortable"].includes(raw.d) &&
      (raw.h === null || (typeof raw.h === "number" && raw.h >= 0 && raw.h <= 359));
    if (!valid) return null;
    return {
      accent: raw.a,
      mode: raw.m,
      fontSize: raw.f,
      radius: raw.r,
      density: raw.d,
      uiHue: raw.h ?? null,
    };
  } catch {
    return null;
  }
}

export function loadSavedExtras(): Pick<ThemeConfig, "fontSize" | "radius" | "density" | "uiHue"> {
  try {
    const saved = localStorage.getItem(THEME_EXTRAS_KEY);
    if (!saved) return { fontSize: "md", radius: "soft", density: "comfortable", uiHue: null };
    const p = JSON.parse(saved);
    return {
      fontSize: ["sm", "md", "lg"].includes(p.fontSize) ? p.fontSize : "md",
      radius: ["sharp", "soft", "round"].includes(p.radius) ? p.radius : "soft",
      density: ["compact", "comfortable"].includes(p.density) ? p.density : "comfortable",
      uiHue: (p.uiHue !== null && typeof p.uiHue === "number") ? p.uiHue : null,
    };
  } catch {
    return { fontSize: "md", radius: "soft", density: "comfortable", uiHue: null };
  }
}

export function saveExtras(extras: Pick<ThemeConfig, "fontSize" | "radius" | "density" | "uiHue">) {
  localStorage.setItem(THEME_EXTRAS_KEY, JSON.stringify(extras));
}
