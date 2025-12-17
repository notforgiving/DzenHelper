import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Интерфейс для записи поста в таблице post
export interface PostRecord {
  // Идентификатор записи (uuid в базе, строка в коде)
  id: string;
  // Текст поста
  text: string;
  // Время запланированной публикации (ISO-строка)
  publish_at: string;
  // Статус поста
  status: string;
  // Время создания записи (ISO-строка)
  created_at: string;
}

// Класс для работы с Supabase и таблицей post
export class SupabaseService {
  // Приватное поле с экземпляром клиента Supabase
  private client: SupabaseClient | null = null;

  constructor() {
    // Получаем URL Supabase из переменных окружения
    const supabaseUrl = process.env.SUPABASE_URL;
    // Получаем ключ Supabase из переменных окружения
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    // Если хотя бы одной переменной окружения нет, выводим предупреждение и не инициализируем клиент
    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠️ SUPABASE_URL или SUPABASE_ANON_KEY не установлены. Работа с базой данных будет недоступна.');
      return;
    }

    // Создаем клиент Supabase с URL и ключом
    this.client = createClient(supabaseUrl, supabaseKey);
  }

  // Метод для проверки подключения к Supabase
  async checkConnection(): Promise<boolean> {
    // Если клиента нет, сразу возвращаем false
    if (!this.client) {
      return false;
    }

    try {
      // Выполняем простой запрос к таблице post для проверки доступа
      const { error } = await this.client.from('post').select('id').limit(1);
      // Если ошибка отсутствует, считаем подключение успешным
      return !error;
    } catch (error) {
      // Логируем ошибку подключения
      console.error('Ошибка подключения к Supabase:', error);
      // Возвращаем false при любой ошибке
      return false;
    }
  }

  // Метод для получения последнего по времени публикации поста
  async getLastPost(): Promise<PostRecord | null> {
    // Если клиент не инициализирован, выбрасываем ошибку
    if (!this.client) {
      throw new Error('Supabase клиент не инициализирован. Проверьте переменные окружения SUPABASE_URL и SUPABASE_ANON_KEY.');
    }

    try {
      // Делаем запрос к таблице post, сортируем по publish_at по убыванию и берем одну запись
      const { data, error } = await this.client
        .from('post')
        .select('*')
        .order('publish_at', { ascending: false })
        .limit(1);

      // Если Supabase вернул ошибку, пробрасываем её как исключение
      if (error) {
        throw new Error(`Ошибка при получении последнего поста: ${error.message}`);
      }

      // Если данных нет или массив пустой, возвращаем null
      if (!data || data.length === 0) {
        return null;
      }

      // Возвращаем первую (и единственную) запись как PostRecord
      return data[0] as PostRecord;
    } catch (error: any) {
      // Логируем ошибку получения последнего поста
      console.error('Ошибка получения последнего поста:', error);
      // Пробрасываем понятное исключение вверх
      throw new Error(`Не удалось получить последний пост: ${error.message || error}`);
    }
  }

  // Метод для вставки нового поста в таблицу post
  async insertPost(text: string, publishAt: Date): Promise<PostRecord> {
    // Если клиент не инициализирован, выбрасываем ошибку
    if (!this.client) {
      throw new Error('Supabase клиент не инициализирован. Проверьте переменные окружения SUPABASE_URL и SUPABASE_ANON_KEY.');
    }

    try {
      // Формируем объект для вставки в таблицу post
      const insertPayload = {
        // Записываем текст поста
        text: text,
        // Записываем дату публикации как ISO-строку
        publish_at: publishAt.toISOString(),
        // Указываем статус по умолчанию scheduled
        status: 'scheduled',
      };

      // Выполняем вставку записи и сразу запрашиваем обратно вставленную строку
      const { data, error } = await this.client
        .from('post')
        .insert(insertPayload)
        .select()
        .single();

      // Если Supabase вернул ошибку, пробрасываем её как исключение
      if (error) {
        throw new Error(`Ошибка при сохранении поста: ${error.message}`);
      }

      // Если данных не вернулось, считаем, что вставка не удалась
      if (!data) {
        throw new Error('Пост не был сохранен. Данные не получены.');
      }

      // Возвращаем сохраненную запись как PostRecord
      return data as PostRecord;
    } catch (error: any) {
      // Логируем ошибку сохранения поста
      console.error('Ошибка сохранения поста:', error);
      // Пробрасываем понятное исключение вверх
      throw new Error(`Не удалось сохранить пост: ${error.message || error}`);
    }
  }

  // Метод для обновления статуса прошедших постов на опубликовано
  async markPastPostsAsPublished(now: Date = new Date()): Promise<number> {
    // Если клиент не инициализирован, выбрасываем ошибку
    if (!this.client) {
      throw new Error('Supabase клиент не инициализирован. Проверьте переменные окружения SUPABASE_URL и SUPABASE_ANON_KEY.');
    }

    try {
      // Выполняем обновление записей, у которых время публикации меньше или равно текущему
      const { data, error } = await this.client
        .from('post')
        .update({ status: 'опубликовано' })
        .lte('publish_at', now.toISOString())
        .eq('status', 'scheduled')
        .select();

      // Если Supabase вернул ошибку, пробрасываем её как исключение
      if (error) {
        throw new Error(`Ошибка при обновлении статусов постов: ${error.message}`);
      }

      // Если данных нет, считаем, что обновленных записей нет
      if (!data) {
        return 0;
      }

      // Возвращаем количество обновленных записей
      return data.length;
    } catch (error: any) {
      // Логируем ошибку обновления статусов
      console.error('Ошибка обновления статусов постов:', error);
      // Пробрасываем понятное исключение вверх
      throw new Error(`Не удалось обновить статусы постов: ${error.message || error}`);
    }
  }
}


