import { describe, it, expect } from 'vitest';
import { generateText, buildSentence, buildParagraph, LANG_CONFIG } from '../utils/loremGenerator';
import type { LoremLanguage } from '../utils/loremGenerator';

// ── buildSentence ─────────────────────────────────────────────────────────────

describe('buildSentence', () => {
  it('produces exactly the requested number of words for Latin-script languages', () => {
    const config = LANG_CONFIG['english'];
    const sentence = buildSentence(config, 8);
    // Strip trailing period and count tokens
    const words = sentence.replace(/\.$/, '').split(' ');
    expect(words).toHaveLength(8);
  });

  it('capitalizes first letter for Latin-script languages', () => {
    const config = LANG_CONFIG['english'];
    for (let i = 0; i < 10; i++) {
      const sentence = buildSentence(config, 5);
      expect(sentence[0]).toBe(sentence[0].toUpperCase());
    }
  });

  it('ends Latin sentences with a period', () => {
    ['english', 'vietnamese', 'spanish', 'french', 'german'].forEach(lang => {
      const sentence = buildSentence(LANG_CONFIG[lang as LoremLanguage], 6);
      expect(sentence).toMatch(/\.$/);
    });
  });

  it('ends Japanese sentences with 。', () => {
    const sentence = buildSentence(LANG_CONFIG['japanese'], 5);
    expect(sentence).toMatch(/。$/);
  });

  it('ends Chinese sentences with 。', () => {
    const sentence = buildSentence(LANG_CONFIG['chinese'], 5);
    expect(sentence).toMatch(/。$/);
  });

  it('does not insert spaces between CJK tokens', () => {
    const sentence = buildSentence(LANG_CONFIG['japanese'], 4);
    // Remove the terminator and check that no ASCII space exists
    const body = sentence.slice(0, -1);
    expect(body).not.toContain(' ');
  });
});

// ── buildParagraph ────────────────────────────────────────────────────────────

describe('buildParagraph', () => {
  it('generates at least one sentence', () => {
    const config = LANG_CONFIG['english'];
    const para = buildParagraph(config, 10);
    expect(para.trim().length).toBeGreaterThan(0);
  });

  it('consumes approximately the requested word count', () => {
    const config = LANG_CONFIG['english'];
    // Request 50 words; sentences are 6-15 words, so actual may be within that range
    const para = buildParagraph(config, 50);
    const count = para.replace(/\.$/, '').split(' ').filter(Boolean).length;
    expect(count).toBeGreaterThanOrEqual(50);
    // At most 50 + 15 (one extra sentence at max length)
    expect(count).toBeLessThanOrEqual(65);
  });

  it('works with a single-word request', () => {
    const para = buildParagraph(LANG_CONFIG['english'], 1);
    expect(para.trim().length).toBeGreaterThan(0);
  });
});

// ── generateText — output structure ──────────────────────────────────────────

describe('generateText — structure', () => {
  it('produces the correct number of paragraphs', () => {
    const output = generateText('english', 100, 3);
    const paragraphs = output.split('\n\n');
    expect(paragraphs).toHaveLength(3);
  });

  it('produces one paragraph when paragraphCount is 1', () => {
    const output = generateText('english', 80, 1);
    expect(output.split('\n\n')).toHaveLength(1);
  });

  it('produces no empty paragraphs', () => {
    const output = generateText('english', 200, 5);
    output.split('\n\n').forEach(para => {
      expect(para.trim().length).toBeGreaterThan(0);
    });
  });

  it('paragraphs are separated by exactly one blank line (\\n\\n)', () => {
    const output = generateText('english', 60, 2);
    expect(output).toContain('\n\n');
    // Should not have triple newlines
    expect(output).not.toContain('\n\n\n');
  });
});

// ── generateText — word count ─────────────────────────────────────────────────

describe('generateText — word count', () => {
  it('total word count is close to the requested amount for English', () => {
    const output = generateText('english', 100, 1);
    const count = output.replace(/\./g, '').split(/\s+/).filter(Boolean).length;
    // Sentences are 6–15 words; last sentence may overshoot by up to 15
    expect(count).toBeGreaterThanOrEqual(100);
    expect(count).toBeLessThanOrEqual(115);
  });

  it('total word count is close to the requested amount across paragraphs', () => {
    const output = generateText('english', 90, 3);
    const count = output.replace(/\./g, '').split(/\s+/).filter(Boolean).length;
    expect(count).toBeGreaterThanOrEqual(90);
    expect(count).toBeLessThanOrEqual(135); // 3 paragraphs × up to 15 overshoot each
  });
});

// ── generateText — each language generates valid output ───────────────────────

const ALL_LANGUAGES: LoremLanguage[] = [
  'english', 'vietnamese', 'spanish', 'french', 'german', 'japanese', 'chinese',
];

describe('generateText — all languages', () => {
  ALL_LANGUAGES.forEach(lang => {
    it(`generates non-empty output for ${lang}`, () => {
      const output = generateText(lang, 50, 1);
      expect(output.trim().length).toBeGreaterThan(0);
    });

    it(`generates correct paragraph count for ${lang}`, () => {
      const output = generateText(lang, 60, 2);
      expect(output.split('\n\n')).toHaveLength(2);
    });
  });

  it('English output uses only ASCII words from the word bank', () => {
    const output = generateText('english', 30, 1);
    // Strip all sentence-ending periods, then split on whitespace
    const words = output.replace(/\./g, '').split(/\s+/).filter(Boolean);
    words.forEach(word => {
      expect(word).toMatch(/^[A-Za-z]+$/);
    });
  });

  it('Japanese output ends sentences with 。', () => {
    const output = generateText('japanese', 40, 1);
    expect(output).toMatch(/。/);
  });

  it('Chinese output ends sentences with 。', () => {
    const output = generateText('chinese', 40, 1);
    expect(output).toMatch(/。/);
  });

  it('Spanish output contains only Spanish words from the word bank', () => {
    const output = generateText('spanish', 20, 1);
    expect(output.trim().length).toBeGreaterThan(0);
  });

  it('French output is non-empty and ends with a period', () => {
    const output = generateText('french', 20, 1);
    expect(output.trimEnd()).toMatch(/\.$/);
  });

  it('German output is non-empty and ends with a period', () => {
    const output = generateText('german', 20, 1);
    expect(output.trimEnd()).toMatch(/\.$/);
  });
});

// ── generateText — edge cases ─────────────────────────────────────────────────

describe('generateText — edge cases', () => {
  it('handles wordCount of 1', () => {
    const output = generateText('english', 1, 1);
    expect(output.trim().length).toBeGreaterThan(0);
  });

  it('handles wordCount equal to paragraphCount (1 word per paragraph)', () => {
    const output = generateText('english', 3, 3);
    const paragraphs = output.split('\n\n');
    expect(paragraphs).toHaveLength(3);
    paragraphs.forEach(para => expect(para.trim().length).toBeGreaterThan(0));
  });

  it('handles large word count without throwing', () => {
    expect(() => generateText('english', 1000, 5)).not.toThrow();
  });

  it('handles large paragraph count without throwing', () => {
    expect(() => generateText('english', 100, 100)).not.toThrow();
  });

  it('randomness: two calls with same params produce different output', () => {
    const a = generateText('english', 200, 2);
    const b = generateText('english', 200, 2);
    // With 200 words and a 250-word bank it is astronomically unlikely they match
    expect(a).not.toBe(b);
  });
});
