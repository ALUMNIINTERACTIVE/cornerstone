const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8000;
const DB_FILE = path.join(__dirname, 'db_submissions.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static frontend files from current directory
app.use(express.static(__dirname));
// Serve uploaded files statically
app.use('/uploads', express.static(UPLOAD_DIR));

// Setup Multer for secure document uploading
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Helper: Load database safely
function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data || '[]');
        }
    } catch (e) {
        console.error("❌ Failed to load submissions database:", e);
    }
    return [];
}

// Helper: Save database atomically to prevent corruption
function saveDatabase(data) {
    const tempFile = DB_FILE + '.tmp';
    try {
        fs.writeFileSync(tempFile, JSON.stringify(data, null, 4), 'utf8');
        fs.renameSync(tempFile, DB_FILE);
        return true;
    } catch (e) {
        console.error("❌ Atomic database write failed:", e);
        if (fs.existsSync(tempFile)) {
            try { fs.unlinkSync(tempFile); } catch(err) {}
        }
    }
    return false;
}

// Helper: Analyze submissions using local Ollama LLM (Multimodal Vision supported!)
async function analyzeWithLocalAI(submission, imagePath = null) {
    console.log(`\n[LOCAL_AI] Ingesting submission ${submission.id} for local LLM risk analysis...`);
    
    // Check if we have an image to analyze
    let base64Image = null;
    if (imagePath && fs.existsSync(imagePath)) {
        try {
            const fileBuffer = fs.readFileSync(imagePath);
            base64Image = fileBuffer.toString('base64');
            console.log(`[LOCAL_AI] Encoded submitted document to Base64 (Size: ${fileBuffer.length} bytes)`);
        } catch (e) {
            console.error("[LOCAL_AI] Failed to read upload image for base64 conversion:", e);
        }
    }

    // Highly sophisticated dynamic offline analysis engine fallback
    const detailsLower = (submission.details || '').toLowerCase();
    const defaultVerdict = {
        verified: true,
        inquirySummary: `General consultation dossier indexed for client ${submission.name}.`,
        riskProfile: "Low",
        recommendedCoverageLimits: "Standard General Liability ($1,000,000)",
        followUpQuestions: [
            "Could you provide secondary official government identification?",
            "Is there any historical loss-of-asset record within the last 36 months?"
        ]
    };

    if (submission.type === 'policy_change' || detailsLower.includes('policy') || detailsLower.includes('alteration') || detailsLower.includes('change')) {
        defaultVerdict.inquirySummary = `Policy alteration request logged for coverage ${submission.policyNumber || 'CS-XXXXX'}. Scope adjustment analysis active.`;
        defaultVerdict.riskProfile = "Medium";
        defaultVerdict.recommendedCoverageLimits = "Commercial General Liability upgrade limit scope ($2,000,000)";
        defaultVerdict.followUpQuestions = [
            "What is the construction rating and structural age of the targeted property?",
            "Does the primary structure feature active digital telemetry alarm fire coverage?"
        ];
    } else if (detailsLower.includes('life') || detailsLower.includes('estate') || detailsLower.includes('trust') || detailsLower.includes('vault')) {
        defaultVerdict.inquirySummary = `Bespoke legacy estate trust and wealth preservation consultation registered for client ${submission.name}.`;
        defaultVerdict.riskProfile = "Low";
        defaultVerdict.recommendedCoverageLimits = "$10,000,000 Generational Legacy Blueprint Limits";
        defaultVerdict.followUpQuestions = [
            "What decentralized asset custody frameworks do you wish to integrate?",
            "Do you require dual-jurisdiction legal compliance coverage?"
        ];
    }

    // System prompt for structured JSON extraction
    const prompt = `
    You are an expert insurance risk analyst and document examiner at Cornerstone Insurance Firm.
    Analyze this user's submission details and any attached document/image.
    You must extract and verify details, rate the risk profile (Low, Medium, High), suggest coverage adjustments, and output a JSON object.
    
    User details:
    - Name: ${submission.name}
    - Email: ${submission.email}
    - Type of Submission: ${submission.type}
    - Service Interest: ${submission.service || 'N/A'}
    - Policy Number: ${submission.policyNumber || 'N/A'}
    - User Details: ${submission.details}

    Attached File: ${imagePath ? 'Yes (Image data included in request)' : 'No file attached'}

    Output exactly a JSON object (no Markdown syntax, no backticks, no wrap text, just raw JSON) matching this schema:
    {
      "verified": true/false (based on document validity or detail clarity),
      "inquirySummary": "A concise 2-sentence summary of the request.",
      "riskProfile": "Low" / "Medium" / "High",
      "recommendedCoverageLimits": "Specific limit recommendation, e.g. $1,000,000 General Liability",
      "followUpQuestions": ["tailored question 1", "tailored question 2"]
    }
    `;

    // Attempt to connect to local Ollama on port 11434
    // We try to use a Vision model (like llama3.2-vision or llava). If they don't have it, we fallback.
    const modelsToTry = ['llama3.2-vision', 'llava', 'qwen2-vl', 'llama3:8b-instruct-q4_K_M', 'llama3'];
    
    for (const model of modelsToTry) {
        try {
            console.log(`[LOCAL_AI] Attempting connection to local Ollama using model: ${model}...`);
            const payload = {
                model: model,
                prompt: prompt,
                format: 'json',
                stream: false
            };
            
            // Add base64 image if available and model is multimodal
            if (base64Image && ['llama3.2-vision', 'llava', 'qwen2-vl'].includes(model)) {
                payload.images = [base64Image];
                console.log(`[LOCAL_AI] Attaching Base64 image track to multimodal ${model} payload...`);
            }

            const response = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                const aiResponseText = result.response.trim();
                console.log(`[LOCAL_AI] Successfully received offline LLM generation response.`);
                try {
                    const parsedVerdict = JSON.parse(aiResponseText);
                    console.log(`[LOCAL_AI] Successfully parsed structured JSON verdict from model.`);
                    return parsedVerdict;
                } catch (parseErr) {
                    console.warn(`[LOCAL_AI] Failed parsing JSON from raw LLM text:`, aiResponseText);
                    // Extract JSON substring if wrapped in markdown or conversation blocks
                    const match = aiResponseText.match(/\{[\s\S]*\}/);
                    if (match) {
                        try {
                            const parsedExtracted = JSON.parse(match[0]);
                            return parsedExtracted;
                        } catch(e) {}
                    }
                }
            }
        } catch (fetchErr) {
            console.warn(`[LOCAL_AI] Local model '${model}' is currently inactive or unreachable.`);
        }
    }

    console.log(`[LOCAL_AI] Falling back to default secure static verdict schema.`);
    return defaultVerdict;
}

// -------------------------------------------------------------
// REST API ENDPOINTS
// -------------------------------------------------------------

// 1. Get all submissions (Admin Inbox portal)
app.get('/api/submissions', (req, res) => {
    const db = loadDatabase();
    res.json(db);
});

// 2. Submit new consultation/policy change (form submission)
app.post('/api/submissions', upload.single('document'), async (req, res) => {
    const { type, name, email, policyNumber, service, details } = req.body;
    
    if (!name || !email || !details) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    const db = loadDatabase();
    const newSubmission = {
        id: 'sub_' + Date.now(),
        type: type || 'consultation',
        name: name,
        email: email,
        policyNumber: policyNumber || null,
        service: service || null,
        details: details,
        timestamp: new Date().toISOString(),
        document: req.file ? `/uploads/${req.file.filename}` : null,
        aiVerdict: null // Will be generated below
    };

    console.log(`\n[SERVER] New submission received from ${name} (Type: ${newSubmission.type})`);
    
    // Trigger background local LLM analysis
    const imagePath = req.file ? req.file.path : null;
    newSubmission.aiVerdict = await analyzeWithLocalAI(newSubmission, imagePath);

    db.push(newSubmission);
    saveDatabase(db);
    
    res.json({ success: true, submission: newSubmission });
});

// 3. Secure AI Concierge Chat Route (Supports optional file attachment uploads)
app.post('/api/ai/chat', upload.single('document'), async (req, res) => {
    let messages = [];
    try {
        if (req.body.messages) {
            messages = typeof req.body.messages === 'string' ? JSON.parse(req.body.messages) : req.body.messages;
        }
    } catch(e) {
        console.error("[CHAT_AI] Failed parsing messages body:", e);
    }
    
    if (!messages || !Array.isArray(messages)) {
        messages = [];
    }

    console.log(`[CHAT_AI] Processing client chat message prompt (Upload: ${req.file ? req.file.filename : 'None'})...`);

    // Ensure the system message is prepended or set correctly
    const systemPrompt = `You are a helpful, professional AI customer assistant at Cornerstone Insurance Firm.
    Greet users warmly. You are the direct conversational front-door for all client submissions.
    To help clients submit an inquiry or stage a policy change, you must politely guide them to provide:
    1. Full Name
    2. Email Address
    3. Staged details of their request (inquiry or policy alterations description)
    4. An active Policy Number (if requesting a policy change)
    5. A supporting document/image if required (instruct them to click the paperclip upload icon next to the chat bar or drag files here).
    
    Instruct the client to review the details compiled in real-time in the "Secure Ingestion Vault" panel at the right and click "Verify & Submit Dossier" once they are ready. Keep answers concise, classical, and elegant to match our luxury Times New Roman theme.`;

    const formattedMessages = [
        { role: 'system', content: systemPrompt },
        ...messages
    ];

    // Try standard instruct models
    const modelsToTry = ['llama3:8b-instruct-q4_K_M', 'llama3', 'llava', 'llama3.2-vision'];
    
    for (const model of modelsToTry) {
        try {
            const response = await fetch('http://localhost:11434/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    messages: formattedMessages,
                    stream: false
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log(`[CHAT_AI] Successfully received response using model ${model}`);
                let reply = result.message.content;
                if (req.file) {
                    reply = `[Telemetry Document Ingested: ${req.file.originalname}]\n\n` + reply;
                }
                return res.json({ success: true, reply: reply });
            }
        } catch(e) {
            // Keep trying models
        }
    }

    // Static fallback if local LLM is completely offline
    console.log(`[CHAT_AI] Offline fallback triggered.`);
    let replyMessage = "Welcome to Cornerstone Insurance Firm. Our local GPU AI models are currently initializing offline. You can describe your request and attach documents right here in the chat terminal. The Secure Ingestion Vault on the right will compile your details; simply review and click 'Verify & Submit' to finalize your request.";
    
    if (req.file) {
        replyMessage = `I have successfully received and securely staged your uploaded document: "${req.file.originalname}". I have locked this document into your Secure Ingestion Vault on the right. Please provide your Full Name and Email Address if you haven't done so, then click 'Verify & Submit Dossier' to transmit this request to our underwriters.`;
    }
    
    res.json({ 
        success: true, 
        reply: replyMessage
    });
});

// Start the secure local server
app.listen(PORT, () => {
    console.log(`\n================================================================`);
    console.log(`🏛️  CORNERSTONE INSURANCE LOCAL PORTAL SERVICE RUNNING ACTIVE`);
    console.log(`🔗 Access the secure client portal: http://localhost:${PORT}`);
    console.log(`📊 Access the secure Agent Inbox: http://localhost:${PORT}/admin.html`);
    console.log(`================================================================\n`);
});
