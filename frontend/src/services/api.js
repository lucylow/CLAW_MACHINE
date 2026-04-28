import axios from 'axios';

const BASE_URL = '/api';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

function genRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class ApiClientError extends Error {
  constructor({
    code = 'INTERNAL_001_UNEXPECTED',
    message = 'Request failed',
    category = 'internal',
    recoverable = true,
    retryable = false,
    requestId,
    details = {},
    status,
  }) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.category = category;
    this.recoverable = recoverable;
    this.retryable = retryable;
    this.requestId = requestId;
    this.details = details;
    this.status = status;
  }
}

// Attach wallet address to every request if available
client.interceptors.request.use((config) => {
  const wallet = localStorage.getItem('oa_wallet');
  if (wallet) config.headers['x-wallet-address'] = wallet;
  config.headers['x-request-id'] = config.headers['x-request-id'] || genRequestId();
  return config;
});

// Normalize errors
client.interceptors.response.use(
  (res) => {
    const payload = res.data;
    if (payload && typeof payload === 'object' && 'ok' in payload) {
      return payload.data;
    }
    return payload;
  },
  (err) => {
    const data = err.response?.data;
    const normalized = data?.error || {};
    const error = new ApiClientError({
      code: normalized.code || (err.code === 'ECONNABORTED' ? 'NET_001_TIMEOUT' : 'NET_000_REQUEST_FAILED'),
      message: normalized.message || err.message || 'Request failed',
      category: normalized.category || (!navigator.onLine ? 'external' : 'internal'),
      recoverable: typeof normalized.recoverable === 'boolean' ? normalized.recoverable : true,
      retryable: typeof normalized.retryable === 'boolean' ? normalized.retryable : err.code === 'ECONNABORTED',
      requestId: normalized.requestId || err.response?.headers?.['x-request-id'],
      details: normalized.details || {},
      status: err.response?.status,
    });
    return Promise.reject(error);
  }
);

// ─── Agent endpoints ───────────────────────────────────────────────────────────

export const agentApi = {
  /** Fetch agent status and backend info */
  getStatus: () => client.get('/agent/status'),

  /** Run the agent with a text prompt */
  run: (input, walletAddress) =>
    client.post('/agent/run', { input, walletAddress }),

  /** List available skills */
  listSkills: () => client.get('/agent/skills'),

  /** Execute a specific skill */
  executeSkill: (skillName, params) =>
    client.post('/agent/skills/execute', { skill: skillName, params }),

  /** Fetch agent conversation history */
  getHistory: (walletAddress) =>
    client.get('/agent/history', { params: { wallet: walletAddress } }),

  /** Clear agent conversation history */
  clearHistory: (walletAddress) =>
    client.delete('/agent/history', { data: { walletAddress } }),

  /** Richer insights: memory stats, events, reflections */
  getInsights: (walletAddress) =>
    client.get('/agent/insights', { params: { wallet: walletAddress } }),

  /** Health check with memory/skill stats */
  health: () => client.get('/health', { baseURL: '' }),
};

// ─── Storage endpoints ─────────────────────────────────────────────────────────

export const storageApi = {
  /** Upload data to 0G Storage */
  upload: (data, metadata = {}) =>
    client.post('/storage/upload', { data, metadata }),

  /** Download data from 0G Storage by root hash */
  download: (rootHash) =>
    client.get(`/storage/download/${rootHash}`),

  /** List stored items for a wallet */
  list: (walletAddress) =>
    client.get('/storage/list', { params: { wallet: walletAddress } }),
};

// ─── Wallet/Auth endpoints ─────────────────────────────────────────────────────

export const walletApi = {
  /** Register/verify wallet with the backend */
  register: (walletAddress, signature, message) =>
    client.post('/wallet/register', { walletAddress, signature, message }),

  /** Get wallet-specific agent config */
  getConfig: (walletAddress) =>
    client.get(`/wallet/${walletAddress}/config`),

  /** Update wallet-specific agent config */
  updateConfig: (walletAddress, config) =>
    client.put(`/wallet/${walletAddress}/config`, config),
};

export default client;
