export interface RoundedScheduleTime {
  time: string;
  endTime: string;
  startNextDay: boolean;
  endNextDay: boolean;
}

export interface DefaultScheduleState {
  startDate: Date;
  startTime: string;
  endDate: Date;
  endTime: string;
}

export function getRoundedScheduleTime(date: Date): RoundedScheduleTime {
  const hours = date.getHours();
  const minutes = date.getMinutes();

  let roundedHours: number;
  let roundedMinutes: number;

  if (minutes === 0) {
    roundedHours = hours;
    roundedMinutes = 0;
  } else if (minutes <= 30) {
    roundedHours = hours;
    roundedMinutes = 30;
  } else {
    roundedHours = hours + 1;
    roundedMinutes = 0;
  }

  const startNextDay = roundedHours >= 24;
  roundedHours = roundedHours % 24;

  const endRoundedHours = (roundedHours + 1) % 24;
  const endNextDay = roundedHours + 1 >= 24;

  const time = `${String(roundedHours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
  const endTime = `${String(endRoundedHours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;

  return { time, endTime, startNextDay, endNextDay };
}

export function getDefaultScheduleState(now: Date = new Date()): DefaultScheduleState {
  const { time, endTime, startNextDay, endNextDay } = getRoundedScheduleTime(now);

  const startDate = new Date(now);
  if (startNextDay) {
    startDate.setDate(startDate.getDate() + 1);
  }

  const endDate = new Date(startDate);
  if (endNextDay) {
    endDate.setDate(endDate.getDate() + 1);
  }

  return {
    startDate,
    startTime: time,
    endDate,
    endTime,
  };
}

export function buildScheduleDateTime(
  date: Date | undefined,
  time: string,
  allDay: boolean,
): string | null {
  if (!date) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  if (allDay) {
    return `${year}-${month}-${day}T00:00:00.000Z`;
  }

  const [hours, minutes] = time.split(':');
  const localDate = new Date(year, date.getMonth(), date.getDate(), parseInt(hours), parseInt(minutes));
  return localDate.toISOString();
}

export function formatScheduleDateDisplay(date: Date | undefined): string {
  if (!date) return '日付を選択';
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

