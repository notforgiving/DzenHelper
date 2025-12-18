-- SQL скрипт для создания/обновления таблицы post в Supabase
-- Выполните этот скрипт в SQL Editor вашего Supabase проекта

-- Создаем таблицу post, если её еще нет
CREATE TABLE IF NOT EXISTS post (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  publish_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'published')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  image_url TEXT
);

-- Добавляем поле image_url, если таблица уже существует и поле отсутствует
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'post' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE post ADD COLUMN image_url TEXT;
  END IF;
END $$;

-- Создаем индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_post_status ON post(status);
CREATE INDEX IF NOT EXISTS idx_post_publish_at ON post(publish_at);
CREATE INDEX IF NOT EXISTS idx_post_created_at ON post(created_at DESC);

-- Комментарии к колонкам
COMMENT ON TABLE post IS 'Таблица для хранения постов с расписанием публикации';
COMMENT ON COLUMN post.id IS 'Уникальный идентификатор поста';
COMMENT ON COLUMN post.text IS 'Текст поста';
COMMENT ON COLUMN post.publish_at IS 'Дата и время запланированной публикации';
COMMENT ON COLUMN post.status IS 'Статус поста: scheduled или published';
COMMENT ON COLUMN post.created_at IS 'Дата и время создания записи';
COMMENT ON COLUMN post.image_url IS 'Ссылка на изображение в Google Drive (опционально)';

