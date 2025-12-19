import { serve } from 'https://deno.land/std/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Описываем тип для записи поста, чтобы работать строго с полями таблицы post
type PostRecord = {
  // Идентификатор поста
  id: string;
  // Текст поста
  text: string;
  // Время запланированной публикации
  publish_at: string;
  // Статус поста
  status: string;
  // Ссылка на изображение в Google Drive (опционально)
  image_url?: string | null;
};

// Определяем константу с именем таблицы постов в Supabase
const POST_TABLE_NAME = 'post';
// Определяем статус, обозначающий, что пост запланирован, но ещё не опубликован
const STATUS_SCHEDULED = 'scheduled';
// Определяем статус, обозначающий, что пост уже опубликован
const STATUS_PUBLISHED = 'published';

// Определяем URL Telegram Bot API для отправки сообщений
const TELEGRAM_API_BASE = 'https://api.telegram.org';
// Определяем chat_id Telegram‑канала, используя переменную окружения или фиксированное значение по умолчанию
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') ?? '-1003470782884';

// Создаём HTTP‑сервер Edge Function, который будет вызываться по расписанию
serve(async () => {
  // Получаем URL Supabase из переменных окружения
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  // Получаем сервисный ключ Supabase из переменных окружения
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  // Получаем токен Telegram‑бота из переменных окружения
  const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');

  // Если URL, ключ Supabase или токен Telegram‑бота не заданы, возвращаем ошибку конфигурации
  if (!supabaseUrl || !supabaseKey || !telegramToken) {
    // Формируем человекочитаемое описание проблемы конфигурации
    const message = 'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY или TELEGRAM_BOT_TOKEN не заданы в переменных окружения';
    // Логируем ошибку конфигурации в консоль для отладки
    console.error(message);
    // Возвращаем HTTP‑ответ с кодом 500 и сообщением об ошибке
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Создаём клиент Supabase с использованием сервисного ключа
  const supabaseClient = createClient(supabaseUrl, supabaseKey);

  // Получаем текущий момент времени в формате ISO для сравнения с полем publish_at
  const nowIso = new Date().toISOString();

  try {
    // Выполняем запрос к таблице постов для получения всех запланированных постов, срок публикации которых уже наступил
    const { data: posts, error: selectError } = await supabaseClient
      .from<PostRecord>(POST_TABLE_NAME)
      .select('*')
      .lte('publish_at', nowIso)
      .eq('status', STATUS_SCHEDULED);

    // Если при выборке постов произошла ошибка, выбрасываем исключение
    if (selectError) {
      // Формируем текст ошибки выбора данных
      const errorMessage = `Ошибка выборки постов: ${selectError.message}`;
      // Логируем ошибку выборки постов
      console.error(errorMessage);
      // Возвращаем HTTP‑ответ с кодом 500 и деталями ошибки
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Если подходящих постов нет, возвращаем успешный ответ с нулевыми счетчиками
    if (!posts || posts.length === 0) {
      // Формируем тело ответа о том, что нечего публиковать
      const body = {
        publishedCount: 0,
        failedCount: 0,
        message: 'Нет постов для публикации',
      };
      // Возвращаем HTTP‑ответ с кодом 200 и телом результата
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Инициализируем счётчик успешно опубликованных постов
    let publishedCount = 0;
    // Инициализируем счётчик неудачных попыток публикации
    let failedCount = 0;

    // Перебираем каждый выбранный пост для публикации
    for (const post of posts) {
      // Пытаемся опубликовать пост и обновить его статус
      const wasPublished = await publishPostAndUpdateStatus(
        supabaseClient,
        telegramToken,
        post,
      );

      // Если публикация прошла успешно, увеличиваем счётчик успешных публикаций
      if (wasPublished) {
        // Увеличиваем количество успешно опубликованных постов
        publishedCount += 1;
      } else {
        // Иначе увеличиваем количество неудачных попыток публикации
        failedCount += 1;
      }
    }

    // Формируем итоговый JSON‑ответ с количеством успешных и неуспешных публикаций
    const resultBody = {
      publishedCount,
      failedCount,
    };

    // Возвращаем HTTP‑ответ с кодом 200 и телом результата
    return new Response(JSON.stringify(resultBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    // Если при выполнении основного блока логики произошла ошибка, логируем её
    console.error('Непредвиденная ошибка в функции autopost:', error);
    // Возвращаем HTTP‑ответ с кодом 500 и кратким описанием ошибки
    return new Response(
      JSON.stringify({ error: 'Внутренняя ошибка функции autopост' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
});

// Объявляем функцию, которая публикует один пост в Telegram и при успехе обновляет статус в Supabase
async function publishPostAndUpdateStatus(
  supabaseClient: ReturnType<typeof createClient>,
  telegramToken: string,
  post: PostRecord,
): Promise<boolean> {
  // Определяем, есть ли ссылка на изображение
  const hasImage = post.image_url && post.image_url.trim().length > 0;
  
  // Если есть ссылка на изображение, отправляем фото с текстом
  // Иначе отправляем просто текст
  const sent = hasImage
    ? await sendTelegramPhoto(telegramToken, TELEGRAM_CHAT_ID, post.text, post.image_url!)
    : await sendTelegramMessage(telegramToken, TELEGRAM_CHAT_ID, post.text);

  // Если отправка завершилась неудачно, возвращаем false, не меняя статус поста
  if (!sent) {
    // Логируем, что статус поста не был изменён из-за ошибки отправки
    console.error(`Не удалось отправить пост с id=${post.id}, статус не изменён`);
    // Возвращаем флаг неуспешной публикации
    return false;
  }

  // Выполняем обновление статуса поста в базе данных на опубликованный
  const { error: updateError } = await supabaseClient
    .from<PostRecord>(POST_TABLE_NAME)
    .update({ status: STATUS_PUBLISHED })
    .eq('id', post.id);

  // Если при обновлении статуса произошла ошибка, логируем её и возвращаем false
  if (updateError) {
    // Логируем ошибку обновления статуса поста после успешной отправки в Telegram
    console.error(
      `Ошибка обновления статуса поста c id=${post.id}: ${updateError.message}`,
    );
    // Возвращаем флаг неуспешного завершения полного цикла публикации
    return false;
  }

  // Если отправка и обновление статуса прошли успешно, возвращаем true
  return true;
}

// Объявляем функцию для отправки текстового сообщения в Telegram‑канал
async function sendTelegramMessage(
  telegramToken: string,
  chatId: string,
  text: string,
): Promise<boolean> {
  // Строим URL для метода отправки сообщения Telegram Bot API
  const url = `${TELEGRAM_API_BASE}/bot${telegramToken}/sendMessage`;

  try {
    // Подготавливаем тело запроса с указанием chat_id и текста сообщения
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    };

    // Выполняем HTTP‑запрос к Telegram Bot API методом POST с JSON‑телом
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // Если HTTP‑статус не в диапазоне успешных, логируем ошибку и возвращаем false
    if (!response.ok) {
      // Читаем тело ответа для более подробной диагностики
      const errorText = await response.text();
      // Логируем код статуса и текст ошибки от Telegram
      console.error(
        `Ошибка Telegram API: status=${response.status}, body=${errorText}`,
      );
      // Возвращаем флаг неуспешной отправки
      return false;
    }

    // Если ответ успешный, считаем, что сообщение отправлено, и возвращаем true
    return true;
  } catch (error) {
    // В случае сетевой или другой непредвиденной ошибки логируем исключение
    console.error('Ошибка при отправке сообщения в Telegram:', error);
    // Возвращаем флаг неуспешной отправки
    return false;
  }
}

// Объявляем функцию для отправки фото с текстом в Telegram‑канал
async function sendTelegramPhoto(
  telegramToken: string,
  chatId: string,
  caption: string,
  imageUrl: string,
): Promise<boolean> {
  try {
    // Преобразуем ссылку Google Drive в прямую ссылку для скачивания
    // Формат ссылки Google Drive: https://drive.google.com/file/d/FILE_ID/view
    // Преобразуем в: https://drive.google.com/uc?export=download&id=FILE_ID
    let downloadUrl = imageUrl;
    
    // Извлекаем ID файла из ссылки Google Drive
    const fileIdMatch = imageUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
      const fileId = fileIdMatch[1];
      // Формируем прямую ссылку для скачивания
      downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    }

    // Скачиваем изображение
    const imageResponse = await fetch(downloadUrl);
    if (!imageResponse.ok) {
      console.error(`Не удалось скачать изображение: ${imageResponse.statusText}`);
      return false;
    }

    // Получаем изображение как массив байтов
    const imageBytes = await imageResponse.arrayBuffer();
    
    // Создаем FormData для отправки фото
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
    
    // Добавляем фото как blob в FormData
    // В Deno FormData принимает Blob напрямую
    const imageBlob = new Blob([imageBytes], { type: imageResponse.headers.get('content-type') || 'image/jpeg' });
    formData.append('photo', imageBlob, 'image.jpg');

    // Строим URL для метода отправки фото Telegram Bot API
    const url = `${TELEGRAM_API_BASE}/bot${telegramToken}/sendPhoto`;

    // Выполняем HTTP‑запрос к Telegram Bot API методом POST с FormData
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    // Если HTTP‑статус не в диапазоне успешных, логируем ошибку и возвращаем false
    if (!response.ok) {
      // Читаем тело ответа для более подробной диагностики
      const errorText = await response.text();
      // Логируем код статуса и текст ошибки от Telegram
      console.error(
        `Ошибка Telegram API при отправке фото: status=${response.status}, body=${errorText}`,
      );
      // Возвращаем флаг неуспешной отправки
      return false;
    }

    // Если ответ успешный, считаем, что фото отправлено, и возвращаем true
    return true;
  } catch (error) {
    // В случае сетевой или другой непредвиденной ошибки логируем исключение
    console.error('Ошибка при отправке фото в Telegram:', error);
    // Возвращаем флаг неуспешной отправки
    return false;
  }
}


