export interface DiarySection {
  title: string;
  body: string;
}

/**
 * Defensively parse formatted diary content into sections.
 * Handles:
 * - Code fence removal (```markdown, ```md, ```)
 * - Noise lines before the first ## heading
 * - Splitting by ## headings
 * - Fallback to a single section if no headings found
 */
export function parseDiarySections(content: string): DiarySection[] {
  if (!content || !content.trim()) return [];

  // 1. Remove code fences
  let cleaned = content
    .replace(/^```(?:markdown|md)?\s*$/gm, '')
    .replace(/^```\s*$/gm, '')
    .trim();

  // 2. Remove leading noise lines (lines before the first ## heading)
  const firstHeadingIndex = cleaned.search(/^## /m);
  if (firstHeadingIndex > 0) {
    cleaned = cleaned.substring(firstHeadingIndex);
  }

  // 3. Split by ## headings
  const parts = cleaned.split(/(?=^## )/m);
  const sections = parts
    .filter(p => p.trim())
    .map(section => {
      const lines = section.trim().split('\n');
      const title = lines[0]?.replace(/^##\s*/, '').trim() || '';
      const body = lines.slice(1).join('\n').trim();
      return { title, body };
    })
    .filter(s => s.title || s.body);

  // 4. Fallback: if no sections parsed, treat entire content as a single body
  if (sections.length === 0 && cleaned.trim()) {
    return [{ title: '', body: cleaned.trim() }];
  }

  return sections;
}
