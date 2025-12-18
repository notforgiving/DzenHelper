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

  // Метод для получения расписания запланированных постов, начиная с текущего момента
  async getScheduledPosts(now: Date = new Date()): Promise<PostRecord[]> {
    // Если клиент не инициализирован, выбрасываем ошибку
    if (!this.client) {
      throw new Error('Supabase клиент не инициализирован. Проверьте переменные окружения SUPABASE_URL и SUPABASE_ANON_KEY.');
    }

    try {
      // Выполняем запрос к таблице post для получения всех постов со статусом scheduled
      const { data, error } = await this.client
        .from('post')
        // Выбираем все поля записи
        .select('*')
        // Ограничиваем выборку постами, запланированными на текущее или будущее время
        .gte('publish_at', now.toISOString())
        // Фильтруем только посты в статусе scheduled
        .eq('status', 'scheduled')
        // Сортируем по времени публикации по возрастанию (от ближайших к более поздним)
        .order('publish_at', { ascending: true });

      // Если Supabase вернул ошибку, пробрасываем её как исключение
      if (error) {
        throw new Error(`Ошибка при получении расписания постов: ${error.message}`);
      }

      // Если данных нет, возвращаем пустой массив как отсутствие запланированных постов
      if (!data) {
        return [];
      }

      // Возвращаем список запланированных постов как массив PostRecord
      return data as PostRecord[];
    } catch (error: any) {
      // Логируем ошибку получения расписания
      console.error('Ошибка получения расписания постов:', error);
      // Пробрасываем понятное исключение вверх
      throw new Error(`Не удалось получить расписание постов: ${error.message || error}`);
    }
  }

  // Метод для получения часов расписания публикаций из таблицы schedule_hours
  async getScheduleHours(): Promise<number[]> {
    // Если клиент не инициализирован, выбрасываем ошибку
    if (!this.client) {
      throw new Error('Supabase клиент не инициализирован. Проверьте переменные окружения SUPABASE_URL и SUPABASE_ANON_KEY.');
    }

    try {
      // Выполняем запрос к таблице schedule_hours и сортируем часы по возрастанию
      const { data, error } = await this.client
        .from('schedule_hours')
        .select('hour')
        .order('hour', { ascending: true });

      // Если Supabase вернул ошибку, пробрасываем её как исключение
      if (error) {
        throw new Error(`Ошибка при получении часов расписания: ${error.message}`);
      }

      // Если данных нет или массив пустой, возвращаем дефолтные часы расписания
      if (!data || data.length === 0) {
        return [10, 15, 18];
      }

      // Преобразуем записи в массив чисел-часов и возвращаем его
      return data.map((row: any) => row.hour as number);
    } catch (error: any) {
      // Логируем ошибку получения часов расписания
      console.error('Ошибка получения часов расписания публикаций:', error);
      // Пробрасываем понятное исключение вверх
      throw new Error(`Не удалось получить часы расписания публикаций: ${error.message || error}`);
    }
  }

  // Метод для полной перезаписи часов расписания публикаций в таблице schedule_hours
  async replaceScheduleHours(hours: number[]): Promise<void> {
    // Если клиент не инициализирован, выбрасываем ошибку
    if (!this.client) {
      throw new Error('Supabase клиент не инициализирован. Проверьте переменные окружения SUPABASE_URL и SUPABASE_ANON_KEY.');
    }

    try {
      // Удаляем все существующие записи из таблицы schedule_hours
      const { error: deleteError } = await this.client
        .from('schedule_hours')
        .delete()
        .gte('hour', 0);

      // Если при удалении произошла ошибка, пробрасываем её как исключение
      if (deleteError) {
        throw new Error(`Ошибка при очистке часов расписания: ${deleteError.message}`);
      }

      // Формируем массив записей для вставки на основе переданных часов
      const rows = hours.map((hour) => ({ hour }));

      // Вставляем новые часы расписания в таблицу schedule_hours
      const { error: insertError } = await this.client
        .from('schedule_hours')
        .insert(rows);

      // Если при вставке произошла ошибка, пробрасываем её как исключение
      if (insertError) {
        throw new Error(`Ошибка при сохранении часов расписания: ${insertError.message}`);
      }
    } catch (error: any) {
      // Логируем ошибку обновления часов расписания
      console.error('Ошибка обновления часов расписания публикаций:', error);
      // Пробрасываем понятное исключение вверх
      throw new Error(`Не удалось обновить часы расписания публикаций: ${error.message || error}`);
    }
  }
}


