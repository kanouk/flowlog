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
 * JST の今日の日付キーを取得（生活日基準）
 * dayBoundaryHour=5 なら、03:00 JST は前日の生活日に属する
 */
export function getTodayKey(dayBoundaryHour: number = 0): string {
  if (dayBoundaryHour === 0) {
    return getDayKey(new Date());
  }
  // 現在時刻から dayBoundaryHour 時間を引いた日付を返す
  const now = new Date();
  const shifted = new Date(now.getTime() - dayBoundaryHour * 60 * 60 * 1000);
  return getDayKey(shifted);
}

/**
 * selectedDate (YYYY-MM-DD) から生活日の UTC 範囲を取得
 * dayBoundaryHour=0: 00:00 JST ～ 翌日 00:00 JST
 * dayBoundaryHour=5: 05:00 JST ～ 翌日 05:00 JST
 */
export function getDateRangeUTC(selectedDate: string, dayBoundaryHour: number = 0): { start: string; end: string } {
  const boundaryTime = String(dayBoundaryHour).padStart(2, '0') + ':00:00';
  const [year, month, day] = selectedDate.split('-').map(Number);
  const baseDate = new Date(Date.UTC(year, month - 1, day));
  const nextDate = addDays(baseDate, 1);
  const nextDateStr = format(nextDate, 'yyyy-MM-dd');
  
  const start = fromZonedTime(`${selectedDate}T${boundaryTime}`, TIMEZONE).toISOString();
  const end = fromZonedTime(`${nextDateStr}T${boundaryTime}`, TIMEZONE).toISOString();
  
  return { start, end };
}

/**
 * dayKey + time から occurred_at ISO文字列を生成（生活日基準）
 * ※これが occurred_at 生成の唯一の正規ルート
 * 
 * dayBoundaryHour=5 の場合:
 * - dayKey=2026-03-07, time=23:00 → 2026-03-07 23:00 JST (same calendar day)
 * - dayKey=2026-03-07, time=01:30 → 2026-03-08 01:30 JST (next calendar day, still life-day 3/7)
 * 
 * ロジック: time の HH が dayBoundaryHour 未満なら、翌calendar dayとして解釈
 * 
 * @param dayKey - YYYY-MM-DD形式の生活日
 * @param time - HH:mm形式の時刻
 * @param dayBoundaryHour - 生活日の区切り時刻 (0-12)
 */
export function createOccurredAt(dayKey: string, time: string, dayBoundaryHour: number = 0): string {
  if (dayBoundaryHour === 0) {
    return fromZonedTime(`${dayKey}T${time}:00`, TIMEZONE).toISOString();
  }
  
  const [hours] = time.split(':').map(Number);
  
  // time の時刻が dayBoundaryHour 未満 → 翌calendar day
  if (hours < dayBoundaryHour) {
    const [y, m, d] = dayKey.split('-').map(Number);
    const nextDay = addDays(new Date(Date.UTC(y, m - 1, d)), 1);
    const nextDayStr = format(nextDay, 'yyyy-MM-dd');
    return fromZonedTime(`${nextDayStr}T${time}:00`, TIMEZONE).toISOString();
  }
  
  // それ以外は同calendar day
  return fromZonedTime(`${dayKey}T${time}:00`, TIMEZONE).toISOString();
}

/**
 * JST の特定時刻を UTC の Date として取得
 */
export function getJSTTimeAsUTC(dateStr: string, timeStr: string): Date {
  return fromZonedTime(`${dateStr}T${timeStr}`, TIMEZONE);
}

/**
 * カレンダー日付 + 実時刻 → occurred_at ISO文字列を生成
 * ※ BlockEditModal など、ユーザーがカレンダー日付と時刻を直接指定する場合に使用
 * ※ createOccurredAt() と違い、生活日解釈をしない（カレンダー日付をそのまま使う）
 */
export function createOccurredAtFromCalendarInput(calendarDate: string, time: string): string {
  return fromZonedTime(`${calendarDate}T${time}:00`, TIMEZONE).toISOString();
}

/**
 * occurred_at の JST カレンダー日付 (YYYY-MM-DD) を取得
 * ※ getOccurredAtDayKey() と違い、生活日オフセットを適用しない
 */
export function getCalendarDateJST(isoString: string): string {
  return formatInTimeZone(parseISO(isoString), TIMEZONE, 'yyyy-MM-dd');
}

/**
 * カレンダー入力で選択できる最大日付を取得
 * 手動日時編集では実カレンダー日付を直接入力するため、常に「今日」までに制限する
 */
export function getMaxCalendarDate(_dayBoundaryHour: number): Date {
  return new Date();
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
 * occurred_at を生活日基準の時刻文字列にフォーマット
 * dayBoundaryHour=5 なら、03:00 → 27:00, 04:59 → 28:59
 */
export function formatTimeWithDayBoundary(isoString: string, dayBoundaryHour: number = 0): string {
  if (dayBoundaryHour === 0) {
    return formatTimeJST(isoString);
  }
  
  const hour = Number(formatInTimeZone(parseISO(isoString), TIMEZONE, 'H'));
  const minute = formatInTimeZone(parseISO(isoString), TIMEZONE, 'mm');
  
  if (hour < dayBoundaryHour) {
    // 区切り時刻未満 → 24+ 表記
    return `${24 + hour}:${minute}`;
  }
  
  return formatTimeJST(isoString);
}

/**
 * occurred_at を JST の日付文字列 (M月d日) にフォーマット
 */
export function formatDateJST(isoString: string): string {
  return formatInTimeZone(parseISO(isoString), TIMEZONE, 'M月d日');
}

/**
 * occurred_at を生活日基準の日付文字列 (M月d日) にフォーマット
 */
export function formatDisplayDateJST(isoString: string, dayBoundaryHour: number = 0): string {
  if (dayBoundaryHour === 0) {
    return formatDateJST(isoString);
  }
  
  const dayKey = getOccurredAtDayKey(isoString, dayBoundaryHour);
  const [y, m, d] = dayKey.split('-').map(Number);
  return `${m}月${d}日`;
}

/**
 * occurred_at を JST の dayKey (YYYY-MM-DD) として取得（生活日基準）
 */
export function getOccurredAtDayKey(isoString: string, dayBoundaryHour: number = 0): string {
  if (dayBoundaryHour === 0) {
    return formatInTimeZone(parseISO(isoString), TIMEZONE, 'yyyy-MM-dd');
  }
  
  // occurred_at から dayBoundaryHour 時間を引いた日付を返す
  const date = parseISO(isoString);
  const shifted = new Date(date.getTime() - dayBoundaryHour * 60 * 60 * 1000);
  return formatInTimeZone(shifted, TIMEZONE, 'yyyy-MM-dd');
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
 * D&D並び替え用: 前後ブロックから中間時刻を計算（生活日境界クランプ付き）
 * 
 * 【D&D例外】この関数のみ UTCミリ秒→ISO 直接生成を許可（READMEに明記）
 * 通常の occurred_at 生成は createOccurredAt() を使うこと
 */
export function calculateMiddleOccurredAt(
  prevOccurredAt: string | null,
  nextOccurredAt: string | null,
  selectedDate: string,
  dayBoundaryHour: number = 0
): MiddleOccurredAtResult {
  // 生活日範囲を取得（dayBoundaryHour 対応）
  const { start, end } = getDateRangeUTC(selectedDate, dayBoundaryHour);
  const startMs = parseISO(start).getTime();
  const endMs = parseISO(end).getTime() - 1; // endは翌日boundary時のので-1ms

  const now = Date.now();
  const fiveMinutesFromNow = now + 5 * 60 * 1000;

  let newMs: number;

  if (prevOccurredAt && nextOccurredAt) {
    const prevMs = parseISO(prevOccurredAt).getTime();
    const nextMs = parseISO(nextOccurredAt).getTime();
    const gap = Math.abs(prevMs - nextMs);
    
    if (gap <= 1) {
      return { success: false, reason: 'この位置には移動できません（時間が詰まりすぎています）' };
    }
    
    newMs = Math.floor((prevMs + nextMs) / 2);
  } else if (nextOccurredAt) {
    const nextMs = parseISO(nextOccurredAt).getTime();
    newMs = nextMs + 1000;
  } else if (prevOccurredAt) {
    const prevMs = parseISO(prevOccurredAt).getTime();
    newMs = prevMs - 1000;
  } else {
    return { success: false, reason: '移動先がありません' };
  }

  // 生活日範囲内にクランプ
  newMs = Math.max(startMs, Math.min(endMs, newMs));

  // 未来チェック
  if (newMs > fiveMinutesFromNow) {
    return { success: false, reason: '未来の日時には移動できません' };
  }

  // D&D例外: UTCミリ秒→ISOで生成
  return { success: true, occurredAt: new Date(newMs).toISOString() };
}
