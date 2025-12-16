import { pipeline, env } from '@xenova/transformers';
import * as fs from 'fs-extra';
// @ts-ignore - wavefile не имеет типов
import { WaveFile } from 'wavefile';
import { TranscriptionChunk } from '../types';

// Отключаем локальные модели для использования из CDN
env.allowLocalModels = false;
env.useBrowserCache = false;

export class Transcriber {
  private static transcriber: any = null;

  static async initialize() {
    if (!this.transcriber) {
      // Используем whisper-tiny для ускорения (можно изменить через переменную окружения)
      const model = process.env.WHISPER_MODEL || 'Xenova/whisper-tiny';
      console.log(`Initializing Whisper model: ${model}`);
      this.transcriber = await pipeline(
        'automatic-speech-recognition',
        model
      );
    }
    return this.transcriber;
  }

  static async transcribe(audioPath: string): Promise<string> {
    try {
      const transcriber = await this.initialize();
      
      console.log(`Starting transcription of ${audioPath}`);
      
      // Читаем аудио файл и конвертируем в формат для Whisper
      const audioData = await this.loadAudioFile(audioPath);
      
      // Валидация данных перед транскрипцией
      if (!audioData || audioData.length === 0) {
        throw new Error('Audio data is empty, cannot transcribe');
      }

      console.log(`Transcribing ${audioData.length} samples (${(audioData.length / 16000).toFixed(2)} seconds)`);

      // Транскрибируем аудио (передаем данные напрямую, а не путь)
      // Используем стандартные параметры для надежности
      const result = await transcriber(audioData, {
        chunk_length_s: 30, // Стандартный размер чанка
        stride_length_s: 5, // Стандартный stride
        return_timestamps: false,
        // Не указываем язык явно, пусть Whisper определит автоматически
      });

      console.log('Transcription completed');

      // Извлекаем текст из результата
      let transcription = '';
      if (result && result.text) {
        transcription = result.text;
      } else if (Array.isArray(result)) {
        transcription = result.map((chunk: TranscriptionChunk) => chunk.text).join(' ');
      } else if (typeof result === 'object' && result.chunks) {
        transcription = result.chunks.map((chunk: TranscriptionChunk) => chunk.text).join(' ');
      }

      const trimmedTranscription = transcription.trim();
      console.log(`Transcription length: ${trimmedTranscription.length} characters`);
      
      return trimmedTranscription;
    } catch (error: any) {
      console.error('Transcription error:', error);
      throw new Error(`Transcription failed: ${error.message || error}`);
    }
  }

  /**
   * Загружает аудио файл и конвертирует его в формат Float32Array для Whisper
   */
  private static async loadAudioFile(audioPath: string): Promise<Float32Array> {
    try {
      // Проверяем, что файл существует
      if (!(await fs.pathExists(audioPath))) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }

      const stats = await fs.stat(audioPath);
      if (stats.size === 0) {
        throw new Error(`Audio file is empty: ${audioPath}`);
      }

      console.log(`Loading audio file: ${audioPath} (${stats.size} bytes)`);

      // Читаем WAV файл
      const buffer = await fs.readFile(audioPath);
      
      if (buffer.length === 0) {
        throw new Error('Audio buffer is empty');
      }

      const wav = new WaveFile(buffer);
      
      // Проверяем формат файла
      // @ts-ignore - fmt может не иметь типов
      if (!wav.fmt) {
        throw new Error('Invalid WAV file format');
      }

      // @ts-ignore - свойства fmt могут не иметь типов
      const numChannels = wav.fmt.numChannels || 1;
      // @ts-ignore
      const sampleRate = wav.fmt.sampleRate || 16000;
      console.log(`WAV format: ${numChannels} channels, ${sampleRate} Hz`);
      
      // Конвертируем в моно, 16kHz (требования Whisper)
      wav.toSampleRate(16000);
      
      // Конвертируем в моно если стерео
      if (numChannels > 1) {
        // @ts-ignore - toMono может существовать в runtime, но не в типах
        if (typeof (wav as any).toMono === 'function') {
          (wav as any).toMono();
        } else {
          // Альтернативный способ: берем только первый канал
          console.warn('toMono not available, using first channel only');
        }
      }
      
      // Получаем данные как массив сэмплов
      // @ts-ignore - getSamples может возвращать разные типы
      let samples = wav.getSamples(false, Float32Array);
      
      let audioData: Float32Array;

      // Обрабатываем разные форматы возвращаемых данных
      if (Array.isArray(samples)) {
        if (samples.length === 0) {
          throw new Error('No audio samples found');
        }
        
        // Если это массив массивов (стерео), берем первый канал
        if (Array.isArray(samples[0])) {
          audioData = new Float32Array(samples[0]);
        } else if (samples[0] instanceof Float32Array) {
          audioData = samples[0];
        } else {
          // Конвертируем первый канал в Float32Array
          audioData = new Float32Array(samples[0] as any);
        }
      } else if (samples instanceof Float32Array) {
        audioData = samples;
      } else if (samples instanceof Float64Array) {
        audioData = new Float32Array(samples);
      } else if (samples && typeof (samples as any).byteLength !== 'undefined') {
        // Это может быть ArrayBuffer или TypedArray
        audioData = new Float32Array(samples as any);
      } else {
        // Последняя попытка - конвертация через unknown
        audioData = new Float32Array(samples as unknown as ArrayLike<number>);
      }

      // Валидация данных
      if (!audioData || audioData.length === 0) {
        throw new Error('Audio data is empty after conversion');
      }

      // Нормализуем данные в диапазон [-1, 1] если нужно
      // Используем итерацию вместо spread для больших массивов (избегаем переполнения стека)
      let max = 0;
      for (let i = 0; i < audioData.length; i++) {
        const absValue = Math.abs(audioData[i]);
        if (absValue > max) {
          max = absValue;
        }
      }

      if (max > 1.0) {
        console.log(`Normalizing audio data (max value: ${max})`);
        // Нормализуем in-place для экономии памяти
        for (let i = 0; i < audioData.length; i++) {
          audioData[i] = audioData[i] / max;
        }
      }

      console.log(`Audio data loaded: ${audioData.length} samples (${(audioData.length / 16000).toFixed(2)} seconds)`);
      
      return audioData;
    } catch (error: any) {
      console.error('Error loading audio file:', error);
      throw new Error(`Failed to load audio file: ${error.message || error}`);
    }
  }

  static async transcribeLongAudio(audioPath: string): Promise<string> {
    // Для длинных аудио разбиваем на чанки
    // Whisper может обрабатывать до 30 секунд за раз
    try {
      const transcriber = await this.initialize();
      
      // Загружаем аудио файл
      const audioData = await this.loadAudioFile(audioPath);
      
      const result = await transcriber(audioData, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
      });

      let transcription = '';
      if (result && result.text) {
        transcription = result.text;
      } else if (Array.isArray(result)) {
        transcription = result.map((chunk: TranscriptionChunk) => chunk.text).join(' ');
      }

      return transcription.trim();
    } catch (error: any) {
      throw new Error(`Long audio transcription failed: ${error.message || error}`);
    }
  }
}

