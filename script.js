/* ==========================================================================
   CORNERSTONE PORTAL — AI Onboarding Specialist
   Multi-Phase Verification, Client Credentials Gate & Theme Inversion
   ========================================================================== */

// ─── STORAGE KEYS ────────────────────────────────────────────────────────────
const STORAGE_KEY_CLIENT = 'cornerstone_logged_in_client';
const STORAGE_KEY_VAULT  = 'cornerstone_vault_state';
const STORAGE_KEY_STEP   = 'cornerstone_chat_step';
const STORAGE_KEY_CHAT   = 'cornerstone_chat_html';

// ─── CONVERSATION STEP ENUM ───────────────────────────────────────────────────
const STEP = {
    WELCOME:        'welcome',
    GET_EMAIL:      'get_email',
    GET_DATE:       'get_date',
    GET_FULL_NAME:  'get_full_name',
    GET_PHONE:      'get_phone',
    VERIFICATION:   'verification',
    PHASE2:         'phase2',
    COMPLETE:       'complete'
};

// ─── GLOBAL STATE ─────────────────────────────────────────────────────────────
let consoleAttachedFile = null;
let loggedInClient = null;
let chatStep = STEP.WELCOME;
let tempEmailForVerification = "";

let vaultState = {
    email: null,
    effectiveDate: null,
    fullName: null,
    phone: null,
    driversLicense: null,
    vin: null,
    ein: null,
    businessName: null,
    status: 'Incomplete'
};

// ─── PERSISTENCE ──────────────────────────────────────────────────────────────
function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY_VAULT, JSON.stringify(vaultState));
        localStorage.setItem(STORAGE_KEY_STEP, chatStep);
        if (loggedInClient) {
            localStorage.setItem(STORAGE_KEY_CLIENT, JSON.stringify(loggedInClient));
        } else {
            localStorage.removeItem(STORAGE_KEY_CLIENT);
        }
        const container = document.getElementById('console-chat-messages');
        if (container) localStorage.setItem(STORAGE_KEY_CHAT, container.innerHTML);
    } catch(e) {}
}

function loadFromStorage() {
    try {
        const savedClient = localStorage.getItem(STORAGE_KEY_CLIENT);
        const savedVault  = localStorage.getItem(STORAGE_KEY_VAULT);
        const savedStep   = localStorage.getItem(STORAGE_KEY_STEP);
        const savedChat   = localStorage.getItem(STORAGE_KEY_CHAT);

        if (savedVault) vaultState = { ...vaultState, ...JSON.parse(savedVault) };
        
        if (savedClient) {
            loggedInClient = JSON.parse(savedClient);
            activateClientPortalTheme(loggedInClient);
        } else {
            if (savedStep) chatStep = savedStep;
            if (savedChat) {
                const container = document.getElementById('console-chat-messages');
                if (container) {
                    container.innerHTML = savedChat;
                    container.scrollTop = container.scrollHeight;
                    restoreOptionButtons();
                }
            } else {
                renderWelcome();
            }
        }
    } catch(e) {
        renderWelcome();
    }
}

function clearStorage() {
    localStorage.removeItem(STORAGE_KEY_VAULT);
    localStorage.removeItem(STORAGE_KEY_STEP);
    localStorage.removeItem(STORAGE_KEY_CHAT);
    localStorage.removeItem(STORAGE_KEY_CLIENT);
}

function restoreOptionButtons() {
    document.querySelectorAll('.chat-option-btn[data-action]').forEach(btn => {
        btn.onclick = () => handleWelcomeChoice(btn.getAttribute('data-action'));
    });
}

// Close left sidebar when clicking outside on the main console area
document.addEventListener('click', (e) => {
    const vault = document.getElementById('staging-vault-panel');
    const hamburger = document.getElementById('portal-hamburger-container');
    if (vault && vault.classList.contains('open')) {
        if (!vault.contains(e.target) && (!hamburger || !hamburger.contains(e.target))) {
            vault.classList.remove('open');
        }
    }
});

// ─── DOM READY ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('console-drop-zone');
    if (dropZone) {
        ['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, highlightConsole, false));
        ['dragleave','drop'].forEach(ev   => dropZone.addEventListener(ev, unhighlightConsole, false));
        dropZone.addEventListener('drop', handleConsoleDrop, false);
    }
    
    // Check keyup inside verification code to auto-submit when 6 digits are hit
    const codeInput = document.getElementById('verification-code-input');
    if (codeInput) {
        codeInput.addEventListener('keyup', (e) => {
            if (codeInput.value.trim().length === 6) {
                submitEmailVerificationCode();
            }
        });
    }

    loadFromStorage();
    updateStagingVaultUI();
});

// ─── WELCOME RENDER ───────────────────────────────────────────────────────────
function renderWelcome() {
    const container = document.getElementById('console-chat-messages');
    if (!container) return;
    container.innerHTML = '';
    
    appendConsoleMessageUI('assistant', 
        `Hello! Welcome to Cornerstone Insurance Firm.\n\nI'm your dedicated AI customer assistant. Do you need an insurance quote?`, 
        true
    );
}

// ─── DRAG & DROP ──────────────────────────────────────────────────────────────
function highlightConsole(e) {
    e.preventDefault(); e.stopPropagation();
    document.getElementById('console-drop-zone')?.classList.add('dragover');
}
function unhighlightConsole(e) {
    e.preventDefault(); e.stopPropagation();
    document.getElementById('console-drop-zone')?.classList.remove('dragover');
}
function handleConsoleDrop(e) {
    e.preventDefault(); e.stopPropagation();
    const files = e.dataTransfer?.files;
    if (files?.length > 0) {
        const fi = document.getElementById('console-file-input');
        if (fi) { fi.files = files; fi.dispatchEvent(new Event('change', { bubbles: true })); }
    }
}
function handleConsoleFileSelect(e) {
    const files = e.target.files;
    if (files?.length > 0) {
        consoleAttachedFile = files[0];
        
        // Show file bubble
        const bubble = document.getElementById('console-staged-file-bubble');
        const nameEl = document.getElementById('console-staged-file-name');
        if (bubble) bubble.classList.remove('hidden');
        if (nameEl) nameEl.innerText = consoleAttachedFile.name;
        
        // If logged in, ask what document this represents
        if (loggedInClient) {
            appendConsoleMessageUI('assistant', 
                `I received your file upload: **${consoleAttachedFile.name}**.\n\nPlease specify which document this represents:`,
                false,
                true // show Phase 2 file options
            );
        } else {
            // General guest file upload
            appendConsoleMessageUI('user', `📎 Uploaded document: ${consoleAttachedFile.name}`);
        }
        
        saveToStorage();
    }
}
function clearConsoleStagedFile() {
    consoleAttachedFile = null;
    const fi = document.getElementById('console-file-input');
    if (fi) fi.value = '';
    document.getElementById('console-staged-file-bubble')?.classList.add('hidden');
    saveToStorage();
}

// ─── INTAKE START CHOICE ──────────────────────────────────────────────────────
function handleWelcomeChoice(action) {
    appendConsoleMessageUI('user', action === 'yes' ? 'Yes, I need a quote' : 'I just have a question');
    if (action === 'yes') {
        chatStep = STEP.GET_EMAIL;
        appendConsoleMessageUI('assistant', 
            `Perfect! I will guide you through our secure intake process to formulate a tailored estimated quote.\n\nFirst, what is your email address?`
        );
    } else {
        appendConsoleMessageUI('assistant', 
            `I'd be glad to answer any questions you have. Feel free to ask about deductibles, premiums, or different coverages. If you ever decide you need an insurance quote, just let me know!`
        );
    }
    saveToStorage();
}

// ─── CHAT HISTORY GATHERER ───────────────────────────────────────────────────
function getChatHistory() {
    const messages = [];
    const container = document.getElementById('console-chat-messages');
    if (container) {
        const bubbles = container.querySelectorAll('.chat-message');
        bubbles.forEach(b => {
            const isUser = b.classList.contains('user');
            const p = b.querySelector('p');
            if (p) {
                messages.push({
                    role: isUser ? 'user' : 'assistant',
                    content: p.innerText
                });
            }
        });
    }
    return messages.slice(-10);
}

// ─── GENERAL CONVERSATION & CHAT CONTROL ─────────────────────────────────────
async function sendConsoleChatMessage() {
    const inputField = document.getElementById('console-chat-input-field');
    const text = inputField.value.trim();
    if (!text && !consoleAttachedFile) return;
    inputField.value = '';

    // Trigger active visual state
    document.getElementById('contact-chat-console')?.classList.add('chat-active');

    if (text) appendConsoleMessageUI('user', text);

    // 1. If in Phase 2 (Logged In), handle document and telemetry ingestion conversationally
    if (loggedInClient && chatStep === STEP.PHASE2) {
        await processPhase2Dialogue(text);
        return;
    }

    // 2. If in Phase 1 (Guest Intake), handle step verification
    if (chatStep !== STEP.COMPLETE) {
        const guidedReply = await processIntakeStep(text);
        if (guidedReply !== null) {
            const loaderId = appendConsoleLoaderUI();
            await sleep(400);
            document.getElementById(loaderId)?.remove();
            appendConsoleMessageUI('assistant', guidedReply);
            updateStagingVaultUI();
            saveToStorage();
            return;
        }
    }

    // 3. Otherwise handle general questions conversationally (allows talking about any topic!)
    if (text) {
        const loaderId = appendConsoleLoaderUI();
        
        // Try static/local knowledge base first
        const knowledgeReply = handleKnowledgeQuery(text);
        if (knowledgeReply !== null) {
            await sleep(400);
            document.getElementById(loaderId)?.remove();
            appendConsoleMessageUI('assistant', knowledgeReply);
            
            // Re-prompt if welcome state
            if (chatStep === STEP.WELCOME) {
                setTimeout(() => {
                    appendConsoleMessageUI('assistant', `By the way, do you need an insurance quote? I can help you start a new request in seconds.`);
                }, 600);
            }
            saveToStorage();
            return;
        }

        // Call backend Gemini/local AI for full conversational richness (handles any topic!)
        try {
            const apiBase = window.location.origin;
            const history = getChatHistory();
            const res = await fetch(`${apiBase}/api/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: history
                })
            });
            document.getElementById(loaderId)?.remove();
            if (res.ok) {
                const data = await res.json();
                appendConsoleMessageUI('assistant', data.reply);
            } else {
                throw new Error("API call failed");
            }
        } catch(e) {
            document.getElementById(loaderId)?.remove();
            appendConsoleMessageUI('assistant', buildFreeFormReply(text));
        }
        saveToStorage();
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── PHASE 1 INTAKE PROCESSOR ────────────────────────────────────────────────
async function processIntakeStep(text) {
    switch (chatStep) {
        case STEP.WELCOME: {
            const lower = text.toLowerCase();
            if (lower.includes('yes') || lower.includes('quote') || lower.includes('trucking') || lower.includes('insurance') || lower.includes('need')) {
                chatStep = STEP.GET_EMAIL;
                return `Perfect! I will guide you through our secure intake process to formulate a tailored estimated quote.\n\nFirst, what is your email address?`;
            }
            return null; // pass through to general QA
        }

        case STEP.GET_EMAIL: {
            const email = extractEmail(text);
            if (!email) {
                return `That doesn't look like a valid email address. Could you check and enter it again?`;
            }
            vaultState.email = email;
            chatStep = STEP.GET_DATE;
            return `Got it! What is the desired effective date for your coverage? (Format: mm/dd/yyyy)`;
        }

        case STEP.GET_DATE: {
            const dateInput = text.trim();
            if (!validateDateMDY(dateInput)) {
                return `Please provide the effective date in mm/dd/yyyy format.`;
            }
            vaultState.effectiveDate = dateInput;
            chatStep = STEP.GET_FULL_NAME;
            return `Got it, starting ${vaultState.effectiveDate}! Next, what is your full name (first and last name together)?`;
        }

        case STEP.GET_FULL_NAME: {
            const nameInput = text.trim();
            const parts = nameInput.split(/\s+/);
            if (parts.length < 2) {
                return `To process your quote, please enter your first and last name together.`;
            }
            vaultState.fullName = nameInput.split(' ').map(word => capitalize(word)).join(' ');
            chatStep = STEP.GET_PHONE;
            return `Nice to meet you, ${vaultState.fullName}! Finally, what is your best phone number?`;
        }

        case STEP.GET_PHONE: {
            const phone = extractPhone(text);
            if (!phone) {
                return `Please enter a valid 10-digit phone number.`;
            }
            vaultState.phone = phone;
            chatStep = STEP.VERIFICATION;
            
            // Trigger 6-digit code generation
            await triggerVerificationCodeRequest();
            return `Perfect! I have compiled your intake details.\n\nFor your security, we need to verify your email address before continuing. A 6-digit verification code has been sent to ${vaultState.email}.\n\nPlease enter the verification code in the overlay modal on your screen.`;
        }

        default:
            return null;
    }
}

// ─── PHASE 2 DIALOGUE ENGINE (LOGGED IN PORTAL) ──────────────────────────────
async function processPhase2Dialogue(text) {
    const loaderId = appendConsoleLoaderUI();

    const lower = text.toLowerCase();

    // Check for explicit updates / driver additions
    if (lower.includes('add driver') || lower.includes('driver') || lower.includes('policy update') || lower.includes('update policy')) {
        await submitPortalUpdateMessage(text);
    }

    // Direct conversational inputs for EIN or Business Name
    const einMatch = text.match(/\b\d{2}-\d{7}\b/) || text.match(/\b\d{9}\b/);
    if (einMatch) {
        let ein = einMatch[0];
        if (ein.length === 9 && !ein.includes('-')) {
            ein = ein.slice(0,2) + '-' + ein.slice(2);
        }
        vaultState.ein = ein;
        await updateTelemetryOnServer();
    }

    // Conversational business name detection
    if (lower.startsWith('my business is') || lower.startsWith('business name is') || lower.includes('company is') || lower.includes('llc') || lower.includes('inc') || lower.includes('transport')) {
        let bName = text.replace(/my business is|business name is|company is/gi, '').trim();
        vaultState.businessName = bName;
        await updateTelemetryOnServer();
    }

    // Call backend Gemini/local AI for full conversational richness (keeps track of what info is provided and pushes for missing)
    try {
        const apiBase = window.location.origin;
        const history = getChatHistory();
        const res = await fetch(`${apiBase}/api/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: history,
                vaultState: vaultState
            })
        });
        document.getElementById(loaderId)?.remove();
        if (res.ok) {
            const data = await res.json();
            appendConsoleMessageUI('assistant', data.reply);
        } else {
            throw new Error("API call failed");
        }
    } catch(e) {
        document.getElementById(loaderId)?.remove();
        appendConsoleMessageUI('assistant', buildFallbackPhase2Guide());
    }

    updateStagingVaultUI();
    saveToStorage();
}

function buildFallbackPhase2Guide() {
    let reply = `Welcome, ${loggedInClient.name}! To complete your commercial trucking insurance quote estimate, please provide the remaining details:\n\n`;
    let count = 1;
    
    if (!vaultState.businessName) {
        reply += `${count++}. Legal Business Name (type your business name)\n`;
    }
    if (!vaultState.ein) {
        reply += `${count++}. EIN (type your 9-digit EIN)\n`;
    }
    if (!vaultState.driversLicense) {
        reply += `${count++}. Owner's Driver's License photo (click the '+' icon below to upload)\n`;
    }
    if (!vaultState.vin) {
        reply += `${count++}. VIN # Photo (click the '+' icon below to upload)\n`;
    }

    if (count === 1) {
        reply = `All documents and details have been successfully uploaded, ${loggedInClient.name}!\n\nAn agent will be in touch with you shortly after uploading the remaining documents.`;
    } else {
        reply += `\nFeel free to ask me general questions about insurance, deductibles, or coverages at any time!`;
    }
    return reply;
}

// ─── AUTH OVERLAY ACTIONS ────────────────────────────────────────────────────
function openLoginOverlay() {
    document.getElementById('auth-overlay-container').classList.add('active');
    document.getElementById('auth-card-verify').classList.remove('active');
    document.getElementById('auth-card-password').classList.remove('active');
    document.getElementById('auth-card-login').classList.add('active');
}

function closeAuthOverlay() {
    document.getElementById('auth-overlay-container').classList.remove('active');
}

async function triggerVerificationCodeRequest() {
    tempEmailForVerification = vaultState.email;
    try {
        const response = await fetch('/api/clients/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: tempEmailForVerification })
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Pop up a highly visual alert so they can easily test the email verification code
            showPortalNotification(`📬 VERIFICATION CODE DISPATCHED to ${tempEmailForVerification}! (Debug Code: ${data.debugCode})`);
            
            // Open the overlay gating dialog
            document.getElementById('auth-overlay-container').classList.add('active');
            document.getElementById('auth-card-login').classList.remove('active');
            document.getElementById('auth-card-password').classList.remove('active');
            
            const cardVerify = document.getElementById('auth-card-verify');
            cardVerify.classList.add('active');
            document.getElementById('verify-email-display').innerText = tempEmailForVerification;
            
            const verifyInput = document.getElementById('verification-code-input');
            verifyInput.value = '';
            verifyInput.focus();
        }
    } catch(e) {
        showPortalNotification('⚠️ Error triggering verification email. Fallback active.', '#ef4444');
    }
}

async function submitEmailVerificationCode() {
    const input = document.getElementById('verification-code-input');
    const err = document.getElementById('verify-error-msg');
    const code = input.value.trim();
    
    if (code.length !== 6) {
        err.innerText = "Please enter the complete 6-digit verification code.";
        err.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/clients/verify-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: tempEmailForVerification, code })
        });

        if (response.ok) {
            err.style.display = 'none';
            // Code matched! Slide to password setup card
            document.getElementById('auth-card-verify').classList.remove('active');
            
            const cardPass = document.getElementById('auth-card-password');
            cardPass.classList.add('active');
            document.getElementById('setup-password-input').focus();
        } else {
            const data = await response.json();
            err.innerText = data.error || "Incorrect verification code. Please try again.";
            err.style.display = 'block';
            input.value = '';
            input.focus();
        }
    } catch(e) {
        err.innerText = "Connection lost. Please try again.";
        err.style.display = 'block';
    }
}

async function resendVerificationCode() {
    await triggerVerificationCodeRequest();
}

async function submitPasswordSetup() {
    const input = document.getElementById('setup-password-input');
    const err = document.getElementById('password-error-msg');
    const password = input.value.trim();

    if (password.length < 6) {
        err.innerText = "For security, password must be at least 6 characters long.";
        err.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/clients/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: vaultState.email,
                name: vaultState.fullName,
                phone: vaultState.phone,
                effectiveDate: vaultState.effectiveDate,
                password: password
            })
        });

        if (response.ok) {
            const data = await response.json();
            err.style.display = 'none';
            
            // Login successful!
            loggedInClient = data.client;
            activateClientPortalTheme(loggedInClient);
            closeAuthOverlay();
            
            // Greet customer in chat
            appendConsoleMessageUI('assistant', 
                `🎉 Verification complete! Welcome to your secure Cornerstone Client Portal, ${loggedInClient.name}!\n\nYour session is active. I have toggled our inverted purple console. To finalize your commercial trucking insurance quote, please upload/provide:\n\n• A photo of the owner's driver's license\n• A photo of your VIN #\n• Your 9-digit EIN\n• Your Legal Business Name`
            );
            
            updateStagingVaultUI();
            saveToStorage();
        } else {
            const data = await response.json();
            err.innerText = data.error || "Failed to register account.";
            err.style.display = 'block';
        }
    } catch(e) {
        err.innerText = "Registration connection failed.";
        err.style.display = 'block';
    }
}

async function submitClientLogin() {
    const emailInput = document.getElementById('login-email-input');
    const passInput = document.getElementById('login-password-input');
    const err = document.getElementById('login-error-msg');

    const email = emailInput.value.trim();
    const password = passInput.value.trim();

    if (!email || !password) {
        err.innerText = "Please supply both email and password.";
        err.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/clients/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (response.ok) {
            const data = await response.json();
            err.style.display = 'none';
            
            loggedInClient = data.client;
            
            // Restore vaultState details
            vaultState.email = loggedInClient.email;
            vaultState.fullName = loggedInClient.name;
            vaultState.phone = loggedInClient.phone;
            vaultState.effectiveDate = loggedInClient.effectiveDate;
            vaultState.businessName = loggedInClient.businessName;
            vaultState.ein = loggedInClient.ein;
            vaultState.driversLicense = loggedInClient.driversLicense;
            vaultState.vin = loggedInClient.vin;
            vaultState.status = loggedInClient.status;
            
            activateClientPortalTheme(loggedInClient);
            closeAuthOverlay();
            
            // Greet in chat
            appendConsoleMessageUI('assistant', 
                `🔑 Authorized! Welcome back, ${loggedInClient.name}!\n\nYour personal client portal is active. If there are any outstanding telemetry documents needed (Driver's License, VIN Photo, EIN, Business Name), please upload them to finalize your quote estimate.`
            );
            
            updateStagingVaultUI();
            saveToStorage();
        } else {
            err.innerText = "Incorrect email address or password. Please try again.";
            err.style.display = 'block';
        }
    } catch(e) {
        err.innerText = "Server authorization connection failed.";
        err.style.display = 'block';
    }
}

function logoutClientPortal() {
    loggedInClient = null;
    chatStep = STEP.WELCOME;
    
    // Clear theme inversion
    document.body.classList.remove('inverted-client-portal');
    
    // Hide hamburger menu container
    const hamburgerContainer = document.getElementById('portal-hamburger-container');
    if (hamburgerContainer) hamburgerContainer.style.display = 'none';
    
    // Hide logout container
    const logoutContainer = document.getElementById('vault-logout-container');
    if (logoutContainer) logoutContainer.style.display = 'none';

    // Close the collapsable left sidebar
    const vault = document.getElementById('staging-vault-panel');
    if (vault) vault.classList.remove('open');
    
    // Show login trigger button
    document.getElementById('btn-portal-login-trigger').style.display = 'inline-flex';
    
    // Reset inputs
    resetConversation();
    showPortalNotification('🔒 Session closed. Returned to secure guest terminal.');
}

// ─── TELEMETRY & MULTIPART UPLOADS ──────────────────────────────────────────
async function updateTelemetryOnServer() {
    if (!loggedInClient) return;

    const fd = new FormData();
    fd.append('clientId', loggedInClient.id);
    if (vaultState.ein) fd.append('ein', vaultState.ein);
    if (vaultState.businessName) fd.append('businessName', vaultState.businessName);

    try {
        const response = await fetch('/api/clients/update-telemetry', {
            method: 'POST',
            body: fd
        });

        if (response.ok) {
            const data = await response.json();
            loggedInClient = data.client;
            
            // Synchronize UI
            if (loggedInClient.businessName) {
                const subTitle = document.getElementById('hamburger-business-subtitle');
                if (subTitle) {
                    subTitle.innerText = loggedInClient.businessName;
                    subTitle.style.display = 'block';
                }
            }
            
            updateStagingVaultUI();
            saveToStorage();
        }
    } catch(e) {
        console.error("Telemetry sync failed:", e);
    }
}

// Handle specialized document uploads from options buttons in Phase 2
async function stageClientDocument(type) {
    if (!consoleAttachedFile || !loggedInClient) return;

    appendConsoleMessageUI('user', `Staged upload as: ${type === 'license' ? "Owner's Driver's License" : "VIN Photo"}`);

    const fd = new FormData();
    fd.append('clientId', loggedInClient.id);
    if (type === 'license') {
        fd.append('driversLicense', consoleAttachedFile);
    } else {
        fd.append('vin', consoleAttachedFile);
    }

    // Visual loader
    const loaderId = appendConsoleLoaderUI();

    try {
        const response = await fetch('/api/clients/update-telemetry', {
            method: 'POST',
            body: fd
        });

        document.getElementById(loaderId)?.remove();

        if (response.ok) {
            const data = await response.json();
            loggedInClient = data.client;
            
            vaultState.driversLicense = loggedInClient.driversLicense;
            vaultState.vin = loggedInClient.vin;
            vaultState.status = loggedInClient.status;
            
            appendConsoleMessageUI('assistant', `✅ Successfully securely ingested your ${type === 'license' ? "Owner's Driver's License Photo" : "VIN # Photo"}.`);
            
            clearConsoleStagedFile();
            updateStagingVaultUI();
            saveToStorage();
            
            checkPhase2Completion();
        } else {
            throw new Error("Telemetry upload failed");
        }
    } catch(e) {
        document.getElementById(loaderId)?.remove();
        appendConsoleMessageUI('assistant', `⚠️ Upload failed. Please check connection and try again.`);
    }
}

function checkPhase2Completion() {
    if (vaultState.businessName && vaultState.ein && vaultState.driversLicense && vaultState.vin) {
        appendConsoleMessageUI('assistant', 
            `🎉 Excellent news, ${loggedInClient.name}! All your documents and details have been successfully received and validated!\n\nAn agent will be in touch with you shortly after uploading the remaining documents.`
        );
        chatStep = STEP.COMPLETE;
        saveToStorage();
    }
}

// Client live notifications route (updates or adding drivers)
async function submitPortalUpdateMessage(msg) {
    if (!loggedInClient) return;

    try {
        await fetch('/api/clients/submit-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId: loggedInClient.id,
                message: msg
            })
        });
    } catch(e) {
        console.error("Live update submission failed:", e);
    }
}

// Activate inverted color scheme
function activateClientPortalTheme(client) {
    chatStep = STEP.PHASE2;
    
    // 1. Invert body color theme instantly
    document.body.classList.add('inverted-client-portal');
    
    // 2. Hide login trigger button
    const trigger = document.getElementById('btn-portal-login-trigger');
    if (trigger) trigger.style.display = 'none';
    
    // 3. Show hamburger menu container
    const hamburgerContainer = document.getElementById('portal-hamburger-container');
    if (hamburgerContainer) hamburgerContainer.style.display = 'block';

    // 4. Show logout container in the sidebar
    const logoutContainer = document.getElementById('vault-logout-container');
    if (logoutContainer) logoutContainer.style.display = 'block';
    
    // Sync vaultState
    vaultState.email = client.email;
    vaultState.fullName = client.name;
    vaultState.phone = client.phone;
    vaultState.effectiveDate = client.effectiveDate;
    vaultState.businessName = client.businessName;
    vaultState.ein = client.ein;
    vaultState.driversLicense = client.driversLicense;
    vaultState.vin = client.vin;
    vaultState.status = client.status;
}

// ─── STAGING VAULT UI UPDATER ────────────────────────────────────────────────
function updateStagingVaultUI() {
    const elType    = document.getElementById('vault-badge-type');
    const elName    = document.getElementById('vault-identity');
    const elEmail   = document.getElementById('vault-email');
    const elPhone   = document.getElementById('vault-phone');
    const elScope   = document.getElementById('vault-scope');
    const elFile    = document.getElementById('vault-file');
    const elDetails = document.getElementById('vault-details');
    if (!elType) return;

    // Badges
    if (loggedInClient) {
        setVaultBadge(elType, 'Portal Active', '#10b981', 'rgba(16,185,129,0.15)', 'rgba(16,185,129,0.3)');
    } else {
        setVaultBadge(elType, 'Guest Intake', '#a78bfa', 'rgba(167,139,250,0.15)', 'rgba(167,139,250,0.25)');
    }

    // Name
    elName.classList.toggle('unpopulated', !vaultState.fullName);
    elName.innerText = vaultState.fullName || 'Not Detected';

    // Email
    elEmail.classList.toggle('unpopulated', !vaultState.email);
    elEmail.innerText = vaultState.email || 'Not Detected';

    // Phone
    elPhone.classList.toggle('unpopulated', !vaultState.phone);
    elPhone.innerText = vaultState.phone || 'Not Detected';

    // Scope / Target
    let scopeText = "Effective: " + (vaultState.effectiveDate || 'Pending');
    if (vaultState.businessName) {
        scopeText += ` | Biz: ${vaultState.businessName}`;
    }
    elScope.classList.toggle('unpopulated', !vaultState.effectiveDate);
    elScope.innerText = scopeText;

    // Staged Docs
    let docsText = "No files attached";
    if (vaultState.driversLicense || vaultState.vin) {
        docsText = "";
        if (vaultState.driversLicense) docsText += "✓ Owner's DL ";
        if (vaultState.vin) docsText += "✓ VIN Photo";
    }
    elFile.classList.toggle('unpopulated', !vaultState.driversLicense && !vaultState.vin);
    elFile.innerText = docsText;

    // Details statement
    let statement = "Awaiting intake progression...";
    if (vaultState.ein) {
        statement = `EIN: ${vaultState.ein} | Status: ${vaultState.status}`;
    } else if (vaultState.fullName) {
        statement = `Intake details compiled for ${vaultState.fullName}.`;
    }
    elDetails.classList.toggle('unpopulated', !vaultState.fullName);
    elDetails.innerText = statement;
}

function setVaultBadge(el, text, color, bg, border) {
    el.className = 'vault-field-value staged-badge';
    el.style.background = bg;
    el.style.borderColor = border;
    el.style.color = color;
    el.innerText = text;
}

// ─── CHAT UI ──────────────────────────────────────────────────────────────────
function appendConsoleMessageUI(role, text, showOptionButtons = false, showPhase2FileOptions = false) {
    const container = document.getElementById('console-chat-messages');
    if (!container) return;

    const msg = document.createElement('div');
    msg.classList.add('chat-message', role);

    if (showOptionButtons) {
        const p = document.createElement('p');
        p.style.whiteSpace = 'pre-line';
        p.innerText = text;
        msg.appendChild(p);

        const opts = document.createElement('div');
        opts.className = 'chat-option-buttons';

        const btn1 = document.createElement('button');
        btn1.className = 'chat-option-btn';
        btn1.setAttribute('data-action', 'yes');
        btn1.innerHTML = '<i class="fa-solid fa-file-contract"></i> Yes, I need a quote';
        btn1.onclick = () => handleWelcomeChoice('yes');

        const btn2 = document.createElement('button');
        btn2.className = 'chat-option-btn';
        btn2.setAttribute('data-action', 'no');
        btn2.innerHTML = '<i class="fa-solid fa-circle-question"></i> No, just a question';
        btn2.onclick = () => handleWelcomeChoice('no');

        opts.appendChild(btn1);
        opts.appendChild(btn2);
        msg.appendChild(opts);
    } else if (showPhase2FileOptions) {
        const p = document.createElement('p');
        p.style.whiteSpace = 'pre-line';
        p.innerText = text;
        msg.appendChild(p);

        const opts = document.createElement('div');
        opts.className = 'chat-option-buttons';

        const btn1 = document.createElement('button');
        btn1.className = 'chat-option-btn';
        btn1.innerHTML = '<i class="fa-solid fa-address-card"></i> Owner\'s Driver\'s License';
        btn1.onclick = () => stageClientDocument('license');

        const btn2 = document.createElement('button');
        btn2.className = 'chat-option-btn';
        btn2.innerHTML = '<i class="fa-solid fa-car-rear"></i> Vehicle VIN # Photo';
        btn2.onclick = () => stageClientDocument('vin');

        opts.appendChild(btn1);
        opts.appendChild(btn2);
        msg.appendChild(opts);
    } else {
        const p = document.createElement('p');
        p.style.whiteSpace = 'pre-line';
        p.innerText = text;
        msg.appendChild(p);
    }

    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    saveToStorage();
}

function appendConsoleLoaderUI() {
    const container = document.getElementById('console-chat-messages');
    if (!container) return '';
    const id = 'loader-' + Date.now();
    const msg = document.createElement('div');
    msg.classList.add('chat-message', 'assistant', 'loader-msg');
    msg.id = id;
    const p = document.createElement('p');
    p.innerHTML = '<span class="chat-dot"></span><span class="chat-dot"></span><span class="chat-dot"></span>';
    msg.appendChild(p);
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    return id;
}

// ─── RESET ────────────────────────────────────────────────────────────────────
function resetConversation() {
    vaultState = { email: null, effectiveDate: null, fullName: null, phone: null, driversLicense: null, vin: null, ein: null, businessName: null, status: 'Incomplete' };
    chatStep = STEP.WELCOME;
    consoleAttachedFile = null;
    clearConsoleStagedFile();
    clearStorage();
    const container = document.getElementById('console-chat-messages');
    if (container) container.innerHTML = '';
    document.getElementById('contact-chat-console')?.classList.remove('chat-active');
    renderWelcome();
    updateStagingVaultUI();
}

// ─── KNOWLEDGE QUERY ROUTER ──────────────────────────────────────────────────
function handleKnowledgeQuery(text) {
    const lower = text.toLowerCase().trim();

    // Math calculation engine
    const mathResult = tryMath(text);
    if (mathResult !== null) {
        return `The answer is **${mathResult}**.\n\nIs there anything else I can help you with — insurance questions or policy guidance?`;
    }

    // Warm greetings
    if (/^(hi|hello|hey|good morning|good afternoon|good evening|howdy)[\s!?.,]*$/.test(lower)) {
        const name = loggedInClient ? `, ${loggedInClient.name}` : '';
        return `Hello${name}! I'm Cornerstone's Insurance Concierge Specialist. I can answer any questions you have about coverage, deductibles, premiums, or file ingestion.\n\nWhat can I do for you today?`;
    }

    const isQuestion = text.includes('?') || /^(what|how|why|when|where|who|can|does|do|is|are|will|should|could|would|tell me|explain|define|difference between|what's|whats|how much|how many)/.test(lower);
    if (!isQuestion) return null;

    return routeInsuranceQuestion(lower);
}

function routeInsuranceQuestion(lower) {
    if (/deductible/.test(lower)) {
        return `A **deductible** is the amount you pay out-of-pocket before your insurance policy begins to cover a loss.\n\n• **Higher deductibles** translate directly to lower monthly/annual premiums, suitable if you rarely file claims.\n• **Lower deductibles** minimize your out-of-pocket burden in a loss, but raise your premium.\n\nWould you like to explore custom deductible adjustments?`;
    }
    if (/premium/.test(lower)) {
        return `An insurance **premium** is the recurring amount you pay to keep your policy active. Premiums are structured based on: age, physical location, commercial risk profile, credit score, and chosen limits.`;
    }
    if (/liabilit/.test(lower)) {
        return `**Liability insurance** defends your assets if you're found legally responsible for bodily injury or property damage to third parties. Most states mandate minimum liability thresholds; commercial trucking typically requires higher limits ($1,000,000) for sound operations.`;
    }
    if (/comprehensive|collision/.test(lower)) {
        return `🚗 **Collision Coverage** covers accident damage to your vehicle resulting from contact with another car or object.\n\n🌪️ **Comprehensive Coverage** covers physical damage from non-collision events: weather, theft, hail, vandalism, or hitting animals. Both are required if you finance your fleet.`;
    }
    if (/trucking|commercial|cargo/.test(lower)) {
        return `Cornerstone specializes in **Commercial Trucking Insurance**. We provide robust general liability, motor truck cargo, physical damage, and bobtail coverage. To secure a trucking quote, simply start our intake form or log in to complete your telemetry!`;
    }
    if (/cornerstone|your company/.test(lower)) {
        return `**Cornerstone Insurance Firm** is a high-grade insurance agency based in New Orleans, Louisiana, serving clients nationwide.\n\n📞 Phone: 844-345-6765\n📧 Email: info@cornerstoneinsurancefirm.com\n📍 Address: 9029 Jefferson Hwy, New Orleans, LA`;
    }
    return null;
}

// ─── ARITHMETIC ENGINE ────────────────────────────────────────────────────────
function tryMath(text) {
    if (/^\s*\(?\d{3}\)?[\s\.\-]?\d{3}[\s\.\-]\d{4}\s*$/.test(text)) return null;
    const digitsOnly = text.replace(/[\s\-\.\(\)]/g, '');
    if (/^\d{10,11}$/.test(digitsOnly)) return null;

    const cleaned = text
        .replace(/what is|what's|calculate|compute|solve|how much is|equals/gi, '')
        .replace(/[^0-9\s\+\-\*\/\.\(\)%]/g, ' ')
        .trim();

    if (!cleaned || !/[\+\-\*\/]/.test(cleaned)) return null;
    if (/[a-zA-Z]{2,}/.test(cleaned)) return null;

    try {
        if (!/^[\d\s\+\-\*\/\.\(\)%]+$/.test(cleaned)) return null;
        const expr = cleaned.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
        const result = new Function(`"use strict"; return (${expr})`)();
        if (typeof result === 'number' && isFinite(result)) {
            return Number.isInteger(result) ? result.toLocaleString() : parseFloat(result.toFixed(6)).toLocaleString();
        }
    } catch(e) {}
    return null;
}

function buildFreeFormReply(text) {
    return `Thank you for sharing that. As an AI insurance specialist, I am happy to have a conversation about any topic or resolve custom questions you have! If you want to start a new trucking quote, simply tell me you need a quote or say yes to getting started!`;
}

// ─── TEXT HELPERS ─────────────────────────────────────────────────────────────
function extractFirstWord(text) {
    return text.trim().split(/\s+/)[0].replace(/[^a-zA-Z'-]/g, '');
}
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
function extractEmail(text) {
    const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return m ? m[0] : null;
}
function extractPhone(text) {
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 10) {
        return `(${digits.slice(-10,-7)}) ${digits.slice(-7,-4)}-${digits.slice(-4)}`;
    }
    return null;
}
function validateDateMDY(str) {
    return /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/.test(str.trim());
}

// ─── PREMIUM CUSTOM WIDGET NOTIFICATIONS ──────────────────────────────────────
function showPortalNotification(message, color = 'var(--text-purple)') {
    const alertEl = document.createElement('div');
    alertEl.style.position = 'fixed';
    alertEl.style.bottom = '30px';
    alertEl.style.left = '30px';
    alertEl.style.background = 'rgba(12, 8, 28, 0.96)';
    alertEl.style.color = color;
    alertEl.style.border = '1px solid rgba(167, 139, 250, 0.4)';
    alertEl.style.padding = '0.9rem 1.6rem';
    alertEl.style.fontFamily = 'var(--font-luxury)';
    alertEl.style.fontSize = '0.95rem';
    alertEl.style.letterSpacing = '0.04rem';
    alertEl.style.boxShadow = '0 15px 40px rgba(0, 0, 0, 0.7), 0 0 20px rgba(124, 58, 237, 0.3)';
    alertEl.style.borderRadius = 'var(--border-radius)';
    alertEl.style.zIndex = '999999';
    alertEl.style.backdropFilter = 'blur(15px)';
    alertEl.style.opacity = '0';
    alertEl.style.transform = 'translateY(15px)';
    alertEl.style.transition = 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
    alertEl.innerHTML = `<i class="fa-regular fa-bell" style="margin-right: 8px;"></i> ${message}`;
    
    document.body.appendChild(alertEl);
    
    setTimeout(() => {
        alertEl.style.opacity = '1';
        alertEl.style.transform = 'translateY(0)';
    }, 100);
    
    setTimeout(() => {
        alertEl.style.opacity = '0';
        alertEl.style.transform = 'translateY(15px)';
        setTimeout(() => alertEl.remove(), 600);
    }, 6000);
}
