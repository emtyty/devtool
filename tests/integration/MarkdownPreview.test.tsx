import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MarkdownPreview from '../../components/MarkdownPreview';

function renderComponent() {
  return render(<MarkdownPreview />);
}

describe('MarkdownPreview Component (I-MD)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('I-MD-03: renders in Split mode by default — pane headers visible', () => {
    renderComponent();
    // Both "Markdown Editor" pane header and the preview section should be in the DOM
    expect(screen.getByText(/markdown editor/i)).toBeInTheDocument();
    // "Preview" pane header exists as a span (not just the toolbar button)
    const previewHeadings = screen.getAllByText(/^preview$/i);
    expect(previewHeadings.length).toBeGreaterThanOrEqual(1);
  });

  it('I-MD-01: Editor-only mode hides the preview pane header', () => {
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /^editor$/i }));
    // "Markdown Editor" pane header should remain, but "Preview" pane header should not
    expect(screen.getByText(/markdown editor/i)).toBeInTheDocument();
    // Only 1 "Preview" occurrence: the toolbar button (no pane header)
    const previewItems = screen.getAllByText(/^preview$/i);
    // In editor mode there's only the toolbar button, not the pane header span
    expect(previewItems.length).toBe(1);
  });

  it('I-MD-02: Preview-only mode hides the editor pane', () => {
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /^preview$/i }));
    // Markdown Editor pane should be hidden
    expect(screen.queryByText(/markdown editor/i)).not.toBeInTheDocument();
  });

  it('I-MD-04: typing # Hello renders h1 in preview', async () => {
    renderComponent();
    const textarea = screen.getByPlaceholderText(/write markdown here/i);
    fireEvent.change(textarea, { target: { value: '# Hello World' } });

    await waitFor(() => {
      const h1 = document.querySelector('h1');
      expect(h1?.textContent).toContain('Hello World');
    });
  });

  it('I-MD-05: GFM table renders as HTML table', async () => {
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/write markdown here/i), {
      target: { value: '| Name | Age |\n|------|-----|\n| Alice | 30 |' },
    });
    await waitFor(() => {
      expect(document.querySelector('table')).toBeInTheDocument();
    });
  });

  it('I-MD-06: GFM task list renders checkboxes', async () => {
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/write markdown here/i), {
      target: { value: '- [x] Done\n- [ ] Pending' },
    });
    await waitFor(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('I-MD-07: strikethrough text renders <del> element', async () => {
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/write markdown here/i), {
      target: { value: '~~strikethrough~~' },
    });
    await waitFor(() => {
      expect(document.querySelector('del')).toBeInTheDocument();
    });
  });

  it('I-MD-08: word count updates on input', () => {
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/write markdown here/i), {
      target: { value: 'hello world' },
    });
    expect(screen.getByText(/2 words/i)).toBeInTheDocument();
  });

  it('I-MD-09: line count updates on multi-line input', () => {
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/write markdown here/i), {
      target: { value: 'line1\nline2\nline3' },
    });
    expect(screen.getByText(/3 lines/i)).toBeInTheDocument();
  });

  it('I-MD-10: Clear button empties the editor', async () => {
    renderComponent();
    const textarea = screen.getByPlaceholderText(/write markdown here/i);
    fireEvent.change(textarea, { target: { value: 'some content' } });
    fireEvent.click(screen.getByRole('button', { name: /clear editor/i }));
    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe('');
    });
  });

  it('char count updates correctly', () => {
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/write markdown here/i), {
      target: { value: 'abc' },
    });
    expect(screen.getByText(/3 chars/i)).toBeInTheDocument();
  });

  it('Export HTML button is present in the toolbar', () => {
    renderComponent();
    expect(screen.getByRole('button', { name: /export html/i })).toBeInTheDocument();
  });

  it('Export PDF button is present in the toolbar', () => {
    renderComponent();
    expect(screen.getByRole('button', { name: /export pdf/i })).toBeInTheDocument();
  });
});
