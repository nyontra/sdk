# @nyontra/sdk

The official JavaScript SDK for the **Nyontra Blockchain Ecosystem**. Seamlessly integrate NYON transactions, locking mechanisms, and project management into your Web3 applications.

---

## 🚀 Installation

Install the SDK via npm:

```bash
npm install @nyontra/sdk
```

---

## 🛠 Getting Started

### 1. Get Your API Key
Login to the [Nyontra Developer Portal](https://developers.nyontra.com) to create a project and generate your `apiKey`.

### 2. Initialize the SDK
Initialize the SDK with your API key and the network configuration.

```javascript
import { NyontraSDK } from '@nyontra/sdk';

const sdk = new NyontraSDK({
  apiKey: 'YOUR_PROJECT_API_KEY',
  baseUrl: 'https://api.nyontra.com', // Optional: defaults to production
});
```

---

## 💎 Features

### 🏦 Locking NYON
Lock NYON tokens for a specific duration (in blocks or seconds).

```javascript
try {
  const transaction = await sdk.blockchain.lockNyon(100, 3600);
  console.log('Transaction Successful:', transaction.txid);
} catch (error) {
  if (error.message === 'NyontraSDK: Invalid API Key') {
    console.error('Authentication Error: Please check your API key.');
  } else {
    console.error('Failed to lock NYON:', error.message);
  }
}
```

### 🔓 Unlocking NYON
Unlock a previously locked transaction using its ID.

```javascript
const result = await sdk.blockchain.unlockNyon('tx-123456789');
console.log('Unlock Status:', result.status);
```

---

## 🔒 Security & Architecture

The SDK communicates with the **Nyontra API Gateway**. This architecture ensures that sensitive blockchain interactions are validated against your developer project settings. All requests are authenticated via the `x-api-key` header.

---

## 📄 License
MIT © Nyontra Foundation
