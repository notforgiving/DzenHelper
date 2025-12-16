import { Context } from 'telegraf';
import { ArticleGenerator } from '../services/article';
import { ImageGenerator } from '../services/image';
import { SupabaseService } from '../services/supabase';
import { ARTICLE_PROMPT, IMAGE_PROMPT } from '../prompts';
import { splitMessage, getMainKeyboard } from '../utils/telegram';

// Хранилище транскрипций по chatId
interface TranscriptionSession {
  chatId: number;
  userId: number;
  messages: string[];
  statusMessageId?: number;
  lastUpdate: number;
  timeoutId?: NodeJS.Timeout; // ID таймера для автоматического завершения
  ctx?: Context; // Сохраняем контекст для автоматической обработки
}

// Хранилище активных сессий транскрипции
const transcriptionSessions = new Map<number, TranscriptionSession>();

// Таймаут для автоматического завершения сессии (5 секунд бездействия)
const AUTO_FINISH_TIMEOUT = 5 * 1000; // 5 секунд

// Максимальное время жизни сессии (5 минут)
const MAX_SESSION_LIFETIME = 5 * 60 * 1000;

/**
 * Запускает таймер автоматического завершения сессии
 */
function scheduleAutoFinish(session: TranscriptionSession): void {
  // Очищаем предыдущий таймер, если он есть
  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
  }

  // Устанавливаем новый таймер
  session.timeoutId = setTimeout(async () => {
    // Проверяем, что сессия все еще существует и не была обработана
    const currentSession = transcriptionSessions.get(session.chatId);
    if (!currentSession || currentSession !== session) {
      return;
    }

    // Проверяем, что есть сообщения для обработки
    if (session.messages.length === 0) {
      return;
    }

    // Удаляем сессию из хранилища
    transcriptionSessions.delete(session.chatId);

    // Объединяем все сообщения в одну транскрипцию
    const fullTranscription = session.messages.join('\n\n');

    // Обновляем статусное сообщение о начале автоматической обработки
    if (session.statusMessageId && session.ctx) {
      try {
        await session.ctx.telegram.editMessageText(
          session.chatId,
          session.statusMessageId,
          undefined,
          `⏱️ Не получено новых сообщений 5 секунд. Начинаю обработку автоматически...`
        ).catch(() => {
          // Игнорируем ошибки редактирования - обработка продолжится с новым сообщением
        });
      } catch (error) {
        // Игнорируем ошибки редактирования - обработка продолжится
      }
    }

    // Начинаем обработку
    if (session.ctx) {
      await processTranscription(session.ctx, fullTranscription, session.statusMessageId);
    }
  }, AUTO_FINISH_TIMEOUT);
}

/**
 * Обрабатывает текстовое сообщение как часть транскрипции
 */
export async function handleTranscriptionMessage(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  
  // Проверяем, что сообщение существует и является текстовым
  if (!ctx.message || !('text' in ctx.message)) {
    return;
  }
  
  const messageText = ctx.message.text;

  if (!chatId || !userId || !messageText) {
    return;
  }

  // Получаем или создаем сессию для этого пользователя
  let session = transcriptionSessions.get(chatId);

  // Если сессии нет или она устарела, создаем новую
  if (!session || Date.now() - session.lastUpdate > MAX_SESSION_LIFETIME) {
    // Очищаем старый таймер, если он есть
    if (session?.timeoutId) {
      clearTimeout(session.timeoutId);
    }

    session = {
      chatId,
      userId,
      messages: [],
      lastUpdate: Date.now(),
      ctx: ctx,
    };
    transcriptionSessions.set(chatId, session);
  } else {
    // Обновляем контекст в существующей сессии
    session.ctx = ctx;
  }

  // Добавляем сообщение в сессию
  session.messages.push(messageText);
  session.lastUpdate = Date.now();

  // Запускаем таймер автоматического завершения
  scheduleAutoFinish(session);

  // Отправляем подтверждение получения сообщения
  const confirmationMessage = await ctx.reply(
    `✅ Получено сообщение ${session.messages.length}.\n\n` +
    `Обработка начнется автоматически через 5 секунд после последнего сообщения.\n` +
    `Или нажмите кнопку "🚀 Начать обработку" для немедленного начала.`,
    getMainKeyboard()
  );

  // Обновляем или создаем статусное сообщение
  if (session.statusMessageId) {
    try {
      await ctx.telegram.editMessageText(
        chatId,
        session.statusMessageId,
        undefined,
        `📝 Собрано сообщений: ${session.messages.length}\n\n` +
        `⏱️ Обработка начнется автоматически через 5 секунд бездействия.\n` +
        `Или нажмите кнопку "🚀 Начать обработку" для немедленного начала.`
      );
    } catch (error) {
      // Игнорируем ошибки редактирования
    }
  } else {
    const statusMessage = await ctx.reply(
      `📝 Собрано сообщений: ${session.messages.length}\n\n` +
      `⏱️ Обработка начнется автоматически через 30 секунд бездействия.\n` +
      `Или нажмите кнопку "🚀 Начать обработку" для немедленного начала.`,
      getMainKeyboard()
    );
    session.statusMessageId = statusMessage.message_id;
  }

  // Удаляем подтверждение через 3 секунды
  setTimeout(async () => {
    try {
      await ctx.telegram.deleteMessage(chatId, confirmationMessage.message_id);
    } catch (error) {
      // Игнорируем ошибки удаления
    }
  }, 3000);
}

/**
 * Завершает сбор транскрипции и начинает обработку
 */
export async function handleFinishTranscription(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;

  if (!chatId || !userId) {
    return;
  }

  // Получаем сессию
  const session = transcriptionSessions.get(chatId);

  if (!session || session.messages.length === 0) {
    await ctx.reply(
      '❌ Нет собранных сообщений транскрипции.\n\nОтправьте текст транскрипции сообщениями. Обработка начнется автоматически через 5 секунд после последнего сообщения.',
      getMainKeyboard()
    );
    return;
  }

  // Очищаем таймер автоматического завершения
  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
    session.timeoutId = undefined;
  }

  // Объединяем все сообщения в одну транскрипцию
  const fullTranscription = session.messages.join('\n\n');

  // Удаляем сессию
  transcriptionSessions.delete(chatId);

    // Обновляем статусное сообщение
    if (session.statusMessageId) {
      try {
        await ctx.telegram.editMessageText(
          chatId,
          session.statusMessageId,
          undefined,
          '🚀 Начинаю обработку...'
        );
      } catch (error) {
        // Игнорируем ошибки редактирования
      }
    }

  // Начинаем обработку
  await processTranscription(ctx, fullTranscription, session.statusMessageId);
}

/**
 * Безопасно редактирует сообщение или отправляет новое, если редактирование не удается
 */
async function safeEditMessage(
  ctx: Context,
  messageId: number | undefined,
  text: string
): Promise<number> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    throw new Error('Chat ID не найден');
  }

  // Если messageId не передан, отправляем новое сообщение
  if (!messageId) {
    const newMessage = await ctx.reply(text);
    return newMessage.message_id;
  }

  // Пытаемся отредактировать сообщение
  try {
    await ctx.telegram.editMessageText(chatId, messageId, undefined, text);
    return messageId;
  } catch (error: any) {
    // Если редактирование не удалось, отправляем новое сообщение
    console.warn(`Не удалось отредактировать сообщение ${messageId}, отправляю новое:`, error.message);
    try {
      // Пытаемся удалить старое сообщение
      await ctx.telegram.deleteMessage(chatId, messageId).catch(() => {
        // Игнорируем ошибки удаления
      });
    } catch (deleteError) {
      // Игнорируем ошибки удаления
    }
    const newMessage = await ctx.reply(text);
    return newMessage.message_id;
  }
}

/**
 * Обрабатывает транскрипцию: генерирует статью, изображение и сохраняет в БД
 */
async function processTranscription(
  ctx: Context,
  transcription: string,
  statusMessageId?: number
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  try {
    // Обновляем статус - начало обработки
    statusMessageId = await safeEditMessage(
      ctx,
      statusMessageId,
      '🔄 Начинаю обработку транскрипции...'
    );

    // Шаг 1: Генерация статьи
    statusMessageId = await safeEditMessage(
      ctx,
      statusMessageId,
      '✍️ Генерирую статью на основе транскрипции...'
    );

    const articleGenerator = new ArticleGenerator();
    const article = await articleGenerator.generateArticleStreaming(
      transcription,
      () => {
        // Callback для стриминга (можно использовать для обновления статуса)
      },
      ARTICLE_PROMPT
    );

    if (!article || article.trim().length === 0) {
      throw new Error('Не удалось сгенерировать статью');
    }

    // Шаг 2: Генерация изображения
    statusMessageId = await safeEditMessage(
      ctx,
      statusMessageId,
      '🎨 Генерирую изображение для статьи...'
    );

    const imageGenerator = new ImageGenerator();
    let imagePath: string | undefined;

    try {
      imagePath = await imageGenerator.generateImage(article, IMAGE_PROMPT);
    } catch (imageError: any) {
      console.warn('Ошибка генерации изображения:', imageError.message);
      // Продолжаем без изображения, если генерация не удалась
    }

    // Шаг 3: Сохранение в базу данных
    statusMessageId = await safeEditMessage(
      ctx,
      statusMessageId,
      '💾 Сохраняю статью в базу данных...'
    );

    const supabaseService = new SupabaseService();
    const savedArticle = await supabaseService.saveArticle(article, 'готово к публикации');

    // Шаг 4: Отправка результатов
    statusMessageId = await safeEditMessage(
      ctx,
      statusMessageId,
      '📤 Отправляю результаты...'
    );

    // Отправляем статью
    const articleMessage = `📄 Сгенерированная статья:\n\n${article}`;
    const chunks = splitMessage(articleMessage, 4000);

    for (const chunk of chunks) {
      try {
        await ctx.reply(chunk);
      } catch (error: any) {
        console.error('Ошибка отправки части статьи:', error);
      }
    }

    // Отправляем изображение, если оно было создано
    if (imagePath) {
      try {
        await ctx.replyWithPhoto({ source: imagePath });
      } catch (photoError) {
        console.warn('Ошибка отправки изображения:', photoError);
      }
    }

    // Отправляем информацию о сохранении
    await ctx.reply(
      `✅ Статья успешно сохранена в базу данных!\n\n` +
      `ID статьи: ${savedArticle.id}\n` +
      `Статус: ${savedArticle.status}\n` +
      `Дата создания: ${savedArticle.created_at ? new Date(savedArticle.created_at).toLocaleString('ru-RU') : 'не указана'}`,
      getMainKeyboard()
    );

    // Удаляем статусное сообщение
    if (statusMessageId) {
      try {
        await ctx.telegram.deleteMessage(chatId, statusMessageId);
      } catch (error) {
        // Игнорируем ошибки удаления
      }
    }
  } catch (error: any) {
    console.error('Ошибка обработки транскрипции:', error);

    const errorMessage = `❌ Ошибка при обработке: ${error.message || 'Неизвестная ошибка'}`;

    // Используем безопасное редактирование для сообщения об ошибке
    try {
      await safeEditMessage(ctx, statusMessageId, errorMessage);
      // Отправляем клавиатуру отдельным сообщением
      await ctx.reply('Используйте кнопки ниже для продолжения работы.', getMainKeyboard());
    } catch (error) {
      // Если даже безопасное редактирование не сработало, просто отправляем новое сообщение
      await ctx.reply(errorMessage, getMainKeyboard());
    }
  }
}

/**
 * Очищает сессию транскрипции для пользователя
 */
export function clearTranscriptionSession(chatId: number): void {
  const session = transcriptionSessions.get(chatId);
  
  // Очищаем таймер, если он есть
  if (session?.timeoutId) {
    clearTimeout(session.timeoutId);
  }
  
  transcriptionSessions.delete(chatId);
}

