import { normalizeAiParseResult } from './ai-normalize.js';

const apiBase = () => (typeof import.meta.env !== 'undefined' && import.meta.env.VITE_AI_API_BASE) || '';

async function post(path, payload, { signal } = {}) {
  const accessToken = (typeof import.meta.env !== 'undefined' && import.meta.env.VITE_AI_ACCESS_TOKEN) || '';
  const response = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', ...(accessToken ? { 'X-Fanfan-Access': accessToken } : {}) },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `AI服务暂时不可用（${response.status}）`);
  return result;
}


export async function parseWithAi({ text, imageDataUrl, date, wishes = [] }) {
  const catalog = wishes.map(({ id, title }) => ({ id, title })).slice(0, 100);
  const result = await post('/api/ai/parse', { text, imageDataUrl, date, wishes: catalog });
  return normalizeAiParseResult(result, date, wishes);
}

export function requestAiReport(summary) {
  return post('/api/ai/report', { summary });
}

export function estimateWishBudget({ title, condition }) {
  return post('/api/ai/wish-budget', { title, condition });
}

export function compressImage(file, maxSide = 1600) {
  if (!file || !file.type.startsWith('image/')) return Promise.reject(new Error('请选择图片文件'));
  if (file.size > 12 * 1024 * 1024) return Promise.reject(new Error('图片不能超过12MB'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('无法读取图片'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('图片格式不受支持'));
      image.onload = () => {
        const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
