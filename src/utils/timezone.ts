// Утилиты для работы с московским временем

const MOSCOW_TIMEZONE = 'Europe/Moscow';

/**
 * Получает компоненты даты в московском времени
 */
export function getMoscowDateComponents(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MOSCOW_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => {
    const part = parts.find(p => p.type === type);
    return part ? parseInt(part.value) : 0;
  };
  
  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hour: getPart('hour'),
    minute: getPart('minute'),
    second: getPart('second'),
  };
}

/**
 * Создает Date объект с указанными компонентами московского времени
 * Использует итеративный подход для точного вычисления UTC времени
 */
export function createMoscowDate(
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0
): Date {
  // Начинаем с приблизительной даты (предполагаем UTC+3 для Москвы)
  // С 2014 года Москва всегда UTC+3
  let candidate = new Date(Date.UTC(year, month - 1, day, hour - 3, minute, second));
  
  // Итеративно корректируем до получения правильных компонентов московского времени
  for (let i = 0; i < 10; i++) {
    const components = getMoscowDateComponents(candidate);
    
    // Если компоненты совпадают, возвращаем результат
    if (
      components.year === year &&
      components.month === month &&
      components.day === day &&
      components.hour === hour &&
      components.minute === minute
    ) {
      return candidate;
    }
    
    // Вычисляем разницу в часах и корректируем
    const hourDiff = hour - components.hour;
    // Вычисляем разницу в днях
    const dayDiff = day - components.day;
    
    // Корректируем время с учетом разницы часов
    candidate = new Date(candidate.getTime() + (hourDiff * 60 * 60 * 1000));
    
    // Если разница в днях, корректируем дни более точно
    if (dayDiff !== 0) {
      const currentComponents = getMoscowDateComponents(candidate);
      // Создаем новую дату с правильным днем
      const correctedDay = new Date(Date.UTC(
        currentComponents.year,
        currentComponents.month - 1,
        currentComponents.day + dayDiff,
        currentComponents.hour,
        currentComponents.minute,
        currentComponents.second
      ));
      // Получаем компоненты скорректированной даты в московском времени
      const correctedMoscow = getMoscowDateComponents(correctedDay);
      // Вычисляем смещение для получения правильного дня
      const offsetHours = (day - correctedMoscow.day) * 24 + (hour - correctedMoscow.hour);
      candidate = new Date(correctedDay.getTime() + (offsetHours * 60 * 60 * 1000));
    }
  }
  
  return candidate;
}

/**
 * Форматирует дату в московском времени в читаемый формат
 * @param date Дата для форматирования
 * @returns Отформатированная строка в формате DD.MM.YYYY HH:MM
 */
export function formatMoscowTime(date: Date): string {
  return date.toLocaleString('ru-RU', {
    timeZone: MOSCOW_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

