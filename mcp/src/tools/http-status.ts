import { z } from "zod";
import type { Tool, ToolResult } from "../registry.js";

interface StatusInfo {
  code: number;
  phrase: string;
  description: string;
  category: string;
  spec: string;
}

const STATUS_CODES: Record<number, StatusInfo> = {
  // 1xx Informational
  100: { code: 100, phrase: "Continue", description: "Server received request headers, client should proceed to send body", category: "Informational", spec: "RFC 9110" },
  101: { code: 101, phrase: "Switching Protocols", description: "Server is switching protocols as requested (e.g., WebSocket upgrade)", category: "Informational", spec: "RFC 9110" },
  102: { code: 102, phrase: "Processing", description: "Server has received and is processing the request (WebDAV)", category: "Informational", spec: "RFC 2518" },
  103: { code: 103, phrase: "Early Hints", description: "Preload resources while server prepares a response", category: "Informational", spec: "RFC 8297" },
  // 2xx Success
  200: { code: 200, phrase: "OK", description: "Request succeeded", category: "Success", spec: "RFC 9110" },
  201: { code: 201, phrase: "Created", description: "Request fulfilled, new resource created", category: "Success", spec: "RFC 9110" },
  202: { code: 202, phrase: "Accepted", description: "Request accepted for processing, but not completed yet", category: "Success", spec: "RFC 9110" },
  203: { code: 203, phrase: "Non-Authoritative Information", description: "Returned metadata is from a local or third-party copy", category: "Success", spec: "RFC 9110" },
  204: { code: 204, phrase: "No Content", description: "Request succeeded but no content to return", category: "Success", spec: "RFC 9110" },
  205: { code: 205, phrase: "Reset Content", description: "Request succeeded, client should reset the document view", category: "Success", spec: "RFC 9110" },
  206: { code: 206, phrase: "Partial Content", description: "Server is delivering only part of the resource (range request)", category: "Success", spec: "RFC 9110" },
  207: { code: 207, phrase: "Multi-Status", description: "Multiple status codes for multiple independent operations (WebDAV)", category: "Success", spec: "RFC 4918" },
  208: { code: 208, phrase: "Already Reported", description: "DAV binding members already enumerated and not included again", category: "Success", spec: "RFC 5842" },
  226: { code: 226, phrase: "IM Used", description: "Server fulfilled GET with instance-manipulations applied", category: "Success", spec: "RFC 3229" },
  // 3xx Redirection
  300: { code: 300, phrase: "Multiple Choices", description: "Multiple options for the resource, client should choose", category: "Redirection", spec: "RFC 9110" },
  301: { code: 301, phrase: "Moved Permanently", description: "Resource has been permanently moved to a new URL", category: "Redirection", spec: "RFC 9110" },
  302: { code: 302, phrase: "Found", description: "Resource temporarily at different URL (historically 'Moved Temporarily')", category: "Redirection", spec: "RFC 9110" },
  303: { code: 303, phrase: "See Other", description: "Response to request can be found at another URL using GET", category: "Redirection", spec: "RFC 9110" },
  304: { code: 304, phrase: "Not Modified", description: "Resource has not been modified since last request (caching)", category: "Redirection", spec: "RFC 9110" },
  307: { code: 307, phrase: "Temporary Redirect", description: "Temporarily at different URL, must use same HTTP method", category: "Redirection", spec: "RFC 9110" },
  308: { code: 308, phrase: "Permanent Redirect", description: "Permanently at different URL, must use same HTTP method", category: "Redirection", spec: "RFC 9110" },
  // 4xx Client Error
  400: { code: 400, phrase: "Bad Request", description: "Server cannot process request due to client error (malformed syntax, invalid framing)", category: "Client Error", spec: "RFC 9110" },
  401: { code: 401, phrase: "Unauthorized", description: "Authentication is required and has failed or not been provided", category: "Client Error", spec: "RFC 9110" },
  402: { code: 402, phrase: "Payment Required", description: "Reserved for future use (payment processing)", category: "Client Error", spec: "RFC 9110" },
  403: { code: 403, phrase: "Forbidden", description: "Server understood request but refuses to authorize it", category: "Client Error", spec: "RFC 9110" },
  404: { code: 404, phrase: "Not Found", description: "Server cannot find the requested resource", category: "Client Error", spec: "RFC 9110" },
  405: { code: 405, phrase: "Method Not Allowed", description: "HTTP method is not allowed for the requested resource", category: "Client Error", spec: "RFC 9110" },
  406: { code: 406, phrase: "Not Acceptable", description: "No content matching Accept headers found", category: "Client Error", spec: "RFC 9110" },
  407: { code: 407, phrase: "Proxy Authentication Required", description: "Client must authenticate with the proxy", category: "Client Error", spec: "RFC 9110" },
  408: { code: 408, phrase: "Request Timeout", description: "Server timed out waiting for the client request", category: "Client Error", spec: "RFC 9110" },
  409: { code: 409, phrase: "Conflict", description: "Request conflicts with current state of the resource", category: "Client Error", spec: "RFC 9110" },
  410: { code: 410, phrase: "Gone", description: "Resource is permanently gone and will not be available again", category: "Client Error", spec: "RFC 9110" },
  411: { code: 411, phrase: "Length Required", description: "Server requires Content-Length header", category: "Client Error", spec: "RFC 9110" },
  412: { code: 412, phrase: "Precondition Failed", description: "One or more conditions in request headers evaluated to false", category: "Client Error", spec: "RFC 9110" },
  413: { code: 413, phrase: "Content Too Large", description: "Request body is larger than server is willing to process", category: "Client Error", spec: "RFC 9110" },
  414: { code: 414, phrase: "URI Too Long", description: "URI provided was too long for the server to process", category: "Client Error", spec: "RFC 9110" },
  415: { code: 415, phrase: "Unsupported Media Type", description: "Request entity has a media type the server does not support", category: "Client Error", spec: "RFC 9110" },
  416: { code: 416, phrase: "Range Not Satisfiable", description: "Client requested a range not available in the resource", category: "Client Error", spec: "RFC 9110" },
  417: { code: 417, phrase: "Expectation Failed", description: "Server cannot meet the requirements of the Expect header", category: "Client Error", spec: "RFC 9110" },
  418: { code: 418, phrase: "I'm a Teapot", description: "Server refuses to brew coffee because it is a teapot (April Fools' RFC)", category: "Client Error", spec: "RFC 2324" },
  421: { code: 421, phrase: "Misdirected Request", description: "Request directed at server unable to produce a response", category: "Client Error", spec: "RFC 9110" },
  422: { code: 422, phrase: "Unprocessable Content", description: "Request well-formed but unable to process (semantic errors)", category: "Client Error", spec: "RFC 9110" },
  423: { code: 423, phrase: "Locked", description: "Resource is locked (WebDAV)", category: "Client Error", spec: "RFC 4918" },
  424: { code: 424, phrase: "Failed Dependency", description: "Request failed due to failure of a previous request (WebDAV)", category: "Client Error", spec: "RFC 4918" },
  425: { code: 425, phrase: "Too Early", description: "Server unwilling to process request that might be replayed", category: "Client Error", spec: "RFC 8470" },
  426: { code: 426, phrase: "Upgrade Required", description: "Client should switch to a different protocol", category: "Client Error", spec: "RFC 9110" },
  428: { code: 428, phrase: "Precondition Required", description: "Origin server requires the request to be conditional", category: "Client Error", spec: "RFC 6585" },
  429: { code: 429, phrase: "Too Many Requests", description: "User has sent too many requests in a given time (rate limiting)", category: "Client Error", spec: "RFC 6585" },
  431: { code: 431, phrase: "Request Header Fields Too Large", description: "Server unwilling to process — header fields too large", category: "Client Error", spec: "RFC 6585" },
  451: { code: 451, phrase: "Unavailable For Legal Reasons", description: "Resource unavailable due to legal demands (censorship)", category: "Client Error", spec: "RFC 7725" },
  // 5xx Server Error
  500: { code: 500, phrase: "Internal Server Error", description: "Server encountered an unexpected condition", category: "Server Error", spec: "RFC 9110" },
  501: { code: 501, phrase: "Not Implemented", description: "Server does not support the functionality required", category: "Server Error", spec: "RFC 9110" },
  502: { code: 502, phrase: "Bad Gateway", description: "Server received an invalid response from upstream server", category: "Server Error", spec: "RFC 9110" },
  503: { code: 503, phrase: "Service Unavailable", description: "Server not ready to handle the request (overloaded or maintenance)", category: "Server Error", spec: "RFC 9110" },
  504: { code: 504, phrase: "Gateway Timeout", description: "Server did not receive a timely response from upstream server", category: "Server Error", spec: "RFC 9110" },
  505: { code: 505, phrase: "HTTP Version Not Supported", description: "Server does not support the HTTP version used in request", category: "Server Error", spec: "RFC 9110" },
  506: { code: 506, phrase: "Variant Also Negotiates", description: "Transparent content negotiation has a circular reference", category: "Server Error", spec: "RFC 2295" },
  507: { code: 507, phrase: "Insufficient Storage", description: "Server unable to store the representation to complete request (WebDAV)", category: "Server Error", spec: "RFC 4918" },
  508: { code: 508, phrase: "Loop Detected", description: "Server detected an infinite loop processing the request (WebDAV)", category: "Server Error", spec: "RFC 5842" },
  510: { code: 510, phrase: "Not Extended", description: "Further extensions required for the server to fulfill request", category: "Server Error", spec: "RFC 2774" },
  511: { code: 511, phrase: "Network Authentication Required", description: "Client needs to authenticate to gain network access (captive portal)", category: "Server Error", spec: "RFC 6585" },
};

const COMMON_HEADERS: Record<string, string> = {
  "content-type": "Indicates the media type of the resource (e.g., application/json, text/html)",
  "authorization": "Credentials for authenticating the client (e.g., Bearer <token>, Basic <base64>)",
  "accept": "Media types the client can process (e.g., application/json, text/html)",
  "cache-control": "Directives for caching mechanisms (e.g., no-cache, max-age=3600)",
  "content-length": "Size of the response body in bytes",
  "content-encoding": "Encoding applied to the body (e.g., gzip, br, deflate)",
  "cookie": "Client cookies sent to server",
  "set-cookie": "Server instructs client to store a cookie",
  "etag": "Identifier for a specific version of a resource (caching)",
  "if-none-match": "Conditional request: succeed only if ETag doesn't match",
  "if-modified-since": "Conditional request: succeed only if modified after date",
  "last-modified": "Date the resource was last modified",
  "location": "URL to redirect to (used with 3xx responses)",
  "origin": "Origin of the request (used in CORS)",
  "access-control-allow-origin": "CORS: which origins can access the resource",
  "access-control-allow-methods": "CORS: allowed HTTP methods",
  "access-control-allow-headers": "CORS: allowed request headers",
  "x-request-id": "Unique identifier for request tracing/debugging",
  "x-forwarded-for": "Original client IP when behind proxy/load balancer",
  "x-forwarded-proto": "Original protocol (http/https) when behind proxy",
  "user-agent": "Client software identification string",
  "referer": "URL of the page that linked to the requested resource",
  "host": "Domain name of the server (and optionally port)",
  "retry-after": "When to retry after 429/503 (seconds or date)",
  "www-authenticate": "Authentication method for 401 responses",
  "transfer-encoding": "Encoding for safe transfer (e.g., chunked)",
  "strict-transport-security": "HSTS: force HTTPS connections",
  "x-content-type-options": "Prevent MIME type sniffing (nosniff)",
  "x-frame-options": "Control iframe embedding (DENY, SAMEORIGIN)",
  "content-security-policy": "Control resources the browser is allowed to load",
};

const COMMON_MIME_TYPES: Record<string, string> = {
  "application/json": "JSON data",
  "application/xml": "XML data",
  "application/pdf": "PDF document",
  "application/zip": "ZIP archive",
  "application/gzip": "Gzip compressed data",
  "application/octet-stream": "Arbitrary binary data",
  "application/x-www-form-urlencoded": "Form data (URL encoded)",
  "multipart/form-data": "Form data with file upload",
  "text/html": "HTML document",
  "text/plain": "Plain text",
  "text/css": "CSS stylesheet",
  "text/csv": "CSV data",
  "text/javascript": "JavaScript (legacy MIME)",
  "application/javascript": "JavaScript",
  "image/png": "PNG image",
  "image/jpeg": "JPEG image",
  "image/gif": "GIF image",
  "image/webp": "WebP image",
  "image/svg+xml": "SVG vector image",
  "audio/mpeg": "MP3 audio",
  "video/mp4": "MP4 video",
  "font/woff2": "WOFF2 web font",
};

export const tool: Tool = {
  name: "http_status",
  description:
    "Look up HTTP status codes, headers, and MIME types with descriptions and RFC references. Call this tool when the user asks about HTTP status codes, needs to know what a header does, or wants MIME type info. Provides comprehensive reference data faster and more accurately than recall — includes exact RFC spec references.",
  schema: z.object({
    query: z
      .string()
      .describe("Status code (e.g., '404'), header name (e.g., 'content-type'), MIME type (e.g., 'application/json'), or category (e.g., '4xx', 'client error')"),
    type: z
      .enum(["auto", "status", "header", "mime"])
      .optional()
      .default("auto")
      .describe("Query type: auto (detect), status (HTTP code), header, or mime type"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ query, type = "auto" }): Promise<ToolResult> => {
    const q = (query as string)?.trim().toLowerCase();
    if (!q) return { success: false, error: "Query is required" };

    const queryType = (type as string) || "auto";

    // Auto-detect query type
    let effectiveType = queryType;
    if (effectiveType === "auto") {
      if (/^\d{3}$/.test(q)) effectiveType = "status";
      else if (/^\d[x]{2}$/i.test(q)) effectiveType = "status"; // e.g., 4xx
      else if (q.includes("/")) effectiveType = "mime";
      else if (COMMON_HEADERS[q]) effectiveType = "header";
      else if (STATUS_CODES[parseInt(q)]) effectiveType = "status";
      else effectiveType = "header"; // default to header search
    }

    switch (effectiveType) {
      case "status": {
        // Single code
        const code = parseInt(q);
        if (!isNaN(code) && STATUS_CODES[code]) {
          const info = STATUS_CODES[code];
          return {
            success: true,
            data: { type: "status", ...info },
            summary: `${info.code} ${info.phrase}\n${info.description}\nCategory: ${info.category} | Spec: ${info.spec}`,
          };
        }

        // Category (e.g., "4xx", "client error")
        const categoryMatch = q.match(/^(\d)[x]{2}$/i);
        const categoryPrefix = categoryMatch ? parseInt(categoryMatch[1]) : null;
        const categoryKeyword = q.replace(/\s+/g, " ");

        const filtered = Object.values(STATUS_CODES).filter((s) => {
          if (categoryPrefix !== null) return Math.floor(s.code / 100) === categoryPrefix;
          return s.category.toLowerCase().includes(categoryKeyword);
        });

        if (filtered.length > 0) {
          return {
            success: true,
            data: { type: "status_category", codes: filtered },
            summary: filtered.map((s) => `${s.code} ${s.phrase} — ${s.description}`).join("\n"),
          };
        }
        return { success: false, error: `Unknown status code: ${q}` };
      }

      case "header": {
        const header = COMMON_HEADERS[q];
        if (header) {
          return {
            success: true,
            data: { type: "header", name: q, description: header },
            summary: `${q}: ${header}`,
          };
        }
        // Fuzzy search
        const matches = Object.entries(COMMON_HEADERS).filter(
          ([name, desc]) => name.includes(q) || desc.toLowerCase().includes(q)
        );
        if (matches.length > 0) {
          return {
            success: true,
            data: { type: "header_search", results: Object.fromEntries(matches) },
            summary: matches.map(([name, desc]) => `${name}: ${desc}`).join("\n"),
          };
        }
        return { success: false, error: `Unknown header: ${q}` };
      }

      case "mime": {
        const mime = COMMON_MIME_TYPES[q];
        if (mime) {
          return {
            success: true,
            data: { type: "mime", mimeType: q, description: mime },
            summary: `${q}: ${mime}`,
          };
        }
        // Fuzzy search
        const matches = Object.entries(COMMON_MIME_TYPES).filter(
          ([mt, desc]) => mt.includes(q) || desc.toLowerCase().includes(q)
        );
        if (matches.length > 0) {
          return {
            success: true,
            data: { type: "mime_search", results: Object.fromEntries(matches) },
            summary: matches.map(([mt, desc]) => `${mt}: ${desc}`).join("\n"),
          };
        }
        return { success: false, error: `Unknown MIME type: ${q}` };
      }

      default:
        return { success: false, error: `Unknown query type: ${effectiveType}` };
    }
  },
};
