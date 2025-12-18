import { google } from 'googleapis';
import { Readable } from 'stream';

// Класс для работы с Google Drive API
export class GoogleDriveService {
  private drive: ReturnType<typeof google.drive> | null = null;
  private folderId: string | null = null;

  constructor() {
    // Получаем учетные данные из переменных окружения
    const credentialsJson = process.env.GOOGLE_DRIVE_CREDENTIALS;
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    // Если учетные данные не установлены, выводим предупреждение
    if (!credentialsJson) {
      console.warn('⚠️ GOOGLE_DRIVE_CREDENTIALS не установлены. Работа с Google Drive будет недоступна.');
      return;
    }

    try {
      // Парсим JSON с учетными данными
      const credentials = JSON.parse(credentialsJson);
      
      // Создаем клиент OAuth2
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      });

      // Инициализируем клиент Google Drive
      this.drive = google.drive({ version: 'v3', auth });
      
      // Сохраняем ID папки, если указан
      if (folderId) {
        this.folderId = folderId;
      } else {
        console.warn('⚠️ GOOGLE_DRIVE_FOLDER_ID не установлен. Файлы будут загружаться в корень Google Drive.');
      }
    } catch (error) {
      console.error('❌ Ошибка при инициализации Google Drive:', error);
    }
  }

  /**
   * Проверяет существование и доступность папки в Google Drive
   * @param folderId ID папки для проверки
   * @returns true если папка существует и доступна, false в противном случае
   */
  private async checkFolderExists(folderId: string): Promise<boolean> {
    if (!this.drive) {
      return false;
    }

    try {
      const response = await this.drive.files.get({
        fileId: folderId,
        fields: 'id, mimeType',
      });

      // Проверяем, что это действительно папка
      return response.data.mimeType === 'application/vnd.google-apps.folder';
    } catch (error: any) {
      // Если папка не найдена или нет доступа
      if (error.code === 404 || error.code === 403) {
        return false;
      }
      // Для других ошибок тоже возвращаем false
      return false;
    }
  }

  /**
   * Загружает файл в Google Drive
   * @param fileName Имя файла
   * @param fileBuffer Буфер с содержимым файла
   * @param mimeType MIME-тип файла
   * @returns URL файла в Google Drive или null в случае ошибки
   */
  async uploadFile(
    fileName: string,
    fileBuffer: Buffer,
    mimeType: string = 'image/jpeg'
  ): Promise<string | null> {
    if (!this.drive) {
      throw new Error('Google Drive клиент не инициализирован. Проверьте переменные окружения GOOGLE_DRIVE_CREDENTIALS.');
    }

    try {
      // Создаем поток из буфера
      const fileStream = Readable.from(fileBuffer);

      // Метаданные файла
      const fileMetadata: any = {
        name: fileName,
      };

      // Если указана папка, проверяем её существование и доступность
      let useFolder = false;
      if (this.folderId) {
        const folderExists = await this.checkFolderExists(this.folderId);
        if (folderExists) {
          fileMetadata.parents = [this.folderId];
          useFolder = true;
        } else {
          console.warn(`⚠️ Папка с ID "${this.folderId}" не найдена или недоступна. Файл будет загружен в корень.`);
          console.warn('💡 Убедитесь, что:');
          console.warn('   1. ID папки указан правильно в GOOGLE_DRIVE_FOLDER_ID');
          console.warn('   2. Папка находится в Shared Drive (общий диск)');
          console.warn('   3. Сервисный аккаунт добавлен в Shared Drive с правами Content Manager');
        }
      } else {
        // Если папка не указана, пытаемся найти первый доступный Shared Drive
        // или загружаем в корень (но это может не сработать для сервисных аккаунтов)
        console.warn('⚠️ GOOGLE_DRIVE_FOLDER_ID не указан. Попытка загрузки в корень (может не работать для сервисных аккаунтов).');
        console.warn('💡 Рекомендуется использовать Shared Drive (общий диск) и указать ID папки в GOOGLE_DRIVE_FOLDER_ID');
      }

      // Параметры загрузки
      const media = {
        mimeType,
        body: fileStream,
      };

      // Загружаем файл
      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        media,
        fields: 'id, name, webViewLink',
      });

      if (response.data.id) {
        // Возвращаем ссылку на файл
        const fileId = response.data.id;
        const fileLink = `https://drive.google.com/file/d/${fileId}/view`;
        const location = useFolder ? `в папку "${this.folderId}"` : 'в корень Google Drive';
        console.log(`✅ Файл "${fileName}" успешно загружен ${location}: ${fileLink}`);
        return fileLink;
      }

      return null;
    } catch (error: any) {
      console.error('❌ Ошибка при загрузке файла в Google Drive:', error);
      
      // Более детальная обработка ошибок
      if (error.code === 404) {
        throw new Error(`Папка не найдена. Проверьте GOOGLE_DRIVE_FOLDER_ID и доступ сервисного аккаунта к папке.`);
      } else if (error.code === 403) {
        // Проверяем, это ошибка о квоте хранилища
        if (error.message && (error.message.includes('storage quota') || error.message.includes('Service Accounts do not have storage quota'))) {
          throw new Error(`Сервисные аккаунты не имеют собственного хранилища.\n\nВарианты решения:\n1. Используйте Shared Drive (если доступен):\n   - Создайте Shared Drive в Google Drive\n   - Добавьте сервисный аккаунт с правами Content Manager\n   - Создайте папку в Shared Drive и укажите её ID\n\n2. Используйте обычную папку в вашем личном Google Drive:\n   - Создайте папку в вашем личном Google Drive\n   - Откройте настройки папки → "Доступ"\n   - Добавьте email сервисного аккаунта с правами "Редактор"\n   - Укажите ID папки в GOOGLE_DRIVE_FOLDER_ID`);
        } else {
          throw new Error(`Нет доступа к папке. Убедитесь, что:\n1. Папка создана в вашем личном Google Drive или Shared Drive\n2. Сервисный аккаунт добавлен в настройки доступа папки с правами "Редактор"\n3. ID папки указан правильно в GOOGLE_DRIVE_FOLDER_ID`);
        }
      } else {
        throw new Error(`Не удалось загрузить файл в Google Drive: ${error.message || error}`);
      }
    }
  }

  /**
   * Проверяет, инициализирован ли клиент Google Drive
   */
  isInitialized(): boolean {
    return this.drive !== undefined && this.drive !== null;
  }
}

