/**
 * Keypair generation and management — secp256k1, Ethereum-compatible, so keys
 * interoperate with any standard tooling (ethers, viem, MetaMask, hardware
 * wallets). Signatures are EIP-191 personal messages, verified by core.
 *
 * The private key never leaves the process: signing happens locally via
 * Account.signMessage(), and only the signature is ever sent over HTTP.
 */

import { Wallet, HDNodeWallet } from "ethers";

/** Exported key material. Store `privateKey` (or `mnemonic`) securely! */
export interface Keypair {
  /** EIP-55 checksummed address (0x + 40 hex). Core compares case-insensitively. */
  address: string;
  /** 0x-prefixed 32-byte hex private key. */
  privateKey: string;
  /** BIP-39 mnemonic phrase (present when generated via Account.generate() or fromMnemonic()). */
  mnemonic?: string;
}

/**
 * A Nyontra signing account. Wraps an ethers v6 wallet; addresses are the
 * checksummed form and lowercase themselves transparently at sign time.
 */
export class Account {
  private readonly wallet: Wallet | HDNodeWallet;

  private constructor(wallet: Wallet | HDNodeWallet) {
    this.wallet = wallet;
  }

  /** EIP-55 checksummed address. */
  get address(): string {
    return this.wallet.address;
  }

  /** 0x-prefixed private key. Keep secret. */
  get privateKey(): string {
    return this.wallet.privateKey;
  }

  /** BIP-39 mnemonic phrase, or null when the account was imported from a raw key. */
  get mnemonic(): string | null {
    return "mnemonic" in this.wallet ? (this.wallet.mnemonic?.phrase ?? null) : null;
  }

  /** Generate a fresh random account (returns its mnemonic — back it up). */
  static generate(): Account {
    return new Account(Wallet.createRandom());
  }

  /** Import from a 0x-prefixed (or bare) 32-byte hex private key. */
  static fromPrivateKey(privateKey: string): Account {
    const trimmed = privateKey.trim();
    const key = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
    return new Account(new Wallet(key));
  }

  /** Import from a BIP-39 mnemonic phrase. */
  static fromMnemonic(phrase: string): Account {
    return new Account(Wallet.fromPhrase(phrase.trim().replace(/\s+/g, " ")));
  }

  /**
   * Sign an arbitrary message with EIP-191 personal-message prefixing
   * ("\x19Ethereum Signed Message:\n" + len + message). This is exactly what
   * core's verifyMessage() expects for transaction signatures — the SDK uses
   * it internally; exposed as an escape hatch for custom/governance flows.
   */
  signMessage(message: string): Promise<string> {
    return this.wallet.signMessage(message);
  }

  /** Export the key material as a plain object. */
  export(): Keypair {
    const kp: Keypair = { address: this.address, privateKey: this.privateKey };
    if (this.mnemonic) kp.mnemonic = this.mnemonic;
    return kp;
  }
}