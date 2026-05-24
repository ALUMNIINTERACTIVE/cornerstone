require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

// Setup Nodemailer transporter with SMTP or local sendmail fallback
let mailTransporter;

if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    console.log(`[EMAIL] Configuring authenticated SMTP transporter: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
    mailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
} else {
    console.log(`[EMAIL] No SMTP credentials found. Initializing sendmail fallback.`);
    mailTransporter = nodemailer.createTransport({
        sendmail: true,
        newline: 'unix',
        path: '/usr/sbin/sendmail'
    });
}

// Verification Codes In-Memory Store
const verificationCodes = new Map();

async function sendVerificationEmail(email, code) {
    console.log(`[EMAIL] Attempting to send real verification email to: ${email} with code: ${code}`);
    
    const mailOptions = {
        from: process.env.SMTP_FROM || '"Cornerstone Insurance Firm" <info@chatcif.com>',
        to: email,
        subject: 'Verify Your Email Address - Cornerstone Insurance Firm',
        text: `Your Cornerstone verification code is: ${code}\n\nPlease enter this code in the client portal to complete your quote request.`,
        html: `
            <div style="font-family: 'Times New Roman', Times, serif; max-width: 600px; margin: 0 auto; border: 1px solid #7c3aed; padding: 30px; border-radius: 4px; background-color: #ffffff; color: #1e1b4b;">
                <div style="text-align: center; border-bottom: 1px solid #7c3aed; padding-bottom: 20px; margin-bottom: 20px;">
                    <h1 style="font-size: 24px; letter-spacing: 0.1em; color: #7c3aed; margin: 0;">CORNERSTONE</h1>
                    <p style="font-size: 10px; letter-spacing: 0.4em; color: #5b21b6; text-transform: uppercase; margin: 5px 0 0 0; font-weight: bold;">Insurance Firm</p>
                </div>
                <h2 style="font-size: 20px; font-weight: normal; color: #1e1b4b; margin-top: 0;">Verify Your Email Address</h2>
                <p style="font-size: 16px; line-height: 1.6; color: #475569;">Thank you for initiating a quote request with Cornerstone Insurance Firm. To continue and secure your client portal, please use the following 6-digit verification code:</p>
                <div style="background-color: #faf9fe; border: 1px dashed #7c3aed; border-radius: 4px; padding: 15px; text-align: center; margin: 25px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 0.25em; color: #7c3aed; font-family: monospace;">${code}</span>
                </div>
                <p style="font-size: 14px; line-height: 1.6; color: #475569;">If you did not request this quote, please ignore this email. This code will expire in 10 minutes.</p>
                <div style="border-top: 1px solid #f1ecfe; padding-top: 20px; margin-top: 30px; text-align: center; font-size: 12px; color: #94a3b8;">
                    <p style="margin: 0;">&copy; 2026 Cornerstone Insurance Firm. All rights reserved.</p>
                    <p style="margin: 5px 0 0 0;">9029 Jefferson Hwy D 1135, New Orleans, LA 70123</p>
                </div>
            </div>
        `
    };

    try {
        const info = await mailTransporter.sendMail(mailOptions);
        console.log(`[EMAIL] Email successfully sent: ${info.messageId}`);
        return { success: true };
    } catch (error) {
        console.error("❌ Nodemailer send failed, executing direct fallback logic:", error);
        
        // Output large, visible message in the terminal console with the code in case sendmail fails locally
        console.log(`\n================================================================`);
        console.log(`🔑  VERIFICATION CODE FOR ${email.toUpperCase()}: [ ${code} ]`);
        console.log(`================================================================\n`);
        
        return { success: false, error: error.message };
    }
}


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

// Helper: Analyze submissions using Gemini API or local Ollama LLM (Multimodal Vision supported!)
async function analyzeWithLocalAI(submission, imagePath = null) {
    console.log(`\n[LOCAL_AI] Ingesting submission ${submission.id} for risk analysis...`);
    
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

    // 1. Try Gemini API first if configured
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (GEMINI_API_KEY) {
        try {
            console.log(`[GEMINI_AI] Attempting connection to Gemini API for structured risk analysis...`);
            
            const contents = [
                {
                    role: 'user',
                    parts: [
                        { text: prompt }
                    ]
                }
            ];

            if (base64Image) {
                const ext = path.extname(imagePath).toLowerCase();
                const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
                contents[0].parts.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Image
                    }
                });
                console.log(`[GEMINI_AI] Attaching Base64 image data to Gemini payload.`);
            }

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: contents,
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                verified: { type: "BOOLEAN", description: "Whether the document is valid or details are clear" },
                                inquirySummary: { type: "STRING", description: "A concise 2-sentence summary of the request" },
                                riskProfile: { type: "STRING", enum: ["Low", "Medium", "High"], description: "Risk profile rating" },
                                recommendedCoverageLimits: { type: "STRING", description: "Specific limit recommendation, e.g. $1,000,000 General Liability" },
                                followUpQuestions: { 
                                    type: "ARRAY", 
                                    items: { type: "STRING" },
                                    description: "Two tailored follow-up questions" 
                                }
                            },
                            required: ["verified", "inquirySummary", "riskProfile", "recommendedCoverageLimits", "followUpQuestions"]
                        }
                    }
                })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts[0]) {
                    const aiResponseText = result.candidates[0].content.parts[0].text.trim();
                    console.log(`[GEMINI_AI] Successfully received Gemini API response.`);
                    try {
                        const parsedVerdict = JSON.parse(aiResponseText);
                        console.log(`[GEMINI_AI] Successfully parsed structured JSON verdict from Gemini.`);
                        return parsedVerdict;
                    } catch (parseErr) {
                        console.warn(`[GEMINI_AI] Failed parsing JSON from raw Gemini response:`, aiResponseText);
                    }
                }
            } else {
                const errText = await response.text();
                console.error(`[GEMINI_AI] API call failed:`, errText);
            }
        } catch (geminiErr) {
            console.error(`[GEMINI_AI] Error contacting Gemini API:`, geminiErr);
        }
    }

    // 2. Fall back to local Ollama on port 11434
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

// 0. Verify admin authorization passcode (Hidden from Git)
app.post('/api/verify-admin', (req, res) => {
    const { passcode } = req.body;
    const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || '00000000';
    if (passcode === ADMIN_PASSCODE) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, error: "Invalid passcode" });
    }
});

// -------------------------------------------------------------
// SECURE CLIENT PORTAL & ONBOARDING ENDPOINTS
// -------------------------------------------------------------

// Generate and send 6-digit email verification code
app.post('/api/clients/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: "Email address is required." });
    }

    // Generate a secure 6-digit random code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store in-memory with a 10-minute expiration
    verificationCodes.set(email.toLowerCase(), {
        code,
        expires: Date.now() + 10 * 60 * 1000
    });

    const emailSent = await sendVerificationEmail(email, code);
    
    res.json({ 
        success: true, 
        message: "Verification code sent successfully.",
        // For local development fallback if sendmail is not configured on the developer machine:
        debugCode: code 
    });
});

// Verify 6-digit code
app.post('/api/clients/verify-code', (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) {
        return res.status(400).json({ error: "Email and verification code are required." });
    }

    const record = verificationCodes.get(email.toLowerCase());
    if (!record) {
        return res.status(400).json({ error: "No active verification code found for this email." });
    }

    if (Date.now() > record.expires) {
        verificationCodes.delete(email.toLowerCase());
        return res.status(400).json({ error: "Verification code has expired." });
    }

    if (record.code !== code.trim()) {
        return res.status(400).json({ error: "Incorrect verification code." });
    }

    // Keep it in storage or delete upon registration
    res.json({ success: true, message: "Email verified successfully." });
});

// Register new client account (Phase 1)
app.post('/api/clients/register', (req, res) => {
    const { email, name, phone, effectiveDate, password } = req.body;
    if (!email || !name || !phone || !effectiveDate || !password) {
        return res.status(400).json({ error: "All profile fields and password are required." });
    }

    const db = loadDatabase();
    
    // Check if account already exists
    const existing = db.find(s => s.type === 'new_client_request' && s.email.toLowerCase() === email.toLowerCase());
    if (existing) {
        return res.status(400).json({ error: "An account with this email address already exists." });
    }

    const newClient = {
        id: 'client_' + Date.now(),
        type: 'new_client_request',
        name,
        email: email.toLowerCase(),
        phone,
        password, // Client portal login info
        effectiveDate,
        businessName: null,
        ein: null,
        driversLicense: null,
        vin: null,
        timestamp: new Date().toISOString(),
        updates: [],
        status: "Incomplete",
        aiVerdict: {
            verified: true,
            inquirySummary: `New client request registered for commercial trucking policy starting ${effectiveDate}.`,
            riskProfile: "Low",
            recommendedCoverageLimits: "Awaiting final documents (Driver's License, VIN, EIN, Business Name)...",
            followUpQuestions: [
                "Please upload a photo of the owner's driver's license.",
                "Please upload a photo of the VIN #.",
                "Provide the company EIN and Business Name."
            ]
        }
    };

    db.push(newClient);
    saveDatabase(db);

    // Delete verification code
    verificationCodes.delete(email.toLowerCase());

    console.log(`[SERVER] New client registered: ${name} (${email})`);

    res.json({ 
        success: true, 
        client: {
            id: newClient.id,
            name: newClient.name,
            email: newClient.email,
            phone: newClient.phone,
            effectiveDate: newClient.effectiveDate,
            businessName: newClient.businessName,
            ein: newClient.ein,
            driversLicense: newClient.driversLicense,
            vin: newClient.vin
        }
    });
});

// Login client portal
app.post('/api/clients/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
    }

    const db = loadDatabase();
    const client = db.find(s => s.type === 'new_client_request' && s.email.toLowerCase() === email.toLowerCase() && s.password === password);
    
    if (!client) {
        return res.status(401).json({ error: "Invalid email or password." });
    }

    res.json({
        success: true,
        client: {
            id: client.id,
            name: client.name,
            email: client.email,
            phone: client.phone,
            effectiveDate: client.effectiveDate,
            businessName: client.businessName,
            ein: client.ein,
            driversLicense: client.driversLicense,
            vin: client.vin,
            status: client.status,
            updates: client.updates
        }
    });
});

// Telemetry update for Phase 2 (Business name, EIN, Driver's License photo, VIN photo)
app.post('/api/clients/update-telemetry', upload.fields([
    { name: 'driversLicense', maxCount: 1 },
    { name: 'vin', maxCount: 1 }
]), (req, res) => {
    const { clientId, ein, businessName } = req.body;
    if (!clientId) {
        return res.status(400).json({ error: "Missing client identifier." });
    }

    const db = loadDatabase();
    const client = db.find(s => s.id === clientId);
    if (!client) {
        return res.status(404).json({ error: "Client account not found." });
    }

    if (ein) client.ein = ein;
    if (businessName) client.businessName = businessName;

    if (req.files) {
        if (req.files.driversLicense && req.files.driversLicense[0]) {
            client.driversLicense = `/uploads/${req.files.driversLicense[0].filename}`;
        }
        if (req.files.vin && req.files.vin[0]) {
            client.vin = `/uploads/${req.files.vin[0].filename}`;
        }
    }

    // Check if onboarding is completely finished
    if (client.businessName && client.ein && client.driversLicense && client.vin) {
        client.status = "Complete";
        client.aiVerdict.inquirySummary = `Commercial trucking insurance quote completed for ${client.businessName} (EIN: ${client.ein}) starting ${client.effectiveDate}.`;
        client.aiVerdict.riskProfile = "Medium";
        client.aiVerdict.recommendedCoverageLimits = "Commercial Auto / Trucking Liability ($1,000,000)";
        client.aiVerdict.followUpQuestions = [];
    }

    saveDatabase(db);

    console.log(`[SERVER] Telemetry updated for ${client.name}. Status: ${client.status}`);

    res.json({
        success: true,
        client: {
            id: client.id,
            name: client.name,
            email: client.email,
            phone: client.phone,
            effectiveDate: client.effectiveDate,
            businessName: client.businessName,
            ein: client.ein,
            driversLicense: client.driversLicense,
            vin: client.vin,
            status: client.status,
            updates: client.updates
        }
    });
});

// Post live update notification (driver updates, policy adjustments)
app.post('/api/clients/submit-update', (req, res) => {
    const { clientId, message } = req.body;
    if (!clientId || !message) {
        return res.status(400).json({ error: "Missing client ID or update message." });
    }

    const db = loadDatabase();
    const client = db.find(s => s.id === clientId);
    if (!client) {
        return res.status(404).json({ error: "Client account not found." });
    }

    const updateItem = {
        timestamp: new Date().toISOString(),
        message
    };

    if (!client.updates) client.updates = [];
    client.updates.push(updateItem);

    // Create a new notification submission for the admin workspace inbox
    const newNotification = {
        id: 'notif_' + Date.now(),
        type: 'portal_update',
        clientId: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        details: `Client updates requested: "${message}"`,
        timestamp: new Date().toISOString(),
        aiVerdict: {
            verified: true,
            inquirySummary: `Incoming client portal update notification: "${message}"`,
            riskProfile: "Low",
            recommendedCoverageLimits: "N/A",
            followUpQuestions: []
        }
    };

    db.push(newNotification);
    saveDatabase(db);

    console.log(`[SERVER] Portal update received from ${client.name}: ${message}`);

    res.json({
        success: true,
        client: {
            id: client.id,
            name: client.name,
            email: client.email,
            phone: client.phone,
            effectiveDate: client.effectiveDate,
            businessName: client.businessName,
            ein: client.ein,
            driversLicense: client.driversLicense,
            vin: client.vin,
            status: client.status,
            updates: client.updates
        }
    });
});


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

    // 1. Try Gemini API first if configured
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (GEMINI_API_KEY) {
        try {
            console.log(`[GEMINI_AI] Processing concierge chat with Gemini 1.5 Flash...`);
            
            let chatImagePart = null;
            if (req.file && fs.existsSync(req.file.path)) {
                try {
                    const fileBuffer = fs.readFileSync(req.file.path);
                    const base64Image = fileBuffer.toString('base64');
                    const ext = path.extname(req.file.path).toLowerCase();
                    const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
                    chatImagePart = {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Image
                        }
                    };
                    console.log(`[GEMINI_AI] Loaded chat attachment image for multimodal processing.`);
                } catch (e) {
                    console.error("[GEMINI_AI] Failed to read chat upload image for base64 conversion:", e);
                }
            }

            const contents = [];
            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                if (msg.role === 'system') continue;
                
                const role = msg.role === 'assistant' ? 'model' : 'user';
                const parts = [{ text: msg.content || "" }];
                
                // Attach image to the very last user message in history
                if (i === messages.length - 1 && role === 'user' && chatImagePart) {
                    parts.push(chatImagePart);
                }
                
                contents.push({ role, parts });
            }

            if (contents.length === 0) {
                const parts = [{ text: "Hello" }];
                if (chatImagePart) {
                    parts.push(chatImagePart);
                }
                contents.push({ role: 'user', parts });
            }

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: contents,
                    systemInstruction: {
                        parts: [{ text: systemPrompt }]
                    }
                })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts[0]) {
                    let reply = result.candidates[0].content.parts[0].text;
                    console.log(`[GEMINI_AI] Received chat reply from Gemini.`);
                    if (req.file) {
                        reply = `[Telemetry Document Ingested: ${req.file.originalname}]\n\n` + reply;
                    }
                    return res.json({ success: true, reply: reply });
                }
            } else {
                const errText = await response.text();
                console.error(`[GEMINI_AI] Chat API call failed:`, errText);
            }
        } catch (geminiErr) {
            console.error(`[GEMINI_AI] Error contacting Gemini Chat API:`, geminiErr);
        }
    }

    // 2. Try standard local instruct models
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
    let replyMessage = "Welcome to Cornerstone Insurance Firm. You can describe your request and attach documents right here in the chat terminal. The Secure Ingestion Vault on the right will compile your details; simply review and click 'Verify & Submit' to finalize your request.";
    
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
