import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Тип статуса статьи
export type ArticleStatus = 'опубликовано' | 'готово к публикации';

// Интерфейс для статьи в базе данных
export interface ArticleRecord {
  id?: number;
  text: string;
  status: ArticleStatus;
  created_at?: string;
}

export class SupabaseService {
  private client: SupabaseClient | null = null;

  constructor() {
    // Получаем URL и ключ из переменных окружения
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    // Проверяем наличие обязательных переменных окружения
    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠️ SUPABASE_URL или SUPABASE_ANON_KEY не установлены. Работа с базой данных будет недоступна.');
      return;
    }

    // Создаем клиент Supabase
    this.client = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Проверяет подключение к Supabase
   */
  async checkConnection(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      // Пробуем выполнить простой запрос для проверки подключения
      const { error } = await this.client.from('articles').select('id').limit(1);
      return !error;
    } catch (error) {
      console.error('Ошибка подключения к Supabase:', error);
      return false;
    }
  }

  /**
   * Сохраняет статью в базу данных
   */
  async saveArticle(text: string, status: ArticleStatus = 'готово к публикации'): Promise<ArticleRecord> {
    if (!this.client) {
      throw new Error('Supabase клиент не инициализирован. Проверьте переменные окружения SUPABASE_URL и SUPABASE_ANON_KEY.');
    }

    try {
      // Вставляем статью в базу данных
      const { data, error } = await this.client
        .from('articles')
        .insert({
          text: text,
          status: status,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Ошибка при сохранении статьи: ${error.message}`);
      }

      if (!data) {
        throw new Error('Статья не была сохранена. Данные не получены.');
      }

      return data as ArticleRecord;
    } catch (error: any) {
      console.error('Ошибка сохранения статьи:', error);
      throw new Error(`Не удалось сохранить статью: ${error.message || error}`);
    }
  }

  /**
   * Получает статью по ID
   */
  async getArticle(id: number): Promise<ArticleRecord | null> {
    if (!this.client) {
      throw new Error('Supabase клиент не инициализирован.');
    }

    try {
      const { data, error } = await this.client
        .from('articles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        throw new Error(`Ошибка при получении статьи: ${error.message}`);
      }

      return data as ArticleRecord | null;
    } catch (error: any) {
      console.error('Ошибка получения статьи:', error);
      throw new Error(`Не удалось получить статью: ${error.message || error}`);
    }
  }

  /**
   * Обновляет статус статьи
   */
  async updateArticleStatus(id: number, status: ArticleStatus): Promise<void> {
    if (!this.client) {
      throw new Error('Supabase клиент не инициализирован.');
    }

    try {
      const { error } = await this.client
        .from('articles')
        .update({ status: status })
        .eq('id', id);

      if (error) {
        throw new Error(`Ошибка при обновлении статуса: ${error.message}`);
      }
    } catch (error: any) {
      console.error('Ошибка обновления статуса:', error);
      throw new Error(`Не удалось обновить статус: ${error.message || error}`);
    }
  }
}

