// Типы для работы с транскрипцией и статьями
export type ArticleStatus = 'опубликовано' | 'готово к публикации';

export interface ArticleRecord {
  id?: number;
  text: string;
  status: ArticleStatus;
  created_at?: string;
}




