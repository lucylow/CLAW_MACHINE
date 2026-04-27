import axios from 'axios';

const BASE_URL = '/api';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach wallet address to every request if available
client.interceptors.request.use((config) => {
  const wallet = localStorage.getItem('oa_wallet');
  if (wallet) config.headers['x-wallet-address'] = wallet;
  return config;
});

// Normalize errors
client.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Request failed';
    return Promise.reject(new Error(msg));
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
