# devtoolkit-mcp

25+ developer utilities as an MCP server for AI-assisted workflows. JSON repair, SQL formatting, hashing, encoding, UUID generation, regex testing, CSV transforms, subnet calculation, and more.

**No API keys. No network requests. Everything runs locally.**

By [Coding4Pizza](https://coding4pizza.com)

## Quick Start

```bash
npx -y devtoolkit-mcp
```

## Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "devtoolkit": {
      "command": "npx",
      "args": ["-y", "devtoolkit-mcp"]
    }
  }
}
```

### Claude Code (CLI & VSCode Extension)

Add globally (available in all projects):

```bash
claude mcp add -s user devtoolkit -- npx -y devtoolkit-mcp
```

Or add for current project only:

```bash
claude mcp add devtoolkit -- npx -y devtoolkit-mcp
```

> **Note:** Do NOT manually edit `~/.claude/.mcp.json` — use `claude mcp add` to register servers correctly.

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "devtoolkit": {
      "command": "npx",
      "args": ["-y", "devtoolkit-mcp"]
    }
  }
}
```

### VS Code (Copilot)

Add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "devtoolkit": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "devtoolkit-mcp"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "devtoolkit": {
      "command": "npx",
      "args": ["-y", "devtoolkit-mcp"]
    }
  }
}
```

## Available Tools (25)

### Data Transform
| Tool | Description |
|------|-------------|
| `repair_json` | Fix malformed JSON — missing quotes, trailing commas, single quotes, comments |
| `format_sql` | Format or minify SQL with 18+ dialect support |
| `format_list` | Convert lists to SQL IN clause, VALUES, UNION, JSON array, CSV |
| `clean_list` | Deduplicate, sort, trim, filter lists |
| `generate_mock_data` | Generate fake data with 63+ field types via Faker.js (JSON/CSV/SQL) |
| `csv_transform` | Parse, filter, sort, aggregate, convert CSV data |
| `yaml_json` | Convert between YAML and JSON |
| `json_to_types` | Convert JSON to TypeScript interfaces, Zod schemas, or JSON Schema |

### Decode & Parse
| Tool | Description |
|------|-------------|
| `decode_jwt` | Decode JWT tokens — header, payload, expiration status |
| `parse_cron` | Parse cron expressions — human-readable description + next run times |
| `convert_epoch` | Convert between epoch timestamps and human dates |
| `convert_color` | Convert colors (HEX/RGB/HSL/OKLCH) with WCAG contrast grades |
| `url_parse` | Parse URLs into components, manipulate query parameters |
| `http_status` | Look up HTTP status codes, headers, and MIME types with RFC references |

### Crypto & Random
| Tool | Description |
|------|-------------|
| `hash_text` | Compute MD5, SHA-1, SHA-256, SHA-512 hashes and HMAC |
| `encode_decode` | Encode/decode Base64, URL, HTML entities, Unicode escapes |
| `uuid_generate` | Generate UUID v4, v7, NanoID, or ULID with true crypto randomness |
| `password_generate` | Generate crypto-random passwords or passphrases with entropy estimate |

### Dev Utilities
| Tool | Description |
|------|-------------|
| `regex_test` | Test regex patterns — matches, captures, named groups, replace |
| `number_base_convert` | Convert between decimal, hex, binary, octal (BigInt support) |
| `diff_text` | Line-by-line text diff using LCS algorithm |
| `string_case` | Convert between camelCase, snake_case, kebab-case, PascalCase, CONSTANT_CASE, and more |
| `ip_subnet` | IPv4 subnet calculator — CIDR, masks, host range, membership check |
| `timestamp_calc` | Date math — add/subtract durations, diff between dates, timezone conversion |

### Smart Detection
| Tool | Description |
|------|-------------|
| `detect_content` | Auto-detect content type (JSON, SQL, JWT, cron, etc.) with confidence score |

## Examples

Just ask your AI assistant in natural language:

```
Hash "hello world" with SHA-256
```

```
Decode this JWT: eyJhbGciOiJIUzI1NiIs...
```

```
Convert 0xFF3A to binary
```

```
Test regex (\d{4})-(\d{2})-(\d{2}) against "2024-03-15"
```

```
Generate 5 UUID v7
```

```
What is 2024-01-15 + 90 days?
```

```
Calculate subnet for 192.168.1.0/24
```

```
Convert getUserHTTPResponse to snake_case
```

```
Convert this JSON to TypeScript: {"id": 1, "name": "John", "tags": ["admin"]}
```

```
Generate 20 mock users with id, name, email, salary as CSV, then filter salary > 60000
```

## Why MCP Tools vs Native AI?

These tools provide capabilities that AI models **cannot do natively**:

| Capability | AI Native | MCP Tool |
|-----------|-----------|----------|
| Compute SHA-256 hash | Cannot | Exact |
| Generate true random UUIDs | Cannot | Crypto-random |
| Base64 encode/decode | Often wrong | Exact |
| Regex matching with captures | Often wrong | JS RegExp engine |
| Subnet math (CIDR, masks) | Often wrong | Bit-level exact |
| Date arithmetic | Often wrong | Millisecond exact |
| CSV parsing (quoted fields) | Approximates | RFC-compliant |
| Line-by-line diff | Misses changes | LCS algorithm |

## Requirements

- Node.js >= 18

## License

MIT

## Links

- Website: [coding4pizza.com](https://coding4pizza.com)
- Source: [github.com/emtyty/devtool](https://github.com/emtyty/devtool)
- Issues: [github.com/emtyty/devtool/issues](https://github.com/emtyty/devtool/issues)
