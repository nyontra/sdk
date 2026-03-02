import axios from 'axios';

/**
 * Creates a configured Axios instance for the Nyontra Gateway.
 * @param {string} apiKey - Developer's API Key.
 * @param {string} baseURL - The Gateway URL.
 * @returns {import('axios').AxiosInstance}
 */
export const createApiClient = (apiKey, baseURL) => {
  const instance = axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
  });

  // Intercept response to handle specific gateway errors
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response && error.response.status === 401) {
        throw new Error('NyontraSDK: Invalid API Key');
      }
      if (error.response && error.response.status === 403 && error.response.data?.error === 'Feature Disabled') {
        throw new Error('NyontraSDK: This feature is currently disabled by the gateway administrator.');
      }
      if (error.response && error.response.status === 504) {
        throw new Error('NyontraSDK: Blockchain Gateway Timeout');
      }
      return Promise.reject(error);
    }
  );

  return instance;
};
