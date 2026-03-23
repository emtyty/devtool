import { z } from "zod";
import type { Tool, ToolResult } from "../registry.js";

type Format = "base64" | "url" | "html" | "unicode";
type Direction = "encode" | "decode";

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_DECODE_MAP: Record<string, string> = {};
for (const [ch, ent] of Object.entries(HTML_ENTITIES)) {
  HTML_DECODE_MAP[ent] = ch;
}

function htmlEncode(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch] ?? ch);
}

function htmlDecode(str: string): string {
  return str
    .replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&#x[\da-fA-F]+;|&#\d+;/g, (ent) => {
      if (HTML_DECODE_MAP[ent]) return HTML_DECODE_MAP[ent];
      if (ent.startsWith("&#x")) return String.fromCodePoint(parseInt(ent.slice(3, -1), 16));
      if (ent.startsWith("&#")) return String.fromCodePoint(parseInt(ent.slice(2, -1), 10));
      return ent;
    });
}

function unicodeEncode(str: string): string {
  return Array.from(str)
    .map((ch) => {
      const code = ch.codePointAt(0)!;
      if (code < 128) return ch;
      return code > 0xffff
        ? `\\u{${code.toString(16)}}`
        : `\\u${code.toString(16).padStart(4, "0")}`;
    })
    .join("");
}

function unicodeDecode(str: string): string {
  return str
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function process(input: string, format: Format, direction: Direction): string {
  switch (format) {
    case "base64":
      return direction === "encode"
        ? Buffer.from(input, "utf-8").toString("base64")
        : Buffer.from(input, "base64").toString("utf-8");
    case "url":
      return direction === "encode"
        ? encodeURIComponent(input)
        : decodeURIComponent(input);
    case "html":
      return direction === "encode" ? htmlEncode(input) : htmlDecode(input);
    case "unicode":
      return direction === "encode" ? unicodeEncode(input) : unicodeDecode(input);
  }
}

export const tool: Tool = {
  name: "encode_decode",
  description:
    "Encode or decode text between formats: Base64, URL-encoding, HTML entities, and Unicode escapes. Call this tool whenever the user needs to encode/decode strings. Claude often makes errors with Base64 and URL encoding — this tool provides exact results.",
  schema: z.object({
    input: z.string().describe("The text to encode or decode"),
    format: z
      .enum(["base64", "url", "html", "unicode"])
      .describe("Encoding format: base64, url, html (entities), or unicode (escape sequences)"),
    direction: z
      .enum(["encode", "decode"])
      .describe("Direction: encode or decode"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ input, format, direction }): Promise<ToolResult> => {
    const text = input as string;
    const fmt = format as Format;
    const dir = direction as Direction;

    if (!text && text !== "") {
      return { success: false, error: "Input is required" };
    }

    try {
      const result = process(text, fmt, dir);
      const inputPreview = text.length > 60 ? text.slice(0, 60) + "…" : text;
      const resultPreview = result.length > 100 ? result.slice(0, 100) + "…" : result;

      return {
        success: true,
        data: {
          result,
          format: fmt,
          direction: dir,
          inputLength: text.length,
          outputLength: result.length,
        },
        summary: `${fmt} ${dir}: "${inputPreview}" → "${resultPreview}"`,
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to ${dir} ${fmt}: ${err instanceof Error ? err.message : "invalid input"}`,
      };
    }
  },
};
