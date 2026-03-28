# 14 — Testing

## Stack

| Tool | Purpose |
|---|---|
| Vitest 2.0 | Unit test runner (Jest-compatible API) |
| @testing-library/react | Component rendering & querying |
| @testing-library/jest-dom | Custom DOM matchers |
| @testing-library/user-event | User interaction simulation |
| @vitest/coverage-v8 | Code coverage |
| Playwright 1.44 | E2E browser testing |
| jsdom | Headless DOM environment |

## Commands

```bash
npm run test          # Vitest in watch mode
npm run test:e2e      # Playwright E2E tests
npm run test:e2e:ui   # Playwright with UI
```

## Configuration

**`vite.config.ts`** test section:

```typescript
test: {
  environment: 'jsdom',
  setupFiles: ['./tests/setup.ts'],
}
```

**`tests/setup.ts`** — global mocks:

```typescript
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock html-query-plan
vi.mock('html-query-plan', () => ({ showPlan: vi.fn(), drawQueryPlan: vi.fn() }));

// Mock Gemini AI
vi.mock('@google/genai', () => ({ GoogleGenAI: vi.fn() }));

// Mock browser APIs
Object.defineProperty(window, 'matchMedia', { value: vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn() })) });
Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(), readText: vi.fn() } });
```

## File Structure

```
tests/
├── setup.ts                           # Global setup + mocks
├── smartDetect.test.ts                # Unit tests for detection engine
└── integration/
    └── MarkdownPreview.test.tsx       # Component integration test
```

### File Naming

| Convention | Example |
|---|---|
| Unit tests | `tests/[module].test.ts` |
| Integration tests | `tests/integration/[Component].test.tsx` |
| Extension | `.test.ts` for pure logic, `.test.tsx` for components |

## Writing Tests

### Unit Tests (Utility Functions)

```typescript
// tests/smartDetect.test.ts
import { describe, it, expect } from 'vitest';
import { detectContent } from '../utils/smartDetect';

describe('detectContent', () => {
  it('detects valid JSON', () => {
    const result = detectContent('{"key": "value"}');
    expect(result[0].tool).toBe('json');
    expect(result[0].confidence).toBeGreaterThan(80);
  });

  it('detects SQL queries', () => {
    const result = detectContent('SELECT * FROM users WHERE id = 1');
    expect(result[0].tool).toBe('sql');
  });

  it('returns empty for ambiguous input', () => {
    const result = detectContent('hello');
    expect(result).toHaveLength(0);
  });
});
```

### Integration Tests (Components)

```typescript
// tests/integration/MarkdownPreview.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';

describe('MarkdownPreview', () => {
  it('renders markdown input', async () => {
    render(<MarkdownPreview />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '# Hello World');
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });
});
```

### Test Structure (Arrange-Act-Assert)

```typescript
it('formats SQL with selected dialect', async () => {
  // Arrange
  render(<SqlFormatter />);
  const input = screen.getByRole('textbox');

  // Act
  await userEvent.type(input, 'SELECT * FROM users');
  await userEvent.click(screen.getByText('Format'));

  // Assert
  expect(screen.getByText(/SELECT/)).toBeInTheDocument();
});
```

## Coverage Targets

| Type | Target | Priority |
|---|---|---|
| Utility functions (`utils/`) | 80%+ | High |
| Detection engine (`smartDetect.ts`) | 90%+ | High |
| Complex analysis (`lib/`) | 70%+ | Medium |
| Tool components | Key interactions only | Low |
| Reusable UI components | Render + click | Medium |

## Mocking

### Mock External Libraries

```typescript
// Heavy libraries that don't work in jsdom
vi.mock('html-query-plan', () => ({ showPlan: vi.fn() }));
vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: vi.fn() } }));
```

### Mock Browser APIs

```typescript
// Clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
});

// matchMedia
window.matchMedia = vi.fn().mockImplementation(query => ({
  matches: false,
  media: query,
  addListener: vi.fn(),
  removeListener: vi.fn(),
}));
```

### Do NOT Mock

- Utility functions (`utils/`) — test them directly
- React hooks — test through component behavior
- Simple state changes — test the rendered output

## Rules

1. **Test file extension**: `.test.ts` (logic) or `.test.tsx` (components)
2. **Tests in `tests/` directory** — not co-located with source
3. **Arrange-Act-Assert** pattern for all tests
4. **Mock heavy/browser-dependent libraries** in `tests/setup.ts`
5. **Do NOT mock utility functions** — test them directly with real inputs
6. **Priority**: utility functions > detection engine > components
7. **No `.skip` or `.only` in committed code** — all tests must run in CI
8. **Run `npm run test` before committing** — all tests must pass
