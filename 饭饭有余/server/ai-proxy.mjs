import http from 'node:http';
import { PARSER_PROMPT, wishCatalog } from './entry-prompt.mjs';
import { openAccountDatabase, createAccountService } from './accounts.mjs';

try { process.loadEnvFile?.('.env'); } catch {}

// Cloud platforms such as Railway inject PORT. Locally, keep the proxy bound to
// loopback unless the developer explicitly opts into LAN access.
const PORT = Number(process.env.PORT || process.env.AI_PROXY_PORT || 8787);
const HOST = process.env.AI_PROXY_HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const API_KEY = process.env.ARK_API_KEY || '';
const MODEL = process.env.ARK_MODEL || 'doubao-seed-2-1-lite-260915';
const ACCESS_TOKEN = process.env.AI_ACCESS_TOKEN || '';
const ARK_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const MAX_BODY = 8 * 1024 * 1024;
const LIMIT_PER_HOUR = Number(process.env.AI_RATE_LIMIT || 60);
const allowedOrigins = new Set((process.env.AI_ALLOWED_ORIGINS || 'http://localhost:5173,https://localhost,http://localhost,capacitor://localhost').split(',').map(value => value.trim()).filter(Boolean));
const usage = new Map();
const accountDb = await openAccountDatabase(process.env.DATABASE_URL).catch(error => {
  console.error('Account database unavailable:', error.code || 'connection error');
  return null;
});
const accounts = createAccountService(accountDb);

const REPORT_PROMPT = `你是「饭饭有余」的月度账本解读助手。只返回JSON，不要Markdown。
输入金额已由程序精确计算，不得自行重算、改写或虚构。
返回：{"summary":"","findings":[{"title":"","evidence":"","level":"good|notice|warning"}],"suggestions":[""]}。
要求：像朋友一样简洁，每个结论必须引用输入中的具体数字；最多3个发现和3条建议；不提供投资、借贷或医疗建议。`;

const WISH_BUDGET_PROMPT = `你是「饭饭有余」的愿望预算助手。只返回JSON，不要Markdown。
根据中国大陆普通学生的日常消费场景，给出粗略预算参考：{"low":0,"suggested":0,"high":0,"reason":"","assumption":""}。
要求：金额单位为人民币元，low<=suggested<=high且均大于0；只做消费规划参考，不声称实时价格；reason一句话说明依据；assumption说明默认数量、档次或城市条件。无法合理估算时将三个金额都设为null。`;

function cors(origin) {
  return origin && allowedOrigins.has(origin) ? origin : allowedOrigins.has('*') ? '*' : '';
}

function send(res, status, value, origin = '') {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(value));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('图片或请求过大'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid object');
        resolve(value);
      }
      catch { reject(Object.assign(new Error('请求格式无效'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function allowed(ip) {
  const now = Date.now();
  const current = usage.get(ip);
  if (!current || now - current.startedAt >= 3600000) { usage.set(ip, { startedAt: now, count: 1 }); return true; }
  current.count += 1;
  return current.count <= LIMIT_PER_HOUR;
}

async function callArk(messages, maxTokens) {
  if (!API_KEY) throw Object.assign(new Error('服务端还没有配置 ARK_API_KEY'), { status: 503 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(ARK_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        max_completion_tokens: maxTokens,
        messages
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data?.error?.message || '模型调用失败'), { status: response.status });
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw Object.assign(new Error('模型没有返回可用结果'), { status: 502 });
    return JSON.parse(content);
  } catch (error) {
    if (error.name === 'AbortError') throw Object.assign(new Error('模型响应超时'), { status: 504 });
    if (error instanceof SyntaxError) throw Object.assign(new Error('模型返回的JSON无效'), { status: 502 });
    throw error;
  } finally { clearTimeout(timer); }
}

const server = http.createServer(async (req, res) => {
  const origin = cors(req.headers.origin);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}), 'Access-Control-Allow-Headers': 'Content-Type,X-Fanfan-Access,Authorization', 'Access-Control-Allow-Methods': 'POST,GET,OPTIONS' });
    res.end(); return;
  }
  if (req.method === 'GET' && req.url === '/api/health') return send(res, 200, { ok: true, model: MODEL, configured: Boolean(API_KEY), voice: false, quickEntryVersion: 2, accounts: Boolean(accountDb), accountRecoveryVersion: 1 }, origin);
  if (req.url?.startsWith('/api/account/')) {
    if (req.headers.origin && !origin) return send(res, 403, { error: '此来源尚未获准访问账号服务' });
    try { return send(res, 200, await accounts.handle(req, readJson), origin); }
    catch (error) {
      if (!error.status) console.error('Account request failed:', error.code || 'unknown');
      return send(res, error.status || 503, { error: error.status ? error.message : '账号服务暂时不可用，请稍后重试' }, origin);
    }
  }
  if (req.method !== 'POST' || !['/api/ai/parse', '/api/ai/report', '/api/ai/wish-budget'].includes(req.url)) return send(res, 404, { error: '接口不存在' }, origin);
  if (ACCESS_TOKEN && req.headers['x-fanfan-access'] !== ACCESS_TOKEN) return send(res, 401, { error: '内测访问码无效' }, origin);
  const ip = req.socket.remoteAddress || 'unknown';
  if (!allowed(ip)) return send(res, 429, { error: '本小时AI试用次数已用完' }, origin);
  try {
    const body = await readJson(req);
    if (req.url === '/api/ai/parse') {
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : '';
      const image = typeof body.imageDataUrl === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(body.imageDataUrl) ? body.imageDataUrl : '';
      if (!text && !image) throw Object.assign(new Error('请输入记账文字或选择图片'), { status: 400 });
      const content = [];
      if (image) content.push({ type: 'image_url', image_url: { url: image } });
      content.push({ type: 'text', text: `今天日期：${body.date || '未知'}\n现有愿望目录：${JSON.stringify(wishCatalog(body))}\n用户输入：${text || '请解析图片中的消费凭证'}` });
      return send(res, 200, await callArk([{ role: 'system', content: PARSER_PROMPT }, { role: 'user', content }], 2400), origin);
    }
    if (req.url === '/api/ai/wish-budget') {
      const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : '';
      const condition = typeof body.condition === 'string' ? body.condition.trim().slice(0, 120) : '';
      if (!title) throw Object.assign(new Error('请先填写愿望内容'), { status: 400 });
      const estimate = await callArk([{ role: 'system', content: WISH_BUDGET_PROMPT }, { role: 'user', content: JSON.stringify({ title, condition }) }], 500);
      const low = Number(estimate.low);
      const suggested = Number(estimate.suggested);
      const high = Number(estimate.high);
      if (![low, suggested, high].every(value => Number.isFinite(value) && value > 0) || low > suggested || suggested > high) throw Object.assign(new Error('暂时无法给出可靠预算，请手动填写'), { status: 422 });
      return send(res, 200, { low, suggested, high, reason: String(estimate.reason || '').slice(0, 120), assumption: String(estimate.assumption || '').slice(0, 120) }, origin);
    }
    if (!body.summary || typeof body.summary !== 'object') throw Object.assign(new Error('缺少月度统计'), { status: 400 });
    return send(res, 200, await callArk([{ role: 'system', content: REPORT_PROMPT }, { role: 'user', content: JSON.stringify(body.summary) }], 1200), origin);
  } catch (error) {
    send(res, error.status || 500, { error: error.message || '服务端错误' }, origin);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Fanfan AI proxy listening on http://${HOST}:${server.address().port}`);
  console.log(API_KEY ? `Model: ${MODEL}` : 'ARK_API_KEY is not configured; health check only.');
});
