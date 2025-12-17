// Тип статуса поста в таблице post
export type PostStatus = 'scheduled' | 'published';

// Интерфейс для записи поста в таблице post
export interface PostRecord {
  // Идентификатор поста (uuid в базе, строка в коде)
  id: string;
  // Текст поста
  text: string;
  // Время запланированной публикации (ISO-строка)
  publish_at: string;
  // Статус поста
  status: PostStatus;
  // Время создания записи (ISO-строка)
  created_at: string;
}

