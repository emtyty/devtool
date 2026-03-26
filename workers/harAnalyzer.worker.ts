import { parseHar, parseLogs, DEFAULT_RULES, Rule, ParseResult } from '../lib/harAnalyzer';

self.onmessage = (e: MessageEvent<{
  harText: string;
  logText?: string;
  tzOffsetMs: number;
  rules?: Rule[];
}>) => {
  const { harText, logText, tzOffsetMs = 0, rules = DEFAULT_RULES } = e.data;

  try {
    const { entries, t0 } = parseHar(harText, rules);
    const logs = logText ? parseLogs(logText, tzOffsetMs, t0, rules) : [];

    let duration = 0;
    for (const entry of entries) {
      const end = entry.relStartMs + entry.time;
      if (end > duration) duration = end;
    }

    const result: ParseResult = { entries, logs, t0, duration };
    (self as unknown as Worker).postMessage({ type: 'result', result });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'Parse failed',
    });
  }
};
