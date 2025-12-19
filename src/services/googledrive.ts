import { google } from 'googleapis';
import { Readable } from 'stream';

export class GoogleDriveService {
  private drive;
  private folderId?: string;

  constructor() {
    const {
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REFRESH_TOKEN,
      GOOGLE_DRIVE_FOLDER_ID,
    } = process.env;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
      throw new Error('Google OAuth env vars are missing');
    }

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      refresh_token: GOOGLE_REFRESH_TOKEN,
    });

    this.drive = google.drive({
      version: 'v3',
      auth: oauth2Client,
    });

    this.folderId = GOOGLE_DRIVE_FOLDER_ID;
  }

  isInitialized(): boolean {
    return !!this.drive;
  }

  async uploadFile(
    fileName: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<string> {
    try {
      const stream = Readable.from(buffer);

      const requestBody: any = {
        name: fileName,
      };

      if (this.folderId) {
        requestBody.parents = [this.folderId];
      }

      const res = await this.drive.files.create({
        requestBody,
        media: {
          mimeType,
          body: stream,
        },
        fields: 'id, webViewLink',
      });

      if (!res.data.webViewLink) {
        throw new Error('Google Drive did not return a link');
      }

      return res.data.webViewLink;
    } catch (e: any) {
      console.error(
        'Google Drive upload error:',
        e?.response?.data || e
      );
      throw e;
    }
  }
}
