import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

// whitelist of allowed wallet addresses
const WHITELIST: string[] = [
  // add your whitelisted wallet addresses here
  "JYNr9Garqmx8DX9Hszgz6YjVw2ReeoTxpx6Xfj3WPPe",
  "5nBn9euKbPZMSSyRt1r78RhMWYFir6WYP2JZVw9pmpRB"
  // example: 'YourWalletAddress11111111111111111111111111111111',
];

// in-memory storage for challenge codes
// map structure: walletAddress -> { code: string, timestamp: number }
const challengeStore = new Map<string, { 
  code: string; 
  timestamp: number;
}>();

// challenge code generation
function generateChallengeCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// verify ed25519 signature (solana uses ed25519)
function verifySignature(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  try {
    return nacl.sign.detached.verify(message, signature, publicKey);
  } catch {
    return false;
  }
}

// validate solana wallet address format
function isValidWalletAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

const app = new Hono();

// enable cors for frontend integration
app.use('/*', cors());

/**
 * post /init-auth
 * generates a challenge code for zk proof wallet verification
 * 
 * request body: { walletAddress: string }
 * response: { code: string, message: string, instructions: string }
 */
app.post('/init-auth', async (c) => {
  try {
    const { walletAddress } = await c.req.json();

    // validate input
    if (!walletAddress || typeof walletAddress !== 'string') {
      return c.json({ error: 'walletAddress is required' }, 400);
    }

    // validate wallet address format
    if (!isValidWalletAddress(walletAddress)) {
      return c.json({ error: 'Invalid wallet address format' }, 400);
    }

    // check whitelist
    if (!WHITELIST.includes(walletAddress)) {
      return c.json({ error: 'Wallet address not whitelisted' }, 403);
    }

    // generate challenge code and message for zk proof
    const code = generateChallengeCode();
    const timestamp = Date.now();
    const message = `Verify wallet ownership: ${code}\nTimestamp: ${timestamp}\nAddress: ${walletAddress}`;
    
    challengeStore.set(walletAddress, { 
      code, 
      timestamp
    });

    return c.json({
      code,
      message,
      instructions: 'Sign the message above with your wallet to generate a zero-knowledge proof. Your private key will never leave your wallet.',
    });
  } catch (error) {
    console.error('Error in /init-auth:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * post /verify-auth
 * verifies wallet ownership using zk proof (ed25519 signature verification)
 * 
 * request body: { walletAddress: string, signature: string }
 * response: { success: boolean, token?: string, error?: string }
 */
app.post('/verify-auth', async (c) => {
  try {
    const { walletAddress, signature } = await c.req.json();

    // validate input
    if (!walletAddress || typeof walletAddress !== 'string') {
      return c.json({ error: 'walletAddress is required' }, 400);
    }

    if (!signature || typeof signature !== 'string') {
      return c.json({ error: 'Signature is required for ZK proof verification' }, 400);
    }

    // validate wallet address format
    if (!isValidWalletAddress(walletAddress)) {
      return c.json({ error: 'Invalid wallet address format' }, 400);
    }

    // retrieve stored challenge
    const challenge = challengeStore.get(walletAddress);
    if (!challenge) {
      return c.json({ error: 'No challenge found. Please call /init-auth first.' }, 404);
    }

    const { code, timestamp: challengeTimestamp } = challenge;

    try {
      // reconstruct the challenge message
      const message = `Verify wallet ownership: ${code}\nTimestamp: ${challengeTimestamp}\nAddress: ${walletAddress}`;
      const messageBytes = new TextEncoder().encode(message);

      // decode signature from base58
      const signatureBytes = bs58.decode(signature);

      // get user's public key
      const userPublicKey = new PublicKey(walletAddress);
      const publicKeyBytes = userPublicKey.toBytes();

      // verify ed25519 signature
      const verified = verifySignature(messageBytes, signatureBytes, publicKeyBytes);

      if (verified) {
        // clean up challenge after successful verification
        challengeStore.delete(walletAddress);

        // generate mock session token (in production, use proper jwt)
        const mockToken = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        return c.json({
          success: true,
          token: mockToken,
          message: 'Wallet ownership verified successfully',
        });
      } else {
        return c.json(
          {
            success: false,
            error: 'Verification failed. Invalid signature.',
          },
          401
        );
      }
    } catch (error) {
      console.error('ZK proof verification error:', error);
      return c.json({ error: 'Invalid signature format' }, 400);
    }
  } catch (error) {
    console.error('Error in /verify-auth:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

// serve static files from public directory (must be after api routes)
app.get('*', serveStatic({ root: './public' }));
app.get('/', serveStatic({ path: './public/index.html' }));

// start server
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

console.log(`Server running on http://localhost:${port}`);
console.log(`Whitelist contains ${WHITELIST.length} addresses`);

export default {
  port,
  fetch: app.fetch,
};

