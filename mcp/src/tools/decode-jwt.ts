import { z } from "zod";
import {
  decodeJwt, formatTimestamp, getTokenStatus,
  KNOWN_CLAIMS, TIME_CLAIMS,
} from "../../../utils/jwtDecoder.js";
import type { Tool, ToolResult } from "../registry.js";

export const tool: Tool = {
  name: "decode_jwt",
  description:
    "Decode a JWT token into its header, payload, and signature components. Call this tool whenever the user pastes a string starting with 'eyJ' or asks to decode/inspect/check a JWT or Bearer token. Returns parsed header (algorithm, type), payload with annotated claims (iss, sub, exp with human-readable timestamps), expiration status (VALID/EXPIRED/NO_EXPIRY), and signature. More accurate than manual base64 decoding because it handles URL-safe base64, padding, and time claim annotations automatically.",
  schema: z.object({
    token: z
      .string()
      .describe("The JWT token string (with or without 'Bearer ' prefix)"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ token }): Promise<ToolResult> => {
    let raw = (token as string).trim();
    if (raw.toLowerCase().startsWith("bearer ")) {
      raw = raw.slice(7).trim();
    }

    try {
      const { header, payload, signature } = decodeJwt(raw);

      // Expiration check
      const status = getTokenStatus(payload);
      const isExpired = status ? status.label === "EXPIRED" : null;
      const expiresAt = typeof payload.exp === "number"
        ? formatTimestamp(payload.exp)
        : null;

      // Annotate known claims
      const claims: Record<string, { value: unknown; description?: string; humanTime?: string }> = {};
      for (const [key, value] of Object.entries(payload)) {
        const entry: { value: unknown; description?: string; humanTime?: string } = { value };
        if (KNOWN_CLAIMS[key]) entry.description = KNOWN_CLAIMS[key];
        if (TIME_CLAIMS.has(key) && typeof value === "number") {
          entry.humanTime = formatTimestamp(value);
        }
        claims[key] = entry;
      }

      const lines = [
        `Algorithm: ${header.alg || "unknown"}`,
        `Type: ${header.typ || "JWT"}`,
        `Status: ${status ? status.label : "NO_EXPIRY"}`,
      ];
      if (expiresAt) lines.push(`Expires: ${expiresAt}`);
      if (payload.sub) lines.push(`Subject: ${payload.sub}`);
      if (payload.iss) lines.push(`Issuer: ${payload.iss}`);

      return {
        success: true,
        data: {
          header,
          payload,
          signature,
          status: status ? status.label : "NO_EXPIRY",
          isExpired,
          expiresAt,
          claims,
        },
        summary: lines.join("\n"),
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to decode JWT: ${err instanceof Error ? err.message : "invalid base64 or JSON"}`,
      };
    }
  },
};
