// api configuration
const API_BASE_URL = window.location.origin;

// base58 encoding (simplified for browser)
// in production, use a proper bs58 library or cdn
function base58Encode(bytes: Uint8Array): string {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    if (bytes.length === 0) return '';
    
    let num = BigInt(0);
    for (let i = 0; i < bytes.length; i++) {
        num = num * 256n + BigInt(bytes[i]);
    }
    
    let result = '';
    while (num > 0) {
        result = alphabet[Number(num % 58n)] + result;
        num = num / 58n;
    }
    
    // handle leading zeros
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
        result = '1' + result;
    }
    
    return result;
}

// state management
interface AppState {
    walletAddress: string;
    challengeCode: string;
    verificationAddress: string;
    sessionToken: string | null;
    challengeMessage?: string;
}

let appState: AppState = {
    walletAddress: '',
    challengeCode: '',
    verificationAddress: '',
    sessionToken: null,
};

// dom elements
const step1 = document.getElementById('step-1')!;
const step2 = document.getElementById('step-2')!;
const step3 = document.getElementById('step-3')!;
const loading = document.getElementById('loading')!;
const loadingText = document.getElementById('loading-text')!;

const walletForm = document.getElementById('wallet-form') as HTMLFormElement;
const walletInput = document.getElementById('wallet-address') as HTMLInputElement;
const initBtn = document.getElementById('init-btn') as HTMLButtonElement;
const verifyBtn = document.getElementById('verify-btn') as HTMLButtonElement;
const backBtn = document.getElementById('back-btn') as HTMLButtonElement;
const copyTokenBtn = document.getElementById('copy-token-btn') as HTMLButtonElement;
const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement;
const retryBtn = document.getElementById('retry-btn') as HTMLButtonElement;
const restartErrorBtn = document.getElementById('restart-error-btn') as HTMLButtonElement;

const challengeCodeDisplay = document.getElementById('challenge-code');
const copyMessageBtn = document.getElementById('copy-message-btn') as HTMLButtonElement;
const messageDisplay = document.getElementById('challenge-message');
const sessionTokenDisplay = document.getElementById('session-token')!;
const successMessage = document.getElementById('success-message')!;
const errorMessage = document.getElementById('error-message')!;
const errorText = document.getElementById('error-text')!;

// utility functions
function showLoading(message: string = 'Processing...') {
    loadingText.textContent = message;
    loading.classList.remove('hidden');
}

function hideLoading() {
    loading.classList.add('hidden');
}

function showStep(stepNumber: 1 | 2 | 3) {
    step1.classList.add('hidden');
    step2.classList.add('hidden');
    step3.classList.add('hidden');

    if (stepNumber === 1) {
        step1.classList.remove('hidden');
    } else if (stepNumber === 2) {
        step2.classList.remove('hidden');
    } else if (stepNumber === 3) {
        step3.classList.remove('hidden');
        // reset message states when showing step 3
        if (successMessage) successMessage.classList.add('hidden');
        if (errorMessage) errorMessage.classList.add('hidden');
    }
}

function showSuccess(token: string) {
    // ensure error is hidden first
    if (errorMessage) {
        errorMessage.classList.add('hidden');
    }
    // then show success
    if (successMessage) {
        successMessage.classList.remove('hidden');
    }
    if (sessionTokenDisplay) {
        sessionTokenDisplay.textContent = token;
    }
    appState.sessionToken = token;
}

function showError(message: string) {
    // ensure success is hidden first
    if (successMessage) {
        successMessage.classList.add('hidden');
    }
    // then show error
    if (errorMessage) {
        errorMessage.classList.remove('hidden');
    }
    if (errorText) {
        errorText.textContent = message;
    }
}

function resetApp() {
    appState = {
        walletAddress: '',
        challengeCode: '',
        sessionToken: null,
    };
    walletInput.value = '';
    showStep(1);
}

// api functions
async function initAuth(walletAddress: string): Promise<{ 
    code: string; 
    message: string;
    instructions: string;
}> {
    const response = await fetch(`${API_BASE_URL}/init-auth`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletAddress }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to initialize authentication');
    }

    return response.json();
}

async function verifyAuth(
    walletAddress: string, 
    signature: string
): Promise<{ success: boolean; token?: string; error?: string }> {
    const response = await fetch(`${API_BASE_URL}/verify-auth`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            walletAddress,
            signature
        }),
    });

    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
    }

    return data;
}

// sign message using wallet (zk proof generation)
async function signMessage(message: string): Promise<string | null> {
    try {
        // check if phantom wallet is available
        const provider = (window as any).solana;
        
        if (!provider || !provider.isPhantom) {
            // try other wallet providers
            const solflare = (window as any).solflare;
            if (solflare && solflare.signMessage) {
                const encodedMessage = new TextEncoder().encode(message);
                const response = await solflare.signMessage(encodedMessage, 'utf8');
                // convert uint8array to base58
                return base58Encode(response.signature);
            }
            
            throw new Error('No Solana wallet found. Please install Phantom or Solflare.');
        }

        // connect to wallet (one-time, if needed)
        if (!provider.isConnected) {
            await provider.connect();
        }

        // sign message
        const encodedMessage = new TextEncoder().encode(message);
        const signedMessage = await provider.signMessage(encodedMessage, 'utf8');
        
        // convert signature to base58 (solana format)
        // signedmessage.signature is uint8array
        const signature = base58Encode(signedMessage.signature);
        
        // disconnect after signing (privacy-focused)
        try {
            if (provider.disconnect) {
                await provider.disconnect();
            }
        } catch (e) {
            // ignore disconnect errors
        }
        
        return signature;
    } catch (error) {
        console.error('Signing error:', error);
        throw error;
    }
}


// event handlers
walletForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const walletAddress = walletInput.value.trim();
    
    if (!walletAddress) {
        alert('Please enter a wallet address');
        return;
    }

    // basic validation
    if (walletAddress.length < 32 || walletAddress.length > 44) {
        alert('Invalid wallet address format');
        return;
    }

    try {
        showLoading('Initializing authentication...');
        initBtn.disabled = true;

        const result = await initAuth(walletAddress);
        
        appState.walletAddress = walletAddress;
        appState.challengeCode = result.code;
        appState.challengeMessage = result.message;

        // update ui
        if (challengeCodeDisplay) {
            challengeCodeDisplay.textContent = result.code;
        }
        
        if (messageDisplay && result.message) {
            messageDisplay.textContent = result.message;
        }

        showStep(2);
    } catch (error) {
        alert(error instanceof Error ? error.message : 'Failed to initialize authentication');
    } finally {
        hideLoading();
        initBtn.disabled = false;
    }
});

verifyBtn.addEventListener('click', async () => {
    if (!appState.walletAddress || !appState.challengeCode) {
        alert('Please complete step 1 first');
        return;
    }

    try {
        showLoading('Verifying...');
        verifyBtn.disabled = true;

        // zk proof method: sign message
        if (!appState.challengeMessage) {
            throw new Error('Challenge message not found');
        }

        showLoading('Signing message with your wallet...');
        const signature = await signMessage(appState.challengeMessage);
        
        if (!signature) {
            throw new Error('Failed to sign message');
        }
        
        showLoading('Verifying ZK proof...');

        const result = await verifyAuth(
            appState.walletAddress,
            signature
        );

        if (result.success && result.token) {
            showStep(3);
            showSuccess(result.token);
        } else {
            showStep(3);
            showError(result.error || 'Verification failed. Please try again.');
        }
    } catch (error) {
        showStep(3);
        showError(error instanceof Error ? error.message : 'Verification failed');
    } finally {
        hideLoading();
        verifyBtn.disabled = false;
    }
});

backBtn.addEventListener('click', () => {
    showStep(1);
});

copyTokenBtn.addEventListener('click', () => {
    if (appState.sessionToken) {
        navigator.clipboard.writeText(appState.sessionToken).then(() => {
            const originalText = copyTokenBtn.textContent;
            copyTokenBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyTokenBtn.textContent = originalText;
            }, 2000);
        }).catch(() => {
            alert('Failed to copy to clipboard');
        });
    }
});

copyMessageBtn?.addEventListener('click', () => {
    if (appState.challengeMessage) {
        navigator.clipboard.writeText(appState.challengeMessage).then(() => {
            const originalText = copyMessageBtn.textContent;
            copyMessageBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyMessageBtn.textContent = originalText;
            }, 2000);
        }).catch(() => {
            alert('Failed to copy to clipboard');
        });
    }
});

restartBtn.addEventListener('click', () => {
    resetApp();
});

retryBtn.addEventListener('click', () => {
    showStep(2);
});

restartErrorBtn.addEventListener('click', () => {
    resetApp();
});

// initialize app
resetApp();

