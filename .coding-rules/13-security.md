# 13 — Security

> Client-side security checks aligned with OWASP Top 10:2025, adapted for a browser-only application.

## A03 — Injection / XSS

### dangerouslySetInnerHTML

The primary XSS risk in DevToolKit. Several tools generate HTML for syntax highlighting.

```typescript
// REQUIRED: Escape user content before embedding in HTML
function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Good: Escape content, then wrap with styling
const highlighted = `<span class="keyword">${escHtml(keyword)}</span>`;
<div dangerouslySetInnerHTML={{ __html: highlighted }} />

// Bad: Raw user input
<div dangerouslySetInnerHTML={{ __html: userInput }} />
```

### JSON.parse

Always wrap in try-catch:

```typescript
// Good
try {
  const data = JSON.parse(input);
} catch {
  setError('Invalid JSON');
}

// Bad
const data = JSON.parse(input);  // Throws on invalid input
```

## A04 — Sensitive Data Exposure

### No Secrets in Client Code

This is a browser app — everything is visible to the user.

```typescript
// Bad: API key in source code
const API_KEY = 'sk-abc123';

// Good: User provides their own API key at runtime (e.g., Gemini in QueryPlanViewer)
const [apiKey, setApiKey] = useState('');
// Key stored only in component state, never persisted
```

### localStorage Security

```typescript
// OK: User preferences (non-sensitive)
localStorage.setItem('devtoolkit:theme', 'dark');
localStorage.setItem('devtoolkit:favorites', JSON.stringify(favorites));

// Bad: Sensitive data in localStorage
localStorage.setItem('apiKey', key);  // Accessible via DevTools
```

## A05 — Security Misconfiguration

### No console.log in Production

```typescript
// Bad
console.log('Processing file:', file.name);
console.error('Failed:', error);

// Good: Display in UI
setError(`Failed to process ${file.name}`);
```

### Content Security Policy

DevToolKit loads external resources via CDN:
- Google Fonts (Inter, Fira Code)
- Font Awesome icons

If deploying with CSP headers, ensure these origins are allowed.

## A06 — Vulnerable Dependencies

Before adding a new dependency:

| Check | How |
|---|---|
| Known CVEs | `npm audit` |
| License | Must be MIT/Apache/BSD — NO GPL/LGPL |
| Maintenance | Check last publish date and open issues |
| Bundle size | bundlephobia.com |

## A08 — Data Integrity

### File Processing

Binary file processing (EXIF, PSD, ZIP, HEIC) should validate before processing:

```typescript
// Good: Validate file type before processing
const handleFile = async (file: File) => {
  if (!SUPPORTED_TYPES.includes(file.type)) {
    setError(`Unsupported file type: ${file.type}`);
    return;
  }
  // Process file...
};
```

### URL Handling

```typescript
// Good: Validate URLs before opening
const isValidUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};

// Bad: Open arbitrary URLs
window.open(userInput);
```

## A09 — Privacy

DevToolKit is **privacy-focused** — no tracking, no analytics, no server calls.

- **NO tracking scripts** (Segment, GA, Mixpanel, etc.)
- **NO telemetry or error reporting** to external services
- **NO server-side processing** — all data stays in the browser
- **NO cookies** — only localStorage for preferences
- The only external network calls are CDN fonts/icons (loaded in `index.html`)
- Exception: User-initiated AI analysis (Gemini) in QueryPlanViewer — user provides their own API key

## Rules

1. **Escape all HTML** before `dangerouslySetInnerHTML` — use `escHtml()` or equivalent
2. **Wrap `JSON.parse` in try-catch** — always
3. **No hardcoded API keys or secrets** — user provides keys at runtime if needed
4. **No sensitive data in localStorage** — only UI preferences
5. **No console.log in production** — display errors in the UI
6. **Audit dependencies** before adding — `npm audit`, check license
7. **Validate file types** before binary processing
8. **Validate URLs** before `window.open()` or navigation
9. **No external tracking or telemetry** — privacy is a core principle
10. **No PII collection** — the app should never ask for or store personal data
