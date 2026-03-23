import { z } from "zod";
import type { Tool, ToolResult } from "../registry.js";

export const tool: Tool = {
  name: "url_parse",
  description:
    "Parse a URL into its components (protocol, host, port, pathname, query parameters, fragment, auth) and optionally build/modify URLs. Handles encoded characters, IDN domains, and complex query strings. Call this tool whenever the user needs to parse, inspect, or manipulate URLs. Claude often misparses complex encoded URLs — this tool uses Node.js URL API for exact RFC-compliant results.",
  schema: z.object({
    url: z.string().describe("The URL to parse"),
    setParams: z
      .record(z.string())
      .optional()
      .describe("Optional: set/override query parameters (key-value pairs). Returns modified URL."),
    removeParams: z
      .array(z.string())
      .optional()
      .describe("Optional: remove these query parameters by name. Returns modified URL."),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ url, setParams, removeParams }): Promise<ToolResult> => {
    const raw = (url as string)?.trim();
    if (!raw) return { success: false, error: "URL is required" };

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      // Try with https:// prefix
      try {
        parsed = new URL("https://" + raw);
      } catch {
        return { success: false, error: `Invalid URL: "${raw}"` };
      }
    }

    // Extract query params as object
    const params: Record<string, string | string[]> = {};
    for (const [key, value] of parsed.searchParams.entries()) {
      const existing = params[key];
      if (existing !== undefined) {
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          params[key] = [existing, value];
        }
      } else {
        params[key] = value;
      }
    }

    // Apply modifications if requested
    let modifiedUrl: string | undefined;
    if (setParams || removeParams) {
      const modified = new URL(parsed.href);
      if (removeParams) {
        for (const key of removeParams as string[]) {
          modified.searchParams.delete(key);
        }
      }
      if (setParams) {
        for (const [key, value] of Object.entries(setParams as Record<string, string>)) {
          modified.searchParams.set(key, value);
        }
      }
      modifiedUrl = modified.href;
    }

    const components: Record<string, unknown> = {
      href: parsed.href,
      protocol: parsed.protocol.replace(/:$/, ""),
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? "443" : parsed.protocol === "http:" ? "80" : ""),
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
      origin: parsed.origin,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      queryParams: params,
      queryParamCount: parsed.searchParams.size,
    };

    if (modifiedUrl) {
      components.modifiedUrl = modifiedUrl;
    }

    const summaryLines = [
      `Protocol: ${components.protocol}`,
      `Host: ${parsed.hostname}${parsed.port ? ":" + parsed.port : ""}`,
      `Path: ${parsed.pathname}`,
    ];
    if (parsed.searchParams.size > 0) {
      summaryLines.push(`Query params (${parsed.searchParams.size}):`);
      for (const [k, v] of parsed.searchParams.entries()) {
        summaryLines.push(`  ${k} = ${v}`);
      }
    }
    if (parsed.hash) summaryLines.push(`Fragment: ${parsed.hash}`);
    if (modifiedUrl) summaryLines.push(`\nModified: ${modifiedUrl}`);

    return {
      success: true,
      data: components,
      summary: summaryLines.join("\n"),
    };
  },
};
