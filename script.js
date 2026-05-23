/* ==========================================================================
   CORNERSTONE PORTAL — AI Insurance Agent
   Guided Intake Flow + Insurance Knowledge Base + Arithmetic Engine
   localStorage Persistence
   ========================================================================== */

// ─── STORAGE KEYS ────────────────────────────────────────────────────────────
const STORAGE_KEY_VAULT = 'cornerstone_vault_state';
const STORAGE_KEY_STEP  = 'cornerstone_chat_step';
const STORAGE_KEY_CHAT  = 'cornerstone_chat_html';

// ─── CONVERSATION STEP ENUM ───────────────────────────────────────────────────
const STEP = {
    WELCOME:        'welcome',
    GET_SERVICE:    'get_service',
    GET_FIRST_NAME: 'get_first',
    GET_LAST_NAME:  'get_last',
    GET_EMAIL:      'get_email',
    GET_PHONE:      'get_phone',
    GET_DL:         'get_dl',
    GET_CHANGE:     'get_change',
    COMPLETE:       'complete'
};

// ─── GLOBAL STATE ─────────────────────────────────────────────────────────────
let consoleAttachedFile = null;

let vaultState = {
    type: null,
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    driverLicense: null,
    changeDescription: null,
    documentFile: null
};

let chatStep = STEP.WELCOME;

// ─── PERSISTENCE ──────────────────────────────────────────────────────────────
function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY_VAULT, JSON.stringify(vaultState));
        localStorage.setItem(STORAGE_KEY_STEP, chatStep);
        const container = document.getElementById('console-chat-messages');
        if (container) localStorage.setItem(STORAGE_KEY_CHAT, container.innerHTML);
    } catch(e) {}
}

function loadFromStorage() {
    try {
        const savedVault = localStorage.getItem(STORAGE_KEY_VAULT);
        const savedStep  = localStorage.getItem(STORAGE_KEY_STEP);
        const savedChat  = localStorage.getItem(STORAGE_KEY_CHAT);

        if (savedVault) vaultState = { ...vaultState, ...JSON.parse(savedVault) };
        if (savedStep)  chatStep   = savedStep;

        if (savedChat) {
            const container = document.getElementById('console-chat-messages');
            if (container) {
                container.innerHTML = savedChat;
                container.scrollTop = container.scrollHeight;
                // Re-attach option button handlers after DOM restore
                restoreOptionButtons();
            }
        } else {
            renderWelcome();
        }
    } catch(e) {
        renderWelcome();
    }
}

function clearStorage() {
    localStorage.removeItem(STORAGE_KEY_VAULT);
    localStorage.removeItem(STORAGE_KEY_STEP);
    localStorage.removeItem(STORAGE_KEY_CHAT);
}

// Re-attach onclick handlers to option buttons that were restored from localStorage HTML
function restoreOptionButtons() {
    document.querySelectorAll('.chat-option-btn[data-service]').forEach(btn => {
        btn.onclick = () => selectService(btn.getAttribute('data-service'));
    });
}

// ─── DOM READY ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('console-drop-zone');
    if (dropZone) {
        ['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, highlightConsole, false));
        ['dragleave','drop'].forEach(ev   => dropZone.addEventListener(ev, unhighlightConsole, false));
        dropZone.addEventListener('drop', handleConsoleDrop, false);
    }
    loadFromStorage();
    updateVaultUI();
});

// ─── WELCOME RENDER ───────────────────────────────────────────────────────────
function renderWelcome() {
    const container = document.getElementById('console-chat-messages');
    if (!container) return;
    container.innerHTML = '';
    appendConsoleMessageUI('assistant', null, true /* showOptionButtons */);
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
        vaultState.documentFile = { name: consoleAttachedFile.name };
        const bubble = document.getElementById('console-staged-file-bubble');
        const nameEl = document.getElementById('console-staged-file-name');
        if (bubble) bubble.classList.remove('hidden');
        if (nameEl) nameEl.innerText = consoleAttachedFile.name;
        updateVaultUI(); saveToStorage();
    }
}
function clearConsoleStagedFile() {
    consoleAttachedFile = null;
    vaultState.documentFile = null;
    const fi = document.getElementById('console-file-input');
    if (fi) fi.value = '';
    document.getElementById('console-staged-file-bubble')?.classList.add('hidden');
    updateVaultUI(); saveToStorage();
}

// ─── SERVICE OPTION SELECT ────────────────────────────────────────────────────
function selectService(type) {
    const label = type === 'new_policy' ? 'New Policy' : 'Policy Change';
    appendConsoleMessageUI('user', label);
    vaultState.type = type;
    chatStep = STEP.GET_FIRST_NAME;
    setTimeout(() => {
        appendConsoleMessageUI('assistant',
            `Great! I'll help you with a ${label}.\n\nTo get started — what is your first name?`);
        updateVaultUI(); saveToStorage();
    }, 350);
}

// ─── MAIN SEND HANDLER ────────────────────────────────────────────────────────
async function sendConsoleChatMessage() {
    const inputField = document.getElementById('console-chat-input-field');
    const text = inputField.value.trim();
    if (!text && !consoleAttachedFile) return;
    inputField.value = '';

    if (text)              appendConsoleMessageUI('user', text);
    if (consoleAttachedFile) appendConsoleMessageUI('user', `📎 ${consoleAttachedFile.name}`);

    // 1. Check for a general/knowledge question FIRST (can interrupt any step)
    if (text) {
        const knowledgeReply = handleKnowledgeQuery(text);
        if (knowledgeReply !== null) {
            const loaderId = appendConsoleLoaderUI();
            await sleep(400);
            document.getElementById(loaderId)?.remove();
            appendConsoleMessageUI('assistant', knowledgeReply);
            // After answering, re-prompt current step if mid-intake
            if (chatStep !== STEP.WELCOME && chatStep !== STEP.COMPLETE) {
                setTimeout(() => {
                    appendConsoleMessageUI('assistant', repromptForStep());
                    saveToStorage();
                }, 600);
            }
            saveToStorage();
            return;
        }
    }

    // 2. Guided intake step processing
    if (text) {
        const guidedReply = processGuidedStep(text);
        if (guidedReply !== null) {
            const loaderId = appendConsoleLoaderUI();
            await sleep(380);
            document.getElementById(loaderId)?.remove();
            appendConsoleMessageUI('assistant', guidedReply);
            updateVaultUI(); saveToStorage();
            return;
        }
    }

    // 3. In COMPLETE state — free chat, try server AI then fallback
    const loaderId = appendConsoleLoaderUI();
    try {
        const apiBase = window.location.origin;
        let response;
        if (consoleAttachedFile) {
            const fd = new FormData();
            fd.append('messages', JSON.stringify([{ role: 'user', content: text }]));
            fd.append('document', consoleAttachedFile);
            response = await fetch(`${apiBase}/api/ai/chat`, { method: 'POST', body: fd });
        } else {
            response = await fetch(`${apiBase}/api/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: [{ role: 'user', content: text }] })
            });
        }
        document.getElementById(loaderId)?.remove();
        if (response.ok) {
            const data = await response.json();
            appendConsoleMessageUI('assistant', data.reply);
        } else { throw new Error('api_error'); }
    } catch(e) {
        document.getElementById(loaderId)?.remove();
        appendConsoleMessageUI('assistant', buildFreeFormReply(text));
    }
    updateVaultUI(); saveToStorage();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── GUIDED STEP PROCESSOR ────────────────────────────────────────────────────
function processGuidedStep(text) {
    switch (chatStep) {
        case STEP.WELCOME:
        case STEP.GET_SERVICE: {
            const lower = text.toLowerCase();
            if (/\b(new\s*policy|new|1)\b/.test(lower)) {
                vaultState.type = 'new_policy';
                chatStep = STEP.GET_FIRST_NAME;
                return `Great! I'll help you with a New Policy.\n\nTo get started — what is your first name?`;
            }
            if (/\b(policy\s*change|change|2)\b/.test(lower)) {
                vaultState.type = 'policy_change';
                chatStep = STEP.GET_FIRST_NAME;
                return `Absolutely! I'll help you with a Policy Change.\n\nTo get started — what is your first name?`;
            }
            return `I can help you with one of the following:\n\n  1. New Policy\n  2. Policy Change\n\nJust type the number or name of your choice — or feel free to ask me any insurance question!`;
        }

        case STEP.GET_FIRST_NAME: {
            const name = extractFirstWord(text);
            if (name.length < 2) return `Could you share your first name?`;
            vaultState.firstName = capitalize(name);
            chatStep = STEP.GET_LAST_NAME;
            return `Nice to meet you, ${vaultState.firstName}! And your last name?`;
        }

        case STEP.GET_LAST_NAME: {
            const name = extractFirstWord(text);
            if (name.length < 2) return `Could you share your last name?`;
            vaultState.lastName = capitalize(name);
            chatStep = STEP.GET_EMAIL;
            return `Thank you, ${vaultState.firstName}! What email address should we use to reach you?`;
        }

        case STEP.GET_EMAIL: {
            const email = extractEmail(text);
            if (!email) return `That doesn't look like a valid email address. Could you double-check and try again?`;
            vaultState.email = email;
            chatStep = STEP.GET_PHONE;
            return `Perfect, ${vaultState.firstName}! And your best phone number?`;
        }

        case STEP.GET_PHONE: {
            const phone = extractPhone(text);
            if (!phone) return `I need a valid phone number (e.g. 555-867-5309). Could you try again?`;
            vaultState.phone = phone;
            if (vaultState.type === 'new_policy') {
                chatStep = STEP.GET_DL;
                return `Got it, ${vaultState.firstName}! For a new policy we'll need your driver's license number for verification. Please enter it now.`;
            } else {
                chatStep = STEP.GET_CHANGE;
                return `Got it, ${vaultState.firstName}! Please describe the change you'd like to make to your existing policy. Be as detailed as you like.`;
            }
        }

        case STEP.GET_DL: {
            if (text.length < 4) return `That doesn't look like a valid driver's license number. Could you re-enter it?`;
            vaultState.driverLicense = text.toUpperCase();
            chatStep = STEP.COMPLETE;
            return buildCompletionMessage();
        }

        case STEP.GET_CHANGE: {
            if (text.length < 10) return `Could you provide a bit more detail about the change you'd like to make?`;
            vaultState.changeDescription = text;
            chatStep = STEP.COMPLETE;
            return buildCompletionMessage();
        }

        case STEP.COMPLETE:
            return null; // hand off to AI / free-form

        default:
            return null;
    }
}

function repromptForStep() {
    switch (chatStep) {
        case STEP.GET_SERVICE:    return `Whenever you're ready — are you looking to start a New Policy or make a Policy Change?`;
        case STEP.GET_FIRST_NAME: return `To continue with your request, could you share your first name?`;
        case STEP.GET_LAST_NAME:  return `And your last name, ${vaultState.firstName}?`;
        case STEP.GET_EMAIL:      return `What email address should we use, ${vaultState.firstName}?`;
        case STEP.GET_PHONE:      return `And your best phone number, ${vaultState.firstName}?`;
        case STEP.GET_DL:         return `Whenever you're ready — please enter your driver's license number.`;
        case STEP.GET_CHANGE:     return `Please go ahead and describe the policy change you'd like to make.`;
        default:                  return null;
    }
}

function buildCompletionMessage() {
    return `All set, ${vaultState.firstName}! I've collected everything I need.\n\nPlease review your information in the Service Request panel and click **Verify & Submit Dossier** to securely send your request to our team.\n\nIn the meantime, feel free to ask me any insurance questions!`;
}

// ─── KNOWLEDGE QUERY HANDLER ──────────────────────────────────────────────────
// Returns a string reply if this is a knowledge/math question, or null if not.
function handleKnowledgeQuery(text) {
    const lower = text.toLowerCase().trim();

    // --- Arithmetic detection ---
    const mathResult = tryMath(text);
    if (mathResult !== null) {
        return `The answer is **${mathResult}**.\n\nIs there anything else I can help you with — insurance questions, a new policy, or a policy change?`;
    }

    // --- Greeting detection (don't intercept from guided step, just answer warmly) ---
    if (/^(hi|hello|hey|good morning|good afternoon|good evening|howdy)[\s!?.,]*$/.test(lower)) {
        const name = vaultState.firstName ? `, ${vaultState.firstName}` : '';
        return `Hello${name}! I'm Cornerstone's Insurance Specialist. I'm here to help with any insurance questions you have, or I can get you started on a new policy or policy change.\n\nWhat can I do for you today?`;
    }

    // --- Question detection ---
    const isQuestion = text.includes('?') || /^(what|how|why|when|where|who|can|does|do|is|are|will|should|could|would|tell me|explain|define|difference between|what's|whats|how much|how many)/.test(lower);

    if (!isQuestion) return null;

    // Insurance knowledge base — topic routing
    return routeInsuranceQuestion(lower);
}

function routeInsuranceQuestion(lower) {

    // ── DEDUCTIBLE ────────────────────────────────────────────────────────────
    if (/deductible/.test(lower)) {
        if (/high|higher/.test(lower)) {
            return `A **higher deductible** means you pay more out-of-pocket before your insurance kicks in — but in exchange, your monthly premium will be lower. It's a good choice if you rarely file claims and want to reduce ongoing costs.\n\nFor example, raising your auto deductible from $500 to $1,000 can reduce your premium by 15–30%.`;
        }
        if (/low|lower/.test(lower)) {
            return `A **lower deductible** means your insurer covers more of the cost if you file a claim — but you'll pay a higher monthly premium. It makes sense if you prefer predictable costs or are in a high-risk area.\n\nWould you like to explore deductible options for a specific line of coverage?`;
        }
        return `A **deductible** is the amount you pay out-of-pocket before your insurance policy begins to cover a loss.\n\nFor example, with a $500 deductible on your auto policy, if you have a $2,000 repair claim, you pay $500 and your insurer pays $1,500.\n\nDeductibles exist for auto, home, health, and many other policy types. Higher deductibles generally mean lower premiums.`;
    }

    // ── PREMIUM ───────────────────────────────────────────────────────────────
    if (/premium/.test(lower)) {
        return `An insurance **premium** is the amount you pay — monthly, quarterly, or annually — to keep your policy active.\n\nPremiums are calculated based on risk factors such as:\n• Your age, location, and claims history\n• The type and amount of coverage\n• Your deductible amount\n\nPaying premiums on time ensures your coverage stays in force. Would you like to explore what affects premiums on a specific policy type?`;
    }

    // ── LIABILITY ─────────────────────────────────────────────────────────────
    if (/liabilit/.test(lower)) {
        return `**Liability insurance** protects you if you're legally responsible for injury or property damage to someone else.\n\n• **Auto liability** — covers damage you cause to others in an accident (required in most states)\n• **General liability** — protects businesses from third-party claims\n• **Umbrella liability** — provides excess coverage above your primary policy limits\n\nMost states require minimum auto liability of $25,000/$50,000/$25,000 (bodily injury per person / per accident / property damage). We recommend higher limits for stronger protection.`;
    }

    // ── COMPREHENSIVE vs COLLISION ────────────────────────────────────────────
    if (/comprehensive|collision/.test(lower)) {
        if (/difference|vs|versus|or/.test(lower) || (lower.includes('comprehensive') && lower.includes('collision'))) {
            return `Great question! Here's the difference:\n\n🚗 **Collision Coverage** — pays for damage to your vehicle caused by a collision with another car or object, regardless of fault.\n\n🌪️ **Comprehensive Coverage** — pays for damage from non-collision events: theft, vandalism, weather (hail, floods), fire, or hitting an animal.\n\nMost lenders require both if you're financing or leasing a vehicle. Together, they provide full physical damage protection for your car.`;
        }
        if (/comprehensive/.test(lower)) {
            return `**Comprehensive insurance** covers damage to your vehicle from events other than collisions — including theft, vandalism, natural disasters, fire, and animal strikes.\n\nIf a hailstorm damages your car or it's stolen, comprehensive coverage pays for repairs or replacement (minus your deductible).`;
        }
        return `**Collision insurance** covers damage to your vehicle when it collides with another car or object — like a guardrail or telephone pole — regardless of who is at fault.\n\nIt's typically required by lenders if you're financing or leasing a vehicle.`;
    }

    // ── AUTO INSURANCE ────────────────────────────────────────────────────────
    if (/auto|car|vehicle|driver|driving/.test(lower)) {
        if (/required|mandatory|law|state/.test(lower)) {
            return `**Auto insurance requirements vary by state**, but nearly all states require at minimum:\n\n• **Bodily Injury Liability** — covers injuries you cause to others\n• **Property Damage Liability** — covers damage you cause to others' property\n\nSome states also require **Personal Injury Protection (PIP)** or **Uninsured Motorist** coverage.\n\nLouisiana — where Cornerstone is headquartered — requires 15/30/25 minimum liability limits.\n\nWould you like to start a new auto policy?`;
        }
        if (/factor|affect|rate|cost/.test(lower)) {
            return `Several factors affect your **auto insurance rate**:\n\n• **Driving record** — accidents and violations increase premiums\n• **Age & experience** — young drivers under 25 typically pay more\n• **Credit score** — in most states, a higher score means lower rates\n• **Vehicle type** — luxury and sports cars cost more to insure\n• **Location** — urban areas with higher theft/accident rates cost more\n• **Annual mileage** — less driving can mean lower premiums\n• **Coverage levels** — higher limits and lower deductibles raise costs\n\nWould you like to get started on an auto insurance quote?`;
        }
        return `**Auto insurance** protects you financially if you're in an accident, your vehicle is stolen, or it sustains damage. Key coverages include:\n\n• **Liability** — required in most states\n• **Collision** — covers accident damage to your car\n• **Comprehensive** — covers non-collision damage (theft, weather, etc.)\n• **Uninsured/Underinsured Motorist** — protects you if the other driver lacks coverage\n• **PIP / Medical Payments** — covers medical expenses regardless of fault\n\nWould you like to explore an auto policy with Cornerstone?`;
    }

    // ── HOME INSURANCE ────────────────────────────────────────────────────────
    if (/home|homeowner|house|property|renter/.test(lower)) {
        if (/renter/.test(lower)) {
            return `**Renters insurance** covers your personal belongings in a rented home or apartment — furniture, electronics, clothing, etc. — against theft, fire, and certain disasters.\n\nIt also provides **liability protection** if someone is injured in your unit, and can cover temporary living expenses if your rental becomes uninhabitable.\n\nThe average renters policy costs just $15–$30/month, making it one of the most affordable forms of coverage available.`;
        }
        return `**Homeowners insurance** (HO-3 is the most common form) protects your home and personal property and provides liability coverage. Standard coverages include:\n\n• **Dwelling** — repairs or rebuilds your home's structure\n• **Other Structures** — fences, garages, sheds\n• **Personal Property** — furniture, electronics, clothing\n• **Loss of Use** — pays for living expenses while your home is repaired\n• **Liability** — covers legal claims if someone is injured on your property\n• **Medical Payments** — covers minor injuries to guests\n\nFlood and earthquake coverage are typically excluded and require separate policies. Would you like to start a home insurance quote?`;
    }

    // ── LIFE INSURANCE ────────────────────────────────────────────────────────
    if (/life\s*insurance|term life|whole life|universal life|beneficiary/.test(lower)) {
        if (/term|vs|difference|whole/.test(lower)) {
            return `Here's a comparison of the main life insurance types:\n\n📅 **Term Life** — provides coverage for a specific period (10, 20, or 30 years). It's the most affordable option and pays a death benefit if you pass during the term. No cash value.\n\n♾️ **Whole Life** — permanent coverage that never expires, with a guaranteed death benefit and a cash value component that grows over time. Premiums are higher but fixed.\n\n📈 **Universal Life** — flexible permanent coverage where you can adjust premiums and death benefit over time. Includes a cash value component tied to market interest rates.\n\nFor most families, **term life** provides the most coverage per dollar. Would you like to explore a life policy?`;
        }
        if (/beneficiary/.test(lower)) {
            return `A **beneficiary** is the person (or entity) who receives the death benefit from your life insurance policy when you pass away.\n\nYou can name:\n• Primary beneficiaries — receive the payout first\n• Contingent (secondary) beneficiaries — receive the payout if primary beneficiaries can't\n\nYou can name multiple beneficiaries and assign percentages. It's important to keep your beneficiary designations up to date — especially after major life events like marriage, divorce, or having children.`;
        }
        return `**Life insurance** provides a tax-free death benefit to your beneficiaries when you pass away, helping replace lost income and cover expenses.\n\nKey types:\n• **Term Life** — affordable, time-limited coverage\n• **Whole Life** — permanent with cash value\n• **Universal Life** — flexible permanent coverage\n\nA general guideline is to carry **10–12× your annual income** in life insurance coverage. Would you like to start a life insurance inquiry with Cornerstone?`;
    }

    // ── HEALTH INSURANCE ─────────────────────────────────────────────────────
    if (/health|medical|copay|coinsurance|hmo|ppo|deductible.*health|out-of-pocket/.test(lower)) {
        if (/hmo|ppo|difference/.test(lower)) {
            return `Great question!\n\n🏥 **HMO (Health Maintenance Organization)** — requires you to choose a primary care physician (PCP) and get referrals to see specialists. Coverage is limited to in-network providers. Lower premiums and out-of-pocket costs.\n\n🌐 **PPO (Preferred Provider Organization)** — gives you flexibility to see any doctor without a referral, including out-of-network providers (at higher cost). More expensive premiums but greater freedom.\n\nIf you value cost savings and don't mind a structured network, HMO is efficient. If you want flexibility and see multiple specialists, PPO offers more freedom.`;
        }
        if (/copay/.test(lower)) {
            return `A **copay** (or copayment) is a fixed dollar amount you pay at the time of a healthcare service — regardless of the total bill.\n\nFor example: a $30 copay for a primary care visit, or $50 for a specialist visit.\n\nCopays are separate from your deductible — you usually pay them even after meeting your deductible. They help make healthcare costs predictable.`;
        }
        if (/coinsurance/.test(lower)) {
            return `**Coinsurance** is the percentage of costs you share with your insurer after you've met your deductible.\n\nFor example, with 80/20 coinsurance:\n• Your insurer pays 80% of covered costs\n• You pay 20%\n\nThis continues until you hit your **out-of-pocket maximum**, after which your insurer covers 100%.`;
        }
        return `**Health insurance** helps cover the cost of medical care — doctor visits, prescriptions, hospital stays, surgeries, and preventive care.\n\nKey cost terms:\n• **Premium** — monthly payment to keep the policy active\n• **Deductible** — what you pay before insurance kicks in\n• **Copay** — fixed fee per visit\n• **Coinsurance** — your percentage share of costs after the deductible\n• **Out-of-pocket maximum** — the most you'll pay in a year\n\nCornerstone can help you find the right plan for your needs and budget. Would you like to get started?`;
    }

    // ── BUSINESS INSURANCE ────────────────────────────────────────────────────
    if (/business|commercial|liability.*business|workers.*comp|general liability|bop|professional liability|e&o|errors/.test(lower)) {
        if (/workers.*comp|workers'/.test(lower)) {
            return `**Workers' Compensation** insurance covers employees who are injured or become ill on the job. It pays for:\n\n• Medical treatment and rehabilitation\n• Lost wages during recovery\n• Permanent disability benefits\n• Death benefits for families\n\nWorkers' comp is **required by law** in most states for businesses with employees. Rates are based on payroll and the risk level of your industry.`;
        }
        if (/bop|business owner/.test(lower)) {
            return `A **Business Owner's Policy (BOP)** bundles the most common business coverages into one affordable package:\n\n• **General Liability** — protects against third-party injury/property damage claims\n• **Commercial Property** — covers your building, equipment, and inventory\n• **Business Interruption** — replaces lost income if operations are disrupted\n\nBOPs are ideal for small-to-medium businesses and are typically cheaper than buying each coverage separately.`;
        }
        if (/professional|e&o|errors/.test(lower)) {
            return `**Professional Liability insurance** (also called Errors & Omissions — E&O) protects professionals from claims of negligence, mistakes, or inadequate work.\n\nIt's essential for consultants, lawyers, accountants, real estate agents, insurance agents, and other service professionals.\n\nFor example, if a client sues you because your advice led to a financial loss, E&O covers your legal defense and any settlements.`;
        }
        return `**Business insurance** protects your company's assets, operations, and employees. Key coverages include:\n\n• **General Liability** — covers bodily injury and property damage claims\n• **Commercial Property** — protects your building, equipment, and inventory\n• **Business Interruption** — replaces income lost due to a covered event\n• **Professional Liability (E&O)** — protects against professional mistakes\n• **Workers' Compensation** — covers employee work-related injuries\n• **Cyber Liability** — protects against data breaches and cyberattacks\n\nCornerstone specializes in building custom coverage packages for businesses of all sizes. Would you like to discuss your business coverage needs?`;
    }

    // ── CLAIMS ────────────────────────────────────────────────────────────────
    if (/claim|file.*claim|claims process/.test(lower)) {
        return `Filing an insurance claim is straightforward. Here's the general process:\n\n1. **Report the incident** — contact your insurer (or Cornerstone) as soon as possible\n2. **Document the damage** — take photos and gather evidence\n3. **Provide information** — your policy number, date of loss, description of what happened\n4. **Meet with an adjuster** — the insurer may send someone to assess the damage\n5. **Receive a settlement** — after review, the insurer issues payment (minus your deductible)\n\nKeep records of all communications and expenses. Most insurers have 24/7 claim hotlines.`;
    }

    // ── UMBRELLA POLICY ───────────────────────────────────────────────────────
    if (/umbrella/.test(lower)) {
        return `An **umbrella insurance policy** provides an extra layer of liability coverage above and beyond what your existing home, auto, or other policies provide.\n\nFor example, if you're at fault in a serious accident and the damages exceed your auto liability limit of $300,000, your umbrella policy picks up the excess — often in $1M increments.\n\nUmbrella policies are surprisingly affordable — typically $150–$300/year for $1 million in additional coverage — making them excellent value for high-net-worth individuals.`;
    }

    // ── FLOOD / EARTHQUAKE ────────────────────────────────────────────────────
    if (/flood|earthquake/.test(lower)) {
        const type = lower.includes('flood') ? 'flood' : 'earthquake';
        return `**${capitalize(type)} insurance** is NOT covered by standard homeowners policies — it must be purchased separately.\n\n${type === 'flood'
            ? '• Flood insurance is available through the **National Flood Insurance Program (NFIP)** or private insurers.\n• It covers your home\'s structure and personal belongings damaged by flooding.\n• Even a few inches of water can cause tens of thousands in damage.\n• If you live in a FEMA-designated flood zone, your lender likely requires it.'
            : '• Earthquake insurance covers damage caused by seismic events.\n• It\'s especially important in California, the Pacific Northwest, and parts of the Midwest.\n• Deductibles are often 10–15% of the home\'s insured value, so it\'s best for major events.'}\n\nWould you like to ask about adding ${type} coverage to your policy?`;
    }

    // ── UNINSURED MOTORIST ────────────────────────────────────────────────────
    if (/uninsured|underinsured/.test(lower)) {
        return `**Uninsured/Underinsured Motorist (UM/UIM)** coverage protects you if you're in an accident caused by a driver who has no insurance — or not enough insurance to cover your damages.\n\nApproximately **1 in 8 drivers** in the US is uninsured. UM/UIM coverage pays for:\n• Your medical expenses and lost wages\n• Pain and suffering\n• Damage to your vehicle (in some states)\n\nThis coverage is required in many states and strongly recommended everywhere. It's typically inexpensive to add to your auto policy.`;
    }

    // ── GENERAL "WHAT IS INSURANCE" ───────────────────────────────────────────
    if (/what is insurance|how does insurance work/.test(lower)) {
        return `**Insurance** is a financial contract between you and an insurer. You pay regular premiums, and in return the insurer agrees to cover certain financial losses defined in your policy.\n\nInsurance works by **pooling risk** across many policyholders. Most people won't experience a major loss in any given year — so the premiums collected from many people fund the claims of the few who do.\n\nKey components of any insurance policy:\n• **Premium** — what you pay\n• **Deductible** — your share before coverage begins\n• **Coverage limit** — the maximum the insurer will pay\n• **Exclusions** — what the policy does NOT cover\n\nIs there a specific type of insurance you'd like to know more about?`;
    }

    // ── CORNERSTONE SPECIFIC ──────────────────────────────────────────────────
    if (/cornerstone|your company|your agency|you offer|you provide/.test(lower)) {
        return `**Cornerstone Insurance Firm** is a full-service insurance agency based in New Orleans, Louisiana, dedicated to protecting individuals, families, and businesses nationwide.\n\nWe offer:\n• Auto Insurance\n• Home & Property Insurance\n• Life Insurance\n• Health Insurance\n• Business & Commercial Insurance\n\n📞 Call us: 844-345-6765\n📧 Email: info@cornerstoneinsurancefirm.com\n📍 9029 Jefferson Hwy D 1135, New Orleans, LA 70123\n\nWould you like to start a new policy or make a change to an existing one?`;
    }

    // ── THANK YOU / PLEASANTRIES ──────────────────────────────────────────────
    if (/thank|thanks|appreciate/.test(lower)) {
        const name = vaultState.firstName ? `, ${vaultState.firstName}` : '';
        return `You're very welcome${name}! It's my pleasure to help. Is there anything else you'd like to know — about coverage options, your policy, or anything else?`;
    }

    // Not a recognized knowledge query
    return null;
}

// ─── MATH ENGINE ─────────────────────────────────────────────────────────────
function tryMath(text) {
    // Guard: bail out if input looks like a phone number
    // Covers: 504-555-4556 | (504) 555-4556 | 5045554556 | 504.555.4556
    if (/^\s*\(?\d{3}\)?[\s\.\-]?\d{3}[\s\.\-]\d{4}\s*$/.test(text)) return null;
    const digitsOnly = text.replace(/[\s\-\.\(\)]/g, '');
    if (/^\d{10,11}$/.test(digitsOnly)) return null;

    // Strip common phrases to isolate the expression
    const cleaned = text
        .replace(/what is|what's|calculate|compute|solve|how much is|equals/gi, '')
        .replace(/[^0-9\s\+\-\*\/\.\(\)%]/g, ' ')
        .trim();

    if (!cleaned || !/[\+\-\*\/]/.test(cleaned)) return null;
    if (/[a-zA-Z]{2,}/.test(cleaned)) return null; // still has words

    // Extra guard: 3-3-4 digit patterns after stripping (phone slipped through)
    if (/^\s*\d{3}\s+\d{3}\s+\d{4}\s*$/.test(cleaned)) return null;

    try {
        // Safe evaluation — only allow numeric expressions
        if (!/^[\d\s\+\-\*\/\.\(\)%]+$/.test(cleaned)) return null;
        // Handle percentage: 15% of 200 → 0.15 * 200
        const expr = cleaned.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
        // Use Function constructor (sandboxed, no access to scope)
        const result = new Function(`"use strict"; return (${expr})`)();
        if (typeof result === 'number' && isFinite(result)) {
            // Format nicely
            return Number.isInteger(result) ? result.toLocaleString() : parseFloat(result.toFixed(6)).toLocaleString();
        }
    } catch(e) {}
    return null;
}

// ─── FREE-FORM FALLBACK ───────────────────────────────────────────────────────
function buildFreeFormReply(text) {
    const lower = text.toLowerCase();
    const name = vaultState.firstName ? `, ${vaultState.firstName}` : '';

    if (/reset|start over/.test(lower)) { resetConversation(); return null; }
    if (/submit|ready|done/.test(lower) && chatStep === STEP.COMPLETE) {
        return `Your information is all set${name}! Click the **Verify & Submit Dossier** button in the panel to the right to send your request securely.`;
    }

    return `Thank you for that${name}. As a specialist in auto, home, life, health, and business insurance, I'm happy to answer any coverage questions you have. You can also ask me to calculate insurance-related figures, or I can help you start a new policy or policy change — just say the word!`;
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

// ─── VAULT UI UPDATER ─────────────────────────────────────────────────────────
function updateVaultUI() {
    const elType    = document.getElementById('vault-badge-type');
    const elName    = document.getElementById('vault-identity');
    const elEmail   = document.getElementById('vault-email');
    const elPhone   = document.getElementById('vault-phone');
    const elScope   = document.getElementById('vault-scope');
    const elFile    = document.getElementById('vault-file');
    const elDetails = document.getElementById('vault-details');
    const submitBtn = document.getElementById('vault-submit-btn');
    const ledEl     = document.querySelector('.vault-led');
    if (!elType) return;

    // Type badge
    if (vaultState.type === 'new_policy') {
        setVaultBadge(elType, 'New Policy', '#3b82f6', 'rgba(59,130,246,0.2)', 'rgba(59,130,246,0.3)');
    } else if (vaultState.type === 'policy_change') {
        setVaultBadge(elType, 'Policy Change', '#f59e0b', 'rgba(245,158,11,0.2)', 'rgba(245,158,11,0.3)');
    } else {
        setVaultBadge(elType, 'Awaiting Selection', '#a78bfa', 'rgba(167,139,250,0.15)', 'rgba(167,139,250,0.25)');
    }

    // Name
    elName.classList.toggle('unpopulated', !vaultState.firstName);
    elName.innerText = vaultState.firstName
        ? `${vaultState.firstName}${vaultState.lastName ? ' ' + vaultState.lastName : ''}`
        : 'Not Detected';

    // Email
    elEmail.classList.toggle('unpopulated', !vaultState.email);
    elEmail.innerText = vaultState.email || 'Not Detected';

    // Phone
    elPhone.classList.toggle('unpopulated', !vaultState.phone);
    elPhone.innerText = vaultState.phone || 'Not Detected';

    // Scope
    if (vaultState.type === 'new_policy' && vaultState.driverLicense) {
        elScope.classList.remove('unpopulated');
        elScope.innerHTML = `<code style="font-family:monospace;font-size:0.9rem;color:#60a5fa;">${vaultState.driverLicense}</code>`;
    } else if (vaultState.type === 'policy_change' && vaultState.changeDescription) {
        const short = vaultState.changeDescription.length > 55
            ? vaultState.changeDescription.slice(0,52) + '...'
            : vaultState.changeDescription;
        elScope.classList.remove('unpopulated');
        elScope.innerText = short;
    } else {
        elScope.classList.add('unpopulated');
        elScope.innerText = vaultState.type === 'new_policy'
            ? "Driver's License Pending"
            : vaultState.type === 'policy_change'
                ? 'Change Description Pending'
                : 'Not Specified';
    }

    // Document
    if (vaultState.documentFile) {
        elFile.classList.remove('unpopulated');
        elFile.innerHTML = `<i class="fa-solid fa-file-shield" style="color:#60a5fa;margin-right:5px;"></i>${vaultState.documentFile.name}`;
        if (ledEl) {
            ledEl.className = 'vault-led staged';
            document.querySelector('.vault-status-text').innerText = 'Telemetry Staging Loaded';
        }
    } else {
        elFile.classList.add('unpopulated');
        elFile.innerText = 'No files attached';
        if (ledEl) {
            ledEl.className = 'vault-led';
            document.querySelector('.vault-status-text').innerText = 'Active Encryption Tunnel';
        }
    }

    // Details
    const detailText = vaultState.changeDescription || (vaultState.driverLicense ? "Driver's License Provided" : null);
    elDetails.classList.toggle('unpopulated', !detailText);
    elDetails.innerText = detailText
        ? (detailText.length > 80 ? detailText.slice(0,77)+'...' : detailText)
        : 'Awaiting details in chat...';

    // Submit eligibility
    const isReady = chatStep === STEP.COMPLETE
        && vaultState.firstName && vaultState.email && vaultState.phone
        && (vaultState.driverLicense || vaultState.changeDescription);
    if (submitBtn) {
        submitBtn.disabled = !isReady;
        submitBtn.classList.toggle('ready', isReady);
    }

    // Auto-open vault drawer once a request type has been staged to show compiling progress!
    const vaultPanel = document.getElementById('staging-vault-panel');
    if (vaultPanel && vaultState.type && vaultState.type !== 'awaiting' && !vaultPanel.classList.contains('open')) {
        vaultPanel.classList.add('open');
    }
}

function setVaultBadge(el, text, color, bg, border) {
    el.className = 'vault-field-value staged-badge';
    el.style.background = bg;
    el.style.borderColor = border;
    el.style.color = color;
    el.innerText = text;
}

// ─── CHAT UI ──────────────────────────────────────────────────────────────────
function appendConsoleMessageUI(role, text, showOptionButtons = false) {
    const container = document.getElementById('console-chat-messages');
    if (!container) return;

    const msg = document.createElement('div');
    msg.classList.add('chat-message', role);

    if (showOptionButtons) {
        const p = document.createElement('p');
        p.style.whiteSpace = 'pre-line';
        p.innerText = `Hello! Welcome to Cornerstone Insurance Firm.\n\nI'm your dedicated insurance specialist.\n\nHow may I assist you today?`;
        msg.appendChild(p);

        const opts = document.createElement('div');
        opts.className = 'chat-option-buttons';

        const btn1 = document.createElement('button');
        btn1.className = 'chat-option-btn';
        btn1.setAttribute('data-service', 'new_policy');
        btn1.innerHTML = '<i class="fa-solid fa-file-contract"></i> New Policy';
        btn1.onclick = () => selectService('new_policy');

        const btn2 = document.createElement('button');
        btn2.className = 'chat-option-btn';
        btn2.setAttribute('data-service', 'policy_change');
        btn2.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Update Policy';
        btn2.onclick = () => selectService('policy_change');

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
    vaultState = { type: null, firstName: null, lastName: null, email: null, phone: null, driverLicense: null, changeDescription: null, documentFile: null };
    chatStep = STEP.WELCOME;
    consoleAttachedFile = null;
    clearConsoleStagedFile();
    clearStorage();
    const container = document.getElementById('console-chat-messages');
    if (container) container.innerHTML = '';
    renderWelcome();
    updateVaultUI();
}

// ─── SUBMISSION ────────────────────────────────────────────────────────────────
async function submitStagedDossier() {
    const submitBtn = document.getElementById('vault-submit-btn');
    const prevHTML  = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Encrypting Transmission...';

    const fd = new FormData();
    fd.append('type', vaultState.type || '');
    fd.append('name', `${vaultState.firstName || ''} ${vaultState.lastName || ''}`.trim());
    fd.append('email', vaultState.email || '');
    fd.append('phone', vaultState.phone || '');
    fd.append('driverLicense', vaultState.driverLicense || '');
    fd.append('details', vaultState.changeDescription || vaultState.driverLicense || '');
    if (consoleAttachedFile) fd.append('document', consoleAttachedFile);

    try {
        const res = await fetch('/api/submissions', { method: 'POST', body: fd });
        if (res.ok) {
            const result = await res.json();
            appendConsoleMessageUI('assistant',
                `✅ Submission complete, ${vaultState.firstName}! Your request has been securely encrypted and logged.\n\nTicket ID: ${result.submission.id}\n\nOur team will contact you at ${vaultState.email} shortly. Is there anything else I can help you with?`
            );
            setTimeout(resetConversation, 12000);
        } else { throw new Error('rejected'); }
    } catch(e) {
        appendConsoleMessageUI('assistant',
            `⚠️ There was an issue submitting your request. Please try again or contact us directly at info@cornerstoneinsurancefirm.com or 844-345-6765.`
        );
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = prevHTML;
        updateVaultUI();
    }
}
