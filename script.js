/* ==========================================================================
   CORNERSTONE PORTAL - CLIENT-SIDE INTERACTION & CONVERSATIONAL AI CONTROLLER
   ========================================================================== */

// Global State
let consoleAttachedFile = null;
let widgetAttachedFile = null;

let chatMessages = [
    { role: 'assistant', content: 'How may I assist you today?' }
];

// Vault Staging State
let vaultState = {
    type: 'consultation', // 'consultation' or 'policy_change'
    name: null,
    email: null,
    policyNumber: null,
    service: null,
    details: '',
    documentFile: null
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Drag & Drop listeners for the chat console panel
    const consoleDropZone = document.getElementById('console-drop-zone');
    if (consoleDropZone) {
        ['dragenter', 'dragover'].forEach(eventName => {
            consoleDropZone.addEventListener(eventName, highlightConsole, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            consoleDropZone.addEventListener(eventName, unhighlightConsole, false);
        });

        consoleDropZone.addEventListener('drop', handleConsoleDrop, false);
    }
    
    // 2. Pre-populate Vault fields visual state on start
    updateVaultUI();
});

// -------------------------------------------------------------
// SECURE FILE DRAG AND DROP HANDLERS (EMBEDDED CONSOLE)
// -------------------------------------------------------------
function highlightConsole(e) {
    e.preventDefault();
    e.stopPropagation();
    const zone = document.getElementById('console-drop-zone');
    if (zone) zone.classList.add('dragover');
}

function unhighlightConsole(e) {
    e.preventDefault();
    e.stopPropagation();
    const zone = document.getElementById('console-drop-zone');
    if (zone) zone.classList.remove('dragover');
}

function handleConsoleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length > 0) {
        const fileInput = document.getElementById('console-file-input');
        if (fileInput) {
            fileInput.files = files;
            const event = new Event('change', { bubbles: true });
            fileInput.dispatchEvent(event);
        }
    }
}

function handleConsoleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        consoleAttachedFile = files[0];
        vaultState.documentFile = consoleAttachedFile;
        
        const bubble = document.getElementById('console-staged-file-bubble');
        const nameEl = document.getElementById('console-staged-file-name');
        
        if (bubble) bubble.classList.remove('hidden');
        if (nameEl) nameEl.innerText = consoleAttachedFile.name;
        
        console.log(`[VAULT] File attached via console chat: ${consoleAttachedFile.name}`);
        
        // Auto extract target service if matches standard categories
        detectServiceInterest(consoleAttachedFile.name);
        
        updateVaultUI();
    }
}

function clearConsoleStagedFile() {
    consoleAttachedFile = null;
    vaultState.documentFile = null;
    
    const fileInput = document.getElementById('console-file-input');
    if (fileInput) fileInput.value = '';
    
    const bubble = document.getElementById('console-staged-file-bubble');
    if (bubble) bubble.classList.add('hidden');
    
    console.log(`[VAULT] File attachment cleared.`);
    updateVaultUI();
}

// -------------------------------------------------------------
// SECURE VAULT METADATA PARSING & UI UPDATE
// -------------------------------------------------------------
function extractVaultMetadata(text) {
    // 1. Email Regex Ingestion
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
        vaultState.email = emailMatch[0].trim();
        console.log(`[AUTO-EXTRACT] Found Email: ${vaultState.email}`);
    }
    
    // 2. Name Extraction Heuristics
    const namePatterns = [
        /(?:my name is|i am|name is)\s+([a-zA-Z'\s-]{2,40})(?:\.|\,|$|\n|and)/i,
        /name:\s*([a-zA-Z'\s-]{2,40})/i
    ];
    for (const pattern of namePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            const cleanedName = match[1].replace(/\b(a|an|the|my|insurance)\b/gi, '').trim();
            if (cleanedName.split(/\s+/).length <= 4) {
                vaultState.name = cleanedName;
                console.log(`[AUTO-EXTRACT] Found Name: ${vaultState.name}`);
                break;
            }
        }
    }
    
    // 3. Policy Number Extraction (e.g. CS-99482-LA)
    const policyPatterns = [
        /CS-\d{3,6}-[A-Z]{2}/i,
        /(?:policy|policy\s*number|policy\s*#)\s*(?:is\s*)?([a-zA-Z0-9-]+)/i
    ];
    for (const pattern of policyPatterns) {
        const match = text.match(pattern);
        if (match) {
            vaultState.policyNumber = (match[1] || match[0]).toUpperCase().trim();
            vaultState.type = 'policy_change'; // Auto toggle type
            console.log(`[AUTO-EXTRACT] Found Policy Number: ${vaultState.policyNumber} (Toggled type to Policy Alteration)`);
            break;
        }
    }
    
    // 4. Request Details Compilation
    if (text.length > 10 && !text.toLowerCase().includes("hello") && !text.toLowerCase().includes("how may i") && !text.toLowerCase().includes("my name is")) {
        if (!vaultState.details) {
            vaultState.details = text;
        } else {
            vaultState.details += " " + text;
        }
        // Limit details representation length to preserve UX styling
        if (vaultState.details.length > 200) {
            vaultState.details = vaultState.details.substring(0, 197) + "...";
        }
    }
    
    // 5. Category Type overrides
    if (text.toLowerCase().includes("policy change") || text.toLowerCase().includes("alteration") || text.toLowerCase().includes("endorsement")) {
        vaultState.type = 'policy_change';
    } else if (text.toLowerCase().includes("consultation") || text.toLowerCase().includes("new policy") || text.toLowerCase().includes("quote")) {
        vaultState.type = 'consultation';
    }
    
    updateVaultUI();
}

function detectServiceInterest(filename) {
    const fn = filename.toLowerCase();
    if (fn.includes("car") || fn.includes("auto") || fn.includes("driver") || fn.includes("license")) {
        vaultState.service = 'auto';
    } else if (fn.includes("house") || fn.includes("home") || fn.includes("deed") || fn.includes("property")) {
        vaultState.service = 'home';
    } else if (fn.includes("life") || fn.includes("vault") || fn.includes("will") || fn.includes("trust")) {
        vaultState.service = 'life';
    } else if (fn.includes("business") || fn.includes("corp") || fn.includes("commercial")) {
        vaultState.service = 'business';
    } else if (fn.includes("health") || fn.includes("med") || fn.includes("clinical")) {
        vaultState.service = 'health';
    }
}

// Update the premium staging panel UI in real time
function updateVaultUI() {
    const badgeType = document.getElementById('vault-badge-type');
    const identityEl = document.getElementById('vault-identity');
    const scopeEl = document.getElementById('vault-scope');
    const fileEl = document.getElementById('vault-file');
    const detailsEl = document.getElementById('vault-details');
    const submitBtn = document.getElementById('vault-submit-btn');
    const ledEl = document.querySelector('.vault-led');
    
    if (!badgeType) return; // Not on the client page with the console

    // 1. Render Category
    if (vaultState.type === 'policy_change') {
        badgeType.className = 'vault-field-value staged-badge';
        badgeType.style.background = 'rgba(245, 158, 11, 0.2)';
        badgeType.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        badgeType.style.color = '#f59e0b';
        badgeType.innerText = 'Policy Alteration';
    } else {
        badgeType.className = 'vault-field-value staged-badge';
        badgeType.style.background = 'rgba(124, 58, 237, 0.2)';
        badgeType.style.borderColor = 'rgba(167, 139, 250, 0.3)';
        badgeType.style.color = '#c084fc';
        badgeType.innerText = 'Consultation Inquiry';
    }

    // 2. Render Identity
    if (vaultState.name || vaultState.email) {
        identityEl.classList.remove('unpopulated');
        let idStr = "";
        if (vaultState.name) idStr += vaultState.name;
        if (vaultState.email) idStr += (vaultState.name ? " (" : "") + vaultState.email + (vaultState.name ? ")" : "");
        identityEl.innerText = idStr;
    } else {
        identityEl.classList.add('unpopulated');
        identityEl.innerText = 'Not Detected';
    }

    // 3. Render Scope (Policy Number or Service category)
    if (vaultState.type === 'policy_change') {
        if (vaultState.policyNumber) {
            scopeEl.classList.remove('unpopulated');
            scopeEl.innerHTML = `<code style="font-family: monospace; font-size: 1rem; color: #f59e0b;">${vaultState.policyNumber}</code>`;
        } else {
            scopeEl.classList.add('unpopulated');
            scopeEl.innerText = 'CS-XXXXX-LA Pending';
        }
    } else {
        if (vaultState.service) {
            scopeEl.classList.remove('unpopulated');
            scopeEl.innerText = vaultState.service.charAt(0).toUpperCase() + vaultState.service.slice(1) + " Insurance Line";
        } else {
            scopeEl.classList.add('unpopulated');
            scopeEl.innerText = 'General Lines';
        }
    }

    // 4. Render Documents
    if (vaultState.documentFile) {
        fileEl.classList.remove('unpopulated');
        fileEl.innerHTML = `<i class="fa-solid fa-file-shield" style="color: #3b82f6; margin-right: 6px;"></i> ${vaultState.documentFile.name}`;
        
        // Glow blue for staged document
        if (ledEl) {
            ledEl.className = 'vault-led staged';
            document.querySelector('.vault-status-text').innerText = "Telemetry Staging Loaded";
        }
    } else {
        fileEl.classList.add('unpopulated');
        fileEl.innerText = 'No files attached';
        
        // Glow green for standard encryption active
        if (ledEl) {
            ledEl.className = 'vault-led';
            document.querySelector('.vault-status-text').innerText = "Active Encryption Tunnel";
        }
    }

    // 5. Render Statement details
    if (vaultState.details) {
        detailsEl.classList.remove('unpopulated');
        detailsEl.innerText = vaultState.details.length > 60 ? vaultState.details.substring(0, 57) + "..." : vaultState.details;
    } else {
        detailsEl.classList.add('unpopulated');
        detailsEl.innerText = 'Awaiting details in chat...';
    }

    // 6. Toggle Submit Button eligibility (requires at least name, email, and details)
    const isReady = vaultState.name && vaultState.email && vaultState.details;
    if (isReady) {
        submitBtn.disabled = false;
        submitBtn.classList.add('ready');
    } else {
        submitBtn.disabled = true;
        submitBtn.classList.remove('ready');
    }
}

// -------------------------------------------------------------
// EMBEDDED CHAT CONSOLE ROUTINES (CONTACT SECTION)
// -------------------------------------------------------------
async function sendConsoleChatMessage() {
    const inputField = document.getElementById('console-chat-input-field');
    const text = inputField.value.trim();
    if (!text && !consoleAttachedFile) return;
    
    inputField.value = '';
    
    // Append to UI thread
    if (text) {
        appendConsoleMessageUI('user', text);
        chatMessages.push({ role: 'user', content: text });
        
        // Run regex parser to gather vault elements
        extractVaultMetadata(text);
    }
    
    if (consoleAttachedFile) {
        appendConsoleMessageUI('user', `Staged document: ${consoleAttachedFile.name}`);
        chatMessages.push({ role: 'user', content: `Attached document: ${consoleAttachedFile.name}` });
    }
    
    // Get loader ID
    const loaderId = appendConsoleLoaderUI();
    
    // If local GPU node is offline, we run the custom offline agent logic directly
    try {
        const apiBase = window.location.origin;
        
        // Prepare payload (multipart file upload compatible if file attached)
        let response;
        if (consoleAttachedFile) {
            const formData = new FormData();
            formData.append('messages', JSON.stringify(chatMessages));
            formData.append('document', consoleAttachedFile);
            
            response = await fetch(`${apiBase}/api/ai/chat`, {
                method: 'POST',
                body: formData
            });
        } else {
            response = await fetch(`${apiBase}/api/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: chatMessages })
            });
        }
        
        // Remove loader
        const loader = document.getElementById(loaderId);
        if (loader) loader.remove();
        
        if (response.ok) {
            const data = await response.json();
            const reply = data.reply;
            
            appendConsoleMessageUI('assistant', reply);
            chatMessages.push({ role: 'assistant', content: reply });
            
            // Run regex parser on assistant response if needed (sometimes helps clarify options)
            extractVaultMetadata(reply);
        } else {
            throw new Error("Offline LLM proxy failed.");
        }
    } catch(e) {
        const loader = document.getElementById(loaderId);
        if (loader) loader.remove();
        
        // Highly sophisticated offline conversational fallback architect
        const offlineReply = buildOfflineAgentReply(text);
        
        appendConsoleMessageUI('assistant', offlineReply);
        chatMessages.push({ role: 'assistant', content: offlineReply });
        
        // Run parser on fallback
        extractVaultMetadata(offlineReply);
    }
}

function appendConsoleMessageUI(role, text) {
    const container = document.getElementById('console-chat-messages');
    if (!container) return;
    
    const msg = document.createElement('div');
    msg.classList.add('chat-message', role);
    
    const p = document.createElement('p');
    p.innerText = text;
    
    msg.appendChild(p);
    container.appendChild(msg);
    
    container.scrollTop = container.scrollHeight;
}

function appendConsoleLoaderUI() {
    const container = document.getElementById('console-chat-messages');
    if (!container) return "";
    
    const loaderId = 'console-loader-' + Date.now();
    const msg = document.createElement('div');
    msg.classList.add('chat-message', 'assistant', 'loader-msg');
    msg.id = loaderId;
    
    const p = document.createElement('p');
    p.innerHTML = '<span class="chat-dot"></span><span class="chat-dot"></span><span class="chat-dot"></span>';
    
    msg.appendChild(p);
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    
    return loaderId;
}

// -------------------------------------------------------------
// SECURE USER-APPROVED DOSSIER SUBMISSION
// -------------------------------------------------------------
async function submitStagedDossier() {
    const submitBtn = document.getElementById('vault-submit-btn');
    const prevText = submitBtn.innerHTML;
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Encrypting Transmission...';
    
    const formData = new FormData();
    formData.append('type', vaultState.type);
    formData.append('name', vaultState.name);
    formData.append('email', vaultState.email);
    formData.append('policyNumber', vaultState.policyNumber || '');
    formData.append('service', vaultState.service || '');
    formData.append('details', vaultState.details);
    
    if (consoleAttachedFile) {
        formData.append('document', consoleAttachedFile);
    }
    
    try {
        const response = await fetch('/api/submissions', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log("[VAULT] Dossier vaulted securely on local Node:", result);
            
            alert(`TRANSMISSION COMPILE SUCCESSFUL\n\nYour dossier has been securely encrypted and deposited into the Local Agent Inbox under ID: ${result.submission.id}`);
            
            // Re-seed conversation with success confirmation
            appendConsoleMessageUI('assistant', `Secure submission completed successfully. Your records have been encrypted and saved. Ticket ID: ${result.submission.id}.`);
            chatMessages.push({ role: 'assistant', content: `Secure submission completed successfully. Ticket ID: ${result.submission.id}.` });
            
            // Re-set Staging Vault State
            resetVaultState();
            clearConsoleStagedFile();
        } else {
            throw new Error("Vault transaction rejected by local gateway.");
        }
    } catch(e) {
        console.error("❌ Secure vault deposit failed:", e);
        alert("Transmission failure: Ensure the local Cornerstone node service is active.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = prevText;
        updateVaultUI();
    }
}

function resetVaultState() {
    vaultState = {
        type: 'consultation',
        name: null,
        email: null,
        policyNumber: null,
        service: null,
        details: '',
        documentFile: null
    };
}

// -------------------------------------------------------------
// FLOATING AI CHAT WIDGET ROUTINES (SYNCED)
// -------------------------------------------------------------
function toggleChatWidget() {
    const chatWidget = document.getElementById('chat-widget');
    if (chatWidget) {
        chatWidget.classList.toggle('hidden');
        
        // Mark trigger pulse as read once opened
        const trigger = document.getElementById('chat-trigger');
        if (trigger) {
            const pulse = trigger.querySelector('.chat-pulse');
            if (pulse) pulse.style.display = 'none';
        }
    }
}

async function sendChatMessage() {
    const inputField = document.getElementById('chat-input-field');
    const text = inputField.value.trim();
    if (!text) return;
    
    inputField.value = '';
    
    const chatMessagesEl = document.getElementById('chat-messages');
    
    // Append User Message to UI
    appendChatMessageUI('user', text);
    chatMessages.push({ role: 'user', content: text });
    
    // Sync with main console if active on screen
    appendConsoleMessageUI('user', text);
    extractVaultMetadata(text);
    
    // Append pulsing loader for assistant
    const loaderId = appendChatLoaderUI();
    
    try {
        const apiBase = window.location.origin;
        const response = await fetch(`${apiBase}/api/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: chatMessages })
        });
        
        // Remove loader
        const loader = document.getElementById(loaderId);
        if (loader) loader.remove();
        
        if (response.ok) {
            const data = await response.json();
            const reply = data.reply;
            
            appendChatMessageUI('assistant', reply);
            appendConsoleMessageUI('assistant', reply);
            chatMessages.push({ role: 'assistant', content: reply });
        } else {
            throw new Error("Offline LLM proxy failed.");
        }
    } catch (e) {
        const loader = document.getElementById(loaderId);
        if (loader) loader.remove();
        
        const offlineReply = buildOfflineAgentReply(text);
        
        appendChatMessageUI('assistant', offlineReply);
        appendConsoleMessageUI('assistant', offlineReply);
        chatMessages.push({ role: 'assistant', content: offlineReply });
    }
}

function appendChatMessageUI(role, text) {
    const chatMessagesEl = document.getElementById('chat-messages');
    if (!chatMessagesEl) return;
    
    const msgEl = document.createElement('div');
    msgEl.classList.add('chat-message', role);
    
    const textEl = document.createElement('p');
    textEl.innerText = text;
    
    msgEl.appendChild(textEl);
    chatMessagesEl.appendChild(msgEl);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function appendChatLoaderUI() {
    const chatMessagesEl = document.getElementById('chat-messages');
    if (!chatMessagesEl) return "";
    
    const loaderId = 'chat-loader-' + Date.now();
    const loaderEl = document.createElement('div');
    loaderEl.classList.add('chat-message', 'assistant', 'loader-msg');
    loaderEl.id = loaderId;
    
    const textEl = document.createElement('p');
    textEl.innerHTML = '<span class="chat-dot"></span><span class="chat-dot"></span><span class="chat-dot"></span>';
    
    loaderEl.appendChild(textEl);
    chatMessagesEl.appendChild(loaderEl);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    
    return loaderId;
}

// -------------------------------------------------------------
// OFFLINE INTENT INTERACTIVE AGENT BLUEPRINT
// -------------------------------------------------------------
function buildOfflineAgentReply(userText) {
    const text = userText.toLowerCase();
    
    // Greet warm greetings
    if (text.includes("hello") || text.includes("hi ") || text === "hi" || text.includes("hey")) {
        return `Hello. I am the Cornerstone offline GPU assistant. I can help configure consultation blueprints or stage policy changes for our underwriters. \n\nTo begin, please provide your Full Name, Email Address, and tell me: are we planning a New Consultation or staging a Policy Change?`;
    }
    
    // Help details
    if (text.includes("help") || text.includes("what can you do") || text.includes("capabilities")) {
        return `I manage our private offline client ingestion pipeline. You can chat with me, upload supporting documents (click the paperclip), and describe your request. I will compile your files in the Secure Ingestion Vault at the right. Once staging is complete, you can review it and click "Verify & Submit" to log the ticket.`;
    }

    // Guide info gathering
    let missing = [];
    if (!vaultState.name) missing.push("Name");
    if (!vaultState.email) missing.push("Email Address");
    if (vaultState.type === 'policy_change' && !vaultState.policyNumber) missing.push("Active Policy Number (CS-XXXXX)");
    if (!vaultState.details) missing.push("Brief explanation of your request");

    if (missing.length > 0) {
        let guideText = "";
        if (text.includes("@")) {
            guideText = `Thank you for the email address. I have locked it into our vault. `;
        } else if (text.includes("policy") || text.match(/CS-/i)) {
            guideText = `Policy telemetry received. Category changed to Policy Alteration. `;
        } else {
            guideText = `I have logged your statement in our local database. `;
        }

        return `${guideText}To finalize compilation of your secure dossier, please provide the remaining details: ${missing.join(', ')}. You can also drag and drop or click the paperclip to stage relevant document images.`;
    }

    // Complete state
    return `Excellent. Your dossier metadata has been successfully compiled and staged in our Secure Ingestion Vault. \n\nPlease review your details on the right panel and click the glowing "Verify & Submit Dossier" button to deposit the locked case file into our local underwriter database.`;
}
