import { Ollama } from 'ollama';

export class ArticleGenerator {
  private ollama: Ollama;
  private model: string;
  private apiUrl: string;

  constructor() {
    this.apiUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_TEXT_MODEL || 'llama3';
    // Увеличиваем таймауты для больших промптов
    this.ollama = new Ollama({ 
      host: this.apiUrl
    });
  }

  /**
   * Проверяет доступность Ollama API
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.ollama.list();
      return true;
    } catch (error) {
      return false;
    }
  }

  async generateArticle(transcription: string, customPrompt?: string): Promise<string> {
    // Проверяем подключение к Ollama перед генерацией
    const isConnected = await this.checkConnection();
    if (!isConnected) {
      throw new Error(
        `Не удается подключиться к Ollama по адресу ${this.apiUrl}. ` +
        `Убедитесь, что Ollama запущен и доступен.`
      );
    }

    const defaultPrompt = process.env.ARTICLE_PROMPT || 
      'Создай статью на основе следующей транскрипции видео. Статья должна быть структурированной, интересной и информативной.';
    
    const prompt = customPrompt || defaultPrompt;
    
    // Ограничиваем длину транскрипции
    const maxTranscriptionLength = 8000;
    const truncatedTranscription = transcription.length > maxTranscriptionLength 
      ? transcription.substring(0, maxTranscriptionLength) + '...'
      : transcription;
    
    const fullPrompt = `${prompt}\n\nТранскрипция:\n${truncatedTranscription}`;

    try {
      const response = await this.ollama.generate({
        model: this.model,
        prompt: fullPrompt,
        stream: false,
      });

      return response.response.trim();
    } catch (error: any) {
      if (error.message?.includes('fetch failed') || error.code === 'ECONNREFUSED') {
        throw new Error(
          `Не удается подключиться к Ollama по адресу ${this.apiUrl}. ` +
          `Убедитесь, что Ollama запущен: ollama serve`
        );
      } else if (error.message?.includes('model') || error.message?.includes('not found')) {
        throw new Error(
          `Модель "${this.model}" не найдена. Загрузите модель командой: ollama pull ${this.model}`
        );
      } else {
        throw new Error(`Article generation failed: ${error.message || error}`);
      }
    }
  }

  async generateArticleStreaming(
    transcription: string,
    onChunk: (chunk: string) => void,
    customPrompt?: string
  ): Promise<string> {
    // Проверяем подключение к Ollama перед генерацией
    const isConnected = await this.checkConnection();
    if (!isConnected) {
      throw new Error(
        `Не удается подключиться к Ollama по адресу ${this.apiUrl}. ` +
        `Убедитесь, что Ollama запущен и доступен. ` +
        `Проверьте командой: ollama list`
      );
    }

    const defaultPrompt = process.env.ARTICLE_PROMPT || 
      'Создай статью на основе следующей транскрипции видео. Статья должна быть структурированной, интересной и информативной.';
    
    const prompt = customPrompt || defaultPrompt;
    
    // Ограничиваем длину транскрипции для промпта (Ollama может иметь лимиты)
    const maxTranscriptionLength = 8000; // Примерно 8000 символов
    const truncatedTranscription = transcription.length > maxTranscriptionLength 
      ? transcription.substring(0, maxTranscriptionLength) + '...'
      : transcription;
    
    const fullPrompt = `${prompt}\n\nТранскрипция:\n${truncatedTranscription}`;

    let fullArticle = '';

    // Пробуем несколько раз с экспоненциальной задержкой
    const maxRetries = 3;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Generating article with model: ${this.model} (attempt ${attempt}/${maxRetries})`);
        console.log(`Prompt length: ${fullPrompt.length} characters`);
        
        const response = await this.ollama.generate({
          model: this.model,
          prompt: fullPrompt,
          stream: true,
        });

        for await (const chunk of response) {
          const text = chunk.response || '';
          fullArticle += text;
          onChunk(text);
        }

        return fullArticle.trim();
      } catch (error: any) {
        lastError = error;
        console.error(`Ollama error (attempt ${attempt}/${maxRetries}):`, error);
        
        // Если это таймаут или ошибка подключения, пробуем еще раз
        if (attempt < maxRetries && (
          error.message?.includes('Timeout') || 
          error.message?.includes('fetch failed') || 
          error.code === 'ECONNREFUSED' ||
          error.code === 'UND_ERR_HEADERS_TIMEOUT'
        )) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Экспоненциальная задержка, макс 10 сек
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Если это последняя попытка или другая ошибка, выбрасываем исключение
        break;
      }
    }

    // Более детальная обработка ошибок
    if (lastError?.message?.includes('Timeout') || lastError?.code === 'UND_ERR_HEADERS_TIMEOUT') {
      throw new Error(
        `Ollama не отвечает в течение таймаута. ` +
        `Возможно, модель "${this.model}" слишком медленная или промпт слишком большой. ` +
        `Попробуйте использовать более легкую модель или уменьшить длину транскрипции.`
      );
    } else if (lastError?.message?.includes('fetch failed') || lastError?.code === 'ECONNREFUSED') {
      throw new Error(
        `Не удается подключиться к Ollama по адресу ${this.apiUrl}. ` +
        `Убедитесь, что Ollama запущен: проверьте командой "ollama list" или проверьте службу Ollama.`
      );
    } else if (lastError?.message?.includes('model') || lastError?.message?.includes('not found')) {
      throw new Error(
        `Модель "${this.model}" не найдена. Загрузите модель командой: ollama pull ${this.model}`
      );
    } else {
      throw new Error(`Article generation failed: ${lastError?.message || lastError}`);
    }
  }
}




