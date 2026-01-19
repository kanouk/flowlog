import { addDays, format, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const TIMEZONE = 'Asia/Tokyo';

/**
 * Date から JST の日付キー (YYYY-MM-DD) を算出
 */
export function getDayKey(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, 'yyyy-MM-dd');
}

/**
 * JST の今日の日付キーを取得
 */
export function getTodayKey(): string {
  return getDayKey(new Date());
}

/**
 * selectedDate (YYYY-MM-DD) から JST 00:00 ～ 翌日 00:00 の UTC 範囲を取得
 * クエリ: gte(start) & lt(end) で使用
 */
export function getDateRangeUTC(selectedDate: string): { start: string; end: string } {
  const [year, month, day] = selectedDate.split('-').map(Number);
  const baseDate = new Date(Date.UTC(year, month - 1, day));
  const nextDate = addDays(baseDate, 1);
  const nextDateStr = format(nextDate, 'yyyy-MM-dd');
  
  const start = fromZonedTime(`${selectedDate}T00:00:00`, TIMEZONE).toISOString();
  const end = fromZonedTime(`${nextDateStr}T00:00:00`, TIMEZONE).toISOString();
  
  return { start, end };
}

/**
 * dayKey + time から occurred_at ISO文字列を生成（Date直操作禁止）
 * ※これが occurred_at 生成の唯一の正規ルート
 * @param dayKey - YYYY-MM-DD形式の日付
 * @param time - HH:mm形式の時刻
 */
export function createOccurredAt(dayKey: string, time: string): string {
  return fromZonedTime(`${dayKey}T${time}:00`, TIMEZONE).toISOString();
}

/**
 * JST の特定時刻を UTC の Date として取得
 */
export function getJSTTimeAsUTC(dateStr: string, timeStr: string): Date {
  return fromZonedTime(`${dateStr}T${timeStr}`, TIMEZONE);
}

/**
 * ISO8601 文字列を Date にパース（Supabase TIMESTAMPTZ 用）
 */
export function parseTimestamp(isoString: string): Date {
  return parseISO(isoString);
}

/**
 * occurred_at を JST の時刻文字列 (HH:mm) にフォーマット
 */
export function formatTimeJST(isoString: string): string {
  return formatInTimeZone(parseISO(isoString), TIMEZONE, 'HH:mm');
}

/**
 * occurred_at を JST の日付文字列 (M月d日) にフォーマット
 */
export function formatDateJST(isoString: string): string {
  return formatInTimeZone(parseISO(isoString), TIMEZONE, 'M月d日');
}

/**
 * occurred_at を JST の dayKey (YYYY-MM-DD) として取得
 */
export function getOccurredAtDayKey(isoString: string): string {
  return formatInTimeZone(parseISO(isoString), TIMEZONE, 'yyyy-MM-dd');
}

/**
 * 未来日時かどうかを判定（+5分まで許容）
 */
export function isFutureDate(isoString: string): boolean {
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
  return parseISO(isoString).getTime() > fiveMinutesFromNow;
}

export type MiddleOccurredAtResult = 
  | { success: true; occurredAt: string }
  | { success: false; reason: string };

/**
 * D&D並び替え用: 前後ブロックから中間時刻を計算（日付境界クランプ付き）
 * 
 * 【D&D例外】この関数のみ UTCミリ秒→ISO 直接生成を許可（READMEに明記）
 * 通常の occurred_at 生成は createOccurredAt() を使うこと
 * 
 * @param prevOccurredAt - 前のブロック（降順なのでより新しい）
 * @param nextOccurredAt - 次のブロック（降順なのでより古い）
 * @param selectedDate - 選択中の日付 (YYYY-MM-DD) ※必須
 */
export function calculateMiddleOccurredAt(
  prevOccurredAt: string | null,
  nextOccurredAt: string | null,
  selectedDate: string
): MiddleOccurredAtResult {
  // 日付範囲を取得（JST 00:00 ～ 翌日 00:00 のUTC）
  const { start, end } = getDateRangeUTC(selectedDate);
  const startMs = parseISO(start).getTime();
  const endMs = parseISO(end).getTime() - 1; // endは翌日00:00なので-1ms

  const now = Date.now();
  const fiveMinutesFromNow = now + 5 * 60 * 1000;

  let newMs: number;

  if (prevOccurredAt && nextOccurredAt) {
    // 両方存在: 中間時刻
    const prevMs = parseISO(prevOccurredAt).getTime();
    const nextMs = parseISO(nextOccurredAt).getTime();
    const gap = Math.abs(prevMs - nextMs);
    
    if (gap <= 1) {
      return { success: false, reason: 'この位置には移動できません（時間が詰まりすぎています）' };
    }
    
    newMs = Math.floor((prevMs + nextMs) / 2);
  } else if (nextOccurredAt) {
    // 先頭に移動（降順なので next はより古い）: nextより1秒新しく
    const nextMs = parseISO(nextOccurredAt).getTime();
    newMs = nextMs + 1000;
  } else if (prevOccurredAt) {
    // 末尾に移動（降順なので prev はより新しい）: prevより1秒古く
    const prevMs = parseISO(prevOccurredAt).getTime();
    newMs = prevMs - 1000;
  } else {
    return { success: false, reason: '移動先がありません' };
  }

  // 日付範囲内にクランプ（クリティカル修正）
  newMs = Math.max(startMs, Math.min(endMs, newMs));

  // 未来チェック
  if (newMs > fiveMinutesFromNow) {
    return { success: false, reason: '未来の日時には移動できません' };
  }

  // D&D例外: UTCミリ秒→ISOで生成
  return { success: true, occurredAt: new Date(newMs).toISOString() };
}
