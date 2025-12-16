# Быстрый старт

## Шаг 1: Установка зависимостей системы

### Windows
1. Установите Python и pip
2. Установите yt-dlp: `pip install yt-dlp`
3. Установите ffmpeg:
   - **Подробная инструкция**: см. файл `INSTALL_FFMPEG_WINDOWS.md`
   - **Кратко**: Скачайте с https://www.gyan.dev/ffmpeg/builds/ → распакуйте → добавьте папку `bin` в PATH
   - **Проверка**: `ffmpeg -version` в командной строке
4. Скачайте Ollama с https://ollama.ai и установите

### Linux/Mac
```bash
# yt-dlp
pip3 install yt-dlp

# ffmpeg
# Linux
sudo apt-get install ffmpeg
# Mac
brew install ffmpeg

# Ollama
# Скачайте с https://ollama.ai
```

## Шаг 2: Настройка Ollama

**Важно**: На Windows Ollama запускается автоматически как служба после установки. 
Не нужно запускать `ollama serve` вручную!

```bash
# Проверьте, что Ollama работает (должен показать список моделей или пустой список)
ollama list

# Загрузите модель (если еще не загружена)
ollama pull llama3

# Проверьте, что модель загружена
ollama list
```

**Если видите ошибку "bind: Only one usage of each socket address"** - это нормально! 
Это означает, что Ollama уже запущен и работает. Просто пропустите команду `ollama serve` и используйте `ollama pull` для загрузки моделей.

## Шаг 3: Настройка проекта

```bash
# Установите зависимости Node.js
npm install

# Создайте файл .env
cp env.example .env

# Отредактируйте .env и добавьте токен бота
# Получите токен у @BotFather в Telegram
```

## Шаг 4: Запуск

```bash
# Режим разработки
npm run dev

# Или соберите и запустите
npm run build
npm start
```

## Шаг 5: Использование

1. Откройте Telegram
2. Найдите вашего бота
3. Отправьте `/start`
4. Отправьте ссылку на YouTube видео
5. Дождитесь результата

## Устранение проблем

### yt-dlp не найден
- Убедитесь, что yt-dlp установлен: `yt-dlp --version`
- Проверьте PATH

### Ошибка скачивания YouTube видео (требует cookies или JS runtime)
- **Подробная инструкция**: см. файл `YT_DLP_SETUP.md`
- Бот автоматически пробует использовать cookies из браузера
- Убедитесь, что Node.js установлен (используется как JavaScript runtime)
- Обновите yt-dlp: `pip install --upgrade yt-dlp`

### ffmpeg не найден
- Убедитесь, что ffmpeg установлен: `ffmpeg -version`
- Проверьте PATH

### Ollama не отвечает
- Проверьте, что Ollama работает: `ollama list`
- Если команда не работает, проверьте, что Ollama установлен и запущен
- На Windows: Ollama должен запускаться автоматически. Если нет, запустите приложение Ollama вручную
- Убедитесь, что модель загружена: `ollama pull llama3`

### Ошибка "bind: Only one usage of each socket address" при запуске ollama serve
- **Это нормально!** Ollama уже запущен и работает
- На Windows Ollama запускается автоматически как служба
- Просто используйте `ollama pull` для загрузки моделей, не нужно запускать `ollama serve`

### Ошибка транскрипции
- Первый запуск загрузит модель Whisper (может занять время)
- Убедитесь, что есть интернет-соединение

### Ошибка генерации изображения
- Проверьте интернет-соединение (Hugging Face API требует интернет)
- При необходимости создайте бесплатный токен на https://huggingface.co

