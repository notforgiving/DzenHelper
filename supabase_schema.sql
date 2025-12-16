-- SQL скрипт для создания таблицы articles в Supabase
-- Выполните этот скрипт в SQL Editor вашего Supabase проекта

-- Создаем таблицу articles
CREATE TABLE IF NOT EXISTS articles (
  id BIGSERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('опубликовано', 'готово к публикации')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создаем индекс для быстрого поиска по статусу
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);

-- Создаем индекс для сортировки по дате создания
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at DESC);

-- Комментарии к колонкам
COMMENT ON TABLE articles IS 'Таблица для хранения статей, сгенерированных ботом';
COMMENT ON COLUMN articles.id IS 'Уникальный идентификатор статьи';
COMMENT ON COLUMN articles.text IS 'Текст статьи';
COMMENT ON COLUMN articles.status IS 'Статус статьи: опубликовано или готово к публикации';
COMMENT ON COLUMN articles.created_at IS 'Дата и время создания записи';

