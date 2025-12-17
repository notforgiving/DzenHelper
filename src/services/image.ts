import * as fs from 'fs-extra';
import { HfInference } from '@huggingface/inference';
import { getTempFilePath } from '../utils/tempFiles';

export class ImageGenerator {
  private hf: HfInference;
  private model: string;
  private baseUrl: string;
  private token?: string;

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
  }

  async generateImage(articleText: string, customPrompt?: string): Promise<string> {
    const defaultPrompt = process.env.IMAGE_PROMPT || 
      'Create an image that illustrates the topic of the article';
    
    const prompt = customPrompt || defaultPrompt;
    
    // Формируем промпт на основе статьи (ограничиваем длину для промпта)
    const articleSummary = articleText.substring(0, 200);
    const fullPrompt = `${prompt}. Article topic: ${articleSummary}`;

    try {
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
      // Используем альтернативную модель через тот же роутер
      const alternativeModel = 'runwayml/stable-diffusion-v1-5';
      const buffer = await this.generateViaHttp(
        alternativeModel,
        prompt,
        {
          num_inference_steps: 20,
        }
      );
      // Сохраняем изображение
      return await this.saveImage(buffer, 'png');
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
      const errorText = await response.text();
      throw new Error(`HF request failed: ${response.status} ${errorText}`);
    }
    // Читаем бинарное тело ответа
    const arrayBuffer = await response.arrayBuffer();
    // Конвертируем в Buffer
    const buffer = Buffer.from(arrayBuffer);
    // Возвращаем буфер изображения
    return buffer;
  }
}

