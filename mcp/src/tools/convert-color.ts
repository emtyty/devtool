import { z } from "zod";
import {
  rgbToHsl, rgbToOklch,
  parseHex, parseRgb, parseHsl, parseOklch,
  round, relativeLuminance, contrastRatio, wcagGrade,
  type RGBA,
} from "../../../utils/colorMath.js";
import { NAMED_COLORS } from "../compat.js";
import type { Tool, ToolResult } from "../registry.js";

function parseNamed(s: string): RGBA | null {
  const rgb = NAMED_COLORS[s.toLowerCase()];
  if (!rgb) return null;
  return { r: rgb[0], g: rgb[1], b: rgb[2], a: 1 };
}

function parseColor(input: string): RGBA | null {
  const s = input.trim();
  return parseHex(s) ?? parseRgb(s) ?? parseHsl(s) ?? parseOklch(s) ?? parseNamed(s);
}

export const tool: Tool = {
  name: "convert_color",
  description:
    "Convert a color value between HEX, RGB, HSL, OKLCH formats and check WCAG accessibility contrast. Call this tool whenever the user provides a color in any format (#hex, rgb(), hsl(), oklch(), or CSS name like 'red') and wants conversions or contrast analysis. Returns all format equivalents plus WCAG AA/AAA contrast grades against white and black. More precise than manual conversion because it uses exact OKLCH color science and proper relative luminance calculations.",
  schema: z.object({
    color: z.string().describe("Color input: hex (#ff0000), rgb(255,0,0), hsl(0,100%,50%), oklch(0.6 0.2 30), or named color (red, blue, etc.)"),
    contrastAgainst: z.string().optional().describe("Optional second color to calculate contrast ratio against (default: checks against white and black)"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ color, contrastAgainst }): Promise<ToolResult> => {
    const rgba = parseColor(color as string);
    if (!rgba) {
      return { success: false, error: `Could not parse color: "${color}"` };
    }

    const { r, g, b, a } = rgba;
    const hsl = rgbToHsl(r, g, b);
    const oklch = rgbToOklch(r, g, b);
    const hex6 = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;

    const formats = {
      hex: hex6,
      rgb: `rgb(${r}, ${g}, ${b})`,
      rgba: `rgba(${r}, ${g}, ${b}, ${round(a, 2)})`,
      hsl: `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%)`,
      oklch: `oklch(${round(oklch.L, 4)} ${round(oklch.C, 4)} ${round(oklch.H, 2)})`,
    };

    const lum = relativeLuminance(r, g, b);
    const whiteLum = relativeLuminance(255, 255, 255);
    const blackLum = relativeLuminance(0, 0, 0);
    const whiteContrast = round(contrastRatio(lum, whiteLum), 2);
    const blackContrast = round(contrastRatio(lum, blackLum), 2);

    const contrast: Record<string, unknown> = {
      vsWhite: { ratio: whiteContrast, wcag: wcagGrade(whiteContrast) },
      vsBlack: { ratio: blackContrast, wcag: wcagGrade(blackContrast) },
    };

    if (contrastAgainst) {
      const other = parseColor(contrastAgainst as string);
      if (other) {
        const otherLum = relativeLuminance(other.r, other.g, other.b);
        const customContrast = round(contrastRatio(lum, otherLum), 2);
        contrast.vsCustom = { color: contrastAgainst, ratio: customContrast, wcag: wcagGrade(customContrast) };
      }
    }

    return {
      success: true,
      data: { ...formats, contrast },
      summary: [
        `Color: ${color}`,
        `HEX:   ${formats.hex}`,
        `RGB:   ${formats.rgb}`,
        `HSL:   ${formats.hsl}`,
        `OKLCH: ${formats.oklch}`,
        ``,
        `Contrast vs white: ${whiteContrast}:1 ${whiteContrast >= 4.5 ? "(AA pass)" : "(AA fail)"}`,
        `Contrast vs black: ${blackContrast}:1 ${blackContrast >= 4.5 ? "(AA pass)" : "(AA fail)"}`,
      ].join("\n"),
    };
  },
};
