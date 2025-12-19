import { useMemo } from 'react';
import { Entry } from '@/hooks/useEntries';

interface FormattedViewProps {
  entry: Entry;
}

export function FormattedView({ entry }: FormattedViewProps) {
  const content = entry.formatted_content;

  const sections = useMemo(() => {
    if (!content) return [];

    // Split by markdown headers
    const parts = content.split(/(?=^## )/m);
    return parts.filter(p => p.trim()).map(section => {
      const lines = section.trim().split('\n');
      const title = lines[0]?.replace(/^##\s*/, '').trim() || '';
      const body = lines.slice(1).join('\n').trim();
      return { title, body };
    });
  }, [content]);

  if (!content) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
          <svg
            className="w-8 h-8 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <p className="text-muted-foreground">
          まだ整形されていません
        </p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          フローを書いてから「整形する」ボタンを押してください
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {sections.map((section, index) => (
        <div key={index} className="block-card p-5">
          <h3 className="text-lg font-medium text-primary mb-3 flex items-center gap-2">
            {section.title === '今日の3行まとめ' && (
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                ✨
              </span>
            )}
            {section.title === '朝' && '🌅'}
            {section.title === '昼' && '☀️'}
            {section.title === '夕方' && '🌇'}
            {section.title === '夜' && '🌙'}
            {section.title}
          </h3>
          <div className="prose prose-sm max-w-none text-foreground/90">
            {section.body.split('\n').map((line, i) => (
              <p key={i} className="mb-2 last:mb-0 leading-relaxed">
                {line.replace(/^[-*]\s*/, '• ')}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
