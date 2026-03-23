import { z } from "zod";
import type { Tool, ToolResult } from "../registry.js";

type Base = "bin" | "oct" | "dec" | "hex";

const BASE_MAP: Record<Base, number> = { bin: 2, oct: 8, dec: 10, hex: 16 };
const BASE_PREFIX: Record<Base, string> = { bin: "0b", oct: "0o", dec: "", hex: "0x" };

function parseInput(value: string): { num: bigint; detectedBase: Base } {
  const v = value.trim().toLowerCase();

  if (v.startsWith("0x")) return { num: BigInt(v), detectedBase: "hex" };
  if (v.startsWith("0b")) return { num: BigInt(v), detectedBase: "bin" };
  if (v.startsWith("0o")) return { num: BigInt(v), detectedBase: "oct" };

  // Try decimal
  if (/^-?\d+$/.test(v)) return { num: BigInt(v), detectedBase: "dec" };

  // Try hex without prefix (all hex chars)
  if (/^[0-9a-f]+$/i.test(v)) return { num: BigInt("0x" + v), detectedBase: "hex" };

  throw new Error(`Cannot parse "${value}" as a number. Use prefixes: 0x (hex), 0b (bin), 0o (oct), or plain decimal.`);
}

function formatNumber(num: bigint, base: Base): string {
  const radix = BASE_MAP[base];
  const isNeg = num < 0n;
  const abs = isNeg ? -num : num;
  const raw = abs.toString(radix);

  let formatted: string;
  switch (base) {
    case "bin":
      // Group in 8-bit chunks
      formatted = raw.padStart(Math.ceil(raw.length / 8) * 8, "0").replace(/(.{8})(?=.)/g, "$1 ");
      break;
    case "hex":
      formatted = raw.toUpperCase();
      break;
    case "dec":
      // Add thousands separators
      formatted = raw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      break;
    default:
      formatted = raw;
  }

  return (isNeg ? "-" : "") + BASE_PREFIX[base] + formatted;
}

export const tool: Tool = {
  name: "number_base_convert",
  description:
    "Convert numbers between decimal, hexadecimal, binary, and octal. Supports arbitrarily large integers (BigInt). Handles prefixed input (0x, 0b, 0o) and auto-detects base. Call this tool whenever the user needs base conversion, hex/bin/oct/dec conversion, or bitwise representation. Claude makes arithmetic errors with base conversions — this tool is exact.",
  schema: z.object({
    value: z
      .string()
      .describe("The number to convert. Supports prefixes: 0x (hex), 0b (bin), 0o (oct), or plain decimal. Also accepts unprefixed hex strings."),
    fromBase: z
      .enum(["bin", "oct", "dec", "hex"])
      .optional()
      .describe("Source base (auto-detected if omitted). Forces interpretation of value in this base."),
    toBase: z
      .enum(["bin", "oct", "dec", "hex"])
      .optional()
      .describe("Target base. If omitted, returns ALL bases."),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ value, fromBase, toBase }): Promise<ToolResult> => {
    const raw = value as string;
    if (!raw?.trim()) return { success: false, error: "Value is required" };

    let num: bigint;
    let detected: Base;

    try {
      if (fromBase) {
        // Force parse in specified base
        const clean = raw.trim().toLowerCase().replace(/^0[xbo]/, "");
        num = BigInt(
          fromBase === "hex" ? "0x" + clean :
          fromBase === "bin" ? "0b" + clean :
          fromBase === "oct" ? "0o" + clean :
          clean
        );
        detected = fromBase as Base;
      } else {
        ({ num, detectedBase: detected } = parseInput(raw));
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Invalid number" };
    }

    if (toBase) {
      const result = formatNumber(num, toBase as Base);
      return {
        success: true,
        data: {
          result,
          value: result,
          fromBase: detected,
          toBase,
          decimal: num.toString(),
        },
        summary: `${raw} (${detected}) → ${result} (${toBase})`,
      };
    }

    // Return all bases
    const bases = (["dec", "hex", "bin", "oct"] as Base[]);
    const conversions: Record<string, string> = {};
    for (const b of bases) {
      conversions[b] = formatNumber(num, b);
    }

    return {
      success: true,
      data: {
        conversions,
        detectedBase: detected,
        decimal: num.toString(),
        bitLength: num === 0n ? 1 : num.toString(2).replace("-", "").length,
      },
      summary:
        `${raw} (auto-detected: ${detected}):\n` +
        bases.map((b) => `  ${b.toUpperCase().padEnd(3)}: ${conversions[b]}`).join("\n"),
    };
  },
};
