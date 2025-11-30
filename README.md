a full-stack application built with bun and hono that authenticates solana wallet ownership without requiring direct wallet connections. uses **zero-knowledge proofs (zk)** for privacy-preserving, connection-less verification.

- **zero-knowledge proof verification**: privacy-preserving wallet verification using message signing
- **connection-less**: no persistent wallet connections required
- **privacy-focused**: private keys never leave user's wallet
- **modern web client**: clean, user-friendly interface for wallet verification
- **whitelist support**: only whitelisted wallet addresses can initiate verification
- **replay attack prevention**: timestamp validation ensures signatures occurred after challenge issuance
- **in-memory challenge storage**: fast, temporary storage for challenge codes
- **no transaction fees**: verification happens instantly without blockchain transactions

### pre-requisites

- [bun](https://bun.sh) installed (v1.0+)

### installation

```bash
bun install
```

### building the client

the client typescript needs to be compiled to javascript:

```bash
bun run build:client
```

### running the server

```bash
bun run dev
```

the server will start on `http://localhost:3000` (or the port specified in `PORT`).

**access the web client**: open `http://localhost:3000` in your browser to use the interactive verification interface.

### api endpoints

#### post `/init-auth`

initiates the authentication process by generating a challenge code for zk proof verification.

**request:**
```json
{
  "walletAddress": "YourWalletAddress11111111111111111111111111111111"
}
```

**response:**
```json
{
  "code": "ABC123",
  "message": "Verify wallet ownership: ABC123\nTimestamp: 1234567890\nAddress: YourWalletAddress...",
  "instructions": "Sign the message above with your wallet to generate a zero-knowledge proof. Your private key will never leave your wallet."
}
```

#### post `/verify-auth`

verifies wallet ownership using zk proof (ed25519 signature verification).

**request:**
```json
{
  "walletAddress": "YourWalletAddress11111111111111111111111111111111",
  "signature": "base58EncodedSignature..."
}
```

**response (success):**
```json
{
  "success": true,
  "token": "session_1234567890_abc123",
  "message": "Wallet ownership verified successfully"
}
```

**response (failure):**
```json
{
  "success": false,
  "error": "Verification failed. Invalid signature."
}
```

#### get `/health`

health check endpoint.

**response:**
```json
{
  "status": "ok",
  "timestamp": 1234567890
}
```

### how it works

1. **initiation**: user calls `/init-auth` with their wallet address
   - server checks if address is whitelisted
   - generates a unique challenge code and message
   - stores challenge with timestamp

2. **user action**: user signs the challenge message with their wallet
   - wallet prompts for signature (one-time, no persistent connection)
   - signature proves wallet ownership without revealing private key
   - no transaction fees required

3. **verification**: user calls `/verify-auth` with signature
   - server verifies ed25519 signature cryptographically
   - validates signature matches challenge message and wallet address
   - returns success with session token if verified


### important notes

- **zk proof method**: uses message signing to create a zero-knowledge proof. provides privacy and user experience - no transaction fees, instant verification, and private keys never leave the wallet.
- **wallet support**: works with phantom and all solana wallets that support message signing.
- challenge codes are stored in-memory and will be lost on server restart
- the client is served as static files from the `public/` directory
- no blockchain queries needed - verification is purely cryptographic
- for production, consider:
  - using a persistent database for challenge storage
  - implementing proper jwt tokens instead of mock tokens
  - adding challenge expiration (e.g., 5-10 minutes)
  - rate limiting to prevent abuse
  - adding logging and monitoring
  - setting up proper build pipeline for client assets

