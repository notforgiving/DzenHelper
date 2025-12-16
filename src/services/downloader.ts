import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import ffmpeg from 'fluent-ffmpeg';
import { getTempFilePath, cleanupFile } from '../utils/tempFiles';
import { YouTubeVideoInfo } from '../types';

const execAsync = promisify(exec);

export class VideoDownloader {
  private static readonly YOUTUBE_URL_REGEX = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;

  static isValidYouTubeUrl(url: string): boolean {
    return this.YOUTUBE_URL_REGEX.test(url);
  }

  /**
   * Скачивает только аудио из YouTube (быстрее чем скачивание видео)
   */
  static async downloadAudio(url: string): Promise<string> {
    if (!this.isValidYouTubeUrl(url)) {
      throw new Error('Invalid YouTube URL');
    }

    const audioPath = getTempFilePath('m4a');
    // Экранируем путь для Windows
    const escapedPath = audioPath.replace(/\\/g, '/');
    
    // Формируем базовую команду yt-dlp для скачивания только аудио
    // Используем лучший аудио формат (m4a обычно быстрее скачивается)
    const baseCommand = [
      'yt-dlp',
      '-f', 'bestaudio[ext=m4a]/bestaudio/best',
      '-x', // Извлекаем только аудио
      '--audio-format', 'm4a', // Конвертируем в m4a если нужно
      '-o', `"${escapedPath}"`,
      '--no-warnings',
      '--quiet',
      '--no-playlist',
      `"${url}"`
    ];

    // Проверяем наличие файла cookies.txt
    const cookiesFile = path.join(process.cwd(), 'cookies.txt');
    const hasCookiesFile = await fs.pathExists(cookiesFile);

    // Формируем стратегии скачивания
    const strategies: string[][] = [];

    if (hasCookiesFile) {
      // Стратегия 1: С cookies.txt и Node.js runtime
      strategies.push([
        ...baseCommand.slice(0, -1),
        '--cookies', `"${cookiesFile}"`,
        '--js-runtimes', 'node',
        ...baseCommand.slice(-1)
      ]);
    }

    // Стратегия 2: С cookies из браузера и Node.js runtime (пробуем разные браузеры)
    const browsers = ['chrome', 'edge', 'firefox', 'brave'];
    for (const browser of browsers) {
      strategies.push([
        ...baseCommand.slice(0, -1),
        '--cookies-from-browser', browser,
        '--js-runtimes', 'node',
        ...baseCommand.slice(-1)
      ]);
    }

    // Стратегия 3: Только с Node.js runtime
    strategies.push([
      ...baseCommand.slice(0, -1),
      '--js-runtimes', 'node',
      ...baseCommand.slice(-1)
    ]);

    // Стратегия 4: С альтернативным клиентом Android
    strategies.push([
      ...baseCommand.slice(0, -1),
      '--extractor-args', 'youtube:player_client=android',
      ...baseCommand.slice(-1)
    ]);

    // Стратегия 5: Базовый вариант
    strategies.push(baseCommand);

    let lastError: Error | null = null;

    for (const command of strategies) {
      try {
        const commandStr = command.join(' ');
        await execAsync(commandStr, {
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          timeout: 300000 // 5 минут таймаут
        });
        
        // Проверяем, что файл был создан (yt-dlp может добавить расширение)
        let finalPath = audioPath;
        if (!(await fs.pathExists(finalPath))) {
          // Проверяем альтернативные пути
          const dir = path.dirname(audioPath);
          if (await fs.pathExists(dir)) {
            const files = await fs.readdir(dir);
            const baseName = path.basename(audioPath, '.m4a');
            const audioFile = files.find(f => f.startsWith(baseName));
            if (audioFile) {
              finalPath = path.join(dir, audioFile);
            } else {
              throw new Error('Audio download failed - file not found');
            }
          } else {
            throw new Error('Audio download failed - temp directory not found');
          }
        }

        return finalPath;
      } catch (error: any) {
        lastError = error;
        // Пробуем следующую стратегию
        continue;
      }
    }

    // Если все стратегии не сработали
    await cleanupFile(audioPath);
    const errorMsg = lastError?.message || 'Unknown error';
    throw new Error(`Failed to download audio after trying multiple strategies. Last error: ${errorMsg}`);
  }

  /**
   * Скачивает видео (используется только если нужен видео файл)
   * @deprecated Используйте downloadAudio для ускорения
   */
  static async downloadVideo(url: string): Promise<string> {
    if (!this.isValidYouTubeUrl(url)) {
      throw new Error('Invalid YouTube URL');
    }

    const videoPath = getTempFilePath('mp4');
    // Экранируем путь для Windows
    const escapedPath = videoPath.replace(/\\/g, '/');
    
    // Формируем базовую команду yt-dlp
    const baseCommand = [
      'yt-dlp',
      '-f', 'best[ext=mp4]/best',
      '-o', `"${escapedPath}"`,
      '--no-warnings',
      '--quiet',
      `"${url}"`
    ];

    // Проверяем наличие файла cookies.txt
    const cookiesFile = path.join(process.cwd(), 'cookies.txt');
    const hasCookiesFile = await fs.pathExists(cookiesFile);

    // Формируем стратегии скачивания
    const strategies: string[][] = [];

    if (hasCookiesFile) {
      strategies.push([
        ...baseCommand.slice(0, -1),
        '--cookies', `"${cookiesFile}"`,
        '--js-runtimes', 'node',
        ...baseCommand.slice(-1)
      ]);
    }

    const browsers = ['chrome', 'edge', 'firefox', 'brave'];
    for (const browser of browsers) {
      strategies.push([
        ...baseCommand.slice(0, -1),
        '--cookies-from-browser', browser,
        '--js-runtimes', 'node',
        ...baseCommand.slice(-1)
      ]);
    }

    strategies.push([
      ...baseCommand.slice(0, -1),
      '--js-runtimes', 'node',
      ...baseCommand.slice(-1)
    ]);

    strategies.push([
      ...baseCommand.slice(0, -1),
      '--extractor-args', 'youtube:player_client=android',
      ...baseCommand.slice(-1)
    ]);

    strategies.push(baseCommand);

    let lastError: Error | null = null;

    for (const command of strategies) {
      try {
        const commandStr = command.join(' ');
        await execAsync(commandStr, {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 300000
        });
        
        let finalPath = videoPath;
        if (!(await fs.pathExists(finalPath))) {
          const dir = path.dirname(videoPath);
          if (await fs.pathExists(dir)) {
            const files = await fs.readdir(dir);
            const videoFile = files.find(f => f.startsWith(path.basename(videoPath, '.mp4')));
            if (videoFile) {
              finalPath = path.join(dir, videoFile);
            } else {
              throw new Error('Video download failed - file not found');
            }
          } else {
            throw new Error('Video download failed - temp directory not found');
          }
        }

        return finalPath;
      } catch (error: any) {
        lastError = error;
        continue;
      }
    }

    await cleanupFile(videoPath);
    const errorMsg = lastError?.message || 'Unknown error';
    throw new Error(`Failed to download video after trying multiple strategies. Last error: ${errorMsg}`);
  }

  /**
   * Конвертирует аудио файл в WAV формат для Whisper
   * Если файл уже в нужном формате, может просто скопировать
   */
  static async extractAudio(audioOrVideoPath: string): Promise<string> {
    const audioPath = getTempFilePath('wav');
    const ext = path.extname(audioOrVideoPath).toLowerCase();

    // Если это уже аудио файл в подходящем формате, конвертируем напрямую
    return new Promise((resolve, reject) => {
      ffmpeg(audioOrVideoPath)
        .toFormat('wav')
        .audioCodec('pcm_s16le')
        .audioFrequency(16000)
        .audioChannels(1)
        .audioBitrate('128k') // Уменьшаем битрейт для ускорения
        .on('end', () => {
          resolve(audioPath);
        })
        .on('error', (err) => {
          cleanupFile(audioPath);
          reject(new Error(`Audio extraction failed: ${err.message}`));
        })
        .save(audioPath);
    });
  }

  static async getVideoInfo(url: string): Promise<YouTubeVideoInfo> {
    // Проверяем наличие файла cookies.txt
    const cookiesFile = path.join(process.cwd(), 'cookies.txt');
    const hasCookiesFile = await fs.pathExists(cookiesFile);

    // Формируем стратегии с учетом наличия cookies.txt
    const strategies: string[] = [];

    if (hasCookiesFile) {
      // Стратегия 1: С cookies.txt и Node.js runtime
      strategies.push(`yt-dlp --dump-json --cookies "${cookiesFile}" --js-runtimes node "${url}"`);
    }

    // Стратегия 2: С cookies из браузера и Node.js runtime (пробуем разные браузеры)
    const browsers = ['chrome', 'edge', 'firefox', 'brave'];
    for (const browser of browsers) {
      strategies.push(`yt-dlp --dump-json --cookies-from-browser ${browser} --js-runtimes node "${url}"`);
    }

    // Стратегия 3: Только с Node.js runtime
    strategies.push(`yt-dlp --dump-json --js-runtimes node "${url}"`);

    // Стратегия 4: С альтернативным клиентом Android
    strategies.push(`yt-dlp --dump-json --extractor-args "youtube:player_client=android" "${url}"`);

    // Стратегия 5: Базовый вариант
    strategies.push(`yt-dlp --dump-json "${url}"`);

    let lastError: Error | null = null;

    for (const command of strategies) {
      try {
        const { stdout } = await execAsync(command, {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 60000 // 1 минута таймаут
        });
        
        const info = JSON.parse(stdout);
        
        return {
          title: info.title || 'Unknown',
          duration: info.duration || 0,
          url: url
        };
      } catch (error: any) {
        lastError = error;
        // Продолжаем пробовать следующую стратегию
        continue;
      }
    }

    throw new Error(`Failed to get video info after trying multiple strategies. Last error: ${lastError?.message || 'Unknown error'}`);
  }
}

