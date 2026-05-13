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
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType
} from "docx";
import PptxGenJS from "pptxgenjs";
import { createClient } from "@supabase/supabase-js";
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import officeParser from 'officeparser';
import { exec } from 'child_process';
import util from 'util';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import { spawn } from 'child_process';

// دالة وسيطة لاستخراج userId من رأس Authorization


// استخدام middleware لجميع المسارات التي تحتاج حماية


const execPromise = util.promisify(exec);

const supabase = createClient(
  process.env.S_URL,
  process.env.S_KEY
);

// في الأعلى بعد const supabase = createClient(process.env.S_URL, process.env.S_KEY)
// تأكد من أن S_KEY هو service_role key (ليس anon).
// إذا لم يكن، قم بإنشاء supabase إضافي للـ service_role.
const supabaseAdmin = createClient(process.env.S_URL, process.env.S_SERVICE_KEY);

// ---- // SAVING // ---- //

async function authenticateUser(req, res, next) {
    // ✅ سجل بداية المصادقة
    console.log('\n' + '-'.repeat(60));
    console.log('🔐 [AUTH-A] ===== AUTHENTICATION START =====');
    console.log('🔐 [AUTH-A] Path:', req.path);
    console.log('🔐 [AUTH-A] Method:', req.method);
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('🔐 [AUTH-A] No Bearer token found');
        const fallbackUserId = req.query.userId || req.body.userId;
        console.log('🔐 [AUTH-A] Fallback userId:', fallbackUserId);
        
        if (fallbackUserId) {
            console.log('🔐 [AUTH-A] Using fallback userId');
            req.userId = fallbackUserId;
            return next();
        }
        
        console.log('🔐 [AUTH-A] No userId available - proceeding without auth');
        req.userId = null;
        return next();
    }
    
    const token = authHeader.split(' ')[1];
    console.log('🔐 [AUTH-A] Token found, verifying with Supabase...');
    
    try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        
        if (error) {
            console.log('❌ [AUTH-A] Token verification failed:', error.message);
            throw error;
        }
        
        console.log('✅ [AUTH-A] Token verified. User ID:', user.id);
        console.log('✅ [AUTH-A] User email:', user.email);
        req.userId = user.id;
        next();
        
    } catch (err) {
        console.error('❌ [AUTH-A] Auth error:', err.message);
        req.userId = null;
        next();
    }
    
    console.log('-'.repeat(60) + '\n');
}



async function ensureUser(userId, settings = {}) {
  const { data } = await supabase
    .from('users')
    .select('id, settings')
    .eq('id', userId)
    .single();

  if (!data) {
    // مستخدم جديد - أنشئ مع الإعدادات
    await supabase.from('users').insert({ 
      id: userId,
      settings: settings || {}
    });
  } else if (settings && Object.keys(settings).length > 0) {
    // تحديث الإعدادات إذا تغيرت (اختياري)
    await supabase
      .from('users')
      .update({ settings: { ...data.settings, ...settings } })
      .eq('id', userId);
  }
}

async function saveToSupabase(userId, convId, message, aiResponse, files = [], modelName = null, thoughtText = null, tasks = null, filesSnapshot = null) {
  try {
    if (!userId) return;
    
    console.log("💾 saveToSupabase called:", { 
      userId, 
      convId, 
      message: message?.slice(0,30), 
      aiResponse: aiResponse?.slice(0,30),
      modelName,
      hasThought: !!thoughtText,
      hasTasks: !!tasks,
      hasSnapshot: !!filesSnapshot
    });
    
    await ensureUser(userId);

    const { data: convData } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', convId)
      .single();

    if (!convData) {
      await supabase.from('conversations').insert({
        id: convId,
        user_id: userId,
        title: message ? message.slice(0, 50) : 'Document',
        updated_at: new Date().toISOString()
      });
    } else {
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', convId);
    }

    // حفظ رسالة المستخدم
    await supabase.from('messages').insert({
      conv_id: convId,
      role: 'user',
      content: message,
      created_at: new Date().toISOString()
    });

    // حفظ رد الذكاء الاصطناعي
    if (aiResponse && aiResponse.trim().length > 0) {
       const plainContent = extractPlainTextFromResponse(aiResponse);
      await supabase.from('messages').insert({
        conv_id: convId,
        role: 'ai',
        content: plainContent,
        model: modelName,
        thought: thoughtText,
        tasks: tasks,
        files_snapshot: filesSnapshot,  // ✅ إضافة لقطة الملفات
        created_at: new Date(Date.now() + 1).toISOString()  // ✅ 
      });
    }

    // حفظ الملفات...
    for (const file of files) {
      await supabase.from('files').insert({
        conv_id: convId,
        name: file.name,
        content: file.content || null,
        url: file.url || null,
        preview_url: file.previewUrl || null,
        preview_urls: file.previewUrls || null,
        type: file.type || file.kind || null,
        created_at: new Date().toISOString()
      });
    }

  } catch (err) {
    console.error("❌ Supabase save error:", err.message);
  }
}


// دالة مساعدة لتحديد MIME type
function getMimeType(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const mimeTypes = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'txt': 'text/plain',
    'py': 'text/x-python',
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon'
  };
  return mimeTypes[ext] || 'application/octet-stream';
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
    'gemini-3.1-flash-lite-preview': {
        provider: 'google',
        modelName: 'gemini-3.1-flash-lite-preview',  // الاسم الدقيق في Google AI Studio
        displayName: 'Gemini 3.1 Flash Lite',
        maxTokens: 1000000,
        temperature: 0.2,
        supportsStreaming: true,
        features: ['fast', 'lightweight', 'preview']
    },
    'gemini-3.1-pro-preview': {
        provider: 'google',
        modelName: 'gemini-3.1-pro-preview',  // الاسم الدقيق في Google AI Studio
        displayName: 'Gemini 3.1 Pro',
        maxTokens: 2000000,  // سعة أكبر للنموذج المتقدم
        temperature: 0.2,
        supportsStreaming: true,
        features: ['advanced', 'preview', 'high-capacity']
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
     modelName: "gemma-4-31b-it",
     maxTokens: 1000000,
     temperature: 0.3,
     supportsStreaming: false,
     displayName: "Gemma 4 31B"
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


// ========== إضافة PROGRAM_CONFIGS ==========
const PROGRAM_CONFIGS = {
  'codeai-code-r': {
    displayName: 'Codeai code-R 1.1',
    baseModels: ['gemma', 'gemini-3-flash', 'gpt-oss-120b'],
    auxModel: 'gemini-3.1-flash-lite-preview',
    maxAuxModels: 6
  }
};

// ========== إضافة بعد PROGRAM_CONFIGS ==========
const DEBUG_CODE_R = true; // مفتاح التشغيل الرئيسي للـ debug

function debugLog(label, data = null) {
  if (!DEBUG_CODE_R) return;
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const divider = '═'.repeat(70);
  
  console.log(`\n${divider}`);
  console.log(`🔍 [DEBUG code‑R ${timestamp}] ${label}`);
  console.log(divider);
  
  if (data) {
    if (typeof data === 'string') {
      console.log(data);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }
  
  console.log(`${divider}\n`);
}

// ========== تعديل generateContractAndGraph ==========
async function generateContractAndGraph(message, projectStructure, files, settings = {}) {
  debugLog('🧠 THINKER STARTED', {
    message: message.substring(0, 100),
    filesCount: projectStructure.length,
    files: projectStructure.map(p => p.file),
    theme: settings.theme || 'dark'
  });

  const thinkerKeyInfo = getSafeKeyForModel('gemini-3-flash');
  if (!thinkerKeyInfo) throw new Error('No key for thinker');

  const genAI = new GoogleGenerativeAI(thinkerKeyInfo.token);
  const thinkerModel = genAI.getGenerativeModel({
    model: MODEL_CONFIGS['gemini-3-flash'].modelName,
    generationConfig: { temperature: 0.1, maxOutputTokens: 1000000 }
  });
  
  // Build visual style instruction based on user theme settings
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

  debugLog('📝 THINKER PROMPT (truncated)', {
    theme: settings.theme || 'dark',
    promptLength: 3000 // approximate
  });

  const prompt = `You are the architect for a multi-file web project. Based on the user request and project structure, produce a design contract and a dependency graph that allows multiple AI assistants to write the files without knowledge conflicts.

User request: "${message}"
Project structure: ${JSON.stringify(projectStructure, null, 2)}
Existing files: ${files.map(f => f.name).join(', ') || 'none'}

=== MANDATORY DESIGN SYSTEM ===
${visualStyleInstruction}
=== END DESIGN SYSTEM ===

🎨 THEME & COLOR RULES (READ THIS OR THE PROJECT WILL FAIL):
- If the user requests ANY game, app, or project with a recognizable identity (Flappy Bird, Mario, Tetris, Instagram clone, etc.):
  * You MUST replicate the ORIGINAL iconic color scheme of that game/app.
  * Flappy Bird = sky blue bg, green pipes, yellow bird, white clouds.
  * Mario = red/blue character, brick brown, sky blue bg, green pipes.
  * Tetris = black bg, neon tetrominos (cyan, yellow, purple, green, red, blue, orange).
  * Instagram clone = pink-to-purple gradient, white cards, dark icons.
  * DO NOT use the default dark/light theme for ANY game or app that has a known visual identity.
  
- If the user's request describes a SPECIFIC mood or scene (underwater, desert, futuristic, carnival, etc.):
  * CREATE UNIQUE, VIBRANT colors that match THAT specific context.
  * Underwater = deep blue bg, teal highlights, coral pink accents.
  * Desert = warm sand bg, terracotta, golden yellow, cactus green.
  * Futuristic = dark navy bg, neon cyan lines, holographic white.

- ONLY use the default theme colors (background: #080808, text: #FFFFFF) if:
  * The user's request is truly GENERIC with no recognizable theme (basic calculator, simple form, landing page with no specific brand).
  * There is absolutely NO specific game, app, mood, or scene mentioned.

- ⛔️ BLACK AND WHITE ARE FORBIDDEN for ANY game, creative app, or themed project.
- ⛔️ Monochrome dark themes are FORBIDDEN unless explicitly requested by the user.
- Every game project MUST have at LEAST 4 distinct, vibrant colors in the contract.
- The colors must make the project visually STUNNING and recognizable.

- EXAMPLES of GOOD vs BAD:
  * "Make Flappy Bird" → BAD: bg:#080808, text:#FFFFFF. GOOD: bg:#87CEEB (sky), pipes:#4CAF50, bird:#FFD700
  * "Create a space shooter" → BAD: bg:#080808, accent:#333. GOOD: bg:#0A0A2E, lasers:#00FFFF, ships:#C0C0C0
  * "Build a calculator" → OK to use default theme
  * "Make a Instagram-like app" → BAD: default theme. GOOD: bg gradient #F77737 to #C13584
  
- If the user's request is GENERIC (no specific theme/scene mentioned):
  * THEN use the exact default colors from the DESIGN SYSTEM above.
  * Example: a basic calculator, a generic landing page, a simple form.
  
- NEVER create a dull or monochrome look for games or themed apps.
- Colors should be COHESIVE, MODERN, and visually APPEALING.
- Prefer vibrant, energetic palettes for games and creative tools.
- Always ensure proper contrast for readability.

Output ONLY a valid JSON object with the following exact structure (no markdown, no extra text):
{
  "user_thought": "A SHORT 3-5 line message to the user in their language explaining what you're about to do. Mention number of files and phases. Be friendly and excited!",
  
  "contract": {
    "colors": { "primary": "#...", "secondary": "#...", "bg": "#...", "text": "#..." },
    "font": "Poppins, sans-serif",
    "spacing": { "section": "2rem", "element": "1rem" },
    "class_names": { "container": "app-container", "button": "btn-primary", "card": "card-item" },
    "api": {
      "functions": { "init": "initApp()", "render": "renderUI(data)", "handleClick": "handleButton(event)" },
      "data_structures": { "state": "{ count: number, items: [] }", "item": "{ id: string, text: string }" }
    },
    "planned_files": ["file1", "file2", "file3"]
  },
  "dependency_graph": {
    "index.html": { "depends_on": [], "phase": 1 },
    "css/style.css": { "depends_on": ["index.html"], "phase": 2 },
    "js/main.js": { "depends_on": ["index.html", "css/style.css"], "phase": 3 }
  }
}

CRITICAL RULES:
- "user_thought" MUST be a short, friendly message in the SAME language as the user's request. NEVER more than 5 lines.
- The contract must be detailed enough so that each file writer can work independently while guaranteeing compatibility.
- All class names, CSS variables, and function names must be decided here.
- "planned_files" MUST list ALL files from the project structure with their exact names.
- The dependency graph must respect that a file can only be created after all files it depends on.
- ⚠️ HTML files (.html) MUST be placed in the LAST phase because they need to reference all other files.
- CSS/JS files with NO dependencies on HTML should go in the FIRST phase.
- The phase numbers must be sequential integers starting from 1.
- Every file from project structure MUST appear in dependency_graph.`;

  try {
    const result = await thinkerModel.generateContent(prompt);
    const text = result.response.text();
    
    debugLog('📄 THINKER RAW RESPONSE (first 500 chars)', text.substring(0, 500));
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON from thinker');
    const blueprint = JSON.parse(jsonMatch[0]);
    // Ensure planned_files includes all project files
if (!blueprint.contract.planned_files) {
  blueprint.contract.planned_files = projectStructure.map(p => p.file);
}

    // Validate
    if (!blueprint.contract || !blueprint.dependency_graph) throw new Error('Invalid blueprint structure');
    
    // استخراج معلومات المراحل
    const phases = {};
    for (const [file, info] of Object.entries(blueprint.dependency_graph)) {
      if (!phases[info.phase]) phases[info.phase] = [];
      phases[info.phase].push(file);
    }
    
    debugLog('✅ THINKER OUTPUT', {
      userThought: blueprint.user_thought,
      phasesCount: Object.keys(phases).length,
      phases: phases,
      contractColors: blueprint.contract?.colors,
      contractClasses: blueprint.contract?.class_names,
      contractFunctions: blueprint.contract?.api?.functions
    });
    
    return blueprint;
  } catch (err) {
    debugLog('❌ THINKER ERROR', { error: err.message });
    console.error('thinker error:', err);
    return {
      user_thought: `سأقوم ببناء ${projectStructure.length} ملفات للمشروع 🚀`,
      contract: { colors: {}, class_names: {}, api: {} },
      dependency_graph: Object.fromEntries(
        projectStructure.map((p, i) => [p.file, { depends_on: i > 0 ? [projectStructure[i-1].file] : [], phase: i+1 }])
      )
    };
  }
}

// ========== تعديل executePhases ==========
async function executePhases(blueprint, message, projectStructure, conversationContext, existingFiles, clientId) {
  const contract = blueprint.contract;
  const graph = blueprint.dependency_graph;
  
  // Collect phases
  const phases = {};
  for (const [file, info] of Object.entries(graph)) {
    if (!phases[info.phase]) phases[info.phase] = [];
    phases[info.phase].push(file);
  }
  
  const phaseNumbers = Object.keys(phases).map(Number).sort((a,b)=>a-b);
  const generatedFiles = {};
  const auxModelKey = PROGRAM_CONFIGS['codeai-code-r'].auxModel;
  
  debugLog('⚡ EXECUTION STARTED', {
    model: auxModelKey,
    totalPhases: phaseNumbers.length,
    maxAuxModels: PROGRAM_CONFIGS['codeai-code-r'].maxAuxModels,
    phases: phases
  });
  
  for (const phase of phaseNumbers) {
    const tasks = phases[phase];
    
    debugLog(`🔄 PHASE ${phase} STARTING`, {
      files: tasks,
      filesCount: tasks.length,
      generatedSoFar: Object.keys(generatedFiles).length
    });
    
    broadcast({ type: 'phase_start', phase, files: tasks }, clientId);
    
    const promises = tasks.map(file => {
      return generateAuxFile(file, contract, generatedFiles, projectStructure, conversationContext, message, existingFiles); 
    });
    
    const results = await Promise.allSettled(promises);
    
    results.forEach((res, idx) => {
      const file = tasks[idx];
      if (res.status === 'fulfilled' && res.value) {
        generatedFiles[file] = res.value;
        debugLog(`✅ GENERATED ${file}`, {
          size: res.value.length,
          phase: phase,
          preview: res.value.substring(0, 150)
        });
        broadcast({ type: 'file_generated', file, content: res.value }, clientId);
      } else {
        debugLog(`❌ FAILED ${file}`, {
          phase: phase,
          error: res.reason?.message || 'Unknown error'
        });
        console.error(`Failed to generate ${file}:`, res.reason);
        broadcast({ type: 'file_error', file, error: res.reason?.message || 'Unknown error' }, clientId);
      }
    });
    
    debugLog(`✅ PHASE ${phase} COMPLETED`, {
      filesGenerated: tasks.filter((_, i) => results[i].status === 'fulfilled').length,
      filesFailed: tasks.filter((_, i) => results[i].status === 'rejected').length,
      totalGenerated: Object.keys(generatedFiles).length
    });
  }
  
  debugLog('🎉 EXECUTION COMPLETED', {
    totalFilesGenerated: Object.keys(generatedFiles).length,
    filesList: Object.keys(generatedFiles)
  });
  
  return generatedFiles;
}

// ========== تعديل generateAuxFile ==========
async function generateAuxFile(targetFile, contract, previouslyGenerated, projectStructure, historyContext, userMessage, existingFiles = []) {
  const auxModelKey = PROGRAM_CONFIGS['codeai-code-r'].auxModel;
  const keyInfo = getSafeKeyForModel(auxModelKey);
  if (!keyInfo) throw new Error(`No key for aux model ${auxModelKey}`);
  
  const genAI = new GoogleGenerativeAI(keyInfo.token);
  const model = genAI.getGenerativeModel({
    model: MODEL_CONFIGS[auxModelKey].modelName,
    generationConfig: { temperature: 0, maxOutputTokens: 1000000 }
  });
  
  const contextText = Object.entries(previouslyGenerated)
    .map(([name, content]) => `--- ${name} (NEWLY CREATED) ---\n${content}`)
    .join('\n\n');
    
    const existingFilesContext = existingFiles
    .filter(f => f.content && !previouslyGenerated[f.name]) // لا تكرر الملفات المنشأة حديثاً
    .map(f => `--- ${f.name} (EXISTING) ---\n${f.content}`)
    .join('\n\n');

const fullContext = [existingFilesContext, contextText].filter(Boolean).join('\n\n');
  
  debugLog(`🔨 BUILDING ${targetFile}`, {
    model: auxModelKey,
    hasContext: Object.keys(previouslyGenerated).length > 0,
    contextFiles: Object.keys(previouslyGenerated),
    contractKeys: Object.keys(contract).filter(k => Object.keys(contract[k]).length > 0)
  });
  
  // For HTML files, add special instructions to NOT inline CSS/JS
let htmlSpecificInstruction = "";
if (targetFile.endsWith('.html')) {
  const allPlannedFiles = contract.planned_files || projectStructure.map(p => p.file);
  const cssFiles = allPlannedFiles.filter(f => f.endsWith('.css'));
  const jsFiles = allPlannedFiles.filter(f => f.endsWith('.js'));
  
  htmlSpecificInstruction = `
⚠️ CRITICAL HTML RULES - READ CAREFULLY:
- This is an HTML file. You MUST NOT include any <style> tags or inline CSS.
- You MUST NOT include any <script> tags with inline JavaScript.
- Instead, use EXTERNAL file references:
${cssFiles.length > 0 ? `  * CSS: ${cssFiles.map(f => `<link rel="stylesheet" href="${f}">`).join(', ')}` : ''}
${jsFiles.length > 0 ? `  * JS: ${jsFiles.map(f => `<script src="${f}"></script>`).join(', ')}` : ''}
- Keep the HTML body minimal - only semantic structure and class names from the contract and other files.
- Use the exact class names from the CONTRACT above.
`;
}

const template = `You are an expert, friendly web developer inside **Codeai PWA**.

🎯 YOUR SPECIFIC TASK: Create the file **${targetFile}**

═══════════════════════════════════════
📋 DESIGN CONTRACT (MUST FOLLOW EXACTLY)
═══════════════════════════════════════
${JSON.stringify(contract, null, 2)}

${htmlSpecificInstruction}
═══════════════════════════════════════
📂 PROJECT CONTEXT
═══════════════════════════════════════
${fullContext || 'No existing files yet - you are creating the first file'}

📝 FILE DESCRIPTION: ${projectStructure.find(p => p.file === targetFile)?.description || 'Create a complete implementation'}

═══════════════════════════════════════
⚡ QUALITY REQUIREMENTS ⚡
═══════════════════════════════════════

1. **COMPLETENESS**: Write the ENTIRE file. NO placeholders. NO "TODO". NO "Add logic here". Every function fully implemented.

2. **SIZE REQUIREMENTS**:
   - CSS files: 100-300+ lines
   - JavaScript files: 150-500+ lines  
   - HTML files: 50-100 lines (structure only, use external files)
   - Your response must be SUBSTANTIAL - never write tiny, minimal files

3. **CREATIVITY & POLISH** (Add 4-7 extra features!):
   - Smooth animations & transitions (hover effects, loading states)
   - Visual effects (gradients, shadows, glow, particles for games)
   - Sound visual indicators & feedback for all actions
   - Responsive design & keyboard accessibility
   - Custom modals (NEVER use alert())

4. **FOR GAMES SPECIFICALLY**:
   - Scoring system with animated display
   - Multiple levels or progressive difficulty
   - Upgrade/improvement mechanics
   - Win/lose conditions with cinematic UI
   - Start screen, pause menu, game over screen
   - Multiple enemy/tower types with unique behaviors
   - Particle effects, screen shake, combo indicators

5. **CODE QUALITY**:
   - Clean, well-organized, with section comments
   - Handle ALL edge cases and errors gracefully
   - Use the EXACT class names, colors, and functions from the CONTRACT
   - Follow best practices for the language

🚫 NEVER:
- Write "..." or "// TODO" or "more code here"
- Create empty or stub functions
- Use basic alert() for UI
- Write less than 100 lines for any JS/CSS file
- Use inline styles (use CSS classes from contract)
- Include inline CSS/JS in HTML (use external file references)

✅ ALWAYS:
- Deliver COMPLETE, WORKING, POLISHED code
- Make it production-ready, not a starter template
- Add 4-7 extra features beyond the basic request
- Handle errors and edge cases
- Make the user say "WOW! This is amazing!"

═══════════════════════════════════════
📤 OUTPUT FORMAT (STRICT)
═══════════════════════════════════════
Output ONLY the file's code. Nothing else. No markdown. No explanations.
The system will wrap your output in <FILE name="${targetFile}"> automatically.

Now create **${targetFile}** - make it INCREDIBLE! 🚀`;

  const callModel = async () => {
    const result = await model.generateContent(template);
    return result;
  };
  
  try {
    const result = await retryWithBackoff(callModel, { maxRetries: 6, baseDelayMs: 2000 });
    const text = result.response.text();
    const cleaned = text.replace(/```[\s\S]*?\n/g, '').replace(/```/g, '').trim();
    return cleaned;
  } catch (err) {
    debugLog(`❌ AUX FAILED ${targetFile}`, { error: err.message });
    throw err;
  }
}

// ========== تعديل executeCodeR ==========
async function executeCodeR({ message, files, history, settings, visionImages, searchContext, projectStructure, clientId, convId, userId, editType = 'build' }) {
  debugLog('🚀 Code‑R STARTED', {
    message: message.substring(0, 80),
    projectFiles: projectStructure.length,
    structure: projectStructure.map(p => p.file),
    theme: settings.theme || 'dark'
  });

  broadcast({ type: 'stage', text: '🎨 Designing the contract...' }, clientId);
  const blueprint = await generateContractAndGraph(message, projectStructure, files, settings);
  
  const thoughtText = blueprint.user_thought || 
    `📁 Building ${projectStructure.length} files for your project...`;
  
  debugLog('💭 USER THOUGHT', { thought: thoughtText });
  
  broadcast({ type: 'thought_process', text: thoughtText }, clientId);
  
  broadcast({ type: 'stage', text: `⚡ Building ${projectStructure.length} files...` }, clientId);
  const generated = await executePhases(blueprint, message, projectStructure, { history, settings }, files, clientId);
  
  let fullResponse = '';
for (const [file, content] of Object.entries(generated)) {
  const fileBlock = `<FILE name="${file}">\n${content}\n</FILE>`;
  fullResponse += fileBlock + '\n';
  // Send each file immediately to the frontend
  broadcast({ type: 'assistant_message', text: fileBlock }, clientId);
}
  
  const summary = `🎉 تم إنشاء ${Object.keys(generated).length} ملفات بنجاح.\n\n${Object.keys(generated).map((f, i) => `${i+1}️⃣ ${f}`).join('\n')}\n\nهل ترغب في تعديل شيء؟`;
  
  debugLog('📊 FINAL SUMMARY', {
    filesCreated: Object.keys(generated).length,
    totalResponseSize: fullResponse.length,
    savedToSupabase: true
  });
  
  broadcast({ type: 'assistant_message', text: summary }, clientId);
  
  const extractedTasks = { built: Object.keys(generated), modified: [], deleted: [] };
  const filesSnapshot = Object.entries(generated).map(([name, content]) => ({ name, content, type: getMimeType(name) }));
  
  const filesArray = Object.entries(generated).map(([name, content]) => ({
    name: name, content: content, type: getMimeType(name)
  }));
  
  await saveToSupabase(userId, convId, message, fullResponse, filesArray, 'Code‑R', thoughtText, extractedTasks, filesSnapshot);
  
  broadcast({ type: 'stream_complete' }, clientId);
  
  debugLog('✅ Code‑R COMPLETED SUCCESSFULLY');
  
  return fullResponse;
}

// الدوال المساعدة الموجودة (getSafeKey, getSafeKeyForModel, updateUsage ...)

// ========== وظائف code‑R الجديدة ==========

/**
 * تستدعي نموذج Gemini 3 Flash (المُفكّر) وتطلب منه عقداً ومخطط تبعيات.
 */


/**
 * تنفيذ المراحل بالاستعانة بالنموذج المساعد، مع تمرير السياق.
 */


// ========== دالة إعادة المحاولة مع تراجع أسي ==========
async function retryWithBackoff(fn, { maxRetries = 6, baseDelayMs = 2000, onRetry = null } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) throw err; // فشل نهائي بعد كل المحاولات
      // تحديد إذا كان الخطأ قابلاً للاسترداد (503 Service Unavailable / 429 Rate Limit)
      const status = err?.status || (err?.response?.status);
      const isRetryable = status === 503 || status === 429 ||
        (err.message && (err.message.includes('503') || err.message.includes('429')));
      if (!isRetryable) throw err; // خطأ غير قابل للاسترداد – رميه فوراً
      const delay = baseDelayMs * Math.pow(2, attempt - 1); // 2, 4, 8, 16 ثانية
      console.log(`🔄 [Retry ${attempt}/${maxRetries}] Waiting ${delay}ms due to error: ${err.message}`);
      if (onRetry) onRetry(attempt, delay, err);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * البداية الجديدة لتشغيل برنامج code‑R.
 */


// ---------------------------
// تعديل app.post('/api/chat') لدعم code‑R الجديد
// ---------------------------


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

// ==========================================
// 1. إضافة متغيرات التحكم (في بداية الملف بعد المتغيرات العامة)
// ==========================================
const CONTINUATION_DELAY_MS = 3000; // 3 ثوانٍ قابلة للتغيير
const MAX_CONTINUATIONS = 2;        // نموذج أولي + نموذج ثانوي فقط حاليًا
const CONTINUATION_MODEL = 'llama-3.3-70b'; // النموذج المخصص للإكمال

// ==========================================
// 2. دالة بناء Prompt الاستمرار (فكرة 4)
// ==========================================
function buildContinuationPrompt(partialResponse, filesState, originalSystemPrompt, projectStructure = []) {
    // استخراج أسماء الملفات التي تم إنشاؤها بالفعل
    const generatedFileNames = [];
    const fileRegex = /<FILE\s+name="([^"]+)"/g;
    let match;
    while ((match = fileRegex.exec(partialResponse)) !== null) {
        generatedFileNames.push(match[1]);
    }
    
    // تحديد الملفات المتبقية
    const pendingFiles = projectStructure.filter(p => !generatedFileNames.includes(p.file));
    
    // ✅ تمرير الملفات كاملة بدون اقتطاع
    const filesContext = filesState.map(f => 
        `⭐ EXISTING FILE: ${f.name}\n${f.content}\n--- END OF ${f.name} ---`
    ).join('\n\n');

    let continuationTask = '';
    if (pendingFiles.length > 0) {
        continuationTask = `
🎯 YOUR SPECIFIC TASK:
You MUST create the following remaining files that were NOT generated yet:
${pendingFiles.map(p => `- ${p.file}: ${p.description}`).join('\n')}

CRITICAL - READ THIS OR YOU WILL FAIL:
1. DO NOT regenerate files that already exist (${generatedFileNames.join(', ')}).
2. You MUST use the EXACT format below for every new file. NO OTHER FORMAT WILL BE ACCEPTED.
3. DO NOT use formats like "--- FILE: name ---" or "### File: name" or Markdown code blocks. ONLY the format below.

MANDATORY FILE FORMAT (COPY THIS EXACTLY):
<FILE name="filename.ext">
... FULL code content here ...
</FILE>

For example, to create index.html you MUST write:
<FILE name="index.html">
<!DOCTYPE html>
<html>
...
</html>
</FILE>

If you output any other format, the system will REJECT your response and the user will see an error.`;
    } else {
        continuationTask = `
✅ All planned files have been created! Provide a brief completion message.
`;
    }

    return {
        systemPrompt: `You are a CONTINUATION assistant completing a multi-file project.

⭐ ALL EXISTING PROJECT FILES (READ CAREFULLY, DO NOT REGENERATE THESE):
${filesContext}

${continuationTask}

CRITICAL RULES:
1. DO NOT introduce yourself or start a new conversation.
2. DO NOT output any text that was already generated.
3. DO NOT recreate files that already exist above.
4. Output ONLY the required <FILE> blocks, with NO extra explanations after them.
5. Ensure new files properly reference existing ones (e.g., index.html links style.css and js/game.js).
6. Maintain exact same coding style, color variables, and class names.

Continue now by generating the remaining files. Start immediately with <FILE name="...">.`,
        
        userPrompt: `Create the remaining files using the EXACT <FILE name="..."> format as instructed. Do not use any other format.`
    };
}


function buildContinuationPromptForRemainingFiles(pendingFiles, currentFiles, originalSystemPrompt) {
    // ✅ تمرير الملفات كاملة بدون اقتطاع
    const filesContext = currentFiles.map(f => 
        `⭐ EXISTING FILE (DO NOT REGENERATE): ${f.name}\n${f.content}\n--- END OF ${f.name} ---`
    ).join('\n\n');

    const fileList = pendingFiles.map(p => `- ${p.file}: ${p.description}`).join('\n');

    return {
        systemPrompt: `You are a CONTINUATION assistant. Your SPECIFIC task is to generate the following missing files for an existing project:

REMAINING FILES TO CREATE:
${fileList}

⭐ ALL EXISTING PROJECT FILES (READ CAREFULLY - DO NOT REGENERATE):
${filesContext}

CRITICAL RULES:
1. Generate EXACTLY ONE <FILE name="..."> block for each of the remaining files.
2. DO NOT generate any files that are already listed as EXISTING above.
3. READ the existing files THOROUGHLY to ensure perfect integration.
4. Use the exact same class names, CSS variables, function names, and coding style.
5. For index.html: include correct <link> and <script> tags for all existing CSS/JS files.

⚠️ MANDATORY FILE FORMAT (NO OTHER FORMAT WILL BE ACCEPTED):
<FILE name="filename.ext">
... FULL code content here ...
</FILE>

DO NOT use formats like "--- FILE: name ---", "### File: name", or Markdown code blocks. ONLY the <FILE> tag format above.

Original system context: ${originalSystemPrompt?.substring(0, 500)}...`,

        userPrompt: `Create the remaining files: ${pendingFiles.map(p => p.file).join(', ')}. Use the EXACT <FILE name="..."> format. Start immediately.`
    };
}


// ==========================================
// 3. دالة تنفيذ الاستمرار
// ==========================================
// ==========================================
// دالة تنفيذ الاستمرار - إضافة حدث جديد
// ==========================================
async function executeContinuation({
    partialResponse,
    filesState,
    originalSystemPrompt,
    clientId,
    convId,
    userId,
    message,
    provider,
    keyInfo,
    modelConfig,
    executionContext,
    continuationCount = 1
}) {
    console.log(`🔄 [CONTINUATION] Starting continuation #${continuationCount}...`);
    
    const continuationModelName = MODEL_CONFIGS[CONTINUATION_MODEL]?.displayName || 'secondary model';
    const primaryModelName = modelConfig?.displayName || 'Primary model';
    
    // ✅ إرسال نوع جديد: continuation_started
    broadcast({
        type: "continuation_started",
        primaryModel: primaryModelName,
        continuationModel: continuationModelName,
        continuationCount: continuationCount
    }, clientId);
    
    // انتظار المدة المحددة
    await new Promise(resolve => setTimeout(resolve, CONTINUATION_DELAY_MS));
    
    // بناء Prompt الاستمرار
    const { systemPrompt, userPrompt } = buildContinuationPrompt(
        partialResponse,
        filesState,
        originalSystemPrompt
    );
    
    // الحصول على معلومات نموذج الإكمال
    const continuationModelConfig = MODEL_CONFIGS[CONTINUATION_MODEL];
    if (!continuationModelConfig) {
        throw new Error(`Continuation model ${CONTINUATION_MODEL} not found`);
    }
    
    const continuationKeyInfo = getSafeKeyForModel(CONTINUATION_MODEL);
    if (!continuationKeyInfo) {
        console.warn(`⚠️ No key for ${CONTINUATION_MODEL}, using original provider`);
        continuationKeyInfo = keyInfo;
    }
    
    let continuedResponse = "";
    
    await sendResponseUnified({
        model: continuationModelConfig.provider === 'google' 
            ? new GoogleGenerativeAI(continuationKeyInfo.token).getGenerativeModel({
                model: continuationModelConfig.modelName,
                generationConfig: {
                    maxOutputTokens: continuationModelConfig.maxTokens,
                    temperature: continuationModelConfig.temperature
                }
            })
            : null,
        provider: continuationModelConfig.provider,
        keyInfo: { 
            ...continuationKeyInfo, 
            clientId, 
            convId, 
            userId, 
            message: "[CONTINUATION] " + message 
        },
        prompt: userPrompt,
        userParts: [{ text: userPrompt }],
        systemPrompt: systemPrompt,
        supportsStreaming: continuationModelConfig.supportsStreaming,
        onChunk: (text) => {
            continuedResponse += text;
            broadcast({ type: "assistant_message", text }, clientId);
        },
        onComplete: (full) => {
            continuedResponse = full;
        },
        maxRetries: 1
    });
    
    // ✅ عند اكتمال النموذج الثاني، إرسال حدث اكتمال الاستمرار
    broadcast({
        type: "continuation_completed",
        primaryModel: primaryModelName,
        continuationModel: continuationModelName,
        totalLength: (partialResponse + continuedResponse).length
    }, clientId);
    
    console.log(`✅ [CONTINUATION] Completed. Added ${continuedResponse.length} chars.`);
    
    const totalResponse = partialResponse + continuedResponse;
    
    return totalResponse;
}

// ==========================================
// 4. تعديل دالة sendResponseUnified لإرجاع معلومات التوقف
// ==========================================
// سنضيف معامل جديد `onChunkWithLimit` لفحص الحد الأقصى أثناء التوليد
// ولكن لتجنب تعقيد الكود، سنضيف المنطق في المكان الذي تُستدعى فيه

// ==========================================
// 5. تعديل كتلة app.post('/api/chat') لدعم الاستمرار
// ==========================================
// سنقوم بتغليف استدعاء sendResponseUnified بمنطق يفحص الحاجة للاستمرار

// ... (سنضع هذا داخل try block بعد الحصول على fullPrompt و systemPrompt)

// ملاحظة: هذا هو التعديل الأساسي داخل app.post('/api/chat')
// سنستبدل الكود الحالي لاستدعاء sendResponseUnified / executeWithFallback
// بمنطق جديد يدعم الاستمرار

// ================ استبدال كتلة try الداخلية ================
/*
الكود الحالي:
try {
  if (!isAutoMode(requestedModel)) {
    await sendResponseUnified({ ... });
  } else {
    fullResponse = await executeWithFallback({ ... });
  }
  ...
}
*/



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
    const res = await fetch('https://fonts.gstatic.com/s/notosansarabic/v18/nwpxtLGrOAZMl5nJ_wfgRg3DrWFZWsnVBJ_sS6tlqHHFlhQ5l3sQWIHPqzCfyGyvu3CBFQLaig.ttf');
    const arrayBuffer = await res.arrayBuffer();
fs.writeFileSync(fontPath, Buffer.from(arrayBuffer));
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

async function extractAttachedFilesContent(files) {
  if (!files || !files.length) return "";
  
  let attachedFilesContext = "";
  const filePromises = files.map(async (file) => {
    // الملفات النصية
    if (file.content && typeof file.content === 'string' && !file.url) {
      return {
        name: file.name,
        content: file.content.substring(0, 2000),
        type: 'text'
      };
    }
    // الملفات المستندية (PDF, DOCX, PPTX)
    else if (file.url && (file.type === 'pdf' || file.type === 'docx' || file.type === 'pptx')) {
      const extractedText = await extractFileContent(file.url, file.type);
      return {
        name: file.name,
        content: extractedText.substring(0, 2000),
        type: file.type
      };
    }
    return null;
  });
  
  const fileContents = await Promise.all(filePromises);
  const validFiles = fileContents.filter(f => f && f.content && f.content.trim());
  
  if (validFiles.length > 0) {
    attachedFilesContext = "\n\n--- ATTACHED FILES CONTENT ---\n";
    validFiles.forEach(f => {
      attachedFilesContext += `\n[FILE: ${f.name}] (${f.type.toUpperCase()})\n${f.content}\n`;
      attachedFilesContext += "-".repeat(50) + "\n";
    });
  }
  
  return attachedFilesContext;
}

function extractTasksFromResponse(fullText) {
  const tasks = {
    built: [],
    modified: [],
    deleted: []
  };

  // ملفات تم إنشاؤها
  const fileRegex = /<FILE\s+name="([^"]+)"\s*>([\s\S]*?)<\/FILE>/gi;
  let match;
  while ((match = fileRegex.exec(fullText)) !== null) {
    if (!tasks.built.includes(match[1])) tasks.built.push(match[1]);
  }

  // ملفات تم تعديلها
  const modifyRegex = /<(REPLACE|ADD_TO)\s+(?:name|file|target)="([^"]+)"[^>]*>/gi;
  while ((match = modifyRegex.exec(fullText)) !== null) {
    if (!tasks.modified.includes(match[2])) tasks.modified.push(match[2]);
  }

  return tasks;
}

// استخراج النص النقي من رد النموذج (إزالة جميع أكواد XML)
function extractPlainTextFromResponse(responseText) {
  if (!responseText || typeof responseText !== 'string') return '';
  
  // إزالة جميع علامات FILE و REPLACE و ADD_TO مع محتواها
  let cleaned = responseText
    .replace(/<FILE\s+name="[^"]*"\s*>[\s\S]*?<\/FILE>/gi, '')
    .replace(/<REPLACE\s+file="[^"]*"\s*>[\s\S]*?<\/REPLACE>/gi, '')
    .replace(/<ADD_TO\s+target="[^"]*"\s+position="[^"]*"\s*>[\s\S]*?<\/ADD_TO>/gi, '')
    .replace(/<<<<<<< SEARCH[\s\S]*?>>>>>>> REPLACE/g, '')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
  
  // إذا أصبح النص فارغاً تماماً، احتفظ برسالة افتراضية
  if (cleaned.length === 0) {
    cleaned = "[تم إنشاء الملفات بنجاح]";
  }
  
  return cleaned;
}

// ==========================================
// دالة تطبيق تغييرات الملفات من الرد (لاستخدامها قبل الاستمرار)
// ==========================================
function applyFileChangesFromResponse(responseText, currentFiles) {
    // نسخ عميق للملفات الحالية لتجنب تعديل المرجع الأصلي مباشرة
    const updatedFiles = currentFiles.map(f => ({ ...f }));
    
    // Regex لاستخراج جميع ملفات FILE (إنشاء/استبدال)
    const fileRegex = /<FILE\s+name="([^"]+)"\s*>([\s\S]*?)<\/FILE>/gi;
    let match;
    
    while ((match = fileRegex.exec(responseText)) !== null) {
        const fileName = match[1];
        const content = match[2].trim();
        
        const existingIndex = updatedFiles.findIndex(f => f.name === fileName);
        if (existingIndex !== -1) {
            updatedFiles[existingIndex].content = content;
        } else {
            updatedFiles.push({ name: fileName, content: content });
        }
    }
    
    // Regex لاستخراج ADD_TO (إضافة جزئية)
    const addToRegex = /<ADD_TO\s+(?:target|name)="([^"]+)"\s+position="(start|end)"\s*>([\s\S]*?)<\/ADD_TO>/gi;
    while ((match = addToRegex.exec(responseText)) !== null) {
        const fileName = match[1];
        const position = match[2];
        const content = match[3].trim();
        
        const file = updatedFiles.find(f => f.name === fileName);
        if (file) {
            if (position === 'end') {
                file.content = file.content.trimEnd() + '\n\n' + content;
            } else {
                file.content = content + '\n\n' + file.content.trimStart();
            }
        }
    }
    
    // Regex لاستخراج REPLACE (استبدال جزئي)
    const replaceRegex = /<REPLACE\s+(?:file|name|target)="([^"]+)"\s*>([\s\S]*?)<\/REPLACE>/gi;
    while ((match = replaceRegex.exec(responseText)) !== null) {
        const fileName = match[1];
        const diffBlock = match[2];
        
        const file = updatedFiles.find(f => f.name === fileName);
        if (file) {
            // تطبيق الـ diff البسيط
            const searchRegex = /<<<<<<< SEARCH\s*([\s\S]*?)\s*=======\s*([\s\S]*?)\s*>>>>>>> REPLACE/g;
            let diffMatch;
            let newContent = file.content;
            
            while ((diffMatch = searchRegex.exec(diffBlock)) !== null) {
                const searchText = diffMatch[1].trim();
                const replaceText = diffMatch[2].trim();
                
                if (newContent.includes(searchText)) {
                    newContent = newContent.replace(searchText, replaceText);
                }
            }
            file.content = newContent;
        }
    }
    
    return updatedFiles;
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

function getCurrentDateInfo() {
  const now = new Date();
  // صيغة UTC: "Monday, May 11, 2026 - 14:30 UTC"
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short'
  };
  return now.toLocaleDateString('en-US', options) + ' UTC';
}

async function buildCodeSystemPrompt({
  routeResult,
    settings,
    taskInfo,
    reasoningSummary,
    visionImages,
    files,
    history,
    convId,
    message,
    projectStructure,
    searchContext
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
    
    let batchFileInstruction = "";
  let targetFiles = [];
  
  if (projectStructure && projectStructure.length > 0) {
    const existingFileNames = files.map(f => f.name);
    
    // البحث عن الملفات التي لم يتم إنشاؤها بعد
    const pendingFiles = projectStructure.filter(p => !existingFileNames.includes(p.file));
    
    // أخذ أول 3 ملفات كحد أقصى للدفعة الحالية
    const BATCH_SIZE = 3;
    targetFiles = pendingFiles.slice(0, BATCH_SIZE);
    
    if (targetFiles.length > 0) {
      const fileList = targetFiles.map(p => `- ${p.file}: ${p.description}`).join('\n');
      const remainingCount = pendingFiles.length - targetFiles.length;
      
      batchFileInstruction = `
================================================
📁 PROJECT PLANNER MODE - BATCH GENERATION (${targetFiles.length} files)
================================================
The system has analyzed the request and divided the project into these planned files:
${projectStructure.map(p => `- ${p.file}: ${p.description}`).join('\n')}

🎯 YOUR CURRENT TASK:
Generate the following ${targetFiles.length} file(s) in this batch:
${fileList}
${remainingCount > 0 ? `\n(After this batch, ${remainingCount} file(s) will remain for subsequent generations)` : ''}

CRITICAL RULES FOR THIS BATCH:
- Generate ONLY the files listed above. DO NOT generate files outside this batch.
- Output EXACTLY ONE <FILE name="..."> block for EACH file.
- Complete each file fully before moving to the next.
- **IMPORTANT**: If you cannot complete all ${targetFiles.length} files due to length, you MUST include <|CONTINUE|> at the exact point you stop, and the system will continue.
- Do not output explanations after the file blocks.
================================================
`;
    } else {
      batchFileInstruction = `
✅ All planned files have been created! You can now review the project or suggest improvements.
`;
    }
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

const currentDate = getCurrentDateInfo();

// 3. تعليمات النظام الجديدة
    const systemInstruction = `You are an expert, friendly web developer.


📅 Today's date: ${currentDate}

${batchFileInstruction}

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
- If the user asks for anything that doesn't relate to coding, answer them normally; you aren't for coding only.
- Be enthusiastic and friendly! Use emojis like 🎉, ✨, 📄, 🚀 when appropriate.
- Summarize what you did in an exciting way, specific to the user's request.
- ALWAYS end with interactive suggestions with numbers related to what the user just created.
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
10. **ALWAYS ADD 4-7 extra features the user didn't ask for but would love**.
11. MAKE IT FEEL FINISHED, not like a starter
12. Include ALL functions, styles, and interactive elements
13. Make the project COMPLETE and FULLY FUNCTIONAL
14. Your response can be VERY LONG (up to 1 million tokens)
15. ADD 4-7 additional features the user might like to the project while building
16. **CONTINUATION MARKER:** If you are forced to stop because you reached the maximum output limit AND you still have more code or files to generate, you MUST end your response with the EXACT marker: <|CONTINUE|>. This tells the system to continue generating with a secondary model. DO NOT use this marker if you have completed the full response.
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
        const role = msg.role || msg.sender || 'user'; 
        const text = msg.text || msg.content || '';
        return `[${role.toUpperCase()}]: ${text.substring(0, 500)}`;
    }).join("\n");
}

// إدراج ذاكرة المحادثة (إن وجدت)
const currentConvMemory = conversationMemory[convId]?.summary || '';
if (currentConvMemory) {
    historyText = `--- CONVERSATION MEMORY (SUMMARY) ---\n${currentConvMemory}\n\n--- LATEST MESSAGES ---\n${historyText}`;
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
// ✅ إضافة محتوى الملفات المرفقة
let attachedFilesContext = "";
if (files && files.length > 0) {
    attachedFilesContext = await extractAttachedFilesContent(files);
}
const userParts = [];
// ثم في userParts:
userParts.push({
  text: `
--- CONVERSATION CONTEXT (LAST 2 TURNS) ---
${historyText}

--- CURRENT USER MESSAGE ---
${message}

--- CURRENT PROJECT FILES ---
${filesContext}

${attachedFilesContext}
`.trim()
});

let visionContext = "";



// 1. نص المستخدم + السياق

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

if (searchContext) {
  userParts.push({ text: searchContext }); // قبل السياق الآخر
}

if (searchContext) {
  systemPrompt += `\n\n--------------------------------------------------\nCITATION RULES: Use [1], [2] for facts from search results. - Do NOT add a separate "## References" section at the end. The system will handle the references automatically.`;
}

return {
  systemPrompt: `${systemInstruction}\n\n${taskPromptContext}\n\n${internalGuidance}\n\n--------------------------------------------------\nCITATION RULES: Use [1], [2] for facts from search results. 
  - Do NOT add a separate "## References" section at the end. The system will handle the references automatically.`,
  userParts
};
}

// دالة بناء system prompt للوضع Native (بدون تعليمات Codeai)
async function buildNativeSystemPrompt({ message, history, files, visionImages, convId }) {
  const currentDate = getCurrentDateInfo();
  let systemPrompt = `You are a helpful AI assistant. Answer directly and naturally in the user's language.
  📅 Today's date: ${currentDate}`;

  let historyText = "";
if (history && Array.isArray(history)) {
    historyText = history.map(msg => {
        const role = msg.role || msg.sender || 'user'; 
        const text = msg.text || msg.content || '';
        return `[${role.toUpperCase()}]: ${text.substring(0, 500)}`;
    }).join("\n");
}

// إدراج ذاكرة المحادثة (إن وجدت)
const currentConvMemory = conversationMemory[convId]?.summary || '';
if (currentConvMemory) {
    historyText = `--- CONVERSATION MEMORY (SUMMARY) ---\n${currentConvMemory}\n\n--- LATEST MESSAGES ---\n${historyText}`;
}

  let filesContext = "";
  if (files && Array.isArray(files)) {
    filesContext = files.map(f =>
      `File: ${f.name}\n${f.content?.substring(0, 500) || ''}`
    ).join("\n\n");
  }

  const userPrompt = `${historyText ? `--- CONVERSATION HISTORY ---\n${historyText}\n\n` : ''}${filesContext ? `--- PROJECT FILES ---\n${filesContext}\n\n` : ''}--- USER MESSAGE ---\n${message}`;

  return { systemPrompt, userParts: [{ text: userPrompt }] };
}

async function buildSystemPrompt(ctx) {
  const {
    routeResult,
    settings,
    taskInfo,
    reasoningSummary,
    visionImages,
    files,
    history,
    message,
    searchContext,
    convId
  } = ctx;

  // ⛔️ الأسئلة العامة
  if (routeResult.task_type === "general") {
    const currentDate = getCurrentDateInfo();
    let systemPrompt = `
    You are a helpful assistant.
Answer clearly and directly.
Language: respond in user's language.

📅 Today's date: ${currentDate}

- Be enthusiastic and friendly! Use emojis like 🎉, ✨, 📄, 🚀 when appropriate.
- Summarize what you did in an exciting way, specific to the user's request.
- ALWAYS end with interactive suggestions with numbers related to what the user just created.
`;
    
    let userPrompt = message;
    
    // إضافة الصور
    let visionContext = "";
    if (visionImages && visionImages.length > 0) {
        visionContext = `--- ATTACHED IMAGES ---\nThe user has attached ${visionImages.length} image(s).\nYou MUST analyze them carefully before responding.\nDescribe what you see and use the visual information to answer accurately.\n\n`;
        visionImages.forEach((img, index) => {
            const base64 = fs.readFileSync(img.path).toString("base64");
            visionContext += `[IMAGE ${index + 1}]\ndata:${img.mimetype};base64,${base64}\n`;
        });
    }
    
    // بناء historyText
    let historyText = "";
if (history && Array.isArray(history)) {
    historyText = history.map(msg => {
        const role = msg.role || msg.sender || 'user'; 
        const text = msg.text || msg.content || '';
        return `[${role.toUpperCase()}]: ${text.substring(0, 500)}`;
    }).join("\n");
}

// إدراج ذاكرة المحادثة (إن وجدت)
const currentConvMemory = conversationMemory[convId]?.summary || '';
if (currentConvMemory) {
    historyText = `--- CONVERSATION MEMORY (SUMMARY) ---\n${currentConvMemory}\n\n--- LATEST MESSAGES ---\n${historyText}`;
}
    
    // بناء filesContext
    let filesContext = "";
    if (files && Array.isArray(files)) {
        filesContext = files.map(f => 
            `--- FILE START: ${f.name} ---\n${f.content || ''}\n--- FILE END: ${f.name} ---`
        ).join("\n\n");
    }
    
    // 🔹 استخراج محتوى الملفات المرفقة
    let attachedFilesContext = "";
    if (files && files.length > 0) {
        const filePromises = files.map(async (file) => {
            // الملفات النصية
            if (file.content && typeof file.content === 'string' && !file.url) {
                return {
                    name: file.name,
                    content: file.content.substring(0, 2000),
                    type: 'text'
                };
            }
            // الملفات المستندية (PDF, DOCX, PPTX)
            else if (file.url && (file.type === 'pdf' || file.type === 'docx' || file.type === 'pptx')) {
                const extractedText = await extractFileContent(file.url, file.type);
                return {
                    name: file.name,
                    content: extractedText.substring(0, 2000),
                    type: file.type
                };
            }
            return null;
        });
        
        const fileContents = await Promise.all(filePromises);
        const validFiles = fileContents.filter(f => f && f.content && f.content.trim());
        
        if (validFiles.length > 0) {
            attachedFilesContext = "\n\n--- ATTACHED FILES CONTENT ---\n";
            validFiles.forEach(f => {
                attachedFilesContext += `\n[FILE: ${f.name}] (${f.type.toUpperCase()})\n${f.content}\n`;
                attachedFilesContext += "-".repeat(50) + "\n";
            });
        }
    }
  console.log(searchContext)
    
    // تجميع userPrompt الكامل
    userPrompt = `${searchContext ? searchContext + '\n\n' : ''}${visionContext}${historyText ? `\n--- CONVERSATION CONTEXT ---\n${historyText}\n` : ''}${filesContext ? `\n--- PROJECT FILES ---\n${filesContext}\n` : ''}${attachedFilesContext ? `\n${attachedFilesContext}\n` : ''}--- CURRENT USER MESSAGE ---\n${message}`;
    
    let citationInstruction = "";
if (searchContext) {
    citationInstruction = `
--------------------------------------------------
CITATION RULES (IMPORTANT)
--------------------------------------------------
- Use [1], [2] for facts from search results.
- Do NOT add a separate "## References" section at the end. The system will handle the references automatically.
`;
}
systemPrompt = (systemPrompt || '') + citationInstruction;
    
    return { systemPrompt, userPrompt };
  }

  // 📄 توليد ملفات
  if (["pdf", "pptx", "docx"].includes(routeResult.task_type)) {
    const currentDate = getCurrentDateInfo();
    let systemPrompt = `
You are an enthusiastic and interactive document generation and editing engine.

📅 Today's date: ${currentDate}

CRITICAL: You MUST respond with ONLY valid JSON that follows this EXACT structure.
DO NOT add any text outside the JSON.
DO NOT add markdown.
DO NOT add explanations.

{
  "type": "document",
  "user_message": "Your enthusiastic, friendly, and interactive response to the user. Make it warm, encouraging, and ask what they'd like to do next.",
  "document": {
    "document_type": "pdf | pptx | docx",
    "file_name": "desired-filename.ext",
    "content": {
      // For PDF:
      "text": "Full text content..."
      
      // For PPTX:
      "slides": [
        {
          "text": "Slide content. Use \\n for new lines. Use \\n\\n for blank lines.",
          "options": { "fontSize": 24, "bold": false, "align": "right" }
        }
      ]
      
      // For DOCX:
      "paragraphs": [
        { "text": "Paragraph text", "bold": true, "size": 24, "align": "right" }
      ]
    }
  }
}

RULES FOR user_message:
- Be enthusiastic and friendly! Use emojis like 🎉, ✨, 📄, 🚀 when appropriate.
- Summarize what you did in an exciting way, specific to the user's request.
- ALWAYS end with interactive suggestions related to what the user just created.
- Make your response feel natural and tailored to the user's specific needs.
- DO NOT copy example messages word-for-word. Be creative and original.
  
Example user_message:
"✨ I've updated your document with the new content! It's now much richer and more detailed. 🎉\n\nWould you like me to:\n1️⃣ Add more sections\n2️⃣ Improve the formatting\n3️⃣ Add bullet points\n4️⃣ Make it longer\n\nJust tell me what you'd like! 😊"

DOCUMENT CONTENT RULES:
- Use \\n for line breaks. Use \\n\\n for blank lines.
- For Arabic text, set align: "right"
- If the user is asking to MODIFY an existing document, read the attached file content carefully and make the requested changes.
- The "content" field must contain the FULL updated content of the document.
`;
    
    let userPrompt = message;
    
    // إضافة الصور
    let visionContext = "";
    if (visionImages && visionImages.length > 0) {
        visionContext = `--- ATTACHED IMAGES ---\n`;
        visionImages.forEach((img, index) => {
            const base64 = fs.readFileSync(img.path).toString("base64");
            visionContext += `[IMAGE ${index + 1}]\ndata:${img.mimetype};base64,${base64}\n`;
        });
    }
    
    // إضافة محتوى الملفات المرفقة
    const attachedFilesContext = await extractAttachedFilesContent(files);
    
    // بناء historyText
    let historyText = "";
if (history && Array.isArray(history)) {
    historyText = history.map(msg => {
        const role = msg.role || msg.sender || 'user'; 
        const text = msg.text || msg.content || '';
        return `[${role.toUpperCase()}]: ${text.substring(0, 500)}`;
    }).join("\n");
}

// إدراج ذاكرة المحادثة (إن وجدت)
const currentConvMemory = conversationMemory[convId]?.summary || '';
if (currentConvMemory) {
    historyText = `--- CONVERSATION MEMORY (SUMMARY) ---\n${currentConvMemory}\n\n--- LATEST MESSAGES ---\n${historyText}`;
}
    
    // تجميع userPrompt الكامل
    userPrompt = `${searchContext ? searchContext + '\n\n' : ''}${visionContext}${historyText ? `\n--- CONVERSATION HISTORY ---\n${historyText}\n` : ''}${attachedFilesContext ? `\n--- ATTACHED FILES TO MODIFY ---\n${attachedFilesContext}\n` : ''}--- CURRENT USER REQUEST ---\n${message}\n\nIMPORTANT: You MUST output ONLY JSON. The user_message field should be enthusiastic and interactive!`;
    // إضافة تعليمات الاقتباس والمصادر
let citationInstruction = "";
if (searchContext) {
  citationInstruction = `
--------------------------------------------------
CITATION RULES (IMPORTANT)
--------------------------------------------------
- You have been provided with up‑to‑date search results.
- When you use information from the search results, you MUST append the corresponding citation number in brackets immediately after the relevant fact, e.g., [1], [2][3].
- Do NOT add a separate "## References" section at the end. The system will handle the references automatically.
- Example: "The latest report shows that ...[1]"
`;
}
systemPrompt = (systemPrompt || '') + citationInstruction;

    return { systemPrompt, userPrompt };
}

  // 👇 من هنا فصاعدًا: CODE MODE
return await buildCodeSystemPrompt({
  routeResult,
  settings,
  taskInfo,
  reasoningSummary,
  visionImages,
  files,
  history,
  convId,
  message,
  projectStructure: ctx.projectStructure // ✅ نأخذ القيمة من السياق
});
}

function checkIfTruncated(text, expectedFileCount = 0) {
    // الفحص الأساسي: هل النموذج طلب الاستمرار بنفسه؟
    if (text.includes('<|CONTINUE|>')) {
        return true;
    }
    
    if (expectedFileCount > 0) {
        const actualFileCount = (text.match(/<FILE\s+name="/g) || []).length;
        if (actualFileCount < expectedFileCount) {
            console.log(`⚠️ Truncated: only ${actualFileCount}/${expectedFileCount} files generated.`);
            return true;
        }
    }
    
    // فحص احتياطي فقط في حال النماذج التي لا تلتزم بالتعليمات
    if (text.length < 1000) return false;
    
    // علامات القطع الواضحة
    const truncationMarkers = [
        /<FILE\s+name="[^"]*"\s*>$/,      // FILE غير مكتمل
        /<REPLACE\s+file="[^"]*"\s*>$/,   // REPLACE غير مكتمل  
        /function\s+\w+\s*\([^)]*$/,       // دالة غير مكتملة
        /[a-z]$/i                          // انتهى بحرف صغير (mid-word)
    ];
    
    for (const marker of truncationMarkers) {
        if (marker.test(text.trim())) {
            return true;
        }
    }
    
    return false;
}

function getSafeKey(modelType = 'gemini') {
    let keys = [];
    let limits = {};
    
    // تحديد المفاتيح والحدود حسب نوع النموذج
    if (modelType === 'gemma') {
        keys = ['G1', 'G2', 'G3'];  // نفس مفاتيح Gemini
        limits = LIMITS.GEMMA;
    } else if (modelType === 'gemini') {
        keys = ['G1', 'G2', 'G3'];
        limits = LIMITS.GEMINI;
    } else if (modelType === 'openrouter') {
        keys = ['O1', 'O2'];
        limits = LIMITS.OPENROUTER;
    } else if (modelType === 'groq') {
        keys = ['R1'];
        limits = LIMITS.GROQ;
    } else if (modelType === 'deepseek') {
        keys = ['D1'];
        limits = { RPM: 60, TPM: 1000000, RPD: 1000 };
    } else {
        console.log(`❌ Unknown model type: ${modelType}`);
        return null;
    }
    
    console.log(`🔍 Looking for ${modelType} key. Available keys: ${keys}`);
    
    for (let keyId of keys) {
        const keyToken = process.env[keyId];
        if (!keyToken) {
            console.log(`   ${keyId}: No token available`);
            continue;
        }

        refreshStats(keyId, modelType);
        const stats = usageStats[keyId]?.[modelType];
        
        if (!stats) {
            console.log(`   ${keyId}: No stats available for ${modelType}`);
            continue;
        }

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
    return null;
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
  maxRetries = 2,
  signal = null
}) {
  let fullResponse = "";
  let currentThoughtText = null;
  let retries = 0;
  const modelConfig = keyInfo?.modelConfig || {};
  const modelTemperature = modelConfig?.temperature || 0.3;
  const modelTopP = modelConfig?.top_p || 1.0;
  while (retries <= maxRetries) {
    try {
      if (provider === 'google') {
        const abortController = new AbortController();
    if (signal) {
      signal.addEventListener('abort', () => abortController.abort());
    }
        if (supportsStreaming) {
  const parts = Array.isArray(userParts) && typeof userParts[0] === "object"
    ? userParts
    : [{ text: prompt }];
  
  const result = await model.generateContentStream({
    systemInstruction: systemPrompt || undefined,
    contents: [{ role: "user", parts: parts }]
  });

  try {
    for await (const chunk of result.stream) {
      if (abortController.signal.aborted) {
        console.log("🛑 Google stream aborted by user");
        break;
      }
      const text = chunk.text();
      if (text) {
        fullResponse += text;

        // فحص إذا كان الـ response مستند JSON
        const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.type === 'document' && parsed.document) {
              await handleDocumentGeneration({
                json: parsed.document,
                clientId: Array.isArray(keyInfo.clientId) ? keyInfo.clientId[0] : keyInfo.clientId,
                convId: keyInfo.convId,
                userId: keyInfo.userId,
                message: keyInfo.message,
                userMessage: parsed.user_message
              });
              onComplete("");
              return;
            }
          } catch (_) {}
        }

        if (!fullResponse.includes('"type"')) {
          onChunk(text);
        }
      }
    }
  } catch (streamError) {
    if (streamError.message && streamError.message.includes('Failed to parse stream')) {
      console.warn('⚠️ Google stream parsing error, finishing with partial response');
      // لا تفعل شيئًا، واستمر باستخدام fullResponse الحالي
    } else {
      throw streamError; // إعادة رمي الأخطاء الأخرى غير المتعلقة بالتحليل
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
        // 🛡️ تحويل prompt إلى نص عادي لأن Groq/OpenRouter لا تدعم Array of Parts
let finalUserPrompt = "";

if (Array.isArray(prompt)) {
    // هذه الحالة خاصة بـ Gemini Vision (مصفوفة كائنات)
    finalUserPrompt = prompt
        .map(part => {
            if (typeof part === 'string') return part;
            if (part && typeof part.text === 'string') return part.text;
            if (part && part.inlineData) return "[Image attached]"; // لا نرسل base64 لـ Groq
            return "";
        })
        .filter(Boolean)
        .join("\n");
} else if (typeof prompt === 'string') {
    finalUserPrompt = prompt;
} else {
    // Fallback
    finalUserPrompt = JSON.stringify(prompt);
}

// تأكد من عدم إرسال محتوى فارغ
if (!finalUserPrompt || finalUserPrompt.trim().length === 0) {
    // ✅ التصحيح
const fallbackMessage = keyInfo?.message || "Hello";
finalUserPrompt = fallbackMessage; // استخدم رسالة المستخدم الأصلية كـ fallback
}
  const messages = [
    { role: "system", content: systemPrompt || "You are a helpful AI coding assistant." },
    { role: "user", content: finalUserPrompt }
  ];

  const apiFunction =
    provider === 'openrouter' ? callOpenRouterAPI :
    provider === 'groq'       ? callGroqAPI :
                                callDeepSeekAPI;

  // ⚠️ هذه الدوال ترجع STRING دائمًا
  const text = await apiFunction(keyInfo, messages, signal, modelTemperature, modelTopP);

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
            prompt: prompt,
            signal: signal
        });
        
        if (kimiResponse) {
            fullResponse = kimiResponse;
            onChunk(kimiResponse); // Kimi حالياً في الكود لا يدعم الـ stream، نرسل النص كاملاً
        }
      }


    // داخل sendResponseUnified، بعد اكتمال الرد وقبل onComplete، أضف:

// طباعة إحصائيات التوكنات
if (fullResponse) {
    const promptText = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
    const systemText = systemPrompt || '';
    logTokenStats(promptText, systemText, fullResponse, `[${provider?.toUpperCase() || 'UNKNOWN'}]`);
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

async function callKimiAPI({ token, modelConfig, prompt, signal }) {
  const controller = new AbortController();
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }
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
    }),
    signal: controller.signal
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kimi API error: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

async function callGroqAPI(keyInfo, messages, signal = null, modelTemperature, modelTopP) {
  const controller = new AbortController();
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }
  
  const requestBody = {
    model: keyInfo.modelConfig.modelName,
    messages,
    temperature: modelTemperature, 
    top_p: modelTopP,
    max_tokens: 4096,  // ✅ خفض القيمة
    stream: false
  };
  
  console.log("📤 Groq Request Body:", JSON.stringify(requestBody, null, 2));
  
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${keyInfo.token}`
    },
    body: JSON.stringify(requestBody),
    signal: controller.signal
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error("❌ Groq Error Details:", errorText);  // ← هذا سيكشف السبب
    if (res.status === 429) throw new Error('RATE_LIMITED');
    throw new Error(`Groq API error: ${res.status} - ${errorText}`);
  }
  
  const data = await res.json();
  return data.choices[0].message.content;
}

// ============= دالة OpenRouter API مع دعم Streaming للـ Reasoning =============
async function callOpenRouterAPI(keyInfo, messages, signal = null, modelTemperature, modelTopP) {
  const controller = new AbortController();
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${keyInfo.token}`,
      'HTTP-Referer': 'https://codeai-0sh2.onrender.com',
      'X-Title': 'Codeai'
    },
    body: JSON.stringify({
      model: keyInfo.modelConfig.modelName,
      messages,
      max_tokens: keyInfo.modelConfig.maxTokens,
      temperature: modelTemperature,   // ✅
      top_p: modelTopP, 
      stream: false
    }),
    signal: controller.signal
  });

  const raw = await response.text();

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('RATE_LIMITED');
    }
    throw new Error(`OpenRouter API error: ${response.status} - ${raw}`);
  }

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

// أضف هذه الدالة لفحص مفاتيح Gemma
function testGemmaKey() {
    const keys = ['G1', 'G2', 'G3'];
    console.log("🔍 Testing Gemma keys...");
    
    for (let keyId of keys) {
        const keyToken = process.env[keyId];
        if (keyToken) {
            console.log(`✅ Gemma key ${keyId} exists (${keyToken.substring(0, 10)}...)`);
            return { id: keyId, token: keyToken };
        } else {
            console.log(`❌ Gemma key ${keyId} NOT found`);
        }
    }
    return null;
}

// استدعاء الدالة عند بدء السيرفر
testGemmaKey();

// اختبار اتصال Gemma API عند بدء السيرفر
async function testGemmaAPIConnection() {
    console.log("\n🔍 Testing Gemma API connection...");
    
    const gemmaKeyInfo = getSafeKey('gemma');
    if (!gemmaKeyInfo) {
        console.log("❌ No Gemma key available");
        return false;
    }
    
    try {
        const testResponse = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': gemmaKeyInfo.token
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: "Say 'Hello World'" }]
                    }],
                    generationConfig: {
                        maxOutputTokens: 10
                    }
                })
            }
        );
        
        if (testResponse.ok) {
            const data = await testResponse.json();
            console.log("✅ Gemma API connection successful!");
            return true;
        } else {
            const errorText = await testResponse.text();
            console.log("❌ Gemma API test failed:", testResponse.status, errorText.substring(0, 200));
            return false;
        }
    } catch (error) {
        console.log("❌ Gemma API connection error:", error.message);
        return false;
    }
}

// استدعاء الاختبار بعد تحميل السيرفر
setTimeout(() => {
    testGemmaAPIConnection();
}, 5000);

async function callDeepSeekAPI(keyInfo, messages, signal = null, modelTemperature, modelTopP) {
  const controller = new AbortController();
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }
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
      temperature: modelTemperature, 
      top_p: modelTopP,
      stream: keyInfo.modelConfig.supportsStreaming
    }),
    signal: controller.signal
  });
  if (!response.ok) throw new Error(`DeepSeek API error: ${response.status}`);
  return response;
}

/**
 * تقدير عدد التوكنز بطريقة آمنة
 */
// أضف هذه الدالة المساعدة في بداية الملف بعد الدوال الأخرى
// ==========================================
// دالة تقدير التوكنات وطباعة الإحصائيات
// ==========================================
function estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    // تقدير تقريبي: 1 توكن لكل 4 حروف (متوسط GPT/Gemini)
    return Math.ceil(text.length / 4);
}

function logTokenStats(userMessage, systemPrompt, fullResponse, contextInfo = '') {
    const userTokens = estimateTokens(userMessage);
    const systemTokens = estimateTokens(systemPrompt);
    const responseTokens = estimateTokens(fullResponse);
    const totalTokens = userTokens + systemTokens + responseTokens;
    
    console.log('\n' + '='.repeat(65));
    console.log(`📊 TOKEN STATISTICS ${contextInfo}`);
    console.log('='.repeat(65));
    console.log(`📝 User message tokens:    ${userTokens.toLocaleString()} (${((userTokens / totalTokens) * 100).toFixed(1)}%)`);
    console.log(`⚙️ System prompt tokens:   ${systemTokens.toLocaleString()} (${((systemTokens / totalTokens) * 100).toFixed(1)}%)`);
    console.log(`🤖 Response tokens:        ${responseTokens.toLocaleString()} (${((responseTokens / totalTokens) * 100).toFixed(1)}%)`);
    console.log(`📦 TOTAL TOKENS:           ${totalTokens.toLocaleString()}`);
    console.log('-'.repeat(65));
    console.log(`📏 User message length:    ${userMessage?.length?.toLocaleString() || 0} chars`);
    console.log(`📏 System prompt length:   ${systemPrompt?.length?.toLocaleString() || 0} chars`);
    console.log(`📏 Response length:        ${fullResponse?.length?.toLocaleString() || 0} chars`);
    
    // نسبة الضغط التقريبية
    const compressionRatio = ((fullResponse?.length || 0) / responseTokens).toFixed(2);
    console.log(`📊 Compression ratio:      ~${compressionRatio} chars/token`);
    console.log('='.repeat(65) + '\n');
    
    return { userTokens, systemTokens, responseTokens, totalTokens };
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
    model: "gemma-4-31b-it",
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
  
  const gemmaKeyInfo = getSafeKeyForModel('gemma');
  if (!gemmaKeyInfo) {
    console.warn("⚠️ No available keys for Gemma summarization, using fallback title");
    return generateFallbackSummary(userMessage);
  }

  console.log(`🔑 Using Gemma Key: ${gemmaKeyInfo.id}`);

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

  try {
    const genAI = new GoogleGenerativeAI(gemmaKeyInfo.token);
    const modelConfig = MODEL_CONFIGS['gemma'];

    const summaryText = await callGemmaWithProtection({
      genAI,
      modelConfig,
      systemPrompt: "You are a title generator. Output ONLY the title, nothing else.",
      userParts: [{ text: summaryPrompt }],
      onChunk: () => {},
      onComplete: (full) => {},
      signal: null
    });

    console.log(`📝 Raw summary from protected Gemma: "${summaryText}"`);
    const cleaned = cleanSummary(summaryText, userMessage);
    console.log(`✅ Final summary: "${cleaned}"`);

    const tokens = estimateTokens(summaryPrompt + cleaned);
    updateUsage(gemmaKeyInfo.id, 'gemma', tokens);
    
    return cleaned || generateFallbackSummary(userMessage);
    
  } catch (error) {
    console.error("❌ Gemma summarization failed:", error.message);
    return generateFallbackSummary(userMessage);
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
app.use('/api', authenticateUser);
app.use(express.static(path.join(__dirname, '..', 'client')));

let clients = [];
const activeRequests = new Map();
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
    model: "gemma-4-31b-it",
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

function fallbackRouteResult(message) {
  return {
    is_code_related: true,
    task_type: "code",
    is_quiz: false,
    edit_type: "build",
    project_structure: [],
    search: { needs: false, queries: [] }
  };
}

/**
 * تنفيذ طلب Gemma 4 مع حماية كاملة ضد أخطاء 500
 */
async function callGemmaWithProtection({
  genAI,
  modelConfig,
  systemPrompt,
  userParts,
  onChunk,
  onComplete,
  signal
}) {
  let safeSystem = systemPrompt || "";
  let safeParts = userParts;

  if (typeof safeSystem === 'string' && safeSystem.length > 12000) {
    safeSystem = safeSystem.slice(0, 12000) + "\n\n[trimmed]";
  }
  if (Array.isArray(safeParts) && safeParts.length > 0) {
    const t = safeParts.map(p => p.text || "").join("\n");
    if (t.length > 16000) safeParts = [{ text: t.slice(0, 16000) }];
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelConfig.modelName,
        generationConfig: {
          temperature: modelConfig.temperature || 0.3,
          maxOutputTokens: modelConfig.maxOutputTokens || 4096,
          topP: 0.9,
          topK: 40
        }
      });

      const result = await model.generateContent({
        systemInstruction: safeSystem || undefined,
        contents: [{ role: "user", parts: safeParts }]
      });

      const text = result.response?.text?.() || "";
      if (text) {
        if (onChunk) onChunk(text);
        if (onComplete) onComplete(text);
        return text;
      }
      throw new Error("EMPTY_RESPONSE");
      
    } catch (err) {
      // ✅ استخراج status من كائن الخطأ بجميع الصيغ الممكنة
      const status = err?.status 
                  || err?.response?.status 
                  || err?.statusText 
                  || (err?.message?.match(/status:\s*(\d+)/i) || [])[1]
                  || (JSON.stringify(err).match(/"status":\s*(\d+)/) || [])[1];

      const is500 = status == 500 || status == 503 
                 || (typeof err?.message === 'string' && (err.message.includes('500') || err.message.includes('503') || err.message.includes('Internal')));

      console.error(`❌ [Gemma] Attempt ${attempt+1}/4 failed. Status: ${status}`, typeof err === 'object' ? JSON.stringify(err).substring(0,200) : err);

      if (attempt === 3 || !is500) throw err;

      console.warn(`⚠️ [Gemma] 500 detected — retrying with reduced input...`);
      safeSystem = (safeSystem || "").slice(0, 8000);
      safeParts = [{ text: (safeParts[0]?.text || "").slice(0, 10000) }];
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1500));
    }
  }
  throw new Error("GEMMA_ALL_RETRIES_EXHAUSTED");
}

async function routeTaskMandatory(message, history = [], files = [], clientId = null) {
  // بناء سياق المحادثة من history
  let historyContext = "";
  if (history && history.length > 0) {
    const lastMessages = history.slice(-8); // آخر 4 رسائل للسياق
    historyContext = lastMessages.map(msg => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      const content = msg.text || msg.content || '';
      return `${role}: ${content.substring(0, 300)}`;
    }).join("\n");
  }

  // بناء معلومات الملفات المرفقة
  let filesInfo = "";
  if (files && files.length > 0) {
    const fileNames = files.map(f => f.name).join(", ");
    const fileTypes = files.map(f => f.type || f.kind).join(", ");
    filesInfo = `\nATTACHED FILES: ${fileNames} (types: ${fileTypes})`;
  }
  
  const prompt = `
You are a task classifier. Analyze the FULL conversation context and the latest user message.

CONVERSATION HISTORY:
${historyContext || "No previous messages"}
${filesInfo}

LATEST USER MESSAGE:
"${message}"

Return ONLY a raw JSON object. Do **not** add any text, explanations, or markdown. The entire response must start with '{' and end with '}'.
NEVER TALK OR ADD WORDS NOT IN JSON FORMAT

JSON format:
{
  "is_code_related": true/false,
  "task_type": "code" | "general" | "pdf" | "pptx" | "docx",
  "is_quiz": true/false,
  "edit_type": "build" | "edit",
  "project_structure": [],  // ONLY include if task_type is "code"
  "search": {
    "needs": true/false,
     "queries": ["query1"]  // 🚫 MUST be a non‑empty if needs is true, otherwise null
  }
}

DETECTION RULES FOR SEARCH:
- "needs" should be true if the message:
  * Requires real‑time or recent information (news, weather, current events, prices, dates).
  * Asks about a specific fact that a typical LLM might not know reliably (obscure facts, latest updates).
  * Mentions "search for", "look up", "find information about", or similar.
  * Asks for opinions or summaries of recent developments after the AI's knowledge cutoff.
- If needs is true, you MUST provide a "queries" array containing one or more concise search queries. Never leave it empty.
- If needs is false, set "queries" to an empty array (or null).
- Example: {"search": {"needs": true, "queries": ["latest AI news"]}}
- Example for comparison: {"search": {"needs": true, "queries": ["gold price today", "oil price today"]}}

DETECTION RULES FOR TASK TYPE (same as before):
- If user asks to CREATE a document: "create a PDF", "make a PowerPoint", "create a Word document" → task_type = pdf/pptx/docx
- If user asks to MODIFY/EDIT an existing document: "edit this document", "add more text", "make it longer", "improve this file" → task_type = pdf/pptx/docx
- If user asks about code or programming → task_type = "code"
- If user asks general questions → task_type = "general"

QUIZ RULES:
- If the user asks to create a quiz, test, exam, or multiple-choice questions, set is_quiz to true. Otherwise false.

EDIT TYPE RULES:
- "edit_type" MUST be "edit" if:
  * The user asks to MODIFY, CHANGE, FIX, UPDATE, IMPROVE any existing code/project.
  * The user mentions existing files or uses words like: عدل, غير, اصلح, حسن, add, remove, change, update, fix, edit.
  * There are existing files in the ATTACHED FILES (not empty placeholders) and wants to edit them
- "edit_type" MUST be "build" if:
  * The user asks to CREATE, BUILD, MAKE a new project from scratch.
  * The user says: اصنع, create, make, build.
  * There are NO meaningful existing files (only empty templates like "// Start coding...").
- Otherwise null if general

PROJECT STRUCTURE RULES (only for task_type = "code"):
- If the user is requesting a NEW project or significant NEW features, provide a logical file structure
- Break the project into SMALL, focused files (each file should have ONE clear responsibility)
- Use proper naming conventions (index.html, css/style.css, js/game.js, js/ui.js, js/utils.js, etc.)
- Each file should be small enough to be generated in a single response
- For existing projects, only suggest new files that need to be created (don't list files that already exist)
- If the request is a simple fix or modification to existing files, return an empty array []

Example project_structure for a game request:
"project_structure": [
  {"file": "index.html", "description": "Main HTML structure with game container"},
  {"file": "css/style.css", "description": "Global styles and game visuals"},
  {"file": "js/game.js", "description": "Core game mechanics and logic"},
  {"file": "js/ui.js", "description": "UI updates, score display, and menus"},
  {"file": "js/utils.js", "description": "Helper functions and utilities"}
]

Example for a simple landing page:
"project_structure": [
  {"file": "index.html", "description": "Main landing page structure"},
  {"file": "css/style.css", "description": "Styling and responsive design"}
]

EXAMPLES:
User: "create a PDF about AI" → {"is_code_related": false, "task_type": "pdf", "search": {"needs": false, "query": null}}
User: "what is AI?" → {"is_code_related": false, "task_type": "general", "search": {"needs": false, "query": null}}
User: "write a function in JavaScript" → {"is_code_related": true, "task_type": "code", "project_structure": [], "search": {"needs": false, "query": null}}
User: "make me a chess game" → {"is_code_related": true, "task_type": "code", "project_structure": [{"file": "index.html", "description": "Main chess board"}, {"file": "css/chess.css", "description": "Chess board styling"}, {"file": "js/chess.js", "description": "Chess game logic"}], "search": {"needs": false, "query": null}}
User: "what's the latest news about AI?" → {"is_code_related": false, "task_type": "general", "search": {"needs": true, "query": "latest AI news"}}
User: "سعر صرف الدولار مقابل الريال اليوم" → {"is_code_related": false, "task_type": "general", "search": {"needs": true, "query": "سعر صرف الدولار مقابل الريال اليوم 2026"}}
`;

  // استخدم نموذج خفيف وسريع
  const modelId = "gemma";
  const modelConfig = MODEL_CONFIGS[modelId];
  const keyInfo = getSafeKeyForModel(modelId);
  if (!keyInfo) throw new Error("No key for Gemma");

  
  let text;
  try {
    text = await callGemmaWithProtection({
      genAI: new GoogleGenerativeAI(keyInfo.token),
      modelConfig,
      systemPrompt: "You are a JSON-only task router.",
      userParts: [{ text: prompt }],
      onChunk: () => {},
      onComplete: (full) => { text = full; },
      signal: null
    });
  } catch (err) {
    console.error("❌ Gemma routing failed, using fallback");
    return fallbackRouteResult(message);
  }
  
  let parsed = null;
  try {
    // إزالة أي نص قبل أول { وبعد آخر }
    const firstCurly = text.indexOf('{');
    const lastCurly = text.lastIndexOf('}');
    if (firstCurly !== -1 && lastCurly !== -1 && lastCurly > firstCurly) {
      const possibleJSON = text.slice(firstCurly, lastCurly + 1);
      parsed = JSON.parse(possibleJSON);
    } else {
      // محاولة كامل النص
      parsed = JSON.parse(text);
    }
  } catch (e) {
    // محاولة باستخدام regex
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e2) {
        console.warn("⚠️ All JSON parsing attempts failed.");
      }
    }
  }


  if (!parsed) {
    console.warn("⚠️ Fallback task classification used.");
    return fallbackRouteResult(message);
  }

  // ... تحقق من الحقول (search, is_quiz, الخ) ...
  if (parsed.search?.needs && (!parsed.search.queries || parsed.search.queries.length === 0)) {
    parsed.search.queries = [message];
  }

  // إرسال project_structure للواجهة إذا وُجد
  if (parsed.task_type === "code" && parsed.project_structure) {
    console.log(`📋 Project structure: ${parsed.project_structure.length} files`);
  }
  return parsed;
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


function generateQuizHTMLFromTemplate(data) {
  const templatePath = path.join(__dirname, '..', 'client', 'quiz.html');
  let template = fs.readFileSync(templatePath, 'utf-8');
  // استبدال العلامة المميزة ببيانات JSON
  return template.replace('__QUIZ_DATA__', JSON.stringify(data));
}

function isAutoMode(modelId) {
    return modelId === "auto" 
        || modelId === "codeai-code-r";
}

// دالة buildPDF المحسنة (استبدل الدالة الموجودة)
async function buildPDF(content) {
  // تحويل النص إلى فقرات مع الحفاظ على التنسيق
  let text = typeof content === "string" ? content : (content.text || "");
  
  // تنظيف النص: استبدال الأسطر المتعددة بمسافات مناسبة
  const paragraphs = text.split(/\n\s*\n/);
  
  const isArabic = /[\u0600-\u06FF]/.test(text);
  const fontPath = isArabic ? await ensureArabicFont() : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ 
      margin: 50,
      info: {
        Title: 'Document',
        Author: 'Codeai'
      }
    });
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    if (fontPath) doc.font(fontPath);
    
    // إضافة كل فقرة على حدة مع مسافة بينها
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i];
      if (!para.trim()) continue;
      
      doc.fontSize(12)
         .text(para, {
           align: isArabic ? "right" : "left",
           features: isArabic ? ["rtla"] : [],
           lineGap: 5
         });
      
      // إضافة مسافة بين الفقرات
      if (i < paragraphs.length - 1) {
        doc.moveDown(0.5);
      }
    }
    
    doc.end();
  });
}

async function extractTextFromPDF(pdfBuffer) {
  try {
    const data = await pdfParse(pdfBuffer);
    return data.text;
  } catch (error) {
    console.error("PDF extraction error:", error);
    return "";
  }
}

async function extractTextFromDOCX(docxBuffer) {
  try {
    const result = await mammoth.extractRawText({ buffer: docxBuffer });
    return result.value;
  } catch (error) {
    console.error("DOCX extraction error:", error);
    return "";
  }
}



async function extractTextFromPPTX(pptxBuffer) {
  try {
    const tempPath = `/tmp/pptx_${Date.now()}.pptx`;
    fs.writeFileSync(tempPath, pptxBuffer);
    
    const text = await officeParser.parseOfficeAsync(tempPath);
    fs.unlinkSync(tempPath);
    
    return text;
  } catch (error) {
    console.error("PPTX extraction error:", error);
    return "";
  }
}

function extractFileNamesFromResponse(response) {
    const matches = response.matchAll(/<FILE\s+name="([^"]+)"/g);
    return Array.from(matches, m => m[1]);
}

// دالة رئيسية لاستخراج النص من أي ملف
async function extractFileContent(fileUrl, fileType) {
  try {
    // تحميل الملف من Supabase
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`);
    
    const buffer = Buffer.from(await response.arrayBuffer());
    
    switch (fileType) {
      case 'pdf':
        return await extractTextFromPDF(buffer);
      case 'docx':
        return await extractTextFromDOCX(buffer);
      case 'pptx':
        return await extractTextFromPPTX(buffer);
      default:
        return "";
    }
  } catch (error) {
    console.error(`Error extracting from ${fileType}:`, error.message);
    return "";
  }
}

// دالة مساعدة لاستخراج محتوى الملفات المرفقة (للاستخدام في أي قسم)


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
  // إذا كان content نصاً عادياً، حوله إلى فقرات
  let paragraphs = content.paragraphs;
  if (typeof content === 'string') {
    const textParagraphs = content.split(/\n\s*\n/);
    paragraphs = textParagraphs.map(para => ({
      text: para,
      bold: false,
      size: 12,
      align: /[\u0600-\u06FF]/.test(para) ? "right" : "left"
    }));
  }
  
  const docParagraphs = paragraphs.map(p => {
    const textRun = new TextRun({
      text: p.text,
      bold: p.bold || false,
      italics: p.italic || false,
      size: p.size ? p.size * 2 : 24,
      color: p.color || "000000"
    });

    let alignment = AlignmentType.LEFT;
    let direction = "ltr";
    
    if (p.align === "center") {
      alignment = AlignmentType.CENTER;
    } else if (p.align === "right" || /[\u0600-\u06FF]/.test(p.text)) {
      alignment = AlignmentType.RIGHT;
      direction = "rtl";
    }

    const spacing = p.spacing || {};
    const margin = p.margin || {};
    
    return new Paragraph({
      children: [textRun],
      alignment: alignment,
      spacing: {
        before: spacing.before !== undefined ? spacing.before : 200,
        after: spacing.after !== undefined ? spacing.after : 200,
        line: spacing.line !== undefined ? spacing.line : 276,
        lineRule: spacing.line ? "auto" : undefined
      },
      indent: {
        left: margin.left || 0,
        right: margin.right || 0,
        hanging: margin.hanging || 0,
        firstLine: margin.firstLine || 0
      },
      bullet: p.bullet ? { level: 0 } : undefined,
      bidirectional: direction === "rtl"
    });
  });

  const doc = new Document({
    sections: [{
      properties: { 
        bidi: true,
        page: {
          margin: {
            top: 720,
            bottom: 720,
            left: 720,
            right: 720
          }
        }
      },
      children: docParagraphs
    }]
  });

  return await Packer.toBuffer(doc);
}

// دالة مساعدة للتحقق من صحة محتوى PPTX
function validatePPTXContent(content) {
  if (!content || !content.slides) {
    console.warn("⚠️ Invalid PPTX content, creating default slide");
    return {
      slides: [{ text: "No content provided", options: { fontSize: 24, align: "center" } }]
    };
  }
  
  // تأكد من أن كل شريحة لها نص
  content.slides = content.slides.map(slide => ({
    ...slide,
    text: slide.text || " "
  }));
  
  return content;
}

async function buildPPTX(content) {
  const pptx = new PptxGenJS();
  
  // التحقق من وجود شرائح
  const slides = content.slides || [];
  if (!slides.length) {
    throw new Error("No slides provided for PPTX");
  }
  
  // التحقق من وجود نص عربي لتحديد الاتجاه
  const hasArabic = slides.some(slide => {
    const text = slide.text || (slide.paragraphs ? slide.paragraphs.map(p => p.text).join('') : '');
    return /[\u0600-\u06FF]/.test(text);
  });
  
  for (const slideData of slides) {
    const s = pptx.addSlide();
    
    // إعدادات الشريحة (يمكن تخصيصها لكل شريحة)
    const slideOptions = slideData.options || {};
    
    // إضافة خلفية إذا وجدت
    if (slideOptions.backgroundColor) {
      s.background = { fill: slideOptions.backgroundColor };
    }
    
    let yPosition = 0.5;
    const lineHeight = 0.5;
    
    // ==========================================
    // الحالة 1: فقرات منسقة (paragraphs) - للتحكم الكامل
    // ==========================================
    if (slideData.paragraphs && Array.isArray(slideData.paragraphs)) {
      for (const paragraph of slideData.paragraphs) {
        const textOptions = {
          x: 0.5,
          y: yPosition,
          w: 9,
          h: lineHeight,
          fontSize: paragraph.size || 14,
          bold: paragraph.bold || false,
          italic: paragraph.italic || false,
          color: paragraph.color || "000000",
          align: paragraph.align || (hasArabic ? "right" : "left"),
          bullet: paragraph.bullet || false,
          rtl: hasArabic || paragraph.align === "right",
          wrap: true
        };
        
        let text = paragraph.text || "";
        if (paragraph.bullet) {
          text = "• " + text;
        }
        
        if (text.trim()) {
          s.addText(text, textOptions);
          yPosition += lineHeight;
        }
      }
    }
    
    // ==========================================
    // الحالة 2: نص عادي مع فواصل أسطر (text with \n)
    // هذه الحالة الجديدة التي تدعم JSON من النموذج
    // ==========================================
    else if (slideData.text) {
      // تقسيم النص إلى أسطر بناءً على \n (يدعم \r\n أيضاً)
      const rawText = slideData.text || "";
      const lines = rawText.split(/\r?\n/);
      
      // إعدادات النص الأساسية من الشريحة أو الإعدادات الافتراضية
      const baseOptions = {
        fontSize: slideData.fontSize || slideOptions.fontSize || 18,
        bold: slideData.bold || slideOptions.bold || false,
        italic: slideData.italic || slideOptions.italic || false,
        color: slideData.color || slideOptions.color || "000000",
        align: slideData.align || slideOptions.align || (hasArabic ? "right" : "left"),
        rtl: hasArabic || slideData.align === "right" || slideOptions.align === "right",
        wrap: true
      };
      
      // إضافة كل سطر كفقرة منفصلة
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        // الحفاظ على الأسطر الفارغة كمسافات (اختياري)
        if (line === "") {
          yPosition += lineHeight;
          continue;
        }
        
        line = line.trim();
        if (line === "") continue;
        
        const textOptions = {
          x: slideData.x || slideOptions.x || 0.5,
          y: yPosition,
          w: slideData.w || slideOptions.w || 9,
          h: lineHeight,
          ...baseOptions
        };
        
        s.addText(line, textOptions);
        yPosition += lineHeight;
      }
      
      // إذا لم نضف أي نص (كل الأسطر فارغة)
      if (yPosition === 0.5) {
        s.addText(" ", {
          x: 0.5,
          y: 0.5,
          w: 9,
          h: 0.5
        });
      }
    }
    
    // ==========================================
    // إضافة عنوان الشريحة إذا وجد
    // ==========================================
    if (slideData.title) {
      const titleOptions = {
        x: 0.5,
        y: 0.2,
        w: 9,
        h: 0.6,
        fontSize: slideData.titleFontSize || 24,
        bold: true,
        color: slideData.titleColor || "000000",
        align: slideData.titleAlign || (hasArabic ? "right" : "center"),
        rtl: hasArabic || slideData.titleAlign === "right"
      };
      s.addText(slideData.title, titleOptions);
    }
  }
  
  return await pptx.write("nodebuffer");
}



// دالة تحويل DOCX إلى PDF باستخدام LibreOffice (إذا كان متاحاً)
// دالة تحويل DOCX إلى PDF
// دالة تحويل DOCX إلى PDF باستخدام docx-pdf فقط
async function convertDocxToPdf(docxBuffer) {
  return new Promise((resolve, reject) => {
    const tempDocxPath = `/tmp/docx_${Date.now()}.docx`;
    const tempPdfPath = `/tmp/pdf_${Date.now()}.pdf`;
    
    fs.writeFileSync(tempDocxPath, docxBuffer);
    
    // استخدام docx-pdf مباشرة (بدون LibreOffice)
    try {
      const pdfBuffer = docxToPdf(docxBuffer);
      fs.unlinkSync(tempDocxPath);
      resolve(pdfBuffer);
    } catch (err) {
      fs.unlinkSync(tempDocxPath);
      reject(new Error(`PDF conversion failed: ${err.message}`));
    }
  });
}

// دالة مساعدة لتقدير ارتفاع النص
function estimateTextHeight(text, fontSize, width) {
  // تقدير تقريبي: عدد الأسطر * حجم الخط * 1.2
  const charsPerLine = Math.floor(width * 72 / (fontSize * 0.6)); // تقريب 0.6 بوصة لكل حرف
  const lines = Math.ceil(text.length / charsPerLine);
  return lines * fontSize * 1.2;
}

// دالة مساعدة لتقسيم النص إلى فقرات مع الحفاظ على المسافات
function splitIntoParagraphs(text) {
  const paragraphs = [];
  const lines = text.split('\n');
  
  let currentParagraph = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.trim() === '') {
      // سطر فارغ - ننهي الفقرة الحالية (إن وجدت) ونضيف فقرة فارغة
      if (currentParagraph.trim() !== '') {
        paragraphs.push(currentParagraph);
        currentParagraph = '';
      }
      paragraphs.push(''); // فقرة فارغة لإنشاء مسافة
    } else {
      if (currentParagraph === '') {
        currentParagraph = line;
      } else {
        currentParagraph += '\n' + line;
      }
    }
  }
  
  // إضافة آخر فقرة
  if (currentParagraph.trim() !== '') {
    paragraphs.push(currentParagraph);
  }
  
  return paragraphs;
}



async function handleQuizRequest({
  message, files, history, settings, clientId, convId, userId,
  requestedModel, executionContext, broadcast, abortController
}) {
  broadcast({ type: 'stage', text: '🎯 Creating your quiz...' }, clientId);

  const quizSystemPrompt = `You are a quiz generator AI.
Generate a JSON response following this exact structure:
{
  "type": "quiz",
  "user_message": "A friendly message confirming the quiz (use emojis).",
  "quiz": {
    "title": "Descriptive title of the quiz (e.g., 'JavaScript quiz')",
    "questions": [
      {
        "question": "Question text?",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correct": 0,
        "explanation": "Brief explanation of the correct answer (1-2 sentences)."
      }
    ]
  }
}
Rules:
- Set "user_message" enthusiastic, in the user's language.
- Generate ${settings?.quizCount || 5} questions.
- Each question must have exactly 4 options.
- correct is the 0‑based index of the correct option.
- Always include a short "explanation" for the correct answer.
- Output ONLY the JSON. No markdown, no code fences.`;

  let modelConfig = MODEL_CONFIGS[requestedModel] || MODEL_CONFIGS['gemini-3-flash'];
  let keyInfo = getSafeKeyForModel(requestedModel) || getSafeKeyForModel('gemini-3-flash');
  if (!keyInfo) throw new Error('No available model for quiz');

  let quizResponse = '';
  await sendResponseUnified({
    model: modelConfig.provider === 'google' ? new GoogleGenerativeAI(keyInfo.token).getGenerativeModel({
      model: modelConfig.modelName,
      generationConfig: { maxOutputTokens: 8192, temperature: 0.4 }
    }) : null,
    provider: modelConfig.provider,
    keyInfo: { ...keyInfo, clientId, convId, userId, message },
    prompt: message,
    userParts: [{ text: message }],
    systemPrompt: quizSystemPrompt,
    supportsStreaming: false,
    onChunk: () => {},
    onComplete: (full) => { quizResponse = full; },
    maxRetries: 1,
    signal: abortController.signal
  });

  let quizData;
  try {
    const jsonMatch = quizResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    quizData = JSON.parse(jsonMatch[0]);
    if (!quizData.quiz || !Array.isArray(quizData.quiz.questions)) throw new Error('Invalid structure');
  } catch (e) {
    broadcast({ type: 'error', text: 'Quiz generation failed. Please try again.' }, clientId);
    throw e;
  }

  const userMsg = quizData.user_message;
  if (!userMsg || !userMsg.trim()) {
    throw new Error('Model did not provide user_message');
  }

  const quizTitle = quizData.quiz.title || 'Quiz';
  const questions = quizData.quiz.questions;

  // بناء HTML من القالب الموجود في client/quiz.html
  const templateData = { title: quizTitle, questions };
  const htmlContent = generateQuizHTMLFromTemplate(templateData);
  const fileName = `${quizTitle.replace(/\s+/g, '_')}.html`;

  // ---- إرسال مثل ملفات الكود ----
  // 1. الرسالة النصية
  broadcast({ type: "assistant_message", text: userMsg }, clientId);
  // 2. الملف داخل علامة <FILE>
  const fileBlock = `<FILE name="${fileName}">\n${htmlContent}\n</FILE>`;
  broadcast({ type: "assistant_message", text: fileBlock }, clientId);
  broadcast({ type: "stream_complete" }, clientId);

  // ---- تجهيز بيانات الحفظ ----
  
  const extractedTasks = extractTasksFromResponse(userMsg);
  const filesSnapshot = [{
    name: fileName,
    content: htmlContent,
    type: 'html'
  }];

  // حفظ في قاعدة البيانات (messages + files) بدون رفع إلى Storage
  await saveToSupabase(
    userId, convId, message,
    userMsg,
    [{
      name: fileName,
      content: htmlContent,
      type: 'html'
    }],
    modelConfig.displayName,
    null,                  // لا thought
    extractedTasks,
    filesSnapshot
  );

  return { status: 'ok' };
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
  console.log("🛠 Building PDF with enhanced formatting...");
  
  // تحسين النص قبل إنشاء PDF
  let enhancedContent = finalContent;
  
  // إذا كان المحتوى من DOCX، استخرج النص
  if (typeof finalContent === 'object' && finalContent.paragraphs) {
    enhancedContent = finalContent.paragraphs.map(p => p.text).join('\n\n');
  }
  
  fileBuffer = await buildPDF({ text: enhancedContent });
  console.log("✅ PDF buffer created, size:", fileBuffer?.length);
  
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

    // في دالة handleDocumentGeneration، أضف هذا قبل بناء DOCX
if (document_type === "docx") {
    console.log("🛠 Building DOCX...");
    console.log("Content received:", JSON.stringify(content, null, 2));
    
    // تأكد من وجود الفقرات
    if (!content.paragraphs || !Array.isArray(content.paragraphs) || content.paragraphs.length === 0) {
        console.error("❌ Invalid DOCX content: no paragraphs");
        // إنشاء محتوى افتراضي
        content.paragraphs = [{
            text: "Document content is empty",
            bold: false,
            italic: false,
            size: 12,
            color: "000000",
            align: "right"
        }];
    }
    
    // إضافة توجيه RTL للفقرات العربية
    content.paragraphs = content.paragraphs.map(p => {
        // إذا كان النص يحتوي على أحرف عربية، اجعل المحاذاة إلى اليمين
        if (/[\u0600-\u06FF]/.test(p.text)) {
            p.align = "right";
        }
        return p;
    });
    
    fileBuffer = await buildDOCX(content);
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

await saveToSupabase(userId, convId, message || null, userMessage || "📄 Document created", [{
  name: path.basename(filePath),
  url: publicUrl,
  previewUrls: previewUrls,        // ✅ حفظ المصفوفة
  previewUrl: previewUrls.length > 0 ? previewUrls[0] : null,
  type: document_type
}]);

console.log("✅ File broadcast completed");


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
  onComplete,
  signal = null
}) {
  const models = STATION_FALLBACKS[station];
  if (!models || !models.length) {
    throw new Error(`NO_MODELS_FOR_STATION:${station}`);
  }
  
  let fullResponse = "";  // ✅ متغير لتجميع الرد الكامل
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
      
      // ✅ إعادة تعريف onChunk و onComplete محلياً لتجميع الرد
      const wrappedOnChunk = (text) => {
        fullResponse += text;  // ✅ تجميع الرد
        if (onChunk) onChunk(text);
      };
      
      const wrappedOnComplete = (full) => {
        if (onComplete) onComplete(fullResponse);  // ✅ تمرير الرد المجمع
      };

      await sendResponseUnified({
        model:
          modelConfig.provider === "google"
            ? new GoogleGenerativeAI(keyInfo.token).getGenerativeModel({
                model: modelConfig.modelName,
                generationConfig: {
                  maxOutputTokens: modelConfig.maxTokens,
                  temperature: modelTemperature,    // ✅ من لوحة التحكم
                  topP: modelTopP                   // ✅ من لوحة التحكم
                }
              })
            : null,
        provider: modelConfig.provider,
        keyInfo,
        prompt,
        userParts,
        systemPrompt,
        supportsStreaming: modelConfig.supportsStreaming,
        onChunk: wrappedOnChunk,      // ✅ استخدم الـ wrapper
        onComplete: wrappedOnComplete, // ✅ استخدم الـ wrapper
        maxRetries: 0,
        signal: signal
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
      
      // داخل executeWithFallback، بعد نجاح النموذج وقبل return fullResponse:
if (fullResponse) {
    logTokenStats(prompt, systemPrompt, fullResponse, `[FALLBACK - ${modelConfig?.displayName || modelId}]`);
}
      
      return fullResponse;  // ✅ إرجاع الرد الكامل

    } catch (err) {
      console.warn(`❌ ${modelId} failed: ${err.message}`);

      if (err.message === 'RATE_LIMITED') {
        markProviderRateLimited(modelConfig.provider);
      }
      continue;
    }
  }

  throw new Error("ALL_FALLBACK_MODELS_FAILED");
}

// ==========================================
// دالة البحث عبر DuckDuckGo API
// ==========================================
// ==========================================
// دالة البحث عبر DuckDuckGo (JSON + HTML fallback)
// ==========================================
async function performSearch(query, maxResults = 5) {
  console.log(`🔍 [SEARCH] Searching for: "${query}"`);

  // المحاولة الأولى: JSON API
  let results = await performSearchJSON(query, maxResults);
  if (!results) {
    console.log(`⚠️ [SEARCH] JSON API returned no results, trying HTML fallback...`);
    results = await performSearchHTML(query, maxResults);
  }
  if (!results) return null;

  // تنسيق النتائج مع فهرسة [1]، [2]...
  let formatted = "--- SEARCH RESULTS (USE WITH CITATION NUMBERS) ---\n";
  results.forEach((r, i) => {
    formatted += `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}\n\n`;
  });
  formatted += "--- END SEARCH RESULTS ---";

  console.log(`📋 [SEARCH] Found ${results.length} results`);
  return formatted;
}

// ========== JSON API ==========
async function performSearchJSON(query, maxResults) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    
    const results = [];
    if (data.AbstractText?.trim()) {
      results.push({
        title: data.AbstractSource || data.Heading || query,
        snippet: data.AbstractText,
        url: data.AbstractURL || ''
      });
    }
    if (data.RelatedTopics?.length) {
      for (const topic of data.RelatedTopics) {
        if (results.length >= maxResults) break;
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Name || topic.Text.split('-')[0]?.trim() || query,
            snippet: topic.Text,
            url: topic.FirstURL
          });
        }
      }
    }
    console.log(`📦 [SEARCH] JSON results: ${results.length}`);
    return results.length ? results : null;
  } catch (err) {
    console.error(`❌ [SEARCH] JSON error:`, err.message);
    return null;
  }
}

// ========== HTML Fallback ==========
async function performSearchHTML(query, maxResults) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();

    const results = [];
    // استخراج النتائج من HTML
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = resultRegex.exec(html)) !== null) {
      if (results.length >= maxResults) break;
      results.push({
        title: match[2].replace(/<[^>]+>/g, '').trim(),
        url: unescape(match[1]),
        snippet: match[3].replace(/<[^>]+>/g, '').trim()
      });
    }
    console.log(`📦 [SEARCH] HTML fallback results: ${results.length}`);
    return results.length ? results : null;
  } catch (err) {
    console.error(`❌ [SEARCH] HTML fallback error:`, err.message);
    return null;
  }
}

async function performSearchFallback(query) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    const html = await response.text();
    
    const results = [];
    const regex = /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]+)<\/a>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      if (results.length >= 3) break;
      results.push({
        title: match[2].trim(),
        url: match[1].trim(),
        snippet: match[3].trim()
      });
    }
    
    if (results.length === 0) return null;
    
    let formatted = "--- SEARCH RESULTS (USE WITH CITATION NUMBERS) ---\n";
    results.forEach((r, i) => {
      formatted += `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}\n\n`;
    });
    formatted += "--- END SEARCH RESULTS ---";
    return formatted;
  } catch (err) {
    return null;
  }
}

app.post('/api/quiz/extend', async (req, res) => {
  try {
    const { topic, existingQuestions, count = 3, difficulty = 'same', instructions, lang = 'ar' } = req.body;

    // بناء الـ Prompt لتوليد الأسئلة الإضافية
    const prompt = `Generate ${count} multiple-choice questions about "${topic}" in ${lang === 'ar' ? 'Arabic' : 'English'}.
Difficulty: ${difficulty}.
${instructions ? `Additional instructions: ${instructions}` : ''}
Existing questions (DO NOT repeat): ${JSON.stringify(existingQuestions)}

Return ONLY JSON
NEVER TALK OR ADD WORDS NOT IN JSON FORMAT
: { "questions": [ { "question": "...", "options": ["...", "...", "...", "..."], "correct": 0, "explanation": "..." } ] }`;

    // استخدام نموذج سريع (نفس النموذج الافتراضي)
    const genAI = new GoogleGenerativeAI(getSafeKeyForModel('gemma').token);
    const model = genAI.getGenerativeModel({
      model: 'gemma-4-31b-it',
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid JSON');
    const data = JSON.parse(jsonMatch[0]);
    res.json(data);
  } catch (err) {
    console.error('Quiz extend error:', err);
    res.status(500).json({ error: 'Failed to generate extra questions' });
  }
});

// --------- Memory managment --------- //

async function generateMemorySummary(messages, existingSummary = '') {
  if (!messages || messages.length === 0) return existingSummary;
  
  const gemmaKey = getSafeKeyForModel('gemma');
  if (!gemmaKey) {
    console.warn("⚠️ No Gemma key for memory summary, returning existing");
    return existingSummary;
  }
  
  const conversationText = messages.map(msg => {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    return `${role}: ${(msg.content || msg.text || '').substring(0, 800)}`;
  }).join('\n---\n');

  const prompt = `You are a conversation summarizer for a coding assistant app (Codeai).
Summarize the following conversation segment into a concise paragraph (max 120 words) that captures:
- The user's main requests and intents
- Key decisions, files, or code patterns
- Any errors and their fixes
- The final state or result

${existingSummary ? 'Existing memory summary:\n' + existingSummary + '\n\nNew messages to incorporate:\n' : 'Messages to summarize:\n'}
${conversationText}

Memory summary:`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': gemmaKey.token
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 300,
            temperature: 0.4,
            topP: 0.9
          }
        })
      }
    );
    if (!response.ok) throw new Error(`API error ${response.status}`);
    const data = await response.json();
    const newSummary = data.candidates?.[0]?.content?.parts?.[0]?.text || existingSummary;
    return newSummary.trim();
  } catch (err) {
    console.error("❌ Memory summary error:", err.message);
    return existingSummary;
  }
}

// /chat
app.post('/api/chat', upload.any(), async (req, res) => {
console.log("[[DEBUG]]:", req.body)
  // 1. نستقبل مصفوفة الملفات بدلاً من كود واحد
const message   = req.body.message   || '';
const convId    = req.body.convId    || '';
const clientId  = req.body.clientId  || '';
const userId = req.userId;

if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
}

let files    = [];
let history  = [];
let settings = {};

try { files    = JSON.parse(req.body.files    || '[]'); } catch {}
try { history  = JSON.parse(req.body.history  || '[]'); } catch {}
try { settings = JSON.parse(req.body.settings || '{}'); } catch {}

// تحميل الملخص السابق من قاعدة البيانات إذا لم تكن الذاكرة محملة بعد
if (!conversationMemory[convId]) {
  const { data: convData } = await supabase
    .from('conversations')
    .select('summary')
    .eq('id', convId)
    .single();
  conversationMemory[convId] = {
    summary: convData?.summary || '',
    lastSummarizedCount: 0,
    messageCount: 0
  };
}

// ===== إدارة الذاكرة كل 6 رسائل =====
// ===== إدارة ذاكرة ديناميكية كل 6 رسائل (بغض النظر عن التضاعفات) =====
const CHUNK_SIZE = 6;

// تأكد من وجود كائن الذاكرة
if (!conversationMemory[convId]) {
  conversationMemory[convId] = {
    summary: "",
    lastSummarizedCount: 0,
    messageCount: 0
  };
}

const mem = conversationMemory[convId];
const currentTotalMessages = history.length;
mem.messageCount = currentTotalMessages;

// احسب عدد الرسائل الجديدة التي لم تُلخص بعد
const unsummarizedCount = currentTotalMessages - mem.lastSummarizedCount;

// إذا كان لدينا 6 رسائل جديدة أو أكثر، قم بالتلخيص في الخلفية
if (unsummarizedCount >= CHUNK_SIZE) {
  // آخر 6 رسائل (أو عدد CHUNK_SIZE) غير الملخصة
  const startIdx = Math.max(0, currentTotalMessages - unsummarizedCount);
  const chunkToSummarize = history.slice(startIdx, startIdx + CHUNK_SIZE);
  
  console.log(`🧠 Generating memory for ${chunkToSummarize.length} new messages. Total msgs: ${currentTotalMessages}, Unsummarized: ${unsummarizedCount}`);
  
  // تشغيل التلخيص والحفظ في الخلفية
  generateMemorySummary(chunkToSummarize, mem.summary)
    .then(newSummary => {
      mem.summary = newSummary;
      mem.lastSummarizedCount = currentTotalMessages; // حدّث العدد بعد الانتهاء
      // حفظ في قاعدة البيانات بصمت
      supabase.from('conversations').update({ summary: newSummary }).eq('id', convId)
        .catch(e => console.warn("⚠️ Failed to persist summary:", e.message));
    })
    .catch(err => console.error("❌ Background memory summary failed:", err));
}

// الآن: نأخذ آخر 6 رسائل فقط لنرسلها للنموذج (ستُستخدم لاحقاً في buildSystemPrompt)
const recentHistory = history.slice(-CHUNK_SIZE);
const memorySummary = mem.summary || '';


const modelTemperature = parseFloat(settings.temperature) || 0.2;
const modelTopP = parseFloat(settings.top_p) || 1.0;
const isNativeMode = settings.native_mode === true || settings.native_mode === 'true';


// 🔹 Vision attachments (images from UI)
let visionImages = [];

if (req.files && Array.isArray(req.files)) {
  visionImages = req.files.filter(f =>
    f.mimetype && f.mimetype.startsWith("image/")
  );
}

// إنشاء AbortController للطلب الحالي
const abortController = new AbortController();
const requestKey = `${clientId}_${convId}`;
activeRequests.set(requestKey, abortController);

// تنظيف عند انتهاء الطلب
const cleanupRequest = () => {
  activeRequests.delete(requestKey);
};


const requestedModel = settings?.selectedModel || 'gemini-3-flash';
const isAutoPro = requestedModel === "codeai-code-r";
let routeResult;

if (isNativeMode) {
  // ✅ أنشئ كائن routeResult وهمي بالقيم الافتراضية المطلوبة للوضع Native
  routeResult = {
    task_type: 'general',
    search: { needs: false },
    is_code_related: false,
    project_structure: []
  };
} else {
  // ✅ فقط في الوضع العادي نستدعي routeTaskMandatory
  routeResult = await routeTaskMandatory(message, history, files, clientId);
}

// أضف:
// إرسال نوع المهمة إلى العميل
broadcast({
    type: "task_type_detected",
    task_type: routeResult.task_type,
    is_code_related: routeResult.is_code_related
}, clientId);



let finalModel = requestedModel;
let taskInfo = null;
const executionModels = {
  reasoning: null,
  executor: null,
  fallbacks: []
};
const executionContext = {
  usedModels: [],
  thoughtText: null
};

if (routeResult.is_quiz) {
  try {
    await handleQuizRequest({
      message, files, history, settings, clientId, convId, userId,
      requestedModel, executionContext, broadcast,
      abortController
    });
    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('Quiz error:', error);
    broadcast({ type: 'error', text: 'Failed to create quiz' }, clientId);
    return res.status(500).json({ error: error.message });
  }
}

let searchContext = null;
if (routeResult.search && routeResult.search.needs) {
    const queries = routeResult.search.queries;
    console.log(`🔎 [SEARCH] Queries to search:`, queries);
    broadcast({ type: "search_status", status: "searching", queries }, clientId);
    
    let allFormatted = "";
    for (const q of queries) {
        console.log(`🔎 [SEARCH] Processing query: "${q}"`);
        try {
            const result = await performSearch(q);
            if (result) {
                allFormatted += result + "\n\n";
                console.log(`✅ [SEARCH] Query "${q}" returned results`);
            } else {
                console.warn(`⚠️ [SEARCH] Query "${q}" returned null`);
            }
        } catch (err) {
            console.error(`❌ [SEARCH] Failed for "${q}":`, err.message);
        }
    }
    
    console.log(`📦 [SEARCH] All formatted length: ${allFormatted.length} chars`);
    
    if (allFormatted) {
        searchContext = allFormatted.trim();
        console.log(`✅ [SEARCH] Final searchContext set (${searchContext.length} chars)`);
        broadcast({ type: "search_status", status: "completed" }, clientId);
    } else {
        console.warn(`⚠️ [SEARCH] No results from any query`);
        broadcast({ type: "search_status", status: "failed" }, clientId);
    }
    if (!allFormatted) {
  // محاولة بديلة
  for (const q of queries) {
    const fallbackResult = await performSearchFallback(q);
    if (fallbackResult) allFormatted += fallbackResult + "\n\n";
    }
  }
}

// بعد تعريف executionContext
if (searchContext) {
    executionContext.searchResults = searchContext;
    console.log(`✅ [SEARCH] Stored in executionContext.searchResults`);
    // استخراج مصفوفة النتائج وإرسالها للعميل
const parsedResults = [];
const lines = searchContext.split('\n');
for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\[(\d+)\]\s+(.+)/);
    if (match) {
        const index = parseInt(match[1]);
        const title = match[2].trim();
        const urlLine = lines[++i] || '';
        const url = urlLine.replace('URL: ', '').trim();
        parsedResults.push({ index, title, url });
    }
}
broadcast({ type: "search_results", results: parsedResults }, clientId);
} else {
    console.warn(`⚠️ [SEARCH] searchContext is null, nothing stored`);
}

// أضف أيضًا هذا قبل buildSystemPrompt
console.log(`📤 [SEARCH] Passing searchContext to buildSystemPrompt: ${searchContext ? searchContext.substring(0, 100) + '...' : 'null'}`);

const modelConfig =
  MODEL_CONFIGS[finalModel] || MODEL_CONFIGS['gemini-3-flash'];


let executionMode = "CODE";


if (routeResult.project_structure) {
  executionContext.project_structure = routeResult.project_structure;
  console.log(`📦 Project structure stored for execution: ${routeResult.project_structure.length} files`);
}

// إذا كان الوضع code‑R، نذهب مباشرة للمنظومة الجديدة ونخرج
if (requestedModel === 'codeai-code-r') {
  broadcast({ type: 'stage', text: 'Code‑R is designing the contract...' }, clientId);

  try {
    const projectStructure = executionContext.project_structure || [];
    const editType = routeResult.edit_type || 'build';
executionContext.editType = editType; // يمكن استخدامه لاحقاً

const fullResponse = await executeCodeR({
  message, files, history, settings, visionImages, searchContext,
  projectStructure, clientId, convId, userId,
  editType  // ← معامل جديد
});

    broadcast({ type: 'stream_complete' }, clientId);
    
    // يمكنك حفظ المحادثة هنا أيضًا (اختياري، لأن executeCodeR يحفظ داخليًا)
    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('code-R error:', err);
    broadcast({ type: 'error', text: 'Code‑R process failed' }, clientId);
    return res.status(500).json({ error: err.message });
  }
}



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

  executionContext.thoughtText = displayExplanation;
  
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
  
  
if (requestedModel === "auto") {
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
    
// نرسل الذاكرة + آخر 6 رسائل فقط (مع إزالة الملفات من آخر 2)
const optimizedHistory = recentHistory.map((msg, i) => {
    if (i >= recentHistory.length - 2) {
        return { ...msg, files: [] };
    }
    return msg;
});
console.log("optimizedHistory:", optimizedHistory);


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

/*const built = await buildSystemPrompt({
  routeResult,
  settings,
  taskInfo,
  reasoningSummary,
  visionImages,
  files,
  history,
  message,
  projectStructure: executionContext.project_structure, // ✅ تمرير الهيكل
  searchContext
});*/
// استبدل هذا السطر:

// بهذا:
let built;
if (isNativeMode) {
  // ✅ في الوضع Native: نرسل رسالة بسيطة بدون تعليمات Codeai
  built = await buildNativeSystemPrompt({ 
    message, 
    history: optimizedHistory,  // بدلاً من history
    files, 
    visionImages, 
    convId 
});
} else {
  // ✅ الوضع العادي: نستخدم تعليمات Codeai الكاملة
  built = await buildSystemPrompt({
    routeResult, settings, taskInfo, reasoningSummary,
    visionImages, files, history: optimizedHistory, message,  // استخدم optimizedHistory
    projectStructure: executionContext.project_structure,
    searchContext,
    convId
});
}


systemPrompt = built?.systemPrompt ?? built;
fullPrompt = built?.userParts ?? built?.userPrompt ?? built;

  // داخل app.post('/api/chat')، بعد تجهيز fullPrompt و systemPrompt، استبدل كتلة try/fullResponse بهذا:

    let fullResponse = "";
    let continuationUsed = false;
    let finalModelName = modelConfig.displayName;

    // دالة مساعدة لمعالجة استدعاء النموذج مع دعم الاستمرار
    const processModelCall = async (callType, callOptions) => {
        let response = "";
        let needsContinuation = false;
        let partialResponse = "";
        
        // تعيين حدود التوليد (80% من الحد الأقصى لتجنب القطع المفاجئ)
        const maxTokensLimit = callOptions.keyInfo?.modelConfig?.maxTokens || 1000000;
        const continuationThreshold = Math.floor(maxTokensLimit * 0.8);
        
        // داخل wrappedOnChunk في processModelCall
const wrappedOnChunk = (text) => {
    partialResponse += text;
    
    // ✅ فحص إضافي: هل تم إنشاء عدد كافٍ من الملفات؟
    const generatedFilesCount = (partialResponse.match(/<FILE\s+name="/g) || []).length;
    const plannedFilesCount = executionContext.project_structure?.length || 0;
    
    if (plannedFilesCount > 0 && generatedFilesCount < plannedFilesCount && 
        partialResponse.length >= continuationThreshold && !needsContinuation) {
        needsContinuation = true;
        console.log(`⚠️ [CONTINUATION] File count threshold: ${generatedFilesCount}/${plannedFilesCount} files generated.`);
    }
    
    // الفحص الأصلي للطول
    if (partialResponse.length >= continuationThreshold && !needsContinuation) {
        needsContinuation = true;
        console.log(`⚠️ [CONTINUATION] Length threshold reached...`);
    }
    callOptions.onChunk(text);
};
        
        // داخل processModelCall في server.js

// داخل processModelCall في server.js

// داخل processModelCall في server.js

// في دالة processModelCall داخل server.js
const wrappedOnComplete = (full) => {
    response = full;
    
    // ✅ آلية احتياطية: تحويل Markdown إلى <FILE> تلقائياً
    // التحقق من وجود ```html وعدم وجود علامات <FILE> الخاصة بنا
    if (!response.includes('<FILE') && response.includes('```html')) {
        console.log("⚠️ [FALLBACK] Model used Markdown instead of <FILE>. Converting...");
        
        // استخراج الكود من داخل علامات HTML
        const codeMatch = response.match(/```html\n([\s\S]*?)```/);
        if (codeMatch && codeMatch[1]) {
            const htmlCode = codeMatch[1];
            // إزالة كود HTML من نص الرد
            const textPart = response.replace(/```html[\s\S]*?```/, '').trim();
            
            // إعادة بناء الرد بالصيغة الصحيحة التي يفهمها المحرر
            response = textPart + `\n\n<FILE name="index.html">\n${htmlCode}\n</FILE>`;
            
            console.log("✅ Successfully converted Markdown to <FILE> format.");
        }
    }
    
    // ✅ فحص مزدوج: العلامة أولاً، ثم القطع كاحتياط
    const modelRequestedContinuation = response.includes('<|CONTINUE|>');
    const expectedFileCount = executionContext.project_structure?.length || 0;
const appearsTruncated = !modelRequestedContinuation && checkIfTruncated(response, expectedFileCount);
    
    if (modelRequestedContinuation || appearsTruncated) {
        needsContinuation = true;
        
        if (modelRequestedContinuation) {
            console.log(`✅ [CONTINUATION] Model explicitly requested continuation`);
            response = response.replace(/<\|CONTINUE\|>/g, '');
        } else {
            console.log(`⚠️ [CONTINUATION] Response appears truncated, initiating fallback continuation`);
        }
    }
    
    callOptions.onComplete(response);
};

// دالة مساعدة جديدة

        
        // تنفيذ الاستدعاء الأصلي
        if (callType === 'unified') {
            await sendResponseUnified({
                ...callOptions,
                onChunk: wrappedOnChunk,
                onComplete: wrappedOnComplete,
                signal: callOptions.signal
            });
        } else {
            response = await executeWithFallback({
                ...callOptions,
                onChunk: wrappedOnChunk,
                onComplete: wrappedOnComplete,
                signal: callOptions.signal
            });
        }
        
        // بعد اكتمال الرد الأول، تحقق من الحاجة للاستمرار
        // في دالة processModelCall، استبدل هذا الجزء:
if (needsContinuation && !callOptions.skipContinuation) {
    console.log(`🔄 [CONTINUATION] Initiating continuation process...`);
    
    // ✅ تحديث حالة الملفات (بعد تطبيق تغييرات الرد الأول)
    const updatedFiles = applyFileChangesFromResponse(response, files);
    console.log(`📁 Updated files state for continuation: ${updatedFiles.length} files`);
    
    const continuedResponse = await executeContinuation({
        partialResponse: response,
        filesState: updatedFiles,  // ✅ استخدام الملفات المحدثة
        originalSystemPrompt: systemPrompt,
        clientId,
        convId,
        userId,
        message,
        provider,
        keyInfo: finalKeyInfo,
        modelConfig,
        executionContext,
        continuationCount: 1
    });
    
    response = continuedResponse;
    continuationUsed = true;
    finalModelName = `${modelConfig.displayName} + ${MODEL_CONFIGS[CONTINUATION_MODEL]?.displayName || 'Continuation'}`;
    
    broadcast({ type: "stream_complete" }, clientId);
}
        
        return response;
    };

    try {
        if (!isAutoMode(requestedModel)) {
            // نموذج محدد يدويًا
            // نموذج محدد يدويًا
fullResponse = await processModelCall('unified', {
    model: provider === 'google' ? new GoogleGenerativeAI(finalKeyInfo.token).getGenerativeModel({
        model: finalKeyInfo.modelConfig.modelName,
        generationConfig: {
  maxOutputTokens: modelConfig.maxTokens,
  temperature: modelTemperature,    // ✅ من لوحة التحكم
  topP: modelTopP                   // ✅ من لوحة التحكم
}
    }) : null,
    provider,
    keyInfo: { ...finalKeyInfo, clientId, convId, userId, message },
    prompt: fullPrompt,
    userParts: Array.isArray(fullPrompt) ? fullPrompt : [{ text: fullPrompt || message }], // ✅ تأكد من أنها مصفوفة
    systemPrompt,
    supportsStreaming: finalKeyInfo.modelConfig.supportsStreaming,
    onChunk: (text) => { broadcast({ type: "assistant_message", text }, clientId); },
    onComplete: (full) => {
        broadcast({ type: "session_info", modelName: finalModelName, convId }, clientId);
    },
    maxRetries: 1,
    skipContinuation: false,
    signal: abortController.signal
});
        } else {
            // Auto mode مع fallback
            // Auto mode مع fallback
fullResponse = await processModelCall('fallback', {
    station: (taskInfo && taskInfo.needs_reasoning) ? "C" : "A",
    prompt: fullPrompt,
    userParts: Array.isArray(fullPrompt) ? fullPrompt : [{ text: fullPrompt || message }], // ✅ نفس التصليح
    systemPrompt,
    clientId,
    executionContext,
    onChunk: (text) => { broadcast({ type: "assistant_message", text }, clientId); },
    onComplete: (full) => {
        broadcast({ type: "session_info", modelName: executionContext.usedModels.join(" + "), convId }, clientId);
    },
    skipContinuation: false
});
        }
        
        // داخل app.post('/api/chat')، بعد fullResponse = await processModelCall...
// أضف:

// طباعة إحصائيات التوكنات النهائية
if (fullResponse) {
    const userPromptText = typeof fullPrompt === 'string' ? fullPrompt : JSON.stringify(fullPrompt);
    logTokenStats(
        userPromptText, 
        systemPrompt, 
        fullResponse, 
        `[FINAL - Model: ${finalModelName || modelConfig.displayName}]`
    );
}
         
         // بعد fullResponse = await processModelCall...
if (executionContext.project_structure && executionContext.project_structure.length > 0) {
    const generatedFiles = extractFileNamesFromResponse(fullResponse);
    const pendingFiles = executionContext.project_structure.filter(p => !generatedFiles.includes(p.file));
    
    if (pendingFiles.length > 0) {
        console.log(`🔄 Need to generate ${pendingFiles.length} more files...`);
        
        // بناء prompt خاص للملفات المتبقية
        const continuationPrompt = buildContinuationPromptForRemainingFiles(
            pendingFiles,
            files,
            systemPrompt
        );
        
        const continuedResponse = await executeContinuation({
            partialResponse: fullResponse,
            filesState: files,
            originalSystemPrompt: continuationPrompt.systemPrompt,
            clientId, convId, userId, message, provider,
            keyInfo: finalKeyInfo, modelConfig, executionContext,
            continuationCount: 1
        });
        
        fullResponse = continuedResponse;
    }
}
        
        // ✅ حفظ الرد النهائي (بعد دمج الاستمرار إن وجد)
        const extractedTasks = extractTasksFromResponse(fullResponse);
        // تجميع الملفات الحالية مع الملفات الجديدة من الرد
let updatedFiles = applyFileChangesFromResponse(fullResponse, files);
// الآن updatedFiles يحتوي على كل الملفات (القديمة + الجديدة)

const filesSnapshot = updatedFiles.map(file => ({
    name: file.name,
    content: file.content,
    type: file.type || getMimeType(file.name)
}));

// استخدم updatedFiles و filesSnapshot في saveToSupabase

        
        broadcast({ 
    type: "assistant_message", 
    text: "\n[STREAM COMPLETE]" 
}, clientId);

// ✅ وأيضاً إرسال حدث stream_complete منفصل للتأكيد
broadcast({ 
    type: "stream_complete" 
}, clientId);

await saveToSupabase(
    userId, 
    convId, 
    message, 
    fullResponse,
    updatedFiles,          // ✅ القائمة الكاملة للملفات
    finalModelName,
    executionContext.thoughtText,
    extractedTasks,
    filesSnapshot          // ✅ لقطة حديثة للملفات
);
        

        // ✅ [إضافة جديدة] تحديث عنوان المحادثة تلقائياً بعد أول رد حقيقي
        try {
            const { data: convData } = await supabase
                .from('conversations')
                .select('title')
                .eq('id', convId)
                .single();

            if (convData) {
                const defaultTitle = (message || 'Document').slice(0, 50);
                // نُحدّث فقط إذا كان العنوان ما زال افتراضيًا (لم يُخصّص بعد)
                if (convData.title === defaultTitle) {
                    const summarizedTitle = await summarizeConversationWithGemma(convId, message, fullResponse);
                    if (summarizedTitle && summarizedTitle.length > 2 && summarizedTitle !== defaultTitle) {
                        await supabase
                            .from('conversations')
                            .update({ title: summarizedTitle })
                            .eq('id', convId);

                        // إشعار الواجهة الأمامية بالتحديث
                        broadcast({
                            type: 'conversation_summary',
                            convId: convId,
                            title: summarizedTitle
                        }, clientId);
                        console.log(`✅ Conversation title updated to: "${summarizedTitle}"`);
                    }
                }
            }
        } catch (titleErr) {
            console.warn("⚠️ Could not update conversation title:", titleErr.message);
        }
        
    } catch (err) {
        // ... (نفس منطق الأخطاء السابق)
    console.error(`❌ ===== REQUEST FAILED =====`);
    console.error(`🔧 Error details:`, err.message);
    console.error(`🔧 Stack:`, err.stack?.substring(0, 300));
    console.error("❌ Generation Error:", err);
    
    broadcast({ 
        type: "assistant_message", 
        text: "\n[STREAM COMPLETE]" 
    }, clientId);
    broadcast({ 
        type: "stream_complete" 
    }, clientId);
    
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


// ========= Sanbox Execution =========


// دالة لإنشاء sandbox وتشغيله
app.post('/api/sandbox/create', async (req, res) => {
    const { language, files } = req.body;
    if (!language || !files) {
        return res.status(400).json({ error: 'language and files are required' });
    }

    const sandboxId = uuidv4();
    const sandboxDir = path.join(os.tmpdir(), `sandbox_${sandboxId}`);
    
    try {
        // 1. إنشاء مجلد مؤقت
        fs.mkdirSync(sandboxDir, { recursive: true });

        // 2. كتابة الملفات
        for (const file of files) {
            const filePath = path.join(sandboxDir, file.name);
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filePath, file.content, 'utf8');
        }

        // 3. تحديد الأمر المناسب للتشغيل
        let command = '';
        let args = [];

        switch (language) {
            case 'python':
                command = 'python3';
                args = [files[0].name];  // يشغل أول ملف .py
                break;
            case 'nodejs':
            case 'react':
            case 'vue':
                command = 'node';
                args = [files[0].name];  // يشغل الملف الأول
                break;
            case 'go':
                command = 'go';
                args = ['run', files[0].name];
                break;
            case 'rust':
                command = 'rustc';
                args = [files[0].name, '-o', 'sandbox_bin'];
                await execFile(command, args, { cwd: sandboxDir, timeout: 10000 });
                command = './sandbox_bin';
                args = [];
                break;
            case 'bash':
                command = 'bash';
                args = [files[0].name];
                break;
            default:
                return res.status(400).json({ error: `Unsupported language: ${language}` });
        }

        // 4. تشغيل العملية مع حماية (timeout 10 ثواني)
        const result = await new Promise((resolve, reject) => {
            const proc = spawn(command, args, {
                cwd: sandboxDir,
                timeout: 10000,
                env: { ...process.env }
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                resolve({ stdout, stderr, code });
            });

            proc.on('error', (err) => {
                reject(err);
            });
        });

        // 5. تنظيف الملفات المؤقتة
        fs.rmSync(sandboxDir, { recursive: true, force: true });

        // 6. إرجاع النتيجة
        const output = (result.stdout + result.stderr).trim();
        const previewUrl = null; // الإصدار الحالي لا يدعم preview URL للمشاريع المبنية

        res.json({
            success: true,
            output,
            previewUrl,
            sandboxId
        });

    } catch (error) {
        console.error("Sandbox error:", error);
        // تنظيف حتى في حالة الخطأ
        if (fs.existsSync(sandboxDir)) {
            fs.rmSync(sandboxDir, { recursive: true, force: true });
        }
        res.status(500).json({
            success: false,
            error: error.message,
            output: error.stderr || error.message
        });
    }
});



// ---- // DATA MANAGMENT \\ ---- \\



app.post('/api/check-nickname', async (req, res) => {
    const { nickname } = req.body;
    
    if (!nickname) {
        return res.status(400).json({ error: 'Nickname required' });
    }
    
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('nickname')
            .eq('nickname', nickname)
            .maybeSingle(); // استخدام maybeSingle بدلاً من single لتجنب خطأ 404
        
        // إذا وجدنا بيانات، الاسم موجود
        res.json({ exists: !!data });
        
    } catch (err) {
        console.error("❌ Error checking nickname:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/update-nickname
app.post('/api/update-nickname', async (req, res) => {
  const userId = req.userId || req.body.userId;
  const { nickname } = req.body;

  if (!userId || !nickname) {
    return res.status(400).json({ error: 'userId and nickname required' });
  }

  try {
    // التحقق من عدم وجود nickname مكرر (باستثناء المستخدم نفسه)
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('nickname', nickname)
      .neq('id', userId)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: 'Nickname already taken' });
    }

    // تحديث الاسم
    const { error } = await supabase
      .from('profiles')
      .update({ nickname, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) throw error;

    res.json({ success: true, nickname });
  } catch (err) {
    console.error('❌ Error updating nickname:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ensure-user
app.post('/api/ensure-user', async (req, res) => {
    const userId = req.userId || req.body.userId;
    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }
    
    try {
        await ensureUser(userId);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ Error ensuring user:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/register - تسجيل مستخدم جديد
app.post('/api/register', async (req, res) => {
    const { nickname } = req.body;
    const userId = req.userId;
    if (!userId || !nickname) {
        return res.status(400).json({ error: 'UserId and nickname required' });
    }
    
    try {
        // 1. التأكد من وجود المستخدم في جدول users
        await ensureUser(userId);
        
        // 2. التحقق من عدم وجود nickname مكرر (إذا أردت فريداً)
        // إذا كنت لا تريد أن يكون فريداً، احذف هذا الجزء
        const { data: existing } = await supabase
            .from('profiles')
            .select('nickname')
            .eq('nickname', nickname)
            .maybeSingle();
        
        if (existing) {
            return res.status(409).json({ error: 'Nickname already taken' });
        }
        
        // 3. إنشاء الملف الشخصي
        const { error } = await supabase
            .from('profiles')
            .insert({
                id: userId,
                nickname: nickname
            });
        
        if (error) throw error;
        
        res.json({ success: true, nickname: nickname });
        
    } catch (err) {
        console.error("❌ Error registering user:", err);
        res.status(500).json({ error: err.message });
    }
});



// GET /api/user?userId=xxx
// GET /api/user?userId=xxx
app.get('/api/user', async (req, res) => {
    const userId = req.userId;
    
    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }
    
    try {
        // جلب المحادثات
        const { data: conversations, error: convError } = await supabase
            .from('conversations')
            .select('id, title, created_at, updated_at')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });
        
        if (convError) throw convError;
        
        // جلب إعدادات المستخدم
        const { data: userData } = await supabase
            .from('users')
            .select('settings')
            .eq('id', userId)
            .single();
        
        // ✅ جلب nickname من جدول profiles
        const { data: profile } = await supabase
            .from('profiles')
            .select('nickname')
            .eq('id', userId)
            .single();
        
        res.json({
            conversations: conversations || [],
            settings: userData?.settings || {},
            nickname: profile?.nickname || null
        });
        
    } catch (err) {
        console.error("❌ Error fetching user data:", err);
        res.status(500).json({ error: err.message });
    }
});


// أضف هذا في server.js بعد تعريف الدوال الموجودة

// ==========================================
// API: Welcome Messages Generator
// ==========================================
// ==========================================
// API: Welcome Messages Generator (Bilingual using Gemma 27B)
// ==========================================
app.post('/api/welcome-messages', async (req, res) => {
    const { language = 'en' } = req.body;
    
    try {
        // الحصول على مفتاح لـ Gemma (نفس مفاتيح Gemini)
        const gemmaKeyInfo = getSafeKey('gemma');
        
        if (!gemmaKeyInfo) {
            console.log("⚠️ No Gemma key available, using fallback");
            const fallbackMessages = {
                en: [
                    "✨ How can I help you today?",
                    "🚀 Ready to build something awesome!",
                    "💻 Let's write beautiful code together",
                    "🎯 What's your project today?",
                    "🤖 I'm here for you!"
                ],
                ar: [
                    "✨ كيف يمكنني مساعدتك اليوم؟",
                    "🚀 جاهز لبناء شيء رائع!",
                    "💻 لنكتب كوداً جميلاً معاً",
                    "🎯 ما هو مشروعك اليوم؟",
                    "🤖 أنا هنا لأجلك!"
                ]
            };
            return res.json({ messages: fallbackMessages });
        }
        
        // ✅ استخدام نموذج Gemma 3 27B
        const modelName = 'gemma-4-31b-it';  // 27B model
        
        const prompt = `You are a creative assistant for a coding app called Codeai. Generate 10 unique, warm, engaging welcome messages.

IMPORTANT: You MUST generate EXACTLY 10 messages:
- First 5 messages in ENGLISH
- Next 5 messages in ARABIC

Each message should be:
- Short (max 8 words)
- Friendly and warm tone
- Completely DIFFERENT from each other
- Each message should be a question, like: How can i help you today?
- only one message in each language must be not a question
- Related to coding, programming, building projects, or about anything thay doesn't related to coding 

Return ONLY valid JSON array with 10 strings, no extra text, no markdown.
Example format: ["English msg 1", "English msg 2", "English msg 3", "English msg 4", "English msg 5", "Arabic msg 1", "Arabic msg 2", "Arabic msg 3", "Arabic msg 4", "Arabic msg 5"]

Make them creative, varied, and natural!
*NEVER* Use emojis`;

        console.log("📡 Calling Gemma API for welcome messages...");
        
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': gemmaKeyInfo.token
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: 0.85,     // درجة عشوائية عالية للتنوع
                        maxOutputTokens: 350,
                        topP: 0.95,
                        topK: 40
                    }
                })
            }
        );
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Gemma  PI error: ${response.status} - ${errorText.substring(0, 200)}`);
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        console.log("📝 Raw Gemma response:", text);
        
        // استخراج JSON من الرد
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        let allMessages = [];
        
        if (jsonMatch) {
            try {
                allMessages = JSON.parse(jsonMatch[0]);
                if (!Array.isArray(allMessages) || allMessages.length !== 10) {
                    console.warn(`⚠️ Expected 10 messages, got ${allMessages.length}`);
                    throw new Error('Invalid format');
                }
            } catch (e) {
                console.error("❌ JSON parse error:", e.message);
                allMessages = [];
            }
        }
        
        // التحقق من صحة النصوص
        if (allMessages.length === 10) {
            const englishMessages = allMessages.slice(0, 5);
            const arabicMessages = allMessages.slice(5, 10);
            
            // تنظيف النصوص من العلامات الزائدة
            const cleanEnglish = englishMessages.map(msg => 
                msg.replace(/^["'`]|["'`]$/g, '')
                  .replace(/[.,!?]$/, '')
                  .trim()
            );
            const cleanArabic = arabicMessages.map(msg => 
                msg.replace(/^["'`]|["'`]$/g, '')
                  .replace(/[.,!?]$/, '')
                  .trim()
            );
            
            const result = {
                en: cleanEnglish,
                ar: cleanArabic
            };
            
            console.log("🎨 Generated welcome messages from Gemma:", result);
            
            // تحديث الاستخدام
            const tokens = estimateTokens(prompt + JSON.stringify(allMessages));
            updateUsage(gemmaKeyInfo.id, 'gemma', tokens);
            
            return res.json({ messages: result });
        } else {
            console.log("⚠️ Invalid messages from API, using fallback");
            throw new Error('Invalid messages count');
        }
        
    } catch (error) {
        console.error("❌ Welcome messages error:", error.message);
        // Fallback messages متنوعة
        const fallbackMessages = {
            en: [
                "✨ How can I help you today?",
                "🚀 Ready to build something awesome!",
                "💻 Let's write beautiful code together",
                "🎯 What's your project today?",
                "🤖 I'm here for you!"
            ],
            ar: [
                "✨ كيف يمكنني مساعدتك اليوم؟",
                "🚀 جاهز لبناء شيء رائع!",
                "💻 لنكتب كوداً جميلاً معاً",
                "🎯 ما هو مشروعك اليوم؟",
                "🤖 أنا هنا لأجلك!"
            ]
        };
        res.json({ messages: fallbackMessages });
    }
});

const FREE_DAILY_LIMIT = 10;
const MAX_BONUS_QUOTA = 5;

app.get('/api/user-limits', async (req, res) => {
    const userId = req.userId || req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    
    try {
        await ensureUser(userId);
        
        const { data, error } = await supabase
            .from('user_limits')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();
        
        if (error) throw error;
        
        if (!data) {
            const today = new Date().toISOString().split('T')[0];
            const newRecord = { user_id: userId, daily_count: 0, last_reset_date: today, streak: 1, last_active_date: today, bonus_quota: 1 };
            await supabase.from('user_limits').insert(newRecord);
            return res.json(newRecord);
        }
        
        const today = new Date().toISOString().split('T')[0];
        if (data.last_reset_date !== today) {
            const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            const wasActiveYesterday = data.last_active_date === yesterdayStr;
            const newStreak = wasActiveYesterday ? Math.min(data.streak + 1, MAX_BONUS_QUOTA) : 1;
            const newBonusQuota = Math.min(newStreak, MAX_BONUS_QUOTA);
            const updated = { daily_count: 0, last_reset_date: today, streak: newStreak, last_active_date: today, bonus_quota: newBonusQuota };
            await supabase.from('user_limits').update(updated).eq('user_id', userId);
            return res.json({ ...data, ...updated });
        }
        
        res.json(data);
    } catch (err) {
        console.error("❌ Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/increment-usage', async (req, res) => {
    const userId = req.userId || req.body.userId;
    
    // ✅ سجل واضح للوصول
    console.log('\n' + '='.repeat(70));
    console.log('📊 [USAGE-API] ===== INCREMENT USAGE CALLED =====');
    console.log('📊 [USAGE-API] Time:', new Date().toISOString());
    console.log('📊 [USAGE-API] userId from auth:', req.userId);
    console.log('📊 [USAGE-API] userId from body:', req.body.userId);
    console.log('📊 [USAGE-API] Final userId used:', userId);
    console.log('📊 [USAGE-API] Is user registered?', !!req.userId);
    
    if (!userId) {
        console.log('❌ [USAGE-API] No userId provided - REJECTED');
        console.log('='.repeat(70) + '\n');
        return res.status(400).json({ error: 'userId required' });
    }
    
    try {
        // ✅ تأكد من وجود المستخدم
        await ensureUser(userId);
        console.log('📊 [USAGE-API] User ensured in database');
        
        const today = new Date().toISOString().split('T')[0];
        console.log('📊 [USAGE-API] Today\'s date:', today);
        
        // ✅ استخدم supabaseAdmin بدلاً من supabase لتجاوز RLS
        const { data, error: fetchError } = await supabaseAdmin
            .from('user_limits')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();
        
        if (fetchError) {
            console.log('❌ [USAGE-API] Failed to fetch limits:', fetchError.message);
            throw fetchError;
        }
        
        console.log('📊 [USAGE-API] Current data from DB:', JSON.stringify(data));
        
        // إذا لم توجد بيانات أو تاريخ مختلف
        if (!data || data.last_reset_date !== today) {
            console.log('📊 [USAGE-API] No data or new day - creating/resetting record');
            
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            const wasActiveYesterday = data?.last_active_date === yesterdayStr;
            const oldStreak = data?.streak || 0;
            
            const newStreak = wasActiveYesterday ? Math.min(oldStreak + 1, MAX_BONUS_QUOTA) : 1;
            const newBonusQuota = Math.min(newStreak, MAX_BONUS_QUOTA);
            
            console.log('📊 [USAGE-API] New streak:', newStreak, 'Bonus quota:', newBonusQuota);
            
            const newRecord = {
                user_id: userId,
                daily_count: 1,
                last_reset_date: today,
                streak: newStreak,
                last_active_date: today,
                bonus_quota: newBonusQuota,
                updated_at: new Date().toISOString()
            };
            
            console.log('📊 [USAGE-API] Upserting record:', JSON.stringify(newRecord));
            
            // ✅ استخدم supabaseAdmin
            const { error: upsertError } = await supabaseAdmin
                .from('user_limits')
                .upsert(newRecord);
            
            if (upsertError) {
                console.log('❌ [USAGE-API] Upsert failed:', upsertError.message);
                throw upsertError;
            }
            
            console.log('✅ [USAGE-API] Record created/updated successfully');
            console.log('='.repeat(70) + '\n');
            
            return res.json(newRecord);
        }
        
        // زيادة العداد ليوم قائم
        const newCount = data.daily_count + 1;
        console.log('📊 [USAGE-API] Incrementing count from', data.daily_count, 'to', newCount);
        
        // ✅ استخدم supabaseAdmin
        const { error: updateError } = await supabaseAdmin
            .from('user_limits')
            .update({
                daily_count: newCount,
                last_active_date: today,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);
        
        if (updateError) {
            console.log('❌ [USAGE-API] Update failed:', updateError.message);
            throw updateError;
        }
        
        const result = { ...data, daily_count: newCount };
        console.log('✅ [USAGE-API] Count updated successfully. New count:', newCount);
        console.log('='.repeat(70) + '\n');
        
        res.json(result);
        
    } catch (err) {
        console.error('❌ [USAGE-API] Error:', err.message);
        console.log('='.repeat(70) + '\n');
        res.status(500).json({ error: err.message });
    }
});

// GET /api/conversation?convId=xxx&userId=xxx
app.get('/api/conversation', async (req, res) => {
  const { convId } = req.query;
  const userId = req.userId;
  if (!convId || !userId) {
    return res.status(400).json({ error: 'convId and userId required' });
  }
  
  try {
    // 1. التحقق من صلاحية المستخدم
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', convId)
      .eq('user_id', userId)
      .single();
    
    if (convError || !conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    // 2. جلب الرسائل (مع model و thought)
    const { data: messages } = await supabase
  .from('messages')
  .select('id, role, content, model, thought, tasks, files_snapshot, created_at, parent_id, reply_index, is_latest')
  .eq('conv_id', convId)
  .order('created_at', { ascending: true })
  .order('id', { ascending: true });  // ✅ ترتيب تصاعدي
  .order('id', { ascending: true });  
    
    // 3. جلب الملفات
    const { data: files } = await supabase
      .from('files')
      .select('id, name, content, url, preview_url, preview_urls, type, created_at')
      .eq('conv_id', convId)
      .order('created_at', { ascending: true });
    
    res.json({
      conversation: conv,
      messages: messages || [],
      files: files || []
    });
    
  } catch (err) {
    console.error("❌ Error fetching conversation:", err);
    res.status(500).json({ error: err.message });
  }
});



// POST /api/conversation
app.post('/api/conversation', async (req, res) => {
  const { conversation } = req.body;
  const userId = req.userId;
  if (!userId || !conversation) {
    return res.status(400).json({ error: 'userId and conversation required' });
  }
  
  try {
    const { id, title, messages, files } = conversation;
    
    // تأكد من وجود المستخدم
    await ensureUser(userId);
    
    // حفظ المحادثة
    const { error: convError } = await supabase
      .from('conversations')
      .upsert({
        id: id,
        user_id: userId,
        title: title,
        updated_at: new Date().toISOString()
      });
    
    if (convError) throw convError;
    
    // حفظ الرسائل (حذف القديمة وإضافة الجديدة)
    if (messages && messages.length) {
      // حذف الرسائل القديمة
      await supabase
        .from('messages')
        .delete()
        .eq('conv_id', id);
      
      // إضافة الرسائل الجديدة
      // داخل POST /api/conversation، في حلقة إضافة الرسائل:
      
for (const msg of messages) {
  await supabase.from('messages').insert({
    conv_id: id,
    role: msg.role,
    content: msg.content,
    model: msg.model || null,
    thought: msg.thought || null,
    tasks: msg.tasks || null,
    files_snapshot: msg.filesSnapshot || null,
    parent_id: msg.parent_id || null,
    reply_index: msg.reply_index || 0,
    is_latest: msg.is_latest !== undefined ? msg.is_latest : true,
    created_at: msg.created_at || new Date().toISOString()
  });
}
    }
    
    // حفظ الملفات
    if (files && files.length) {
      // حذف الملفات القديمة
      await supabase
        .from('files')
        .delete()
        .eq('conv_id', id);
      
      // إضافة الملفات الجديدة
      for (const file of files) {
        await supabase.from('files').insert({
          conv_id: id,
          name: file.name,
          content: file.content || null,
          url: file.url || null,
          preview_url: file.previewUrl || null,
          preview_urls: file.previewUrls || null,
          type: file.type || null,
          created_at: file.created_at || new Date().toISOString()
        });
      }
    }
    
    res.json({ success: true });
    
  } catch (err) {
    console.error("❌ Error saving conversation:", err);
    res.status(500).json({ error: err.message });
  }
});



// DELETE /api/conversation?convId=xxx&userId=xxx
app.delete('/api/conversation', async (req, res) => {
  const { convId } = req.query;
  const userId = req.userId;
  if (!convId || !userId) {
    return res.status(400).json({ error: 'convId and userId required' });
  }
  
  try {
    // التحقق من الصلاحية
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', convId)
      .eq('user_id', userId)
      .single();
    
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    // الحذف (CASCADE ستحذف messages و files تلقائياً)
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', convId);
    
    if (error) throw error;
    
    res.json({ success: true });
    
  } catch (err) {
    console.error("❌ Error deleting conversation:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// FEEDBACK API
// ==========================================

// POST /api/feedback - حفظ تقييم
app.post('/api/feedback', async (req, res) => {
  const userId = req.userId;
  const { conversationId, messageId, feedbackType, reasons, comment } = req.body;

  if (!userId || !conversationId || !messageId || !feedbackType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // التحقق من وجود التقييم مسبقاً
    const { data: existing } = await supabase
      .from('feedback')
      .select('id')
      .eq('user_id', userId)
      .eq('conversation_id', conversationId)
      .eq('message_id', messageId)
      .maybeSingle();

    if (existing) {
      // تحديث التقييم الموجود
      const { error } = await supabase
        .from('feedback')
        .update({
          feedback_type: feedbackType,
          reasons: reasons || [],
          comment: comment || '',
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      if (error) throw error;
      return res.json({ success: true, updated: true });
    } else {
      // إنشاء تقييم جديد
      const { error } = await supabase
        .from('feedback')
        .insert({
          user_id: userId,
          conversation_id: conversationId,
          message_id: messageId,
          feedback_type: feedbackType,
          reasons: reasons || [],
          comment: comment || '',
          created_at: new Date().toISOString()
        });
      if (error) throw error;
      return res.json({ success: true, created: true });
    }
  } catch (err) {
    console.error('❌ Feedback error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/feedback - حذف تقييم
app.delete('/api/feedback', async (req, res) => {
  const userId = req.userId;
  const { conversationId, messageId } = req.body;

  if (!userId || !conversationId || !messageId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const { error } = await supabase
      .from('feedback')
      .delete()
      .eq('user_id', userId)
      .eq('conversation_id', conversationId)
      .eq('message_id', messageId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Delete feedback error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/feedback-status?userId=xxx&convId=xxx
app.get('/api/feedback-status', async (req, res) => {
  const userId = req.userId || req.query.userId;
  const convId = req.query.convId;
  if (!userId || !convId) {
    return res.status(400).json({ error: 'userId and convId required' });
  }
  try {
    const { data, error } = await supabase
      .from('feedback')
      .select('message_id, feedback_type')
      .eq('user_id', userId)
      .eq('conversation_id', convId);
    if (error) throw error;
    const result = {};
    data.forEach(item => { result[item.message_id] = item.feedback_type; });
    res.json(result);
  } catch (err) {
    console.error('❌ Feedback status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SHARE API
// ==========================================
app.post('/api/share', async (req, res) => {
  const userId = req.userId;
  const { conversationId, messageId, messageContent, modelName } = req.body;
  if (!userId || !conversationId || !messageId || !messageContent) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const shareCode = uuidv4().slice(0, 8); // رمز قصير
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 يوم
    const { error } = await supabase
      .from('shared_messages')
      .insert({
        share_code: shareCode,
        conversation_id: conversationId,
        message_id: messageId,
        message_content: messageContent,
        model_name: modelName || 'Unknown',
        user_id: userId,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString()
      });
    if (error) throw error;
    res.json({ shareCode });
  } catch (err) {
    console.error('❌ Share error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/share/:code - يستخدم لعرض الرسالة المشتركة (صفحة عامة)
app.get('/api/share/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const { data, error } = await supabase
      .from('shared_messages')
      .select('message_content, model_name, created_at')
      .eq('share_code', code)
      .single();
    if (error || !data) {
      return res.status(404).send('Shared message not found or expired');
    }
    // يمكن إرجاع JSON أو HTML بسيط
    res.json(data);
  } catch (err) {
    console.error('❌ Get share error:', err);
    res.status(500).json({ error: err.message });
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

// API لإيقاف التوليد الجاري
app.post('/api/stop', (req, res) => {
  const { clientId, convId } = req.body;
  if (!clientId || !convId) {
    return res.status(400).json({ error: 'clientId and convId required' });
  }
  const key = `${clientId}_${convId}`;
  const controller = activeRequests.get(key);
  if (controller) {
    console.log(`🛑 Stopping generation for ${key}`);
    controller.abort();
    // إرسال إشعار للعميل بأنه تم الإيقاف
    broadcast({
      type: 'stream_stopped',
      message: 'Generation stopped by user'
    }, clientId);
    activeRequests.delete(key);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'No active generation found' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

