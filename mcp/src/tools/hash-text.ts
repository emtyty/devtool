import { z } from "zod";
import { createHash, createHmac } from "node:crypto";
import type { Tool, ToolResult } from "../registry.js";

const ALGORITHMS = ["md5", "sha1", "sha256", "sha384", "sha512"] as const;

export const tool: Tool = {
  name: "hash_text",
  description:
    "Compute cryptographic hashes (MD5, SHA-1, SHA-256, SHA-384, SHA-512) for any text input. Optionally compute HMAC with a secret key. Call this tool whenever the user asks to hash, checksum, or fingerprint text. Claude cannot compute hashes natively — this tool provides exact, verified results.",
  schema: z.object({
    input: z.string().describe("The text to hash"),
    algorithm: z
      .enum(ALGORITHMS)
      .optional()
      .describe("Hash algorithm. If omitted, returns ALL algorithms."),
    hmacKey: z
      .string()
      .optional()
      .describe("Optional HMAC secret key. If provided, computes HMAC instead of plain hash."),
    encoding: z
      .enum(["hex", "base64"])
      .optional()
      .default("hex")
      .describe("Output encoding: hex (default) or base64"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ input, algorithm, hmacKey, encoding = "hex" }): Promise<ToolResult> => {
    const text = input as string;
    if (!text && text !== "") {
      return { success: false, error: "Input is required" };
    }

    const algos = algorithm ? [algorithm as string] : [...ALGORITHMS];
    const enc = (encoding as string) || "hex";

    const hashes: Record<string, string> = {};
    for (const algo of algos) {
      if (hmacKey) {
        hashes[algo] = createHmac(algo, hmacKey as string)
          .update(text)
          .digest(enc as "hex" | "base64");
      } else {
        hashes[algo] = createHash(algo)
          .update(text)
          .digest(enc as "hex" | "base64");
      }
    }

    const inputPreview = text.length > 80 ? text.slice(0, 80) + "…" : text;
    const mode = hmacKey ? "HMAC" : "Hash";
    const summary = algorithm
      ? `${mode} ${algorithm.toUpperCase()} (${enc}): ${hashes[algorithm as string]}`
      : `${mode} results (${enc}) for "${inputPreview}":\n` +
        algos.map((a) => `  ${a.toUpperCase()}: ${hashes[a]}`).join("\n");

    return {
      success: true,
      data: {
        hashes,
        encoding: enc,
        mode: mode.toLowerCase(),
        inputLength: text.length,
      },
      summary,
    };
  },
};
