import { ensureCsrf, readCookie } from './api';

export type UploadResult = {
  id: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
};

export type UploadOptions = {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

export type UploadTask = {
  promise: Promise<UploadResult>;
  cancel: () => void;
};

export function createUploadTask(file: File, options?: UploadOptions): UploadTask {
  const xhr = new XMLHttpRequest();
  let settled = false;

  const promise = (async () => {
    await ensureCsrf();
    return new Promise<UploadResult>((resolve, reject) => {
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
        options?.onProgress?.(percent);
      };
      const rejectOnce = (reason: string) => {
        if (settled) return;
        settled = true;
        reject(new Error(reason));
      };
      xhr.onerror = () => rejectOnce('network_error');
      xhr.onabort = () => rejectOnce('upload_aborted');
      xhr.onload = () => {
        const payload = (xhr.response as any) || null;
        if (xhr.status >= 200 && xhr.status < 300 && payload?.upload) {
          settled = true;
          resolve(payload.upload as UploadResult);
          return;
        }
        const reason = payload?.error || `upload_failed_${xhr.status}`;
        rejectOnce(reason);
      };
      const formData = new FormData();
      formData.append('file', file);
      xhr.send(formData);
    });
  })();

  const cancel = () => {
    if (settled) return;
    xhr.abort();
  };

  if (options?.signal) {
    if (options.signal.aborted) {
      cancel();
    } else {
      options.signal.addEventListener('abort', cancel, { once: true });
    }
  }

  return { promise, cancel };
}

export function uploadFile(file: File, onProgress?: (percent: number) => void): Promise<UploadResult> {
  return createUploadTask(file, { onProgress }).promise;
}
