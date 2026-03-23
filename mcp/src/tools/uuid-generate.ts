import { z } from "zod";
import { randomUUID, randomBytes } from "node:crypto";
import type { Tool, ToolResult } from "../registry.js";

function generateUUIDv4(): string {
  return randomUUID();
}

function generateUUIDv7(): string {
  // UUID v7: timestamp-based with random, RFC 9562
  const now = Date.now();
  const bytes = randomBytes(16);

  // Set timestamp (48 bits) in first 6 bytes
  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;

  // Set version (7) and variant (RFC 4122)
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function generateNanoid(size: number = 21): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";
  const bytes = randomBytes(size);
  let id = "";
  for (let i = 0; i < size; i++) {
    id += alphabet[bytes[i] & 63];
  }
  return id;
}

function generateULID(): string {
  // ULID: Crockford Base32, 10 chars timestamp + 16 chars random (80 bits)
  const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const now = Date.now();

  // Encode timestamp (48 bits → 10 Crockford chars)
  let ts = now;
  const timePart: string[] = [];
  for (let i = 0; i < 10; i++) {
    timePart.unshift(CROCKFORD[ts & 31]);
    ts = Math.floor(ts / 32);
  }

  // Encode random: 80 bits → 16 Crockford chars (5 bits each)
  // Use 10 random bytes (80 bits), extract 5 bits at a time
  const rndBytes = randomBytes(10);
  const randPart: string[] = [];

  // Convert 10 bytes into a bit stream and extract 16 × 5-bit values
  // Pack bytes into a BigInt for easy bit extraction
  let bits = 0n;
  for (let i = 0; i < 10; i++) {
    bits = (bits << 8n) | BigInt(rndBytes[i]);
  }
  // Extract 16 × 5-bit values from the 80-bit number (MSB first)
  for (let i = 15; i >= 0; i--) {
    randPart.push(CROCKFORD[Number((bits >> BigInt(i * 5)) & 31n)]);
  }

  return timePart.join("") + randPart.join("");
}

export const tool: Tool = {
  name: "uuid_generate",
  description:
    "Generate cryptographically random unique identifiers: UUID v4, UUID v7 (timestamp-ordered), NanoID (URL-safe), or ULID (sortable). Call this tool whenever the user needs random IDs, UUIDs, or unique identifiers. Claude cannot generate true random values — this tool uses Node.js crypto for real randomness.",
  schema: z.object({
    type: z
      .enum(["uuidv4", "uuidv7", "nanoid", "ulid"])
      .optional()
      .default("uuidv4")
      .describe("ID type: uuidv4 (default), uuidv7 (time-ordered), nanoid (URL-safe compact), ulid (sortable)"),
    count: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(1)
      .describe("Number of IDs to generate (1-100, default 1)"),
    nanoidSize: z
      .number()
      .int()
      .min(2)
      .max(128)
      .optional()
      .default(21)
      .describe("NanoID length (2-128, default 21). Only applies to nanoid type."),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ type = "uuidv4", count = 1, nanoidSize = 21 }): Promise<ToolResult> => {
    const idType = (type as string) || "uuidv4";
    const n = Math.min(Math.max((count as number) || 1, 1), 100);
    const nanoSize = Math.min(Math.max((nanoidSize as number) || 21, 2), 128);

    const generators: Record<string, () => string> = {
      uuidv4: generateUUIDv4,
      uuidv7: generateUUIDv7,
      nanoid: () => generateNanoid(nanoSize),
      ulid: generateULID,
    };

    const gen = generators[idType];
    if (!gen) {
      return { success: false, error: `Unknown type: ${idType}` };
    }

    const ids = Array.from({ length: n }, () => gen());

    return {
      success: true,
      data: {
        ids,
        type: idType,
        count: n,
      },
      summary:
        n === 1
          ? `${idType}: ${ids[0]}`
          : `Generated ${n} ${idType} IDs:\n${ids.map((id) => `  ${id}`).join("\n")}`,
    };
  },
};
