import * as fs from 'fs-extra';
import { HfInference } from '@huggingface/inference';
import { getTempFilePath } from '../utils/tempFiles';
import { Ollama } from 'ollama';

export class ImageGenerator {
  private hf: HfInference;
  private model: string;
  private baseUrl: string;
  private token?: string;
  private provider: 'huggingface' | 'ollama';
  private ollamaApiUrl: string;
  private ollama: Ollama;

  constructor() {
    // Используем бесплатный Hugging Face Inference API
    // Можно использовать без токена, но с ограничениями
    const hfToken = process.env.HUGGINGFACE_API_TOKEN || undefined;
    // Указываем новый актуальный baseUrl Hugging Face Router
    const hfBaseUrl = process.env.HUGGINGFACE_API_URL || 'https://router.huggingface.co';
    // Описываем опции клиента HF (тип обходим через any, т.к. baseUrl еще не в типах)
    const hfOptions: any = { baseUrl: hfBaseUrl };
    // Создаем клиент HF с корректным базовым URL и токеном
    this.hf = new HfInference(hfToken, hfOptions);
    // Используем бесплатную модель Stable Diffusion
    this.model = process.env.IMAGE_MODEL || 'stabilityai/stable-diffusion-2-1';
    // Сохраняем базовый URL для ручных HTTP запросов
    this.baseUrl = hfBaseUrl;
    // Сохраняем токен, чтобы пробрасывать его в HTTP-запросы
    this.token = hfToken;
    // Определяем провайдера генерации изображений (по умолчанию huggingface)
    this.provider = (process.env.IMAGE_PROVIDER as 'huggingface' | 'ollama') || 'huggingface';
    // Сохраняем URL Ollama API или значение по умолчанию
    this.ollamaApiUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
    // Создаем клиент Ollama для генерации изображений
    this.ollama = new Ollama({ host: this.ollamaApiUrl });
  }

  async generateImage(articleText: string, customPrompt?: string): Promise<string> {
    // Проверяем наличие токена, если выбран Hugging Face
    if (this.provider === 'huggingface' && !this.token) {
      // Сообщаем о необходимости задать токен
      throw new Error('Для генерации через Hugging Face укажите HUGGINGFACE_API_TOKEN в .env или окружении либо переключитесь на Ollama через IMAGE_PROVIDER=ollama.');
    }
    // Проверяем доступность модели для Ollama, если выбран провайдер ollama
    if (this.provider === 'ollama') {
      // Проверяем, указана ли модель Ollama, иначе используем значение по умолчанию
      this.model = process.env.OLLAMA_IMAGE_MODEL || 'stable-diffusion';
    }
    const defaultPrompt = process.env.IMAGE_PROMPT || 
      'Create an image that illustrates the topic of the article';
    
    const prompt = customPrompt || defaultPrompt;
    
    // Формируем промпт на основе статьи (ограничиваем длину для промпта)
    const articleSummary = articleText.substring(0, 200);
    const fullPrompt = `${prompt}. Article topic: ${articleSummary}`;

    try {
      // Если выбран Hugging Face, генерируем через HTTP-запрос
      if (this.provider === 'huggingface') {
        // Генерируем изображение через прямой HTTP-запрос к новому роутеру HF
        const buffer = await this.generateViaHttp(
          this.model,
          fullPrompt,
          {
            num_inference_steps: 20,
            guidance_scale: 7.5,
          }
        );
        // Сохраняем изображение
        return await this.saveImage(buffer, 'png');
      }
      // Иначе используем локальную модель Ollama
      const ollamaBuffer = await this.generateViaOllama(fullPrompt);
      // Сохраняем изображение из Ollama
      return await this.saveImage(ollamaBuffer, 'png');
    } catch (error: any) {
      // Если Hugging Face API не работает, пробуем альтернативный метод
      console.warn('Hugging Face API failed, trying alternative:', error.message);
      return await this.generateImageAlternative(fullPrompt);
    }
  }

  private async generateImageAlternative(prompt: string): Promise<string> {
    // Альтернативный метод: можно использовать другие бесплатные модели
    // Например, через другие бесплатные API или локальные модели
    
    // Пробуем другую модель Stable Diffusion
    try {
      // Если выбран Hugging Face, пробуем альтернативную быструю модель
      if (this.provider === 'huggingface') {
        // Используем альтернативную модель через тот же роутер
        const alternativeModel = 'stabilityai/sdxl-turbo';
        // Генерируем изображение через альтернативную модель
        const buffer = await this.generateViaHttp(
          alternativeModel,
          prompt,
          {
            num_inference_steps: 15,
            guidance_scale: 0.0,
          }
        );
        // Сохраняем изображение
        return await this.saveImage(buffer, 'png');
      }
      // Для Ollama пробуем сгенерировать через локальную модель
      const ollamaBuffer = await this.generateViaOllama(prompt);
      // Сохраняем изображение
      return await this.saveImage(ollamaBuffer, 'png');
    } catch (error: any) {
      throw new Error(`Image generation failed: ${error.message}. Please check your internet connection and Hugging Face API availability.`);
    }
  }

  // Метод для сохранения изображения из base64 или buffer
  private async saveImage(imageData: Buffer | string, extension: string = 'png'): Promise<string> {
    const imagePath = getTempFilePath(extension);
    
    if (Buffer.isBuffer(imageData)) {
      await fs.writeFile(imagePath, imageData);
    } else {
      // Если это base64 строка
      const buffer = Buffer.from(imageData, 'base64');
      await fs.writeFile(imagePath, buffer);
    }
    
    return imagePath;
  }

  private async generateViaHttp(
    model: string,
    prompt: string,
    parameters: Record<string, any>
  ): Promise<Buffer> {
    // Формируем URL запроса к новому роутеру
    const url = `${this.baseUrl}/models/${model}`;
    // Собираем тело запроса
    const body = {
      inputs: prompt,
      parameters,
    };
    // Готовим заголовки
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    // Добавляем авторизацию, если есть токен
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    // Отправляем запрос к HF Router
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    // Проверяем успешный статус
    if (!response.ok) {
      // Читаем тело ошибки
      const errorText = await response.text();
      // Если нет авторизации, даем явную подсказку
      if (response.status === 401) {
        // Бросаем понятную ошибку про токен Hugging Face
        throw new Error('HF request failed: 401 Unauthorized. Проверьте HUGGINGFACE_API_TOKEN или задайте его в .env');
      }
      // Если модель не найдена или закрыта, даем подсказку сменить модель
      if (response.status === 404) {
        // Подсказываем задать доступную модель через переменную окружения
        throw new Error('HF request failed: 404 Not Found. Проверьте значение IMAGE_MODEL (например, stabilityai/sdxl-turbo) и доступность модели.');
      }
      // Бросаем общую ошибку для других статусов
      throw new Error(`HF request failed: ${response.status} ${errorText}`);
    }
    // Читаем бинарное тело ответа
    const arrayBuffer = await response.arrayBuffer();
    // Конвертируем в Buffer
    const buffer = Buffer.from(arrayBuffer);
    // Возвращаем буфер изображения
    return buffer;
  }

  private async generateViaOllama(prompt: string): Promise<Buffer> {
    // Собираем URL ручного запроса к Ollama
    const url = `${this.ollamaApiUrl}/api/generate`;
    // Формируем тело запроса для Ollama с отключенным стримингом
    const body = {
      model: this.model,
      prompt,
      stream: false,
      format: 'png',
    };
    // Выполняем запрос к локальному Ollama
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    // Если статус неуспешный — бросаем ошибку
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama request failed: ${response.status} ${errorText}`);
    }
    // Парсим JSON-ответ
    const data = await response.json() as { image?: string; response?: string };
    // Извлекаем base64-картинку из поля image или response
    const base64Image = data.image || data.response;
    // Проверяем, что изображение присутствует
    if (!base64Image) {
      throw new Error('Ollama response does not contain an image payload');
    }
    // Конвертируем base64 в Buffer
    const buffer = Buffer.from(base64Image, 'base64');
    // Возвращаем буфер изображения
    return buffer;
  }
}

