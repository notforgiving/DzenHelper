/**
 * Утилиты для безопасной отправки сообщений в Telegram
 */

/**
 * Экранирует специальные символы Markdown для безопасной отправки
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\~/g, '\\~')
    .replace(/\`/g, '\\`')
    .replace(/\>/g, '\\>')
    .replace(/\#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/\-/g, '\\-')
    .replace(/\=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/\!/g, '\\!');
}

/**
 * Экранирует специальные символы HTML для безопасной отправки
 */
export function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Разбивает текст на части для отправки (Telegram лимит 4096 символов)
 */
export function splitMessage(text: string, maxLength: number = 4000): string[] {
  const chunks: string[] = [];
  let offset = 0;
  
  while (offset < text.length) {
    const chunk = text.substring(offset, offset + maxLength);
    chunks.push(chunk);
    offset += maxLength;
  }
  
  return chunks;
}

import { Markup } from 'telegraf';

/**
 * Создает постоянную клавиатуру с кнопками команд
 */
export function getMainKeyboard() {
  return Markup.keyboard([
    ['📋 Помощь', '🚀 Начать обработку'],
    ['❌ Отменить сессию']
  ])
    .resize() // Кнопки будут автоматически подстраиваться под размер экрана
    .persistent(); // Клавиатура будет оставаться видимой
}

/**
 * Создает скрытую клавиатуру (убирает постоянную клавиатуру)
 */
export function getRemoveKeyboard() {
  return {
    remove_keyboard: true,
  };
}



