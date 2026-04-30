export interface ScoreDeduction {
  rule: string;
  points: number;
  reason: string;
}

export interface ParsedScoreResult {
  score: number;
  deductions: ScoreDeduction[];
  summary: string;
}

export type ScoreParseResult =
  | { ok: true; value: ParsedScoreResult }
  | { ok: false; reason: string; preview: string };

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function sanitizeScoreResponsePreview(raw: string, maxLength = 600): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function extractBalancedJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function getJsonCandidates(raw: string): string[] {
  const text = raw.trim()
    .replace(/^```(?:json|JSON)?\s*/, '')
    .replace(/\s*```$/, '')
    .trim();

  const candidates = new Set<string>();
  if (text.startsWith('{') && text.endsWith('}')) {
    candidates.add(text);
  }

  const fencedMatches = raw.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g);
  for (const match of fencedMatches) {
    const candidate = match[1]?.trim();
    if (candidate) candidates.add(candidate);
  }

  for (const candidate of extractBalancedJsonObjects(raw)) {
    candidates.add(candidate);
  }

  return [...candidates];
}

function normalizeDeduction(deduction: unknown): ScoreDeduction | null {
  if (!deduction || typeof deduction !== 'object') return null;
  const data = deduction as Record<string, unknown>;
  const points = Number(data.points);

  return {
    rule: typeof data.rule === 'string' ? data.rule : 'ルール違反',
    points: Number.isFinite(points) ? points : 0,
    reason: typeof data.reason === 'string' ? data.reason : '',
  };
}

function parseJsonScore(candidate: string): ParsedScoreResult | null {
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const rawScore = parsed.score;
    if (typeof rawScore !== 'number' && typeof rawScore !== 'string') return null;

    const scoreNumber = Number(rawScore);
    if (!Number.isFinite(scoreNumber)) return null;

    const deductions = Array.isArray(parsed.deductions)
      ? parsed.deductions.map(normalizeDeduction).filter((d): d is ScoreDeduction => d !== null)
      : [];

    return {
      score: clampScore(scoreNumber),
      deductions,
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    };
  } catch {
    return null;
  }
}

export function parseScoreResult(raw: string): ScoreParseResult {
  const candidates = getJsonCandidates(raw);
  for (const candidate of candidates) {
    const parsed = parseJsonScore(candidate);
    if (parsed) return { ok: true, value: parsed };
  }

  return {
    ok: false,
    reason: candidates.length > 0 ? 'json_without_valid_score' : 'no_json_found',
    preview: sanitizeScoreResponsePreview(raw),
  };
}

export function formatScoreDetails(result: ParsedScoreResult): string {
  if (result.deductions.length > 0) {
    const deductionLines = result.deductions.map((d) =>
      `・${d.rule}: ${d.points}点\n  → ${d.reason}`
    ).join('\n');
    return `減点内訳:\n${deductionLines}\n\n💬 ${result.summary || ''}`;
  }

  return result.summary || 'すべてのルールを守れました！';
}
