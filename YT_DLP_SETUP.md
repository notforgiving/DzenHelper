# Настройка yt-dlp для работы с YouTube

## Проблема

YouTube может требовать JavaScript runtime и cookies для скачивания видео. Бот автоматически пробует несколько стратегий, но для лучшей работы рекомендуется настроить cookies.

## Решение 1: Использование cookies из браузера (рекомендуется)

Бот автоматически пытается использовать cookies из браузера Chrome. Если у вас установлен Chrome и вы залогинены в YouTube, это должно работать автоматически.

### Альтернативные браузеры

Если Chrome не установлен, бот попробует использовать другие браузеры в следующем порядке:
- Chrome
- Edge
- Firefox
- Brave

Вы можете изменить приоритет браузеров в коде `src/services/downloader.ts`.

## Решение 2: Ручная настройка cookies

Если автоматическое получение cookies не работает, вы можете экспортировать cookies вручную:

### Шаг 1: Установите расширение для экспорта cookies

1. Установите расширение для браузера:
   - Chrome/Edge: [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpgggdhejndh)
   - Firefox: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

2. Откройте YouTube и войдите в свой аккаунт

3. Экспортируйте cookies в файл `cookies.txt`

4. Сохраните файл в папку проекта

### Шаг 2: Обновите код для использования файла cookies

Откройте `src/services/downloader.ts` и добавьте путь к файлу cookies в первую стратегию:

```typescript
// Вместо
'--cookies-from-browser', 'chrome',

// Используйте
'--cookies', 'cookies.txt',
```

## Решение 3: Установка JavaScript runtime

Бот автоматически использует Node.js как JavaScript runtime. Убедитесь, что Node.js установлен и доступен в PATH.

Проверьте установку:
```bash
node --version
```

Если Node.js не установлен:
1. Скачайте с https://nodejs.org
2. Установите
3. Перезапустите терминал

## Решение 4: Обновление yt-dlp

Убедитесь, что у вас установлена последняя версия yt-dlp:

```bash
pip install --upgrade yt-dlp
```

Или через pipx:
```bash
pipx upgrade yt-dlp
```

## Проверка работы

Проверьте, что yt-dlp работает с YouTube:

```bash
yt-dlp --js-runtimes node "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --list-formats
```

Если команда выполняется без ошибок, значит всё настроено правильно.

## Устранение проблем

### Ошибка "No supported JavaScript runtime"

**Решение:**
- Убедитесь, что Node.js установлен: `node --version`
- Если Node.js установлен, но ошибка остаётся, попробуйте указать полный путь к Node.js в коде

### Ошибка "Sign in to confirm you're not a bot"

**Решение:**
- Используйте cookies из браузера (см. Решение 1)
- Или экспортируйте cookies вручную (см. Решение 2)
- Убедитесь, что вы залогинены в YouTube в браузере

### Ошибка "cookies-from-browser: browser not found"

**Решение:**
- Установите один из поддерживаемых браузеров (Chrome, Edge, Firefox, Brave)
- Или используйте ручной экспорт cookies (см. Решение 2)

### Видео не скачивается

**Решение:**
1. Обновите yt-dlp: `pip install --upgrade yt-dlp`
2. Проверьте интернет-соединение
3. Попробуйте скачать видео вручную через yt-dlp для диагностики
4. Проверьте, не заблокирован ли YouTube в вашей стране/сети

## Дополнительные опции

Вы можете добавить дополнительные опции yt-dlp в код для улучшения работы:

- `--user-agent` - указать User-Agent
- `--referer` - указать Referer
- `--proxy` - использовать прокси

Пример добавления в код:
```typescript
'--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
```

## Дополнительная информация

- Официальная документация yt-dlp: https://github.com/yt-dlp/yt-dlp
- FAQ по cookies: https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp
- Экспорт cookies: https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies




