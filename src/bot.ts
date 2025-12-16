import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { handleStart, handleHelp, handleCancel } from './handlers/commands';
import { handleTranscriptionMessage, handleFinishTranscription } from './handlers/transcription';
import { ensureTempDir } from './utils/tempFiles';
import { SupabaseService } from './services/supabase';

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
    // Создаем временную директорию для изображений
    await ensureTempDir();
    console.log('✅ Временная директория создана');
  } catch (error) {
    console.error('❌ Ошибка при создании временной директории:', error);
  }

  // Проверяем подключение к Supabase
  try {
    const supabaseService = new SupabaseService();
    const isConnected = await supabaseService.checkConnection();
    if (isConnected) {
      console.log('✅ Подключение к Supabase установлено');
    } else {
      console.warn('⚠️ Не удалось подключиться к Supabase. Проверьте переменные окружения SUPABASE_URL и SUPABASE_ANON_KEY');
    }
  } catch (error) {
    console.warn('⚠️ Ошибка при проверке подключения к Supabase:', error);
  }
}

// Обработчики команд
bot.command('start', handleStart);
bot.command('help', handleHelp);
bot.command('finish', handleFinishTranscription);
bot.command('cancel', handleCancel);

// Обработчик текстовых сообщений (транскрипция и кнопки)
bot.on('text', async (ctx) => {
  // Проверяем, что сообщение существует и является текстовым
  if (!ctx.message || !('text' in ctx.message)) {
    return;
  }
  
  const text = ctx.message.text;
  
  // Игнорируем команды (они обрабатываются отдельными обработчиками)
  if (text.startsWith('/')) {
    return;
  }
  
  // Обрабатываем нажатия на кнопки клавиатуры
  if (text === '📋 Помощь') {
    await handleHelp(ctx);
    return;
  }
  
  if (text === '🚀 Начать обработку') {
    await handleFinishTranscription(ctx);
    return;
  }
  
  if (text === '❌ Отменить сессию') {
    await handleCancel(ctx);
    return;
  }
  
  // Обрабатываем как сообщение транскрипции
  await handleTranscriptionMessage(ctx);
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
  console.log('   - Ollama запущен локально');
  console.log('   - Модели загружены в Ollama');
  console.log('   - Supabase настроен (SUPABASE_URL и SUPABASE_ANON_KEY в .env)');
  
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




