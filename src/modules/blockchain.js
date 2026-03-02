/**
 * Blockchain Module for Nyontra Ecosystem.
 */
export class Blockchain {
  constructor(api) {
    this.api = api;
  }

  /**
   * Locks NYON tokens for a specified duration.
   * @param {number} amount - Amount of NYON to lock.
   * @param {number} duration - Duration in blocks or seconds (depending on node config).
   * @returns {Promise<object>} Transaction details.
   */
  async lockNyon(amount, duration) {
    try {
      const response = await this.api.post('/api/v1/sdk/lock', {
        amount,
        duration,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Unlocks a previously locked NYON transaction.
   * @param {string} transactionId - The ID of the transaction to unlock.
   * @returns {Promise<object>} Transaction details.
   */
  async unlockNyon(transactionId) {
    try {
      const response = await this.api.post('/api/v1/sdk/unlock', {
        transactionId,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
}
