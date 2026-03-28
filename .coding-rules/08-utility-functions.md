# 08 — Utility Functions

## Overview

Business logic and data transformations live in `utils/` (small, focused) and `lib/` (large, complex). Components should only handle UI rendering and state — delegate computation to utility modules.

## Directory Structure

```
utils/
├── formatter.ts           # SQL/list formatting, parsing
├── smartDetect.ts         # Content type auto-detection
├── colorMath.ts           # HEX ↔ RGB ↔ HSL ↔ OKLCH conversions
├── cronParser.ts          # Cron expression parsing & description
├── diagramParser.ts       # Text → diagram conversion
├── epochConverter.ts      # Unix timestamp utilities
├── exifParser.ts          # EXIF metadata extraction (WASM)
├── jwtDecoder.ts          # JWT token decoding
├── mermaidBuilder.ts      # Mermaid diagram generation
├── mockDataGenerator.ts   # Faker.js data generation wrapper
├── fileConverter.ts       # File format conversion logic
├── cspEvaluator.ts        # CSP policy analysis & scoring
├── cspUtils.ts            # CSP utilities & helpers
├── diagramTemplates.ts    # Diagram template definitions
└── metadataUtils.ts       # Metadata extraction helpers

lib/
├── harAnalyzer.ts         # HAR file analysis (network waterfall)
└── SQLPlanAnalyzer.ts     # SQL execution plan parsing
```

## Writing Utility Functions

### Pattern: Pure Functions

```typescript
// utils/colorMath.ts

// Named exports for each function
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = hex.replace('#', '').match(/.{2}/g);
  if (!match) throw new Error('Invalid hex color');
  return {
    r: parseInt(match[0], 16),
    g: parseInt(match[1], 16),
    b: parseInt(match[2], 16),
  };
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  // Pure computation, no side effects
}
```

### Pattern: Enums + Interfaces

```typescript
// utils/formatter.ts

export enum SqlFormat {
  IN_CLAUSE = 'in',
  VALUES = 'values',
  UNION = 'union',
  CSV = 'csv',
  CUSTOM = 'custom',
}

export interface FormatterOptions {
  quote: "'" | '"' | '';
  uppercase: boolean;
  prefix: string;
  suffix: string;
}

export function formatItems(items: string[], format: SqlFormat, options: FormatterOptions): string {
  if (!items || items.length === 0) return '';
  // ...
}
```

### Pattern: Detection Engine

```typescript
// utils/smartDetect.ts

export interface DetectResult {
  tool: AppMode;
  confidence: number;  // 0-100
  label: string;
}

export function detectContent(input: string): DetectResult[] {
  const results: DetectResult[] = [];
  // Run all detectors, collect results, sort by confidence
  return results.sort((a, b) => b.confidence - a.confidence);
}
```

## `utils/` vs `lib/`

| | `utils/` | `lib/` |
|---|---|---|
| Size | Small (< 200 lines) | Large (200+ lines) |
| Scope | Single-purpose functions | Complex analysis modules |
| State | Stateless, pure functions | May have internal state or classes |
| Example | `hexToRgb()`, `parseItems()` | `SQLPlanAnalyzer`, `harAnalyzer` |

## Rules

1. **NO React imports in `utils/` or `lib/`** — no hooks, no JSX, no React types
2. **Pure functions preferred** — same input always produces same output
3. **Named exports** — `export function name()`, not default exports
4. **TypeScript interfaces for inputs/outputs** — define explicit types for function signatures
5. **Guard clauses first** — validate inputs at the top, return early for edge cases
6. **One concern per file** — `colorMath.ts` handles colors, `cronParser.ts` handles cron
7. **Test utilities directly** — utility functions should have unit tests in `tests/`
8. **No DOM access** — utilities must work without a browser DOM (enables `@jest-environment node`)
