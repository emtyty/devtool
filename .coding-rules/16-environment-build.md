# 16 — Environment & Build

## Commands

```bash
npm run dev          # Start dev server on port 3000 with HMR
npm run build        # Production build → dist/
npm run preview      # Preview production build locally
npm run lint         # ESLint check
npm run type-check   # tsc --noEmit (TypeScript validation)
npm run test         # Vitest (unit tests)
npm run test:e2e     # Playwright (e2e tests)
```

## Vite Configuration

**`vite.config.ts`** key settings:

```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',  // Accessible on LAN
  },
  resolve: {
    alias: { '@': path.resolve(__dirname) },  // @/* → project root
  },
  assetsInclude: ['**/*.wasm'],  // WASM files as assets
  optimizeDeps: {
    include: ['@uswriting/exiftool', '@6over3/zeroperl-ts'],  // Pre-bundle WASM deps
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
```

### html-query-plan Patches

Vite config includes build-time patches for the `html-query-plan` library:

```typescript
// Fix SVG rendering and root selector issues
// Applied via Vite plugin in vite.config.ts
```

## TypeScript Configuration

**`tsconfig.json`** key settings:

| Setting | Value | Purpose |
|---|---|---|
| `target` | ES2022 | Modern JS features |
| `module` | ESNext | ESM imports |
| `moduleResolution` | bundler | Vite-compatible resolution |
| `jsx` | react-jsx | Automatic JSX transform (no `import React`) |
| `strict` | true | Full type checking |
| `skipLibCheck` | true | Skip node_modules type checking |
| `isolatedModules` | true | Safe for transpilers |
| `paths` | `@/*` → `./*` | Path alias for imports |

## Path Alias

Use `@/` to import from project root:

```typescript
import { formatItems } from '@/utils/formatter';
import type { AppMode } from '@/types';
```

## Dependency Management

### Adding New Dependencies

1. Check bundle size on bundlephobia.com
2. Verify license (MIT/Apache/BSD — avoid GPL/LGPL)
3. Check for known vulnerabilities: `npm audit`
4. Prefer packages with ESM support and tree-shaking
5. If the dependency is heavy, ensure the consuming component is lazy-loaded

### No Server Dependencies

DevToolKit is a pure client-side app. Do NOT add:
- Express, Fastify, or any server framework
- Database drivers or ORMs
- Server-side rendering (SSR) libraries
- Backend authentication libraries

Exception: The `mcp/` directory is a separate Node.js package with its own dependencies.

## Build Output

```
dist/
├── index.html           # Entry HTML
├── assets/
│   ├── index-[hash].js  # Main bundle
│   ├── [Tool]-[hash].js # Lazy-loaded tool chunks
│   └── index-[hash].css # Compiled Tailwind CSS
└── *.wasm               # WebAssembly binaries
```

## Rules

1. **Dev server on port 3000** — do not change without updating documentation
2. **Use `@/` path alias** — avoid deep relative imports (`../../../utils/`)
3. **No environment variables for secrets** — this is a client-side app, everything is public
4. **Run `type-check` before builds** — catches TypeScript errors that Vite ignores
5. **WASM files in `assetsInclude`** — add new WASM file patterns if needed
6. **MCP server is independent** — has its own build pipeline (`tsup`), don't mix dependencies
