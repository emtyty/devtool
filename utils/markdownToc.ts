export interface Heading {
  level: number;
  text: string;
  id: string;
}

export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[*_`~]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseHeadings(markdown: string): Heading[] {
  const lines = markdown.split(/\r?\n/);
  const result: Heading[] = [];
  let inCode = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
    if (m) {
      const text = m[2].replace(/[*_`~]/g, '').trim();
      if (!text) continue;
      result.push({ level: m[1].length, text, id: slugify(text) });
    }
  }
  const seen = new Map<string, number>();
  return result.map((h) => {
    const count = seen.get(h.id) ?? 0;
    seen.set(h.id, count + 1);
    return count === 0 ? h : { ...h, id: `${h.id}-${count}` };
  });
}

export function extractTextContent(children: unknown): string {
  if (children == null) return '';
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractTextContent).join('');
  if (typeof children === 'object' && children !== null && 'props' in children) {
    const props = (children as { props?: { children?: unknown } }).props;
    if (props?.children !== undefined) return extractTextContent(props.children);
  }
  return '';
}
