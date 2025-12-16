import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import ffmpeg from 'fluent-ffmpeg';
import { getTempFilePath, cleanupFile } from '../utils/tempFiles';
import { YouTubeVideoInfo } from '../types';

const execAsync = promisify(exec);

// Находим путь к Node.js для использования в yt-dlp
async function getNodePath(): Promise<string | null> {
  try {
    // Пробуем найти node в PATH (Windows)
    const { stdout } = await execAsync('where node', { timeout: 5000 }).catch(() => ({ stdout: '' }));
    const nodePath = stdout.trim().split('\n')[0];
    if (nodePath && await fs.pathExists(nodePath)) {
      return nodePath;
    }
  } catch (error) {
    // Игнорируем ошибки
  }
  
  // Пробуем через process.execPath (путь к текущему Node.js)
  if (process.execPath) {
    return process.execPath;
  }
  
  return null;
}

// Находим способ вызова yt-dlp (может быть yt-dlp, python -m yt_dlp, py -m yt_dlp и т.д.)
async function getYtDlpCommand(): Promise<string[]> {
  // Стратегия 1: Пробуем yt-dlp напрямую
  try {
    await execAsync('yt-dlp --version', { timeout: 5000 });
    return ['yt-dlp'];
  } catch (error) {
    // Продолжаем пробовать другие способы
  }

  // Стратегия 2: Пробуем python -m yt_dlp
  try {
    await execAsync('python -m yt_dlp --version', { timeout: 5000 });
    return ['python', '-m', 'yt_dlp'];
  } catch (error) {
    // Продолжаем пробовать другие способы
  }

  // Стратегия 3: Пробуем py -m yt_dlp (Windows Python Launcher)
  try {
    await execAsync('py -m yt_dlp --version', { timeout: 5000 });
    return ['py', '-m', 'yt_dlp'];
  } catch (error) {
    // Продолжаем пробовать другие способы
  }

  // Стратегия 4: Пробуем python3 -m yt_dlp
  try {
    await execAsync('python3 -m yt_dlp --version', { timeout: 5000 });
    return ['python3', '-m', 'yt_dlp'];
  } catch (error) {
    // Продолжаем пробовать другие способы
  }

  // Если ничего не работает, возвращаем yt-dlp (будет ошибка с понятным сообщением)
  return ['yt-dlp'];
}

// Задержка между попытками для избежания 429 ошибки
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

    // Находим способ вызова yt-dlp
    const ytDlpBase = await getYtDlpCommand();

    const audioPath = getTempFilePath('m4a');
    // Экранируем путь для Windows
    const escapedPath = audioPath.replace(/\\/g, '/');
    
    // Находим путь к Node.js
    const nodePath = await getNodePath();
    const nodeRuntime = nodePath ? `node:${nodePath}` : 'node';
    
    // Проверяем наличие файла cookies.txt
    const cookiesFile = path.join(process.cwd(), 'cookies.txt');
    const hasCookiesFile = await fs.pathExists(cookiesFile);
    
    // Формируем базовые опции для обхода блокировок
    const baseOptions = [
      '-f', 'bestaudio[ext=m4a]/bestaudio/best',
      '-x', // Извлекаем только аудио
      '--audio-format', 'm4a', // Конвертируем в m4a если нужно
      '-o', escapedPath,
      '--no-warnings',
      '--quiet',
      '--no-playlist',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '--referer', 'https://www.youtube.com/',
      '--extractor-args', 'youtube:player_client=web',
    ];

    // Формируем стратегии скачивания
    const strategies: string[][] = [];

    if (hasCookiesFile) {
      // Стратегия 1: С cookies.txt и Node.js runtime
      strategies.push([
        ...ytDlpBase,
        ...baseOptions,
        '--cookies', cookiesFile,
        '--js-runtimes', nodeRuntime,
        url
      ]);
    }

    // Стратегия 2: С cookies из браузера и Node.js runtime (пробуем разные браузеры)
    const browsers = ['chrome', 'edge', 'firefox', 'brave'];
    for (const browser of browsers) {
      strategies.push([
        ...ytDlpBase,
        ...baseOptions,
        '--cookies-from-browser', browser,
        '--js-runtimes', nodeRuntime,
        url
      ]);
    }

    // Стратегия 3: С cookies из браузера без явного указания runtime
    for (const browser of browsers) {
      strategies.push([
        ...ytDlpBase,
        ...baseOptions,
        '--cookies-from-browser', browser,
        url
      ]);
    }

    // Стратегия 4: Только с Node.js runtime
    strategies.push([
      ...ytDlpBase,
      ...baseOptions,
      '--js-runtimes', nodeRuntime,
      url
    ]);

    // Стратегия 5: С альтернативным клиентом Android
    strategies.push([
      ...ytDlpBase,
      '-f', 'bestaudio[ext=m4a]/bestaudio/best',
      '-x',
      '--audio-format', 'm4a',
      '-o', escapedPath,
      '--no-warnings',
      '--quiet',
      '--no-playlist',
      '--extractor-args', 'youtube:player_client=android',
      url
    ]);

    // Стратегия 6: Базовый вариант
    strategies.push([
      ...ytDlpBase,
      '-f', 'bestaudio[ext=m4a]/bestaudio/best',
      '-x',
      '--audio-format', 'm4a',
      '-o', escapedPath,
      '--no-warnings',
      '--quiet',
      '--no-playlist',
      url
    ]);

    let lastError: Error | null = null;

    for (let i = 0; i < strategies.length; i++) {
      const command = strategies[i];
      
      // Добавляем задержку между попытками для избежания 429 ошибки
      if (i > 0) {
        await delay(2000 * i); // Увеличиваем задержку с каждой попыткой
      }
      
      try {
        // Используем правильное формирование команды для Windows
        const commandStr = command.map(arg => {
          // Экранируем аргументы с пробелами
          if (arg.includes(' ') && !arg.startsWith('"') && !arg.startsWith("'")) {
            return `"${arg}"`;
          }
          return arg;
        }).join(' ');
        
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

    // Если все стратегии не сработали, проверяем, установлен ли yt-dlp
    if (lastError?.message?.includes('не является внутренней') || 
        lastError?.message?.includes('not found') ||
        lastError?.message?.includes('is not recognized')) {
      await cleanupFile(audioPath);
      throw new Error(
        `yt-dlp не найден в PATH. Установите yt-dlp одним из способов:\n` +
        `1. pip install yt-dlp (если Python установлен)\n` +
        `2. Убедитесь, что yt-dlp добавлен в PATH\n` +
        `3. Проверьте установку: yt-dlp --version или python -m yt_dlp --version`
      );
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
    // Находим способ вызова yt-dlp
    const ytDlpBase = await getYtDlpCommand();
    
    // Проверяем наличие файла cookies.txt
    const cookiesFile = path.join(process.cwd(), 'cookies.txt');
    const hasCookiesFile = await fs.pathExists(cookiesFile);
    
    // Находим путь к Node.js
    const nodePath = await getNodePath();
    const nodeRuntime = nodePath ? `node:${nodePath}` : 'node';

    // Формируем базовые опции для обхода блокировок
    const baseOptions = [
      '--dump-json',
      '--no-warnings',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '--referer', 'https://www.youtube.com/',
      '--extractor-args', 'youtube:player_client=web',
    ];

    // Формируем стратегии с учетом наличия cookies.txt
    const strategies: string[][] = [];

    if (hasCookiesFile) {
      // Стратегия 1: С cookies.txt и Node.js runtime
      strategies.push([
        ...ytDlpBase,
        ...baseOptions,
        '--cookies', cookiesFile,
        '--js-runtimes', nodeRuntime,
        url
      ]);
    }

    // Стратегия 2: С cookies из браузера и Node.js runtime (пробуем разные браузеры)
    const browsers = ['chrome', 'edge', 'firefox', 'brave'];
    for (const browser of browsers) {
      strategies.push([
        ...ytDlpBase,
        ...baseOptions,
        '--cookies-from-browser', browser,
        '--js-runtimes', nodeRuntime,
        url
      ]);
    }

    // Стратегия 3: С cookies из браузера без явного указания runtime
    for (const browser of browsers) {
      strategies.push([
        ...ytDlpBase,
        ...baseOptions,
        '--cookies-from-browser', browser,
        url
      ]);
    }

    // Стратегия 4: Только с Node.js runtime
    strategies.push([
      ...ytDlpBase,
      ...baseOptions,
      '--js-runtimes', nodeRuntime,
      url
    ]);

    // Стратегия 5: С альтернативным клиентом Android
    strategies.push([
      ...ytDlpBase,
      '--dump-json',
      '--no-warnings',
      '--extractor-args', 'youtube:player_client=android',
      url
    ]);

    // Стратегия 6: Базовый вариант
    strategies.push([
      ...ytDlpBase,
      '--dump-json',
      '--no-warnings',
      url
    ]);

    let lastError: Error | null = null;

    for (let i = 0; i < strategies.length; i++) {
      const command = strategies[i];
      
      // Добавляем задержку между попытками для избежания 429 ошибки
      if (i > 0) {
        await delay(2000 * i); // Увеличиваем задержку с каждой попыткой
      }
      
      try {
        // Используем правильное формирование команды для Windows
        const commandStr = command.map(arg => {
          // Экранируем аргументы с пробелами
          if (arg.includes(' ') && !arg.startsWith('"') && !arg.startsWith("'")) {
            return `"${arg}"`;
          }
          return arg;
        }).join(' ');
        
        const { stdout } = await execAsync(commandStr, {
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

    // Если все стратегии не сработали, проверяем, установлен ли yt-dlp
    if (lastError?.message?.includes('не является внутренней') || 
        lastError?.message?.includes('not found') ||
        lastError?.message?.includes('is not recognized')) {
      throw new Error(
        `yt-dlp не найден в PATH. Установите yt-dlp одним из способов:\n` +
        `1. pip install yt-dlp (если Python установлен)\n` +
        `2. Убедитесь, что yt-dlp добавлен в PATH\n` +
        `3. Проверьте установку: yt-dlp --version или python -m yt_dlp --version`
      );
    }

    throw new Error(`Failed to get video info after trying multiple strategies. Last error: ${lastError?.message || 'Unknown error'}`);
  }
}

