import { google, drive_v3 } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKEN_PATH = path.resolve('token.json');
const CREDENTIALS_PATH = path.resolve('credentials.json');

export class GoogleDriveService {
  private drive!: drive_v3.Drive;
  private folderId: string;
  private initialized = false;

  constructor(folderId: string) {
    this.folderId = folderId;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.installed;

    const auth = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );

    if (!fs.existsSync(TOKEN_PATH)) {
      throw new Error('token.json не найден. Авторизуй Google Drive.');
    }

    auth.setCredentials(
      JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'))
    );

    this.drive = google.drive({
      version: 'v3',
      auth,
    });

    this.initialized = true;
  }

  async uploadFile(
    fileName: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<string> {
    if (!this.initialized) {
      throw new Error('Google Drive не инициализирован');
    }

    const stream = Readable.from(buffer);

    const { data } = await this.drive.files.create({
      requestBody: {
        name: fileName,
        parents: [this.folderId],
      },
      media: {
        mimeType,
        body: stream,
      },
      fields: 'id',
    });

    if (!data.id) {
      throw new Error('Google Drive не вернул fileId');
    }

    // ДЕЛАЕМ ФАЙЛ ПУБЛИЧНЫМ
    await this.drive.permissions.create({
      fileId: data.id,
      requestBody: {
        type: 'anyone',
        role: 'reader',
      },
    });

    return `https://drive.google.com/uc?id=${data.id}`;
  }
}
