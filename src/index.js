import { createApiClient } from './api.js';

/**
 * Nyontra SDK Entry Point.
 */
export class NyontraSDK {
  /**
   * Initialize the SDK with the provided configuration.
   * @param {object} config - Configuration settings.
   * @param {string} config.apiKey - Your Developer API Key.
   * @param {string} [config.baseUrl='http://localhost:5000'] - Optional API Gateway URL.
   */
  constructor({ apiKey, baseUrl = 'http://localhost:5000' }) {
    if (!apiKey) {
      throw new Error('NyontraSDK: apiKey is required for initialization.');
    }

    this.config = {
      apiKey,
      baseUrl: baseUrl.replace(/\/$/, '') + '/api/v1/sdk',
    };

    // Initialize API client
    this.api = createApiClient(this.config.apiKey, this.config.baseUrl);
  }

  /**
   * Lock NYON for a user. Requires user signature.
   */
  async lock(amount, userAddress, userSignature) {
    const response = await this.api.post('/lock', { amount, userAddress, userSignature });
    return response.data;
  }

  /**
   * Unlock NYON for a user. Requires user signature.
   */
  async unlock(amount, userAddress, userSignature) {
    const response = await this.api.post('/unlock', { amount, userAddress, userSignature });
    return response.data;
  }

  /**
   * Transfer NYON between users. Requires sender's signature.
   */
  async transfer(amount, toAddress, userSignature) {
    const response = await this.api.post('/transfer', { amount, toAddress, userSignature });
    return response.data;
  }

  /**
   * Get balance for a user. Requires user signature.
   */
  async getBalance(userAddress, userSignature) {
    const response = await this.api.post('/balance', { userAddress, userSignature });
    return response.data;
  }

  /**
   * Check status of a transaction.
   */
  async getTransactionStatus(txid) {
    const response = await this.api.get(`/transaction-status/${txid}`);
    return response.data;
  }

  /**
   * Validate a Nyontra address.
   */
  async validateAddress(address) {
    const response = await this.api.get(`/validate-address/${address}`);
    return response.data;
  }

  /**
   * Get block information by height. (Admin Switch Controlled)
   */
  async getBlockInfo(height) {
    const response = await this.api.get(`/block-info/${height}`);
    return response.data;
  }
}

export default NyontraSDK;
