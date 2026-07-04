import { describe, expect, it } from 'vitest';
import { parseDiarySections } from './diaryParser';

describe('parseDiarySections', () => {
  it('returns an empty list for blank content', () => {
    expect(parseDiarySections('')).toEqual([]);
    expect(parseDiarySections('   \n')).toEqual([]);
  });

  it('removes markdown fences and noise before headings', () => {
    expect(parseDiarySections('```markdown\nnoise\n## 朝\n起きた\n## 夜\n寝た\n```')).toEqual([
      { title: '朝', body: '起きた' },
      { title: '夜', body: '寝た' },
    ]);
  });

  it('keeps current no-heading behavior', () => {
    // NOTE: current behavior treats a heading-less single line as title, not body.
    expect(parseDiarySections('ただの本文')).toEqual([{ title: 'ただの本文', body: '' }]);
  });
});
