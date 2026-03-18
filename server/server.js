import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import multer from 'multer';
import FormData from 'form-data';
import Groqsdk from "groq-sdk";
import fs from 'fs';
import PDFDocument from "pdfkit";
import { pdf } from "pdf-to-img";
import { Document, Packer, Paragraph } from "docx";
import PptxGenJS from "pptxgenjs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.S_URL,
  process.env.S_KEY
);

// ---- // SAVING // ---- //

async function ensureUser(userId) {
  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .single();

  if (!data) {
    await supabase.from('users').insert({ id: userId });
  }
}

async function saveToSupabase(userId, convId, message, aiResponse, files = []) {
  try {
    if (!userId) return;
console.log("💾 saveToSupabase called:", { userId, convId, message: message?.slice(0,30), aiResponse: aiResponse?.slice(0,30) });
    // 1. تأكد من وجود المستخدم
    await ensureUser(userId);

    // 2. أنشئ المحادثة إذا لم تكن موجودة
    const { data: convData } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', convId)
      .single();

    if (!convData) {
      await supabase.from('conversations').insert({
        id: convId,
        user_id: userId,
        title: message ? message.slice(0, 50) : 'Document'
      });
    }

    // 3. احفظ رسالة المستخدم
    await supabase.from('messages').insert({
      conv_id: convId,
      role: 'user',
      content: message
    });

    // 4. احفظ رد الذكاء الاصطناعي
    if (aiResponse) {
      await supabase.from('messages').insert({
        conv_id: convId,
        role: 'ai',
        content: aiResponse
      });
    }

    // 5. احفظ الملفات
    for (const file of files) {
      await supabase.from('files').insert({
        conv_id: convId,
        name: file.name,
        url: file.url,
        preview_url: file.previewUrl || null,
        type: file.type
      });
    }

  } catch (err) {
    console.error("❌ Supabase save error:", err.message);
  }
}

const groqa = new Groqsdk({
  apiKey: process.env.R1
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_REASONING_MODEL = "trinity-large";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const providerHealth = {
  openrouter: { blockedUntil: 0 },
  google: { blockedUntil: 0 }
};
const upload = multer({ dest: 'tmp/' });
const PUBLIC_DIR = path.join(__dirname, '..', 'client');
const PROVIDER_COOLDOWN = 60_000; // 60 ثانية


// === Codeai code-R 1.0 | Fallback Map ===
// === Codeai code-R 1.0 | FINAL FALLBACK MAP ===
// === Codeai code-R | FINAL FALLBACK MAP (OFFICIAL) ===
const STATION_FALLBACKS = {

  A: [ // ⚡ Fast / General / Chat
    "llama-3.1-instant",        // Groq – أسرع chat
    "gemini-3-flash",
    "gpt-oss"                  // OpenRouter fallback
  ],

  B: [ // 🧠 Deep Reasoning (THINKING)
    "gpt-oss-120b",            // ⭐ Groq – تحليل عميق
    "trinity-large",
    "chimera-r1",
    "gemini-2.5-pro"           // آخر حل
  ],

  C: [ // 💻 Coding / Execution
    "qwen-coder",
    "gpt-oss-120b",            // تحليل + كود
    "chimera-r1",
    "gemini-3-flash"           // emergency
  ]
};


// --- إعدادات الحدود (مثال لـ Gemini Flash) ---
const LIMITS = {
    GEMINI: {
        RPM: 3,
        TPM: 230000,
        RPD: 17,
    },
    GEMMA: {
        RPM: 27,      // Gemma له حدود أعلى
        TPM: 12000,
        RPD: 12000,
    },
    OPENROUTER: { // إعدادات للنماذج المجانية
        RPM: 20,     
        TPM: 40000,
        RPD: 500,
    },
    KIMI: { // 👈 إضافة جديدة
        RPM: 17,       // عدل حسب حدود حسابك في Moonshot
        TPM: 470000,
        RPD: 200,
    },
    GROQ: {
        RPM: 30,
        TPM: 1000000, // عملياً غير محدود
        RPD: 1000
    }
};

// أضف تعريف النماذج بعد تعريف LIMITS
// بعد تعريف LIMITS أضف:
const MODEL_CONFIGS = {
    'gemini-3-flash': {
        provider: 'google',
        modelName: 'gemini-3-flash-preview',
        displayName: 'Gemini 3 Flash',
        maxTokens: 1000000,
        temperature: 0.2,
        supportsStreaming: true,
        features: ['fast', 'latest']
    },
    'gemini-2.5-pro': {
        provider: 'google',
        modelName: 'gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
        maxTokens: 1000000,
        temperature: 0.2,
        supportsStreaming: false,
        features: ['long-context', 'reasoning', 'advanced']
    },
    'gemini-2.5': {
        provider: 'google',
        modelName: 'gemini-2.5-flash',
        displayName: 'Gemini 2.5',
        maxTokens: 1000000,
        temperature: 0.2,
        supportsStreaming: true,
        features: ['fast', 'efficient', 'balanced']
    },
    'gemma': {
     provider: "google",
     modelName: "gemma-3-27b-it",
     maxTokens: 1000000,
     temperature: 0.3,
     supportsStreaming: false,
     displayName: "Gemma 3 12B"
    },
    'deepseek-coder': {
        provider: 'deepseek',
        modelName: 'deepseek-coder',
        displayName: 'DeepSeek Coder',
        maxTokens: 1000000,
        temperature: 0.7,
        supportsStreaming: true,
        apiUrl: 'https://api.deepseek.com/v1/chat/completions',
        features: ['coding', 'open-source']
    },
    'deepseek-chat': {
        provider: 'deepseek',
        modelName: 'deepseek-chat',
        displayName: 'DeepSeek Chat',
        maxTokens: 1000000,
        temperature: 0.7,
        supportsStreaming: true,
        apiUrl: 'https://api.deepseek.com/v1/chat/completions',
        features: ['general', 'open-source']
    },
      'qwen-coder': {
        provider: 'openrouter',
        modelName: 'qwen/qwen3-coder:free', // تصحيح الاسم الشائع، أو استخدم qwen/qwen3-coder:free إذا توفر
        displayName: 'Qwen 3 Coder 480B',
        maxTokens: 1000000,
        temperature: 0.6,
        supportsStreaming: true,
        apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
        features: ['coding']
    },
    'chimera-r1': {
        provider: 'openrouter',
        modelName: 'tngtech/deepseek-r1t2-chimera:free',
        displayName: 'DeepSeek (Chimera R1T2)',
        maxTokens: 1000000,
        temperature: 0.7,
        supportsStreaming: true,
        apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
        features: ['reasoning',]
    },
    'hermes-3': {
        provider: 'openrouter',
        modelName: 'nousresearch/hermes-3-llama-3.1-405b:free',
        displayName: 'Hermes 3 405B',
        maxTokens: 1000000,
        temperature: 0.2,
        supportsStreaming: true,
        apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
        features: ['large', 'free']
    },
    'gpt-oss': {
        provider: 'openrouter',
        modelName: 'openai/gpt-oss-20b:free',
        displayName: 'GPT-OSS 20B',
        maxTokens: 1000000,
        temperature: 0.2,
        supportsStreaming: true,
        apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
        features: ['free']
    },
    'solar-pro': {
        provider: 'openrouter',
        modelName: 'upstage/solar-pro-3:free',
        displayName: 'Solar Pro 3',
        maxTokens: 1000000,
        temperature: 0.2,
        supportsStreaming: true,
        apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
        features: ['efficient', 'free']
    },
    'trinity-large': {
        provider: 'openrouter',
        modelName: 'arcee-ai/trinity-large-preview:free',
        displayName: 'Trinity Large 400B',
        maxTokens: 1000000,
        temperature: 0.7,
        supportsStreaming: true,
        apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
        features: ['advanced', 'free']
    },
    'kimi-k2': {
        provider: "kimi",
        modelName: "moonshot-v1-8k",
        maxTokens: 1000000,
        temperature: 0.3,
        supportsStreaming: false,
        displayName: "Kimi K2"
    },
    'llama-3.1-instant': {
     provider: 'groq',
     modelName: 'llama-3.1-8b-instant',
     displayName: 'LLaMA 3.1 8B Instant',
     maxTokens: 1000000,
     temperature: 0.7,
     supportsStreaming: true,
     features: ['fast', 'chat']
    },
    'llama-3.3-70b': {
     provider: 'groq',
     modelName: 'llama-3.3-70b-versatile',
     displayName: 'LLaMA 3.3 70B',
     maxTokens: 1000000,
     temperature: 0.6,
     supportsStreaming: true,
     features: ['coding', 'reasoning']
    },
    'groq-compound': {
     provider: 'groq',
     modelName: 'groq/compound',
     displayName: 'Groq Compound',
     maxTokens: 1000000,
     temperature: 0.3,
     supportsStreaming: false,
     features: ['reasoning', 'no-tpm-limit']
    },
    'gpt-oss-120b': {
     provider: 'groq',
     modelName: 'openai/gpt-oss-120b',
     displayName: 'GPT-OSS 120B',
     maxTokens: 1000000,
     temperature: 0.3,
     supportsStreaming: false,
     features: ['analysis', 'reasoning', 'large']
    },
};

const D1 = process.env.D1; // D = deepseek
const G3 = process.env.G3; 
const G2 = process.env.G2;
const G1 = process.env.G1; // G = Gemini
const O1 = process.env.O1; // O = Openrouter
const O2 = process.env.O2;
const K1 = process.env.K1;
const R1 = process.env.R1;

// كائن لتتبع الاستهلاك لكل مفتاح
// تهيئة كاملة لـ usageStats
let usageStats = {};

// تهيئة جميع المفاتيح
// غيّر السطر ليصبح:
['G1', 'G2', 'G3', 'D1', 'O1', 'O2', 'K1', 'R1'].forEach(keyId => {
    usageStats[keyId] = {
        gemini: { rpm: 0, tpm: 0, rpd: 0, lastMinute: Date.now(), lastDay: Date.now() },
        gemma: { rpm: 0, tpm: 0, rpd: 0, lastMinute: Date.now(), lastDay: Date.now() },
        deepseek: { rpm: 0, tpm: 0, rpd: 0, lastMinute: Date.now(), lastDay: Date.now() },
        openrouter: { rpm: 0, tpm: 0, rpd: 0, lastMinute: Date.now(), lastDay: Date.now() }, // ⬅ جديد
        kimi: { rpm: 0, tpm: 0, rpd: 0, lastMinute: Date.now(), lastDay: Date.now() },
        groq: { rpm: 0, tpm: 0, rpd: 0, lastMinute: Date.now(), lastDay: Date.now() }
    };
});

console.log("✅ Initialized usage stats for all keys");

/**
 * دالة لتصفير العدادات عند مرور دقيقة أو يوم
 */
function refreshStats(keyId, modelType) {
    const now = Date.now();
    const stats = usageStats[keyId][modelType];
    
    // تصفير الدقيقة
    if (now - stats.lastMinute > 60000) {
        stats.rpm = 0;
        stats.tpm = 0;
        stats.lastMinute = now;
    }
    // تصفير اليوم
    if (now - stats.lastDay > 86400000) {
        stats.rpd = 0;
        stats.lastDay = now;
    }
}


async function ensureArabicFont() {
  const fontDir = path.join(__dirname, 'fonts');
  const fontPath = path.join(fontDir, 'NotoSans.ttf');


  
  if (!fs.existsSync(fontDir)) fs.mkdirSync(fontDir);

if (!fs.existsSync(fontPath)) {
    console.log("📥 Downloading Arabic font...");
    const fetch = (await import('node-fetch')).default;
    const res = await fetch('https://fonts.gstatic.com/s/notosans/v36/o-0IIpQlx3QUlC5A4PNr5TRASf6M7bBd.ttf');
    const buffer = await res.buffer();
    fs.writeFileSync(fontPath, buffer);
    const stats = fs.statSync(fontPath);
console.log("✅ Arabic font downloaded, size:", stats.size, "bytes");
  }
  
  return fontPath;
}


function isProviderAvailable(provider) {
  return Date.now() > (providerHealth[provider]?.blockedUntil || 0);
}

function markProviderRateLimited(provider) {
  providerHealth[provider] = {
    blockedUntil: Date.now() + PROVIDER_COOLDOWN
  };
}

function selectModelForStation(stationKey) {
  const candidates = STATION_FALLBACKS[stationKey];
  if (!candidates) return null;

  for (const modelId of candidates) {
    const config = MODEL_CONFIGS[modelId];
    if (!config) continue;

    if (isProviderAvailable(config.provider)) {
      return modelId;
    }
  }

  return null; // كل المزودين محجوبين
}

function getNextFallbackModel(stationKey, currentModel) {
  const list = STATION_FALLBACKS[stationKey];
  if (!list) return null;

  const idx = list.indexOf(currentModel);
  return list[idx + 1] || null;
}

function getNextAvailableModel(startModel) {
  let found = false;

  for (const station of STATION_FALLBACKS) {
    for (const modelId of station) {
      if (modelId === startModel) {
        found = true;
      }
      if (!found) continue;

      const config = MODEL_CONFIGS[modelId];
      if (!config) continue;

      if (!isProviderAvailable(config.provider)) {
        continue;
      }

      const key = getSafeKeyForModel(modelId);
      if (key) {
        return modelId;
      }
    }
  }

  return null;
}

function buildCodeSystemPrompt({
  routeResult,
    settings,
    taskInfo,
    reasoningSummary,
    visionImages,
    files,
    history,
    message
}) {

  /* ========== visualStyleInstruction ========== */
  let visualStyleInstruction = "";
    if (settings && settings.theme === 'light') {
        visualStyleInstruction = `
- (LIGHT THEME)
If the user does not specify a particular design or theme, ALWAYS apply the following default style:
1. Colors:
   - Background: #FFFFFF (Pure White)
   - Secondary/Surface: #E0E0E0
   - Text: #080808 (Deep Black)
   - Accent: #CCCCCC
   - Borders: rgba(0,0,0,0.1)
2. Components:
   - Use distinct shadows (box-shadow: 0 2px 8px rgba(0,0,0,0.05)) for cards.
   - Buttons: Black text on White background or Light Grey.
   - Modals, Cards, and Menus: border-radius: 16px;
   - Buttons: border-radius: 30px; background-color: #000000; color: #080808; (Change colors only if multiple buttons exist to show hierarchy).
3. Typography:
   - For English text, use the 'Archives' font family.
`;
    } else {
        // الوضع المظلم (الافتراضي القديم)
        visualStyleInstruction = `
- (DARK THEME)
If the user does not specify a particular design or theme, ALWAYS apply the following default style:
1. Colors:
   - Background: #080808 (Deep Black)
   - Secondary/Surface: #2A2A2A
   - Text: #FFFFFF (Pure White)
   - Accent: #333333
2. Typography:
   - For English text, use the 'Archives' font family.
3. Components:
   - Modals, Cards, and Menus: border-radius: 16px;
   - Buttons: border-radius: 30px; background-color: #FFFFFF; color: #000000; (Change colors only if multiple buttons exist to show hierarchy).
`;
    }

    // 2. تحديد شخصية المساعد (Detailed vs Simple)
    let personaInstruction = "";
    if (settings && settings.convStyle === 'Simple') {
        personaInstruction = `
- COMMUNICATION STYLE: SIMPLE & INTERACTIVE -
You are chatting with a non-technical user or someone who wants quick results.
1. DO NOT explain the code in detail.
2. DO NOT list changed files unless asked.
3. Just say enthusiastically: "I've updated the design for you!", "Game is ready!", etc.
4. Be very interactive, ask "Do you want to change the colors?", "Shall we add sound?".
`;
    } else {
        // Detailed (الافتراضي)
        personaInstruction = `
- COMMUNICATION STYLE: DETAILED & EXPERT -
You are chatting with a developer.
1. Briefly explain the technical changes.
2. Be interactive but professional.
`;
    }

    // 3. اللغة المفضلة
    const prefLang = settings && settings.prefLanguage ? settings.prefLanguage : 'HTML';

    // 2. تحضير سياق الملفات الحالي لإرساله للنموذج
    let filesContext = "";
    if (files && Array.isArray(files)) {
        filesContext = files.map(f => 
            `--- FILE START: ${f.name} ---\n${f.content}\n--- FILE END: ${f.name} ---`
        ).join("\n\n");
    }
    let taskModeInstruction = "";

if (taskInfo) {
  switch (taskInfo.intent) {
    case "build":
      taskModeInstruction = `
- TASK MODE: BUILD -
You are creating new features or a new project.
Focus on structure, clarity, and completeness.
`;
      break;

    case "fix":
      taskModeInstruction = `
- TASK MODE: FIX -
You are fixing a bug.
Make minimal, targeted changes.
Do NOT refactor unless necessary.
`;
      break;

    case "improve":
      taskModeInstruction = `
- TASK MODE: IMPROVE -
Enhance existing functionality without breaking behavior.
`;
      break;

    case "refactor":
      taskModeInstruction = `
- TASK MODE: REFACTOR -
Improve code quality and structure without changing functionality.
`;
      break;
  }
}
// 3. تعليمات النظام الجديدة
    const systemInstruction = `You are an expert, friendly web developer.




--------------------------------------------------
GLOBAL IDENTITY
--------------------------------------------------
--- INFO ---

- YOUR GOAL -
Help the user by editing existing files or CREATING new files based on their request.
- ABOUT -
1. Identity & Platform:
You are Codeai (in arabic (كوداي)), an integrated AI chat assistant and code editor. You operate within the Codeai PWA, designed to provide a seamless coding and assistance experience.
2.​Capabilities & Constraints:
You support code generation and live previews for the following languages only: HTML, CSS, JavaScript, Java, Python(console view only). Ensure all technical solutions and previews align with these supported environments.
-------------------------------------------------
[IMPORTANT RULE] 
--------------------------------------------------
If the user asks for anything that doesn't relate to coding, answer them normally; you aren't for coding only.
--------------------------------------------------
USER CONTEXT
--------------------------------------------------
- Preferred Language: ${prefLang} (Default to this if starting a new project).
- Theme: ${settings?.theme || 'dark'}
--------------------------------------------------
DESIGN CONTEXT (if UI involved)
--------------------------------------------------
${visualStyleInstruction}
- ALWAYS include the following block at the very beginning of every CSS file or <style> tag:
* {
    -webkit-tap-highlight-color: transparent;
}
- NEVER use alert(), Make your own modal instead.
- Try always to add simple animations for buttons, modals, cards, and almost everything that makes the app/game better

${personaInstruction}
--------------------------------------------------
RULES
--------------------------------------------------
1. **Language:** Reply in the language the user speaks.
2. **Multi-File Capability:** You can edit multiple files in one response.
3. To ADD new functions/classes (without repeating code): 
   Use <ADD_TO target="filename.ext" position="end">content</ADD_TO> (position can be "start" or "end").
4. For SMALL changes: Use <REPLACE file="filename.ext">
   <<<<<<< SEARCH
   one or two lines ONLY to find
   =======
   new lines
   >>>>>>> REPLACE
   </REPLACE>
5. **New Files:** If the user asks for a new file, output a file block with that name.
6. You can provide multiple <FILE> or <ADD_TO> or <REPLACE> blocks in a single response if the task requires changing multiple files (e.g., updating HTML, CSS, and JS together)."
7. ​Dumping & Coding: Place all diffs and code blocks at the absolute end. Ensure any conversational text or questions for the user precede the code markers <>, as anything following them is hidden.
8. NEVER output templates
9. ALWAYS deliver a complete, polished product
10. ADD 2-3 extra features the user didn't ask for but would love
11. MAKE IT FEEL FINISHED, not like a starter
--------------------------------------------------
EXTERNAL SVG FILES GUIDE
--------------------------------------------------
When creating graphics, ALWAYS use separate .svg files:

1. CREATE SVG FILE:
<FILE name="icon.svg">
<svg width="100" height="100" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="45" fill="#00FFFF"/>
</svg>
</FILE>

2. LINK IN HTML (3 WAYS - ALL SUPPORTED):
   A) <object data="icon.svg" width="100" height="100"></object>
   B) <img src="icon.svg" width="100" height="100">
   C) <svg><use xlink:href="icon.svg#icon" /></svg>

3. BEST PRACTICES:
   - Always include width/height and viewBox
   - Add ids for JavaScript: <circle id="wheel" .../>
   - Use multiple SVGs for complex projects
   - SVGs can be interactive with JS
--------------------------------------------------
OUTPUT FORMAT (STRICT)
--------------------------------------------------
To create a file, use this EXACT format at the end of your response:

<FILE name="filename.ext">
... FULL code content here ...
</FILE>

${taskModeInstruction}
`;

 // 5. دمج التاريخ (Context)
    // ابحث عن هذا الجزء في server.js وعدله ليصبح هكذا:
let historyText = "";
if (history && Array.isArray(history)) {
    historyText = history.map(msg => {
        // تأكد من وجود الحقل الصحيح (sender أو role)
        const role = msg.role || msg.sender || 'user'; 
        const text = msg.text || msg.content || '';
        return `[${role.toUpperCase()}]: ${text.substring(0, 500)}`;
    }).join("\n");
}




let internalGuidance = "";

if (reasoningSummary) {
  internalGuidance = `
--- INTERNAL GUIDANCE (DO NOT EXPOSE TO USER) ---
${reasoningSummary}
`;
}
let taskPromptContext =''

if (taskInfo) {
taskPromptContext = `
--- EXECUTION TASK ---
You are fixing an existing issue.
Your job is to APPLY changes exactly as instructed.
You do NOT decide what to change.
You do NOT re-analyze the task.
Apply the provided plan exactly
`;

if (taskInfo.task_type === "fix" && taskInfo.fault) {
  taskPromptContext += `
--- TARGETED FIX CONTEXT ---
Problem type: ${taskInfo.fault.type}
Affected files: ${taskInfo.fault.files.join(", ")}
Location: ${taskInfo.fault.location}
Summary: ${taskInfo.fault.summary}

Focus ONLY on the affected area.
Do NOT modify unrelated code.
`;
}

if (taskInfo.task_type === "build" || taskInfo.task_type === "feature") {
  taskPromptContext += `
--- BUILD CONTEXT ---
1. Create COMPLETE implementation, not template
2. Add polish and finishing touches
3. Include all features planned above
4. Make it production-ready
5. You may create or modify multiple files.
6. Follow system design best practices.
`;
}
}


let visionContext = "";

const userParts = [];

// 1. نص المستخدم + السياق
userParts.push({
  text: `
--- CONVERSATION CONTEXT (LAST 2 TURNS) ---
${historyText}

--- CURRENT USER MESSAGE ---
${message}

--- CURRENT PROJECT FILES ---
${filesContext}
`.trim()
});

// 2. الصور (Vision حقيقي)
if (visionImages && visionImages.length > 0) {
  for (const img of visionImages) {
    const base64 = fs.readFileSync(img.path, "base64");

    userParts.push({
      inlineData: {
        data: base64,
        mimeType: img.mimetype
      }
    });
  }
}

return {
  systemPrompt: `${systemInstruction}\n\n${taskPromptContext}\n\n${internalGuidance}`,
  userParts
};
}


function buildSystemPrompt(ctx) {
  const {
    routeResult,
    settings,
    taskInfo,
    reasoningSummary,
    visionImages,
    files,
    history,
    message
  } = ctx;

  // ⛔️ الأسئلة العامة
  if (routeResult.task_type === "general") {
    const systemPrompt = `
    You are a helpful assistant.
Answer clearly and directly.
Language: respond in user's language.
`;
    // بناء userPrompt يتضمن آخر محادثة ورسالة المستخدم
    let userPrompt = message;
    
    let visionContext = "";
    if (visionImages && visionImages.length > 0) {
        visionContext = `--- ATTACHED IMAGES ---\nThe user has attached ${visionImages.length} image(s).\nYou MUST analyze them carefully before responding.\nDescribe what you see and use the visual information to answer accurately.\n\n`;
        visionImages.forEach((img, index) => {
            const base64 = fs.readFileSync(img.path).toString("base64");
            visionContext += `[IMAGE ${index + 1}]\ndata:${img.mimetype};base64,${base64}\n`;
        });
    }
    userPrompt = visionContext + userPrompt;
    return { systemPrompt, userPrompt };
  }
  

  // 📄 توليد ملفات
  // في دالة buildSystemPrompt
if (["pdf", "pptx", "docx"].includes(routeResult.task_type)) {
    const systemPrompt = `
You are a document generation engine.

You MUST respond with ONLY valid JSON that follows this EXACT structure:

{
  "type": "document",
  "user_message": "Your friendly whole response to the user here (like 'I've created your PDF!' or 'Here's your presentation')",
  "document": {
    "document_type": "pdf" | "pptx" | "docx",
    "file_name": "desired-filename.ext",
    "content": {
      // Document content based on type:
      // For PDF: { "text": "content..." }
      // For PPTX: { "slides": [{ "text": "slide1" }, { "text": "slide2" }] }
      // For DOCX: { "paragraphs": ["p1", "p2", "p3"] }
    }
  }
}

RULES:
- The "user_message" field MUST contain a natural, friendly response in the user's language, and try to make it a bit long
- The "document" field MUST contain valid document data
- No text outside the JSON structure
- No markdown
- No explanations

Example for PDF:
{
  "type": "document",
  "user_message": "I've created your PDF!",
  "document": {
    "document_type": "pdf",
    "file_name": "my-document.pdf",
    "content": {
      "text": "This is the content of my PDF document..."
    }
  }
}
`;
    const userPrompt = message;
    return { systemPrompt, userPrompt };
}

  // 👇 من هنا فصاعدًا: CODE MODE
  return buildCodeSystemPrompt(ctx);
}


function getSafeKey(modelType = 'gemini') {
    const keys = ['G1', 'G2', 'G3'];
    const limits = LIMITS[modelType.toUpperCase()];
    
    console.log(`🔍 Looking for ${modelType} key. Available keys: ${keys}`);
    
    for (let keyId of keys) {
        const keyToken = process.env[keyId];
        if (!keyToken) {
            console.log(`   ${keyId}: No token available`);
            continue;
        }

        refreshStats(keyId, modelType);
        const stats = usageStats[keyId][modelType];

        // تأكد من أن القيم ليست NaN
        const currentRpm = isNaN(stats.rpm) ? 0 : stats.rpm;
        const currentTpm = isNaN(stats.tpm) ? 0 : stats.tpm;
        const currentRpd = isNaN(stats.rpd) ? 0 : stats.rpd;

        const isRpmSafe = currentRpm < (limits.RPM - 1);
        const isTpmSafe = currentTpm < (limits.TPM * 0.9);
        const isRpdSafe = currentRpd < limits.RPD;
        
        console.log(`   ${keyId}: RPM=${currentRpm}/${limits.RPM}, TPM=${currentTpm}/${limits.TPM}, RPD=${currentRpd}/${limits.RPD}`);
        
        if (isRpmSafe && isTpmSafe && isRpdSafe) {
            console.log(`✅ Selected ${modelType} Key: ${keyId}`);
            return { 
                id: keyId, 
                token: keyToken,
                modelType: modelType
            };
        } else {
            console.log(`   ${keyId}: Limits exceeded`);
        }
    }
    
    console.log(`❌ No available keys for ${modelType}`);
    
}

function getSafeKeyForModel(requestedModel) {
    const modelConfig = MODEL_CONFIGS[requestedModel];
    if (!modelConfig) {
        console.log(`❌ Model config not found: ${requestedModel}`);
        return getSafeKey();
    }
    
    // تحديد الحدود والمفاتيح بناءً على المزود
    let limits, keys, modelType;
    
    if (modelConfig.provider === 'deepseek') {
        limits = { RPM: 60, TPM: 1000000, RPD: 1000 };
        keys = ['D1'];
        modelType = 'deepseek';
    } else if (modelConfig.provider === 'openrouter') { // ⬅ حالة OpenRouter
        limits = LIMITS.OPENROUTER;
        keys = ['O1', 'O2'];
        modelType = 'openrouter';
    } else if (modelConfig.provider === 'kimi') { // 👈 إضافة شرط جديد
        limits = LIMITS.KIMI;
        keys = ['K1'];
        modelType = 'kimi'; // تأكد أنك أضفت هذا النوع في usageStats في الخطوة 1
    } else if (modelConfig.provider === 'groq') {
        limits = LIMITS.GROQ;
        keys = ['R1'];
        modelType = 'groq';
    
    } else { // Google
        limits = { RPM: 3, TPM: 230000, RPD: 17 };
        keys = ['G1', 'G2', 'G3'];
        modelType = 'gemini';
    }
    
    for (let keyId of keys) {
        const keyToken = process.env[keyId];
        if (!keyToken) continue;
        
        refreshStats(keyId, modelType);
        const stats = usageStats[keyId][modelType];
        
        const isRpmSafe = stats.rpm < (limits.RPM - 1);
        const isTpmSafe = stats.tpm < (limits.TPM * 0.9);
        const isRpdSafe = stats.rpd < limits.RPD;
        
        if (isRpmSafe && isTpmSafe && isRpdSafe) {
            return { 
                id: keyId, 
                token: keyToken,
                provider: modelConfig.provider,
                modelConfig: modelConfig
            };
        }
    }

}

async function sendResponseUnified({
  model,
  prompt,
  userParts,
  systemPrompt,
  supportsStreaming,
  provider,
  keyInfo,
  onChunk,
  onComplete,
  maxRetries = 2 // إضافة معامل إعادة المحاولة
}) {
  let fullResponse = "";
  let retries = 0;
  const modelConfig = keyInfo?.modelConfig || {};
  while (retries <= maxRetries) {
    try {
      if (provider === 'google') {
        if (supportsStreaming) {
          const parts = Array.isArray(userParts) && typeof userParts[0] === "object"
  ? userParts
  : [{ text: prompt }];
  console.log(parts)
          const result = await model.generateContentStream({
            systemInstruction: systemPrompt || undefined,
            contents: [
            {
            role: "user",
            parts: parts
            }
          ]
        });
        
          for await (const chunk of result.stream) {
            const text = chunk.text();
            
           /* if (text?.trim().startsWith('<') && 
                !text?.trim().startsWith('<FILE') && 
                !text?.trim().startsWith('<REPLACE') && 
                !text?.trim().startsWith('<ADD_TO')) {
  console.error("🔥 HTML RESPONSE DETECTED");
  console.error("🔥 Provider:", provider);
  console.error("🔥 Model:", modelConfig?.modelName);
  console.error("🔥 Prompt size:", prompt.length);
  throw new Error("HTML_FALLBACK_DETECTED");
}*/
            if (text) {
              
  fullResponse += text;

  // فحص إذا كان الـ response مستند JSON
  const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
  console.log("🔍 jsonMatch found:", !!jsonMatch);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log("🔍 parsed.type:", parsed.type);
    console.log("🔍 parsed.document:", !!parsed.document);
    console.log("🔍 parsed.user_message:", parsed.user_message);
      if (parsed.type === 'document' && parsed.document) {
        
        await handleDocumentGeneration({
          json: parsed.document,
          clientId: Array.isArray(keyInfo.clientId)
    ? keyInfo.clientId[0]
    : keyInfo.clientId,
          convId: keyInfo.convId,
          userId: keyInfo.userId,
          message: keyInfo.message,
          userMessage: parsed.user_message
        });
        onComplete("");
        return; // لا ترسل الـ JSON الخام
      }
    } catch (_) {}
  }

  if (!fullResponse.includes('"type"')) {
    onChunk(text);
  }
}
          }
          console.log(`\n📄 ===== FULL MODEL RESPONSE =====\n${fullResponse}\n===== END RESPONSE =====\n`);
        } else {
  const result = await model.generateContent({
  systemInstruction: systemPrompt || undefined,
  contents: [
    {
      role: "user",
      parts: Array.isArray(userParts) && typeof userParts[0] === "object"
        ? userParts
        : [{ text: typeof userParts === "string" ? userParts : (typeof prompt === "string" ? prompt : JSON.stringify(prompt)) }]
    }
  ]
});
          const text = result.response?.text?.() || "";
          if (text) {
            fullResponse = text;
            onChunk(text);
          }
        }
      }  else if (provider === 'deepseek' || provider === 'openrouter' || provider === 'groq') {
        const finalUserPrompt =
  Array.isArray(prompt)
    ? prompt.map(p => p.text).join("\n")
    : prompt;
  const messages = [
    { role: "system", content: systemPrompt || "You are a helpful AI coding assistant." },
    { role: "user", content: finalUserPrompt }
  ];

  const apiFunction =
    provider === 'openrouter' ? callOpenRouterAPI :
    provider === 'groq'       ? callGroqAPI :
                                callDeepSeekAPI;

  // ⚠️ هذه الدوال ترجع STRING دائمًا
  const text = await apiFunction(keyInfo, messages);

  if (!text || typeof text !== 'string') {
    throw new Error("EMPTY_MODEL_RESPONSE");
  }

  fullResponse = text;
  let handled = false;
        
        // محاولة العثور على JSON في النص
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0];
          const beforeJson = text.substring(0, jsonMatch.index).trim();
          
          try {
            const parsed = JSON.parse(jsonStr);
            
            // التحقق من أنه مستند
            if (parsed.type === 'document' && parsed.document) {
              // إرسال النص الذي قبل JSON (إن وجد)
              if (beforeJson) {
                console.log("🟢 PATH 2 beforeJson onChunk called");
                onChunk(beforeJson);
              }
              
              // إرسال رسالة المستخدم من JSON (إن وجدت)
              
              
              // معالجة المستند
              await handleDocumentGeneration({
                json: parsed.document,
                clientId: Array.isArray(keyInfo.clientId)
    ? keyInfo.clientId[0]
    : keyInfo.clientId,
                convId: keyInfo.convId,
                userId: keyInfo.userId,
                message: keyInfo.message,
                userMessage: parsed.user_message
              });
              
              // إرسال رسالة تأكيد بسيطة (اختياري)
              
              onComplete?.("");
              handled = true;
            }
          } catch (e) {
            // JSON غير صالح، نتجاهل
            console.log("Invalid JSON detected, sending as plain text");
          }
        }
        
        // إذا لم يتم التعامل معها كمستند، نرسل النص كاملاً
        if (!handled) {
          onChunk(text);
        }
} else if (provider === 'kimi') {
          const kimiResponse = await callKimiAPI({
            token: keyInfo.token,
            modelConfig: keyInfo.modelConfig,
            prompt: prompt
        });
        
        if (kimiResponse) {
            fullResponse = kimiResponse;
            onChunk(kimiResponse); // Kimi حالياً في الكود لا يدعم الـ stream، نرسل النص كاملاً
        }
      }


    
    

      // إذا وصلنا هنا، فقد نجحنا
      onComplete(fullResponse);
      return;
      
    } catch (error) {
      retries++;
      console.error(`❌ Attempt ${retries}/${maxRetries + 1} failed:`, error.message);
      
      // ✅ إضافة هذا الشرط الجديد
      if (maxRetries === 0) {
      throw error;
      }
      
      if (retries <= maxRetries) {
        console.log(`🔄 Retrying... (${retries}/${maxRetries})`);
        // انتظر قليلاً قبل إعادة المحاولة
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        // جميع المحاولات فشلت
        console.error(`❌ All ${maxRetries + 1} attempts failed`);
        throw error;
      }
    }
  }
}

async function callKimiAPI({ token, modelConfig, prompt }) {
  const res = await fetch("https://api.moonshot.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      model: modelConfig.modelName,
      messages: [{ role: "user", content: prompt }],
      temperature: modelConfig.temperature,
      max_tokens: modelConfig.maxTokens
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kimi API error: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

async function callGroqAPI(keyInfo, messages) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${keyInfo.token}`
    },
    body: JSON.stringify({
      model: keyInfo.modelConfig.modelName,
      messages,
      temperature: keyInfo.modelConfig.temperature,
      max_tokens: keyInfo.modelConfig.maxTokens,
      stream: false
    })
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('RATE_LIMITED');
    throw new Error(`Groq API error: ${res.status}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

// ============= دالة OpenRouter API مع دعم Streaming للـ Reasoning =============
async function callOpenRouterAPI(keyInfo, messages) {
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${keyInfo.token}`,
      'HTTP-Referer': 'https://codeai.app',
      'X-Title': 'Codeai'
    },
    body: JSON.stringify({
      model: keyInfo.modelConfig.modelName,
      messages,
      max_tokens: keyInfo.modelConfig.maxTokens,
      temperature: keyInfo.modelConfig.temperature,
      stream: false // ✅ reasoning = no stream
    })
  });

  const raw = await response.text(); // ✅ اقرأ مرة واحدة فقط

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('RATE_LIMITED');
    }
    throw new Error(`OpenRouter API error: ${response.status} - ${raw}`);
  }

  // 🧹 أحيانًا OpenRouter يرجع data: حتى بدون stream
  let cleaned = raw;
  if (cleaned.startsWith("data:")) {
    cleaned = cleaned
      .split("\n")
      .filter(l => l.startsWith("data: "))
      .map(l => l.replace("data: ", ""))
      .join("");
  }

  const data = JSON.parse(cleaned);
  return data.choices[0].message.content;
}


function getFallbackModel(originalModelKey) {
    const fallbackMap = {
        // استخدم الـ keys من MODEL_CONFIGS
        'hermes-3': 'trinity-large',
        'trinity-large': 'chimera-r1',
        'chimera-r1': 'solar-pro',
        'solar-pro': 'gpt-oss',
        'gpt-oss': 'gemini-3-flash'
    };
    
    return fallbackMap[originalModelKey] || 'gemini-3-flash';
}

/**
 * تحديث الاستخدام بعد الطلب بطريقة آمنة
 */
/**
 * تحديث الاستخدام بعد الطلب بطريقة آمنة (مصحح)
 */
function updateUsage(keyId, modelType, tokens) {
    if (!usageStats[keyId] || !usageStats[keyId][modelType]) {
        console.error(`❌ Invalid stats for ${keyId}.${modelType}`);
        return;
    }
    
    const stats = usageStats[keyId][modelType];
    
    // تأكد من أن tokens رقم صالح
    const safeTokens = isNaN(parseInt(tokens)) ? 100 : parseInt(tokens);
    
    // إعادة تهيئة القيم إذا كانت NaN
    if (isNaN(stats.rpm)) stats.rpm = 0;
    if (isNaN(stats.tpm)) stats.tpm = 0;
    if (isNaN(stats.rpd)) stats.rpd = 0;
    
    // التحديث بالقيم الصحيحة
    stats.rpm += 1;
    stats.rpd += 1;
    stats.tpm += safeTokens;
    
    console.log(`📊 Updated ${modelType.toUpperCase()} usage for ${keyId}: RPM=${stats.rpm}, TPM=${stats.tpm}, Tokens=${safeTokens}`);
}

async function callDeepSeekAPI(keyInfo, messages) {
    const response = await fetch(keyInfo.modelConfig.apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${keyInfo.token}`
        },
        body: JSON.stringify({
            model: keyInfo.modelConfig.modelName,
            messages: messages,
            max_tokens: keyInfo.modelConfig.maxTokens,
            temperature: keyInfo.modelConfig.temperature,
            stream: keyInfo.modelConfig.supportsStreaming
        })
    });
    
    if (!response.ok) throw new Error(`DeepSeek API error: ${response.status}`);
    return response;
}

/**
 * تقدير عدد التوكنز بطريقة آمنة
 */
function estimateTokens(text) {
    if (!text || typeof text !== 'string') return 100; // قيمة افتراضية آمنة
    
    // تقدير تقريبي: 1 توكن لكل 4 حروف (تقريب Gemini)
    const tokenCount = Math.ceil(text.length / 4);
    
    // تأكد من أن القيمة رقم صحيح موجب
    return Math.max(100, tokenCount); // الحد الأدنى 100 توكن للطلبات الصغيرة
}

async function routeModel(userMessage) {
  const routerPrompt = `
You are a routing AI.

You MUST respond with ONLY valid JSON.
NO explanations.
NO markdown.
NO extra text.

Response format (STRICT):
{"recommended_model":"MODEL_ID"}

Available models:

1) gemini-3-flash
- Best for: fast replies, casual chat, simple questions
- Strengths: very fast, low cost
- Weaknesses: limited deep reasoning

2) gemini-2.5-pro
- Best for: deep reasoning, analysis, complex logic
- Strengths: strong thinking and planning
- Weaknesses: slower than flash

3) gemini-2.5-flash
- Best for: balanced reasoning and speed
- Strengths: good general-purpose model
- Weaknesses: not best for heavy coding

4) qwen-coder
- Best for: coding, debugging, refactoring, file edits
- Strengths: excellent code understanding
- Weaknesses: slower for casual chat

5) chimera-r1
- Best for: research-level reasoning, multi-step analysis
- Strengths: very deep thinking
- Weaknesses: slower, higher cost

6) hermes-3
- Best for: long conversations, explanations, structured output
- Strengths: strong instruction following
- Weaknesses: not code-specialized

7) gpt-oss
- Best for: general knowledge, explanations
- Strengths: stable, predictable
- Weaknesses: weaker than top-tier reasoning

8) solar-pro
- Best for: multilingual chat, balanced tasks
- Strengths: good Arabic + English
- Weaknesses: not best at heavy reasoning

9) trinity-large
- Best for: very complex reasoning and planning
- Strengths: extremely powerful
- Weaknesses: slow, expensive

Rules:
- Choose ONLY from the listed model_id values.
- Prefer specialized models over general ones.
- If unsure, choose gemini-3-flash.

User message:
"${userMessage}"
`;

  const genAI = new GoogleGenerativeAI(getSafeKeyForModel("gemma").token);

  const model = genAI.getGenerativeModel({
    model: "gemma-3-27b-it",
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 50
    }
  });

  const result = await model.generateContent(routerPrompt);
  

  let text = result.response.text().trim();

// محاولة استخراج JSON فقط
const jsonMatch = text.match(/\{[\s\S]*\}/);

if (!jsonMatch) {
  console.error("❌ No JSON found in router response:", text);
  return { recommended_model: "gemini-3-flash" };
}

try {
  return JSON.parse(jsonMatch[0]);
} catch (e) {
  console.error("❌ Router JSON parse failed:", jsonMatch[0]);
  return { recommended_model: "gemini-3-flash" };
}
}

async function summarizeConversationWithGemma(convId, userMessage, aiResponse) {
  console.log(`\n🎯 ===== GEMMA SUMMARIZATION STARTED =====`);
  
  // الحصول على مفتاح لـ Gemma
  const gemmaKeyInfo = getSafeKey('gemma');

  if (!gemmaKeyInfo) {
    console.warn("⚠️ No available keys for Gemma summarization");
    console.log(`🔄 Using fallback summary`);
    const fallback = generateFallbackSummary(userMessage);
    console.log(`📝 Fallback summary: "${fallback}"`);
    console.log(`❌ ===== GEMMA SUMMARIZATION SKIPPED =====\n`);
    return fallback;
  }

  console.log(`🔑 Using Gemma Key: ${gemmaKeyInfo.id}`);
  console.log(`📊 Current Gemma usage: RPM=${usageStats[gemmaKeyInfo.id]?.gemma?.rpm || 0}, TPM=${usageStats[gemmaKeyInfo.id]?.gemma?.tpm || 0}`);

  try {
    const summaryPrompt = `You are an AI conversation summarizer. Your ONLY task is to generate a short, descriptive title for a coding/development conversation.

STRICT RULES:
1. Read ONLY the user's first message and the AI's first response
2. Generate a concise, descriptive title (MAX 40 characters)
3. Use the same language as the conversation (English or Arabic)
4. DO NOT add quotes, punctuation, or emojis
5. DO NOT use "..." truncation - make it a complete phrase
6. DO NOT mention "conversation about" or "discussion of"
7. Make it natural like app conversation titles
8. Focus on the main task/request

CONVERSATION:
User: ${userMessage}
AI: ${aiResponse.substring(0, 200)}

TITLE:`;

    console.log(`📋 Summary prompt length: ${summaryPrompt.length} chars`);
    console.log(`📋 Prompt preview: ${summaryPrompt.substring(0, 150)}...`);

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemma-3-1b-it:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': gemmaKeyInfo.token
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: summaryPrompt }]
          }],
          generationConfig: {
            maxOutputTokens: 50,
            temperature: 0.3,
            topP: 0.9,
            topK: 40
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Gemma API error: ${response.status} - ${errorText.substring(0, 200)}`);
      throw new Error(`Gemma API error: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    console.log(`📝 Raw summary from Gemma: "${summary}"`);
    
    // تنظيف وتحسين التلخيص
    const cleanedSummary = cleanSummary(summary, userMessage);
    
    // تحديث الاستخدام
    const tokens = estimateTokens(summaryPrompt + cleanedSummary);
    updateUsage(gemmaKeyInfo.id, 'gemma', tokens);
    
    console.log(`✅ Cleaned summary: "${cleanedSummary}"`);
    return cleanedSummary;
    
  } catch (error) {
    console.error("❌ Gemma summarization failed:", error);
    // استخدام بديل محسن
    
  }
}

function cleanSummary(summary, userMessage) {
  console.log(`🧹 Cleaning summary: "${summary}"`);
  
  if (!summary || summary.trim().length === 0) {
    console.log(`🧼 Empty summary, using fallback`);
    
  }
  
  // إزالة علامات التنصيص والرموز الخاصة
  let cleaned = summary
    .trim()
    .replace(/^["'`]|["'`]$/g, '')  // إزالة علامات التنصيص
    .replace(/^[\[\]\(\)]|[\[\]\(\)]$/g, '') // إزالة الأقواس
    .replace(/\.\.\.$/g, '') // إزالة "..." من النهاية
    .replace(/\s+/g, ' ')    // استبدال المسافات المتعددة
    .replace(/^\d+\.\s*/, '') // إزالة الأرقام من البداية
    .trim();
  
  console.log(`🧹 After initial clean: "${cleaned}" (${cleaned.length} chars)`);
  
  // التحقق من الطول وتحسينه
  if (cleaned.length > 40) {
    // محاولة ذكية للتقصير دون استخدام "..."
    cleaned = smartTruncate(cleaned, 40);
    console.log(`✂️ Smart truncated: "${cleaned}" (${cleaned.length} chars)`);
  }
  
  // إذا كان قصيراً جداً أو فارغاً
  if (cleaned.length < 3) {
    
  }
  
  // تأكد من أن الحرف الأول كبير (للعناوين الإنجليزية)
  if (/^[a-z]/.test(cleaned)) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  
  console.log(`✅ Final cleaned: "${cleaned}"`);
  return cleaned;
}

/**
 * تقصير ذكي للنص دون قطع الكلمات
 */
function smartTruncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  
  // محاولة العثور على مسافة للقطع عندها
  let truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.7) { // إذا وجدنا مسافة مناسبة
    truncated = truncated.substring(0, lastSpace);
  }
  
  // إزالة أي فواصل زائدة في النهاية
  truncated = truncated.replace(/[,\-\:;\.\s]+$/, '');
  
  return truncated;
}

/**
 * دالة بديلة لإنشاء تلخيص في حالة فشل API
 */
function generateFallbackSummary(userMessage) {
    // لخص أول رسالة من المستخدم
    let summary = userMessage
        .replace(/[<>]/g, '') // إزالة علامات HTML
        .replace(/\n/g, ' ')  // استبدال الأسطر بمسافات
        .trim();
    
    // قطع للطول المناسب
    if (summary.length > 40) {
        summary = summary.substring(0, 37) + '...';
    }
    
    // إذا كان فارغاً، استخدم عنوان افتراضي
    if (!summary || summary.length < 3) {
        return "New Conversation";
    }
    
    return summary;
}



const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // زيادة الحد لاستيعاب الملفات الكبيرة

app.use(express.static(path.join(__dirname, '..', 'client')));

let clients = [];
let conversationMemory = {};

// ==========================================
// 1. تحديث دالة broadcast لتقبل targetClientId
// ==========================================
function broadcast(data, targetClientId = null) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(c => {
    // نرسل فقط للعميل الذي يطابق الـ clientId
    // أو نرسل للجميع إذا لم يتم تحديد هدف (للتوافق، لكن يفضل دائماً التحديد)
    if (!targetClientId || c.clientId === targetClientId) {
      try { c.res.write(msg); }
      catch(e) { console.error("❌ Broadcast error:", e); }
    }
  });
}

function getNextFallback(station, currentModel) {
  const list = STATION_MAP[station];
  const index = list.indexOf(currentModel);
  return list[index + 1] || null;
}

function sendStageUpdate(clientId, userText, modelId, actionText, context) {
  const modelName = MODEL_CONFIGS[modelId]?.displayName || modelId || "AI";

  broadcast({
    type: "assistant_message",
    stage: true,
    text: `${userText}\n${modelName} ${actionText}`
  }, clientId);
}

async function classifyTaskAndThinker(userMessage, files) {
  const prompt = `
You are a task analysis AI.

Your job:
1) Classify the user intent.
2) Decide if deep reasoning is needed.
3) Select the best reasoning model.
4) If the task is FIX, identify where the problem is.

Return ONLY valid JSON in this exact format:
{
  "intent": "build | fix | improve | refactor | explain",
  "needs_reasoning": true | false,
  "reasoning_model": "MODEL_ID or null",
  "fault": {
    "type": "logic | syntax | performance | ui | unknown",
    "files": [],
    "location": "",
    "summary": ""
  }
}

Rules:
- If intent is NOT "fix", set fault = null
- Be concise.
- Do NOT solve the problem.
- Do NOT write code.

Available models: 
gemini-3-flash
gemini-2.5-pro
gemini-2.5-flash
trinity-large
chimera-r1
hermes-3
gpt-oss
solar-pro



User message:
"${userMessage}"
`;

  const genAI = new GoogleGenerativeAI(
    getSafeKeyForModel("gemma").token
  );

  const model = genAI.getGenerativeModel({
    model: "gemma-3-27b-it",
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 150
    }
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return {
      intent: "explain",
      needs_reasoning: false,
      reasoning_model: null
    };
  }

  try {
    return JSON.parse(match[0]);
  } catch {
    return {
      intent: "explain",
      needs_reasoning: false,
      reasoning_model: null
    };
  }
}

async function routeTaskMandatory(message) {
  const prompt = `
Return ONLY valid JSON.
No markdown.
No explanations.

JSON format:
{
  "is_code_related": true/false,
  "task_type": "code" | "general" | "pdf" | "pptx" | "docx"
}

User message:
"${message}"
`;

  // استخدم نموذج خفيف وسريع
  const modelId = "gemma"; // أو أي fast model
  const modelConfig = MODEL_CONFIGS[modelId];
  const keyInfo = getSafeKeyForModel(modelId);

  const genAI = new GoogleGenerativeAI(keyInfo.token);
  const model = genAI.getGenerativeModel({
    model: modelConfig.modelName,
    generationConfig: { temperature: 0 }
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  console.log("TASK RESULTS: ", text)
  try {
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found");
   return JSON.parse(match[0]);
  } catch {
    console.log("[[[ERROR in parsing tasks..]]]  task added manually")
    // fallback ذكي
    return {
      is_code_related: true,
      task_type: "code"
    };
  }
}

async function internalReasoning(taskInfo, message, files, executionContext) {
  
  const filesContext = files?.length
  ? files.map(f => `FILE: ${f.name}\n${f.content}`).join("\n\n")
  : "";

  const prompt = `
You are a senior software architect and developer.

Your task is to:
1. Analyze the user's request DEEPLY
2. Plan a COMPLETE implementation
3. Suggest SMART additional features
4. Write clear execution instructions

Return ONLY valid JSON.
Do NOT add explanations.
Do NOT add markdown.
Do NOT add bullet points.
Do NOT add newlines.

All values MUST be single-line strings.

JSON format (exact):
{
  "internal_analysis": "DETAILED TECHNICAL PLAN for executor",
  "user_explanation": "problem=... | cause=... | solution=... | result=... | features=..."
}



IMPORTANT - For BUILD tasks:
- Plan COMPLETE implementation, not just template
- Suggest 2-3 additional features the user might like
- Specify exactly what files to create
- Include game mechanics, scoring, levels if relevant
- Make it feel like a finished product, not a starter

Task intent: ${taskInfo.intent}
User message: "${message}"

${filesContext}
`;
  const modelId = taskInfo.reasoning_model;
  const modelConfig = MODEL_CONFIGS[modelId];

  if (!modelConfig) {
    throw new Error(`Reasoning model not found: ${modelId}`);
  }

  const keyInfo = getSafeKeyForModel(modelId);
  if (!keyInfo) {
    throw new Error("No available key for reasoning model");
  }

  let text = "";

  // 🔹 Google
  if (modelConfig.provider === "google") {
    const genAI = new GoogleGenerativeAI(keyInfo.token);
    const model = genAI.getGenerativeModel({
      model: modelConfig.modelName,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1000000
      }
    });

    const result = await model.generateContent(prompt);
    text = result.response.text().trim(); 
    
    
    
    // ✅ لا تحول \n إلى \\n هنا! هذا يسبب المشكلة
    // فقط تأكد من وجود JSON صحيح
    console.log("📦 response preview:", text);
  }

  // 🔹 OpenRouter
  if (modelConfig.provider === "openrouter") {
    const messages = [
      { role: "system", content: "You are a senior software architect." },
      { role: "user", content: prompt }
    ];

    const result = await callOpenRouterAPI(keyInfo, messages);
    text = result.trim();
    console.log("📦 Raw OpenRouter response length:", text.length);
        console.log("📦 Response preview:", text);
        text = text
      .replace(/```json\s*/g, '')  // إزالة ```json
      .replace(/```\s*$/g, '')      // إزالة ``` في النهاية
      .trim();
    
    // ✅ لا تحول \n إلى \\n هنا! هذا يسبب المشكلة
    // فقط تأكد من وجود JSON صحيح
console.log("📦 Cleaned preview:", text);
   /* if (text?.trim().startsWith('<')) {
      console.error("🔥 HTML RESPONSE DETECTED");
      throw new Error("HTML_FALLBACK_DETECTED");
    } */
  } 

  if (!text) {
    throw new Error("Reasoning model returned empty response");
  }

  // 🔧 FIXED: Better JSON extraction and parsing
  const cleaned = text
    .replace(/```json\s*/g, "")
    .replace(/```\s*$/g, "")
    .trim();

  // Try to find JSON object in the response
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    console.log("⚠️ No JSON found in reasoning response, creating fallback structure");
    console.log("Raw text:", text.substring(0, 200) + "...");
    
    return {
  internal_analysis: "Direct execution without detailed reasoning.",
  user_explanation: generateFallbackExplanation(taskInfo, message)  // ✅ نص وليس كائن
};
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    
    if (executionContext && !executionContext.usedModels.includes(modelConfig.displayName)) {
      executionContext.usedModels.push(modelConfig.displayName);
    }
    // Validate and ensure structure
    return {
  internal_analysis: parsed.internal_analysis || "No analysis provided",
  user_explanation: parsed.user_explanation || generateFallbackExplanation(taskInfo, message)
};
  } catch (err) {
    console.error("❌ Failed to parse reasoning JSON:", err.message);
    console.log("JSON string attempted:", jsonMatch[0].substring(0, 200) + "...");
    
    try {
    // محاولة 2: إصلاح الـ newlines داخل الـ string
    const fixed = jsonMatch[0]
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    
    const parsed = JSON.parse(fixed);
    return {
      internal_analysis: parsed.internal_analysis || "",
      user_explanation: parsed.user_explanation || generateFallbackExplanation(taskInfo, message)
    };
  } catch (err2) {
    console.error("❌ All JSON parsing attempts failed");
    
    // محاولة 3: استخراج النص يدوياً (آخر أمل)
    const extracted = extractTextFromBrokenJSON(jsonMatch[0]);
    return {
      internal_analysis: extracted.analysis || "Failed to parse reasoning response",
      user_explanation: extracted.explanation || generateFallbackExplanation(taskInfo, message)
    };
  }
    
    
  }
}

function formatUserExplanation(text) {
  if (!text || typeof text !== "string") return "";

  const parts = text.split("|").map(p => p.trim());

  return parts
    .map(p => {
      const [key, ...rest] = p.split("=");
      if (!rest.length) return null;
      return `• ${key.trim()}: ${rest.join("=").trim()}`;
    })
    .filter(Boolean)
    .join("\n");
}


function isAutoMode(modelId) {
    return modelId === "auto" 
        || modelId === "codeai-code-r";
}

async function buildPDF(content) {
  const text = typeof content === "string" ? content : (content.text || "");
  const isArabic = /[\u0600-\u06FF]/.test(text);
  const fontPath = isArabic ? await ensureArabicFont() : null;


  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    if (fontPath) doc.font(fontPath);
    const lines = text.split("\n");
    lines.forEach(line => {
      if (line.trim() === "") {
        doc.moveDown(0.5);
      } else {
        doc.fontSize(13).text(line, { 
          align: isArabic ? "right" : "left",
          features: isArabic ? ["rtla"] : []
        });
      }
});
    doc.end();
  });
}

async function buildPDFPreviews(pdfBufferOrPath, outputDir) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const pdfBuffer = Buffer.isBuffer(pdfBufferOrPath) 
    ? pdfBufferOrPath 
    : fs.readFileSync(pdfBufferOrPath);
  const doc = await pdf(pdfBuffer, { scale: 1.5 });
  let pageNum = 1;
  for await (const image of doc) {
    fs.writeFileSync(path.join(outputDir, `page_${pageNum}.png`), image);
    pageNum++;
  }
}

async function buildDOCX(content) {
  const doc = new Document({
    sections: [{
      children: content.paragraphs.map(p => new Paragraph(p))
    }]
  });

  return await Packer.toBuffer(doc);
}

async function buildPPTX(content) {
  const pptx = new PptxGenJS();

  content.slides.forEach(slide => {
    const s = pptx.addSlide();
    s.addText(slide.text, { x:1, y:1, fontSize:24 });
  });

  return await pptx.write("nodebuffer");
}

async function handleDocumentGeneration({
  json,
  clientId,
  convId,
  userId,
  message,
  userMessage
}) {
  
broadcast({
  type: "assistant_message",
  text: userMessage || "✅ تم إنشاء الملف بنجاح."
}, clientId);

  console.log("📄 ===== DOCUMENT GENERATION START =====");
  console.log("ConvID:", convId);
  console.log("ClientID:", clientId);
  console.log("Incoming JSON:", JSON.stringify(json, null, 2));

  const { document_type, file_name, content } = json;

  const finalContent = content?.text || content;

  console.log("📌 Document type:", document_type);
  console.log("📌 File name from model:", file_name);
  console.log("📌 Content length:", finalContent?.length);

  let filePath = "";
  let fileBuffer;

  try {

    if (document_type === "pdf") {
  console.log("🛠 Building PDF...");
  fileBuffer = await buildPDF({ text: finalContent });
  console.log("✅ PDF buffer created");
  console.log("Buffer size:", fileBuffer?.length);
  const safeName = (file_name || "document").replace(/\.pdf$/i, "");
  filePath = `/generated/${safeName}.pdf`;
  console.log("📂 Final PDF path:", filePath);
    }

    if (document_type === "pptx") {

      console.log("🛠 Building PPTX...");

      fileBuffer = await buildPPTX(finalContent);

      console.log("✅ PPTX buffer created");
      console.log("Buffer size:", fileBuffer?.length);

      const safeName = (file_name || "presentation").replace(/\.pptx$/i, "");

      filePath = `/generated/${safeName}.pptx`;

      console.log("📂 Final PPTX path:", filePath);
    }

    if (document_type === "docx") {

      console.log("🛠 Building DOCX...");

      fileBuffer = await buildDOCX(finalContent);

      console.log("✅ DOCX buffer created");
      console.log("Buffer size:", fileBuffer?.length);

      const safeName = (file_name || "document").replace(/\.docx$/i, "");

      filePath = `/generated/${safeName}.docx`;

      console.log("📂 Final DOCX path:", filePath);
    }

    const safeName = path.basename(filePath, `.${document_type}`);

// 1. رفع الملف على Supabase Storage
console.log("☁️ Uploading file to Supabase Storage...");
const fileExt = path.extname(filePath);
const storageFileName = `file_${Date.now()}${fileExt}`;
const storagePath = `${userId}/${convId}/${storageFileName}`;
const { error: uploadError } = await supabase.storage
  .from('documents')
  .upload(storagePath, fileBuffer, {
    contentType: document_type === 'pdf' ? 'application/pdf' :
                 document_type === 'pptx' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' :
                 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: true
  });

if (uploadError) {
  console.error("❌ Storage upload error:", uploadError.message);
} else {
  console.log("✅ File uploaded to Supabase Storage");
}

// 2. احصل على الـ URL الدائم
const { data: { publicUrl } } = supabase.storage
  .from('documents')
  .getPublicUrl(storagePath);

console.log("🔗 Public URL:", publicUrl);

// 3. معاينة PNG للـ PDF
let previewUrls = [];
if (document_type === "pdf") {
  console.log("🖼 Building previews...");
  try {
    const tmpDir = path.join('/tmp', safeName + "_preview");
    await buildPDFPreviews(fileBuffer, tmpDir);

    const previewFiles = fs.readdirSync(tmpDir).sort();
    for (const previewFile of previewFiles) {
      const previewBuffer = fs.readFileSync(path.join(tmpDir, previewFile));
      const previewStoragePath = `${userId}/${convId}/preview_${Date.now()}/${previewFile}`;
      await supabase.storage
        .from('documents')
        .upload(previewStoragePath, previewBuffer, { contentType: 'image/png', upsert: true });
      const { data: { publicUrl: previewUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(previewStoragePath);
      previewUrls.push(previewUrl);
    }
    console.log("✅ Previews uploaded:", previewUrls.length, "pages");
  } catch (previewErr) {
    console.error("❌ Preview error:", previewErr.message);
  }
}

// 4. broadcast للواجهة
broadcast({
  type: "file_created",
  file: {
    name: path.basename(filePath),
    url: publicUrl,
    kind: document_type,
    type: document_type,
    previewable: true,
    hidePreviewButton: true,
    previewUrls: previewUrls,
    previewUrl: previewUrls.length > 0 ? previewUrls[0] : null
  },
  convId
}, clientId);

console.log("✅ File broadcast completed");

await saveToSupabase(userId, convId, message || null, userMessage || "📄 Document created", [{
  name: path.basename(filePath),
  url: publicUrl,
  previewUrl: previewUrls.length > 0 ? JSON.stringify(previewUrls) : null,
  type: document_type
}]);

  } catch (err) {

    console.error("❌ DOCUMENT GENERATION ERROR");
    console.error(err);

  }

  console.log("📄 ===== DOCUMENT GENERATION END =====");
}

async function executeWithFallback({
  station,
  prompt,
  userParts,
  systemPrompt,
  clientId,
  executionContext,
  onChunk,
  onComplete
}) {
  const models = STATION_FALLBACKS[station];
  if (!models || !models.length) {
    throw new Error(`NO_MODELS_FOR_STATION:${station}`);
  }

  const tried = new Set();

  for (const modelId of models) {
    if (tried.has(modelId)) continue;
    tried.add(modelId);

    const modelConfig = MODEL_CONFIGS[modelId];
    if (!modelConfig) continue;

    const keyInfo = getSafeKeyForModel(modelId);
    if (!keyInfo) continue;

    if (!isProviderAvailable(modelConfig.provider)) continue;

    try {
      

      await sendResponseUnified({
        model:
          modelConfig.provider === "google"
            ? new GoogleGenerativeAI(keyInfo.token).getGenerativeModel({
                model: modelConfig.modelName,
                generationConfig: {
                  maxOutputTokens: modelConfig.maxTokens,
                  temperature: modelConfig.temperature
                }
              })
            : null,
        provider: modelConfig.provider,
        keyInfo,
        prompt,
        userParts,
        systemPrompt,
        supportsStreaming: modelConfig.supportsStreaming,
        onChunk,
        onComplete,
        maxRetries: 0
      });
      
      if (executionContext && !executionContext.usedModels.includes(modelConfig.displayName)) {
        executionContext.usedModels.push(modelConfig.displayName);
        sendStageUpdate(
        clientId,
        "Processing request",
        modelId,
        "is running",
        executionContext
      );
      }
      
      return; // ✅ نجاح = خروج نهائي

    } catch (err) {
      console.warn(`❌ ${modelId} failed: ${err.message}`);

      // ⛔ حظر المزود عند 429
      if (err.message === 'RATE_LIMITED') {
        markProviderRateLimited(modelConfig.provider);
      }

      // ⬇️ نكمل مباشرة للنموذج التالي
      continue;
    }
  }

  throw new Error("ALL_FALLBACK_MODELS_FAILED");
}

app.post('/api/chat', upload.any(), async (req, res) => {
console.log("[[DEBUG]]:", req.body)
  // 1. نستقبل مصفوفة الملفات بدلاً من كود واحد
const message   = req.body.message   || '';
const convId    = req.body.convId    || '';
const clientId  = req.body.clientId  || '';
const userId    = req.body.userId    || null;

let files    = [];
let history  = [];
let settings = {};

try { files    = JSON.parse(req.body.files    || '[]'); } catch {}
try { history  = JSON.parse(req.body.history  || '[]'); } catch {}
try { settings = JSON.parse(req.body.settings || '{}'); } catch {}
// 🔹 Vision attachments (images from UI)
let visionImages = [];

if (req.files && Array.isArray(req.files)) {
  visionImages = req.files.filter(f =>
    f.mimetype && f.mimetype.startsWith("image/")
  );
}
const requestedModel = settings?.selectedModel || 'gemini-3-flash';
const isAutoPro = requestedModel === "codeai-code-r";
const routeResult = await routeTaskMandatory(message);
let finalModel = requestedModel;
let taskInfo = null;
const executionModels = {
  reasoning: null,
  executor: null,
  fallbacks: []
};
const executionContext = {
  usedModels: []
};
const modelConfig =
  MODEL_CONFIGS[finalModel] || MODEL_CONFIGS['gemini-3-flash'];


let executionMode = "CODE";

if (!routeResult.is_code_related) {
  executionMode = "GENERAL";
}

if (["pdf", "pptx", "docx"].includes(routeResult.task_type)) {
  executionMode = "DOCUMENT";
}


if (requestedModel === "auto") {
  const route = await routeModel(message);
  finalModel = route.recommended_model;
  console.log("Final model selected :", finalModel)
};



if (requestedModel === "codeai-code-r") {
  taskInfo = await classifyTaskAndThinker(message, files);
  sendStageUpdate(
  clientId,
  "Analyzing your request..",
  "gemini-3-flash",
  "is analyzing..",
  executionContext
);

if (isAutoPro) {


  if (taskInfo.intent === "explain") {
    taskInfo.intent = "build";
  }


  taskInfo.needs_reasoning = true;

  // 3️⃣ ضمان وجود نموذج تفكير
  if (!taskInfo.reasoning_model) {
    taskInfo.reasoning_model = "trinity-large";
  }
}

  console.log("🧠 code-R analysis:", taskInfo);
}
let reasoningData = null;
let reasoningSummary = null;
let userExplanation = null;
let combinedModelName = null;

if (taskInfo?.needs_reasoning) {
  sendStageUpdate(
    clientId,
    "Identifying the problem..",
    taskInfo.reasoning_model,
    "is thinking..",
    executionContext
  );
}

// 🔸 المحاولة الأساسية
if (taskInfo && taskInfo.needs_reasoning) {
  try {
    sendStageUpdate(
      clientId,
      "Identifying the problem..",
      taskInfo.reasoning_model,
      "is thinking..",
      executionContext
    );

if (executionMode === "CODE") {
  reasoningData = await internalReasoning(taskInfo, message, files);
}
    
    
    if (reasoningData) {
      reasoningSummary = reasoningData.internal_analysis;
      userExplanation = reasoningData.user_explanation;
      const displayExplanation =
  formatUserExplanation(userExplanation);
  
      broadcast({
        type: 'thought_process',
        text: displayExplanation || "No analysis details provided."
      }, clientId);
    }

  } catch (err) {
    console.warn("⚠️ Reasoning failed:", err.message);
  }
}

// 🔸 Fallback تلقائي
if (taskInfo && !reasoningData && taskInfo.needs_reasoning) {
  console.log("🔁 Reasoning fallback → Gemini Flash");

  

  try {
    sendStageUpdate(
      clientId,
      "Identifying the problem..",
      taskInfo.reasoning_model,
      "is thinking..",
      executionContext
    );

    let currentModel = taskInfo ? taskInfo.reasoning_model : null;

reasoningData = await executeWithFallback({
  station: "B",
  prompt: message,
  userParts: message,
  clientId,
  executionContext,
  onChunk: () => {},
  onComplete: (full) => full
});
} catch (error) {
  /* handle error */
  }


// 🔸 ضمان عدم توقف البرنامج
if (!reasoningData) {
  reasoningData = {
    internal_analysis: "",
    user_explanation: {
      problem: "",
      cause: "",
      solution: "Proceeding directly with execution.",
      result: ""
    }
  };
}
  

const reasoningModelName = (taskInfo && taskInfo.reasoning_model) 
    ? MODEL_CONFIGS[taskInfo.reasoning_model]?.displayName || "Trinity large"
    : "Trinity large";
 combinedModelName = `${reasoningModelName} + ${modelConfig.displayName}`;

  

  if (reasoningData) {
    reasoningSummary = reasoningData.internal_analysis;
    userExplanation = reasoningData.user_explanation;

    // >>>> إضافة: إرسال التحليل المختصر فوراً للعميل <<<<
    broadcast({
        type: 'thought_process',
        text: reasoningSummary || "No analysis details provided."
    }, clientId);
  }
}
 


let finalKeyInfo = null;

if (!isAutoMode(finalModel)) {
    finalKeyInfo = getSafeKeyForModel(finalModel);
}
let usedModelName = modelConfig.displayName;
let provider = modelConfig.provider;
  
  
if (requestedModel === "auto" || requestedModel === "codeai-code-r") {
    const routingResult = await routeModel(message, files);

    finalModel = routingResult.recommended_model; // مثل qwen-coder
    console.log("reasoning model:", finalModel)
    const candidateProvider = MODEL_CONFIGS[finalModel].provider;

if (!isProviderAvailable(candidateProvider)) {
  throw new Error(`PROVIDER_BLOCKED:${candidateProvider}`);
}

provider = candidateProvider;

    finalKeyInfo = getSafeKeyForModel(finalModel);
}

    console.log(`🎯 Requested model: ${modelConfig.displayName} (Provider: ${modelConfig.provider})`);
console.log(`🔑 Using Key: ${finalKeyInfo} for ${provider}`);
    
const optimizedHistory = history.map((msg, index) => {
    if (index >= history.length - 2) {
        return { ...msg, files: [] }; // إفراغ مصفوفة الملفات لآخر رسالتين
    }
    
    return msg;
});
console.log("optimizedHistory:", optimizedHistory)



if (!conversationMemory[convId]) {
    conversationMemory[convId] = {
        summary: "",
        history: [], // هذا سيخزن النص الكامل لكل رد (ليس chunks)
        messageCount: 0 // 👈 إضافة عداد للرسائل
    };
}

const activeKeyInfo = getSafeKey();
    
      // منطق الـ Fallback (إذا فشل النموذج المختار نعود لـ Gemini Flash)
  if (!finalKeyInfo) {
      console.log(`⚠️ Primary model keys exhausted. Switching to Fallback...`);
      finalKeyInfo = getSafeKey('gemini'); 
      
      if (!finalKeyInfo) {
          broadcast({ type: 'assistant_message', text: '⚠️ السيرفر مشغول جداً.' }, clientId);
          return res.json({ status: 'limit-reached' });
      }
       // تحديد الاسم يدوياً للـ Fallback
      usedModelName = "Gemini 3 Flash (Auto)"; 
      provider = 'google';
      
      // إعداد config وهمي للـ fallback
      finalKeyInfo.modelConfig = {
          modelName: 'gemini-2.5-flash', // أو المتاح لديك
          maxTokens: 100000,
          temperature: 0.2,
          supportsStreaming: true
      };
  } else {
      // إذا نجحنا، نستخدم الاسم الرسمي
      usedModelName = finalKeyInfo.modelConfig.displayName;
  }


console.log(`🎯 ===== REQUEST STARTED =====`);
console.log(`📌 Conversation ID: ${convId}`);
console.log(`🔑 Using Key: ${activeKeyInfo.id}`);

console.log(`📝 User message: ${message.substring(0, 100)}...`);

let fullPrompt;
let systemPrompt;

  try {
    let model;
       if (provider === 'google') {
       // إعداد Gemini
       const genAI = new GoogleGenerativeAI(finalKeyInfo.token);
       model = genAI.getGenerativeModel({ 
           model: finalKeyInfo.modelConfig.modelName,
           generationConfig: { 
               maxOutputTokens: finalKeyInfo.modelConfig.maxTokens,
               temperature: finalKeyInfo.modelConfig.temperature
           }
       });
    }

    // إرسال رسالة فارغة لبدء الـ Stream للمستخدم المحدد فقط
   // broadcast({ type: 'assistant_message', text: ' ' }, clientId);
    
    

const estimatedRequestTokens = estimateTokens(message + JSON.stringify(files || ""));

    // تحديث العدادات (بشكل مؤقت قبل الطلب)
        usageStats[activeKeyInfo.id].gemini.rpm += 1;
usageStats[activeKeyInfo.id].gemini.rpd += 1;
usageStats[activeKeyInfo.id].gemini.tpm += estimatedRequestTokens;

    

    // 1. تحديد النمط البصري بناءً على الثيم (Dark/Light)
    


const built = buildSystemPrompt({
  routeResult,
  settings,
  taskInfo,
  reasoningSummary,
  visionImages,
  files,
  history,
  message
});

 systemPrompt = built?.systemPrompt ?? built;
 fullPrompt = built?.userParts ?? built?.userPrompt ?? built;
/*console.log("==================== FULL PROMPT SENT ====================");
    console.log(fullPrompt);
    console.log("====================================================================");*/
console.log('DEBUG executionContext type:', typeof executionContext, 'value:', executionContext);
sendStageUpdate(
  clientId,
  "Applying changes..",
  finalModel,
  "is applying changes..",
  executionContext
);

// بعدها يبدأ sendResponseUnified + stream

    
let usedModels = [];
    
try {
  if (!isAutoMode(requestedModel)) {
  // النموذج محدد يدوياً - استخدمه مباشرة بدون fallback
  await sendResponseUnified({
    model: provider === 'google' ? new GoogleGenerativeAI(finalKeyInfo.token).getGenerativeModel({
      model: finalKeyInfo.modelConfig.modelName,
      generationConfig: { maxOutputTokens: finalKeyInfo.modelConfig.maxTokens, temperature: finalKeyInfo.modelConfig.temperature }
    }) : null,
    provider,
    keyInfo: { ...finalKeyInfo, clientId, convId, userId, message },
    prompt: fullPrompt,
    userParts: fullPrompt,
    systemPrompt,
    supportsStreaming: finalKeyInfo.modelConfig.supportsStreaming,
    onChunk: (text) => { broadcast({ type: "assistant_message", text }, Array.isArray(clientId) ? clientId[0] : clientId); },
    onComplete: (full) => {
      broadcast({ type: "session_info", modelName: modelConfig.displayName, convId }, clientId);
      broadcast({ type: "stream_complete" }, clientId);
      setImmediate(() => saveToSupabase(userId, convId, message, full));
    },
    maxRetries: 1
  });
} else {
  await executeWithFallback({
    station: (taskInfo && taskInfo.needs_reasoning) ? "C" : "A",
    prompt: fullPrompt,
    userParts: fullPrompt,
    systemPrompt,
    clientId,
    executionContext,
    onChunk: (text) => { broadcast({ type: "assistant_message", text }, Array.isArray(clientId) ? clientId[0] : clientId); },
    onComplete: (full) => {
      broadcast({ type: "session_info", modelName: executionContext.usedModels.join(" + "), convId }, clientId);
      broadcast({ type: "stream_complete" }, clientId);
      setImmediate(() => saveToSupabase(userId, convId, message, full));
    }
  });
}
} catch (error) {
  console.error("❌ All attempts failed including retries:", error.message);
  
  // حتى بعد كل المحاولات فشلت، حاول استخدام نموذج بديل بسيط
  try {
    const simpleModel = getSafeKey('gemini');
    if (simpleModel) {
      console.log("🆘 Using emergency simple model...");
      
      const genAI = new GoogleGenerativeAI(simpleModel.token);
      const emergencyModel = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
        generationConfig: { 
          maxOutputTokens: 50000,
          temperature: 0.2
        }
      });
      
      const result = await emergencyModel.generateContent(fullPrompt);
      const text = result.response.text();
      
      if (text) {
        broadcast({ type: "assistant_message", text }, clientId);
        broadcast({ 
          type: 'session_info', 
          modelName: "Gemini 3 Flash (Emergency)",
          convId: convId
        }, clientId);
        broadcast({ type: "stream_complete" }, clientId);
      }
    }
  } catch (finalError) {
    console.error("❌ Even emergency model failed:", finalError.message);
    // لا ترسل أي شيء - توقف صامتاً
  }
}


// بعد اكتمال الـ stream
if (visionImages.length > 0) {
  visionImages.forEach(img => {
    try {
      fs.unlinkSync(img.path);
    } catch {}
  });
}

    console.log(`✅ [SUCCESS] Response completed for ConvID: ${convId}`);
    
      
      console.log(`✅ ===== REQUEST COMPLETED =====`);
console.log(`📊 Final Gemini usage for ${activeKeyInfo.id}: RPM=${usageStats[activeKeyInfo.id].gemini.rpm}, TPM=${usageStats[activeKeyInfo.id].gemini.tpm}`);



    broadcast({ type: "assistant_message", text: "\n[STREAM COMPLETE]" }, clientId);
    
    
    console.log(`\n🔍 Checking for auto-summary...`);
    const conversation = conversationMemory[convId];
    const isFirstAIResponse = conversation && conversation.messageCount === 0;

console.log(`   Is first AI response: ${isFirstAIResponse}`);
console.log(`   History length: ${conversation?.history?.length || 0}`);
if (isFirstAIResponse) {
    console.log(`🚀 Starting Gemma summarization process...`);
}
     // --- التلخيص التلقائي للمحادثات الجديدة ---
    
    if (conversation && conversation.history && conversation.history.length === 1) {
        // هذا هو الرد الأول في محادثة جديدة
        // نجمع النص الكامل من الرد
        const fullAIResponse = conversation.history.join('');
        console.log(`📤 Sending to Gemma summarizer...`);
        console.log(`   AI Response preview: ${fullAIResponse.substring(0, 100)}...`);
        // ننتظر قليلاً ثم نرسل للتلخيص (غير متزامن)
        setTimeout(async () => {
            try {
                const summary = await summarizeConversationWithGemma(convId, message, fullAIResponse);
                
                if (summary) {
                  console.log(`📨 Broadcasting summary to clients...`);
                    // إرسال التلخيص للعميل لتحديث عنوان المحادثة
                    broadcast({ 
                        type: "conversation_summary", 
                        convId: convId,
                        summary: summary
                    });
                    console.log(`✅ Summary broadcast complete`);
                }
            } catch (error) {
                console.error("Auto-summary process failed:", error);
            }
        }, 1000); // انتظار 1 ثانية للتأكد من اكتمال الرد
    }
    res.json({ status: "ok" });
if (conversationMemory[convId].history.length > 20) { // زدن الحد قليلاً
        // نقوم بالتلخيص في الخلفية دون انتظار
        

    }

  
  // تحقق من القيم بعد التحديث
console.log(`🔍 Post-request check for ${activeKeyInfo.id}:`);
console.log(`   Gemini RPM: ${usageStats[activeKeyInfo.id].gemini.rpm}`);
console.log(`   Gemini TPM: ${usageStats[activeKeyInfo.id].gemini.tpm}`);
console.log(`   Gemma RPM: ${usageStats[activeKeyInfo.id].gemma.rpm}`);
console.log(`   Gemma TPM: ${usageStats[activeKeyInfo.id].gemma.tpm}`);
// زيادة عداد الرسائل بعد اكتمال الرد
if (conversationMemory[convId]) {
    conversationMemory[convId].messageCount = (conversationMemory[convId].messageCount || 0) + 1;
}

  

  } catch (err) {
    console.error(`❌ ===== REQUEST FAILED =====`);
    console.error(`🔧 Error details:`, err.message);
    console.error(`🔧 Stack:`, err.stack?.substring(0, 300));
    console.error("❌ Generation Error:", err);
    
    
    
    // تصحيح تحديث الاستخدام
    if (activeKeyInfo) {
        usageStats[activeKeyInfo.id].gemini.rpm = Math.max(0, (usageStats[activeKeyInfo.id].gemini.rpm || 0) - 1);
    }
    
    console.error("API Error:", err);
    
    
  }
});

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();
const clientId = req.query.clientId || Date.now().toString();
  const id = Date.now();
  
    // نحفظ العميل مع الـ clientId الخاص به
  clients = clients.filter(c => c.clientId !== clientId);
const newClient = { id: clientId, clientId: clientId, res };
clients.push(newClient);
  console.log(`🔌 Client connected: ${clientId}`);
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    clients = clients.filter(c => c.id !== clientId);
    console.log(`🔌 Client disconnected: ${clientId}`);
  });
});


app.post('/api/stt', upload.single('audio'), async (req, res) => {
  console.log("🎤 ===== STT REQUEST RECEIVED =====");

  if (!req.file) {
    return res.status(400).json({ error: 'NO_AUDIO_FILE' });
  }

  try {
    const mimeToExt = {
  'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/aac': 'm4a',
  'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mpeg': 'mp3',
  'audio/x-m4a': 'm4a',
};
const ext = mimeToExt[req.file.mimetype] || req.file.originalname?.split('.').pop() || 'webm';
const renamedPath = `${req.file.path}.${ext}`;
fs.renameSync(req.file.path, renamedPath);

const transcription = await groqa.audio.transcriptions.create({
  file: fs.createReadStream(renamedPath),
  model: "whisper-large-v3-turbo",
});

fs.unlinkSync(renamedPath);

    res.json({ text: transcription.text || '' });

  } catch (err) {
    console.error("❌ GROQ STT ERROR:", err);
    res.status(500).json({ error: 'STT_FAILED' });
  }
});


// ============= دالة مساعدة لتوليد شرح احتياطي =============
function generateFallbackExplanation(taskInfo, message) {
  const intent = taskInfo?.intent || "build";
  
  if (intent === "build") {
    return `• problem: You want to create a new ${message.includes('لعبة') ? 'game' : 'project'}
• cause: You're building something interactive and fun
• solution: I'll create a complete, polished implementation
• result: A fully functional product ready to use
• features: Core functionality, clean UI, smooth animations`;
  }
  
  if (intent === "fix") {
    return `• problem: There's an issue with your code
• cause: A bug or unexpected behavior
• solution: I'll fix the problem and optimize the code
• result: Your application will work correctly`;
  }
  
  return `• problem: Processing your request
• cause: Direct execution
• solution: Implementing changes
• result: Completed successfully`;
}

function extractTextFromBrokenJSON(str) {
  // استخراج internal_analysis
  const analysisMatch = str.match(/"internal_analysis"\s*:\s*"([^"]+)"/);
  const analysis = analysisMatch ? analysisMatch[1] : "Failed to parse reasoning response";
  
  // استخراج user_explanation  
  const explanationMatch = str.match(/"user_explanation"\s*:\s*"([^"]+)"/);
  const explanation = explanationMatch ? explanationMatch[1].replace(/\\n/g, '\n') : generateFallbackExplanation(taskInfo, message);
  
  return {
    analysis,
    explanation
  };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

