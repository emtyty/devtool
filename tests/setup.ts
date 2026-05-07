import '@testing-library/jest-dom';
import { vi } from 'vitest';

// ── Mock html-query-plan (needs real DOM/SVG environment) ────────────────────
vi.mock('html-query-plan', () => ({
  showPlan: vi.fn(),
  drawQueryPlan: vi.fn(),
}));

// ── Mock @google/genai ───────────────────────────────────────────────────────
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({
        text: 'AI analysis mock result',
      }),
    },
  })),
}));

// ── Mock html-query-plan CSS import ─────────────────────────────────────────
vi.mock('html-query-plan/css/qp.css', () => ({}));

// ── Mock window.matchMedia (not available in jsdom) ─────────────────────────
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ── Mock navigator.clipboard ────────────────────────────────────────────────
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
  },
});

// ── Mock URL.createObjectURL / revokeObjectURL ──────────────────────────────
// jsdom provides stubs that throw "Not implemented" when called; replace with
// no-throw mocks so tests exercising blob-download flows don't crash.
let __objectUrlCounter = 0;
URL.createObjectURL = vi.fn(() => `blob:mock-${++__objectUrlCounter}`);
URL.revokeObjectURL = vi.fn();

// ── Suppress noisy React act() warnings in tests ────────────────────────────
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: An update to') ||
        args[0].includes('inside a test was not wrapped in act'))
    ) return;
    originalError(...args);
  };
});
afterAll(() => {
  console.error = originalError;
});
