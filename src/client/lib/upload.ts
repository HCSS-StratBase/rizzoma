import { ensureCsrf, readCookie } from './api';

export type UploadResult = {
  id: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
};

export async function uploadFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  await ensureCsrf();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads');
    xhr.withCredentials = true;
    const token = readCookie('XSRF-TOKEN');
    if (token) {
      xhr.setRequestHeader('x-csrf-token', token);
    }
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress?.(percent);
    };
    xhr.onerror = () => reject(new Error('network_error'));
    xhr.onload = () => {
      const payload = (xhr.response as any) || null;
      if (xhr.status >= 200 && xhr.status < 300 && payload?.upload) {
        resolve(payload.upload as UploadResult);
        return;
      }
      const reason = payload?.error || `upload_failed_${xhr.status}`;
      reject(new Error(reason));
    };
    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}
