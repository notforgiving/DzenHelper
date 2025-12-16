import { Context } from 'telegraf';
import { VideoDownloader } from '../services/downloader';
import { Transcriber } from '../services/transcriber';
import { ArticleGenerator } from '../services/article';
import { ImageGenerator } from '../services/image';
import { cleanupFiles } from '../utils/tempFiles';
import { splitMessage } from '../utils/telegram';

export async function handleYouTubeUrl(ctx: Context, url: string) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const tempFiles: string[] = [];
  let statusMessage: any = null;

  try {
    // Отправляем сообщение о начале обработки
    statusMessage = await ctx.reply('🔄 Начинаю обработку видео...');

    // Шаг 1: Получение информации о видео
    await ctx.telegram.editMessageText(
      chatId,
      statusMessage.message_id,
      undefined,
      '📥 Скачиваю аудио...'
    );
    
    const videoInfo = await VideoDownloader.getVideoInfo(url);
    // Оптимизация: скачиваем только аудио вместо всего видео (намного быстрее!)
    const audioFile = await VideoDownloader.downloadAudio(url);
    tempFiles.push(audioFile);

    // Шаг 2: Конвертация аудио в WAV для Whisper
    await ctx.telegram.editMessageText(
      chatId,
      statusMessage.message_id,
      undefined,
      '🎵 Конвертирую аудио...'
    );
    
    const audioPath = await VideoDownloader.extractAudio(audioFile);
    tempFiles.push(audioPath);

    // Шаг 3: Транскрипция
    await ctx.telegram.editMessageText(
      chatId,
      statusMessage.message_id,
      undefined,
      '📝 Создаю транскрипцию...\n⏳ Это может занять несколько минут для длинных видео'
    );
    
    // Обновляем статус каждые 30 секунд во время транскрипции
    const statusInterval = setInterval(async () => {
      try {
        await ctx.telegram.editMessageText(
          chatId,
          statusMessage.message_id,
          undefined,
          '📝 Создаю транскрипцию...\n⏳ Это может занять несколько минут для длинных видео\n🔄 Обработка продолжается...'
        );
      } catch (e) {
        // Игнорируем ошибки обновления статуса
      }
    }, 30000); // Каждые 30 секунд
    
    let transcription: string;
    try {
      // Обертываем транскрипцию в Promise с большим таймаутом (30 минут)
      transcription = await Promise.race([
        Transcriber.transcribe(audioPath),
        new Promise<string>((_, reject) => 
          setTimeout(() => reject(new Error('Transcription timeout after 30 minutes')), 30 * 60 * 1000)
        )
      ]);
    } catch (error: any) {
      clearInterval(statusInterval);
      throw error;
    } finally {
      clearInterval(statusInterval);
    }
    
    if (!transcription || transcription.trim().length === 0) {
      throw new Error('Транскрипция пуста');
    }

    // Шаг 4: Генерация статьи
    await ctx.telegram.editMessageText(
      chatId,
      statusMessage.message_id,
      undefined,
      '✍️ Генерирую статью...'
    );
    
    const articleGenerator = new ArticleGenerator();
    let articleChunks: string[] = [];
    
    const article = await articleGenerator.generateArticleStreaming(
      transcription,
      (chunk) => {
        articleChunks.push(chunk);
      }
    );

    // Шаг 5: Генерация изображения
    await ctx.telegram.editMessageText(
      chatId,
      statusMessage.message_id,
      undefined,
      '🎨 Генерирую изображение...'
    );
    
    const imageGenerator = new ImageGenerator();
    let imagePath: string | undefined;
    
    try {
      imagePath = await imageGenerator.generateImage(article);
      if (imagePath) {
        tempFiles.push(imagePath);
      }
    } catch (imageError: any) {
      console.warn('Image generation failed:', imageError.message);
      // Продолжаем без изображения, если генерация не удалась
    }

    // Шаг 6: Отправка результатов
    await ctx.telegram.editMessageText(
      chatId,
      statusMessage.message_id,
      undefined,
      '📤 Отправляю результаты...'
    );

    // Отправляем статью
    // Используем plain text для избежания проблем с форматированием Markdown
    const articleMessage = `📄 Статья на основе видео:\n\n${article}`;
    
    // Разбиваем длинные сообщения на части (Telegram лимит 4096 символов)
    const chunks = splitMessage(articleMessage, 4000);
    
    for (const chunk of chunks) {
      try {
        await ctx.reply(chunk);
      } catch (error: any) {
        console.error('Error sending article chunk:', error);
        // Пробуем отправить без форматирования
        await ctx.reply(chunk.replace(/📄 Статья на основе видео:\n\n/, ''));
      }
    }

    // Отправляем изображение, если оно было создано
    if (imagePath) {
      try {
        await ctx.replyWithPhoto({ source: imagePath });
      } catch (photoError) {
        console.warn('Failed to send photo:', photoError);
      }
    }

    // Удаляем статус сообщение
    await ctx.telegram.deleteMessage(chatId, statusMessage.message_id);
    
    await ctx.reply('✅ Обработка завершена!');

  } catch (error: any) {
    console.error('Error processing YouTube video:', error);
    
    const errorMessage = `❌ Ошибка при обработке: ${error.message || 'Неизвестная ошибка'}`;
    
    if (statusMessage) {
      await ctx.telegram.editMessageText(
        chatId,
        statusMessage.message_id,
        undefined,
        errorMessage
      );
    } else {
      await ctx.reply(errorMessage);
    }
  } finally {
    // Очищаем временные файлы
    await cleanupFiles(tempFiles);
  }
}




