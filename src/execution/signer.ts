import { GetPublicKeyCommand, KMSClient, SignCommand, SigningAlgorithmSpec } from '@aws-sdk/client-kms';
import { VersionedTransaction } from '@solana/web3.js';

/** Signing boundary. Implementations MUST NOT export private key material. */
export interface Signer {
  /** Base58 wallet public key controlled by this signer. */
  readonly publicKey: string;
  /** Accepts a base64-encoded unsigned Solana transaction and returns a signed base64 transaction. */
  sign(base64: string): Promise<string>;
}

/**
 * AWS KMS Ed25519 signer.
 *
 * The KMS private key never leaves AWS KMS. KMS signs the serialized Solana
 * message bytes directly (SigningAlgorithm=ED25519_SHA_512), then the signature is
 * inserted into the matching required-signer slot of the VersionedTransaction.
 *
 * IMPORTANT: this adapter is a code draft and has NOT been validated against a
 * real AWS account/KMS key in this repository. Manual verification is mandatory
 * before enabling LIVE.
 */
export class AwsKmsSigner implements Signer {
  private constructor(
    private readonly kms: KMSClient,
    private readonly keyId: string,
    public readonly publicKey: string,
  ) {}

  static async fromEnvironment(env: NodeJS.ProcessEnv = process.env): Promise<AwsKmsSigner> {
    const keyId = env.AWS_KMS_KEY_ID?.trim();
    const region = (env.AWS_KMS_REGION || env.AWS_REGION)?.trim();
    if (!keyId) throw new Error('AWS_KMS_KEY_ID_REQUIRED');
    if (!region) throw new Error('AWS_REGION_REQUIRED');

    // KMSClient uses the standard AWS credential provider chain, including
    // AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_SESSION_TOKEN when supplied.
    // No credentials are embedded in source code.
    const kms = new KMSClient({ region });
    const response = await kms.send(new GetPublicKeyCommand({ KeyId: keyId }));
    const publicKey = ed25519PublicKeyFromDer(response.PublicKey);
    return new AwsKmsSigner(kms, keyId, publicKey);
  }

  async sign(base64: string): Promise<string> {
    let tx: VersionedTransaction;
    try {
      tx = VersionedTransaction.deserialize(Buffer.from(base64, 'base64'));
    } catch {
      throw new Error('KMS_SIGN_TRANSACTION_DESERIALIZATION_FAILED');
    }

    const signerIndex = tx.message.staticAccountKeys
      .slice(0, tx.message.header.numRequiredSignatures)
      .findIndex(key => key.toBase58() === this.publicKey);
    if (signerIndex < 0) throw new Error('KMS_PUBLIC_KEY_NOT_A_REQUIRED_TRANSACTION_SIGNER');

    const response = await this.kms.send(new SignCommand({
      KeyId: this.keyId,
      Message: tx.message.serialize(),
      MessageType: 'RAW',
      SigningAlgorithm: SigningAlgorithmSpec.ED25519_SHA_512,
    }));
    if (!response.Signature || response.Signature.length !== 64) throw new Error('KMS_INVALID_ED25519_SIGNATURE');

    tx.signatures[signerIndex] = Uint8Array.from(response.Signature);
    return Buffer.from(tx.serialize()).toString('base64');
  }
}

function ed25519PublicKeyFromDer(der?: Uint8Array): string {
  if (!der || der.length < 32) throw new Error('KMS_PUBLIC_KEY_MISSING');
  // AWS KMS returns an X.509 SubjectPublicKeyInfo DER blob. For Ed25519 the
  // raw public key is the final 32 bytes. Keep the parser deliberately strict.
  const raw = Uint8Array.from(der.slice(-32));
  if (raw.length !== 32) throw new Error('KMS_PUBLIC_KEY_INVALID_LENGTH');
  return base58Encode(raw);
}

function base58Encode(bytes: Uint8Array): string {
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  if (!bytes.length) return '';
  const digits=[0];
  for (const byte of bytes) {
    let carry=byte;
    for (let i=0;i<digits.length;i++) {
      const n=digits[i]! * 256 + carry;
      digits[i]=n % 58;
      carry=Math.floor(n/58);
    }
    while(carry){digits.push(carry%58);carry=Math.floor(carry/58);}
  }
  let zeros=0; while(zeros<bytes.length && bytes[zeros]===0) zeros++;
  return '1'.repeat(zeros)+digits.reverse().map(d=>alphabet[d]!).join('');
}
