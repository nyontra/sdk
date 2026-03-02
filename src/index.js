import { createApiClient } from './api.js';
import { Blockchain } from './modules/blockchain.js';

/**
 * Nyontra SDK Entry Point.
 */
export class NyontraSDK {
  /**
   * Initialize the SDK with the provided configuration.
   * @param {object} config - Configuration settings.
   * @param {string} config.apiKey - Your Developer API Key.
   * @param {string} [config.baseUrl='https://api.nyontra.com'] - Optional API Gateway URL.
   * @param {string} [config.network='mainnet'] - Optional network name.
   */
  constructor({ apiKey, baseUrl = 'https://api.nyontra.com', network = 'mainnet' }) {
    if (!apiKey) {
      throw new Error('NyontraSDK: apiKey is required for initialization.');
    }

    this.config = {
      apiKey,
      baseUrl,
      network,
    };

    // Initialize API client
    this.api = createApiClient(this.config.apiKey, this.config.baseUrl);

    // Modules
    this.blockchain = new Blockchain(this.api);
  }
}

export default NyontraSDK;
