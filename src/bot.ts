import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { handleStart, handleHelp } from './handlers/commands';
import { handleYouTubeUrl } from './handlers/youtube';
import { VideoDownloader } from './services/downloader';
import { ensureTempDir } from './utils/tempFiles';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN не установлен в переменных окружения!');
  console.error('Создайте файл .env и добавьте TELEGRAM_BOT_TOKEN=your_token_here');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN, {
  handlerTimeout: 1800000, // 30 минут таймаут для обработчиков (для длинных операций)
});

// Инициализация
async function initialize() {
  try {
    await ensureTempDir();
    console.log('✅ Временная директория создана');
  } catch (error) {
    console.error('❌ Ошибка при создании временной директории:', error);
  }
}

// Обработчики команд
bot.command('start', handleStart);
bot.command('help', handleHelp);

// Обработчик текстовых сообщений (YouTube ссылки)
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  
  if (VideoDownloader.isValidYouTubeUrl(text)) {
    await handleYouTubeUrl(ctx, text);
  } else {
    await ctx.reply(
      '❌ Пожалуйста, отправьте валидную ссылку на YouTube видео.\n\n' +
      'Пример: https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    );
  }
});

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error('Ошибка в боте:', err);
  ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
});

// Запуск бота
async function start() {
  await initialize();
  
  console.log('🚀 Запуск Telegram бота...');
  console.log('📋 Убедитесь, что:');
  console.log('   - yt-dlp установлен');
  console.log('   - ffmpeg установлен');
  console.log('   - Ollama запущен локально');
  console.log('   - Модели загружены в Ollama');
  
  bot.launch().then(() => {
    console.log('✅ Бот успешно запущен!');
  }).catch((error) => {
    console.error('❌ Ошибка при запуске бота:', error);
    process.exit(1);
  });
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

start();




