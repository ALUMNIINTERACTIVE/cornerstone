/* ==========================================================================
   CORNERSTONE PORTAL - CLIENT-SIDE INTERACTION CONTROLLER
   ========================================================================== */

let attachedFile = null;
let chatMessages = [
    { role: 'assistant', content: 'How may I assist you today?' }
];

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Drag and Drop listeners
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, unhighlight, false);
        });

        dropZone.addEventListener('drop', handleDrop, false);
    }

    // Form Submission listener
    const portalForm = document.getElementById('portal-form');
    if (portalForm) {
        portalForm.addEventListener('submit', handleFormSubmit);
    }
});

// -------------------------------------------------------------
// FORM TAB SELECTORS
// -------------------------------------------------------------
function switchFormType(type) {
    const tabConsultation = document.getElementById('tab-consultation');
    const tabPolicyChange = document.getElementById('tab-policy-change');
    const formTypeField = document.getElementById('form-type-field');
    const formTitle = document.getElementById('form-title');
    
    const policyGroup = document.getElementById('policy-number-group');
    const serviceGroup = document.getElementById('service-select-group');
    
    const policyInput = policyGroup ? policyGroup.querySelector('input') : null;
    const serviceSelect = serviceGroup ? serviceGroup.querySelector('select') : null;
    
    const detailsTextarea = document.getElementById('details-textarea');
    
    if (type === 'consultation') {
        tabConsultation.classList.add('active');
        tabPolicyChange.classList.remove('active');
        formTypeField.value = 'consultation';
        formTitle.innerText = 'Secure Consultation Request';
        
        if (policyGroup) policyGroup.classList.add('hidden');
        if (serviceGroup) serviceGroup.classList.remove('hidden');
        
        if (policyInput) policyInput.required = false;
        if (serviceSelect) serviceSelect.required = true;
        
        if (detailsTextarea) detailsTextarea.placeholder = "Brief details of your consultation request...";
    } else {
        tabConsultation.classList.remove('active');
        tabPolicyChange.classList.add('active');
        formTypeField.value = 'policy_change';
        formTitle.innerText = 'Request Policy Alteration';
        
        if (policyGroup) policyGroup.classList.remove('hidden');
        if (serviceGroup) serviceGroup.classList.add('hidden');
        
        if (policyInput) policyInput.required = true;
        if (serviceSelect) serviceSelect.required = false;
        
        if (detailsTextarea) detailsTextarea.placeholder = "Please list the exact changes, policy additions, or endorsements required...";
    }
}

// -------------------------------------------------------------
// SECURE FILE DRAG AND DROP HANDLERS
// -------------------------------------------------------------
function highlight(e) {
    e.preventDefault();
    e.stopPropagation();
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) dropZone.classList.add('dragover');
}

function unhighlight(e) {
    e.preventDefault();
    e.stopPropagation();
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) dropZone.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length > 0) {
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.files = files;
            const event = new Event('change', { bubbles: true });
            fileInput.dispatchEvent(event);
        }
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        attachedFile = files[0];
        
        const dropText = document.getElementById('drop-text');
        const previewCapsule = document.getElementById('file-preview-capsule');
        const previewName = document.getElementById('file-preview-name');
        
        if (dropText) dropText.style.display = 'none';
        if (previewCapsule) previewCapsule.classList.remove('hidden');
        if (previewName) previewName.innerText = attachedFile.name;
        
        console.log(`[UPLOADER] File staged for secure transfer: ${attachedFile.name} (${attachedFile.size} bytes)`);
    }
}

function clearAttachedFile() {
    attachedFile = null;
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';
    
    const dropText = document.getElementById('drop-text');
    const previewCapsule = document.getElementById('file-preview-capsule');
    
    if (dropText) dropText.style.display = 'block';
    if (previewCapsule) previewCapsule.classList.add('hidden');
    
    console.log(`[UPLOADER] File attachment cleared.`);
}

// -------------------------------------------------------------
// FORM SECURE POST SUBMISSION
// -------------------------------------------------------------
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = document.getElementById('submit-btn');
    const prevBtnText = submitBtn.innerText;
    
    submitBtn.disabled = true;
    submitBtn.innerText = "Submitting securely...";
    
    const formData = new FormData(form);
    
    try {
        const apiBase = window.location.origin;
        const response = await fetch(`${apiBase}/api/submissions`, {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log("[SERVER] Submission accepted:", data);
            
            alert("Your request has been securely compiled and transmitted to the Local Agent Inbox.");
            
            // Reset Form and Clear file state
            form.reset();
            clearAttachedFile();
            switchFormType('consultation');
        } else {
            throw new Error("Local backend rejected the submission.");
        }
    } catch(err) {
        console.error("❌ Submission failed:", err);
        alert("Transmission error: Make sure the local Cornerstone backend service is active.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = prevBtnText;
    }
}

// -------------------------------------------------------------
// LOCAL GPU AI CHAT CONCIERGE WIDGET
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
    
    // 1. Append User Message to UI
    appendChatMessageUI('user', text);
    chatMessages.push({ role: 'user', content: text });
    
    // 2. Append pulsing loader for assistant
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
            
            // Append assistant reply to UI
            appendChatMessageUI('assistant', reply);
            chatMessages.push({ role: 'assistant', content: reply });
        } else {
            throw new Error("Offline LLM model unreachable.");
        }
    } catch (e) {
        const loader = document.getElementById(loaderId);
        if (loader) loader.remove();
        
        const errMsg = "Offline AI Concierge model is currently unavailable on local port 11434.";
        appendChatMessageUI('assistant', errMsg);
        chatMessages.push({ role: 'assistant', content: errMsg });
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
    
    // Scroll to bottom
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
