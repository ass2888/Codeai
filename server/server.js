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
const execPromise = util.promisify(exec);


const supabase = createClient(
  process.env.S_URL,
  process.env.S_KEY
);

// ---- // SAVING // ---- //

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
     modelName: "gemma-3-27b-it",
     maxTokens: 1000000,
     temperature: 0.3,
     supportsStreaming: false,
     displayName: "Gemma 3 27B"
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

// ==========================================
// 1. إضافة متغيرات التحكم (في بداية الملف بعد المتغيرات العامة)
// ==========================================
const CONTINUATION_DELAY_MS = 3000; // 3 ثوانٍ قابلة للتغيير
const MAX_CONTINUATIONS = 2;        // نموذج أولي + نموذج ثانوي فقط حاليًا
const CONTINUATION_MODEL = 'llama-3.1-instant'; // النموذج المخصص للإكمال

// ==========================================
// 2. دالة بناء Prompt الاستمرار (فكرة 4)
// ==========================================
function buildContinuationPrompt(partialResponse, filesState, originalSystemPrompt) {
    // نأخذ آخر 2000 حرف لتجنب إرسال سياق طويل جدًا
    const lastChunk = partialResponse.slice(-2000);
    
    // تحويل حالة الملفات إلى نص مفهوم
    const filesContext = filesState.map(f => 
        `--- FILE: ${f.name} ---\n${f.content}\n--- END FILE ---`
    ).join('\n\n');

    return {
        systemPrompt: `You are a CONTINUATION assistant. Your job is to EXACTLY continue a previous AI response that was cut off due to length limits.

CRITICAL RULES:
1. DO NOT introduce yourself or start a new conversation.
2. DO NOT repeat any text that was already generated.
3. DO NOT output explanations, greetings, or summaries.
4. Continue generating from the EXACT point where the previous response stopped.
5. Maintain the exact same coding style, formatting, and file structure.
6. Complete all unfinished code blocks, functions, or file edits.
7. Use the same FILE/REPLACE/ADD_TO tags as the original response.

The user has already seen this part of the response:
---
${lastChunk}
---

Current project files state (after applying changes from the first part):
---
${filesContext}
---

Continue generating the rest of the response now. Start immediately with the next character that would have followed the above text.`,
        
        userPrompt: `Continue the response from exactly where it stopped. Do not add any introductory text.`
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

async function buildCodeSystemPrompt({
  routeResult,
    settings,
    taskInfo,
    reasoningSummary,
    visionImages,
    files,
    history,
    message,
    projectStructure
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
- If you reach your output limit, use the <|CONTINUE|> marker at the exact point of interruption.
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
// 3. تعليمات النظام الجديدة
    const systemInstruction = `You are an expert, friendly web developer.


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
10. **ALWAYS ADD 4-7 extra features the user didn't ask for but would love**
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

return {
  systemPrompt: `${systemInstruction}\n\n${taskPromptContext}\n\n${internalGuidance}`,
  userParts
};
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
    message
  } = ctx;

  // ⛔️ الأسئلة العامة
  if (routeResult.task_type === "general") {
    const systemPrompt = `
    You are a helpful assistant.
Answer clearly and directly.
Language: respond in user's language.

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
    
    // تجميع userPrompt الكامل
    userPrompt = `${visionContext}${historyText ? `\n--- CONVERSATION CONTEXT ---\n${historyText}\n` : ''}${filesContext ? `\n--- PROJECT FILES ---\n${filesContext}\n` : ''}${attachedFilesContext ? `\n${attachedFilesContext}\n` : ''}--- CURRENT USER MESSAGE ---\n${message}`;
    
    return { systemPrompt, userPrompt };
  }

  // 📄 توليد ملفات
  if (["pdf", "pptx", "docx"].includes(routeResult.task_type)) {
    const systemPrompt = `
You are an enthusiastic and interactive document generation and editing engine.

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
            const role = msg.role === 'user' ? 'User' : 'Assistant';
            const text = msg.text || msg.content || '';
            return `[${role}]: ${text.substring(0, 500)}`;
        }).join("\n");
    }
    
    // تجميع userPrompt الكامل
    userPrompt = `${visionContext}${historyText ? `\n--- CONVERSATION HISTORY ---\n${historyText}\n` : ''}${attachedFilesContext ? `\n--- ATTACHED FILES TO MODIFY ---\n${attachedFilesContext}\n` : ''}--- CURRENT USER REQUEST ---\n${message}\n\nIMPORTANT: You MUST output ONLY JSON. The user_message field should be enthusiastic and interactive!`;
    
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
  message,
  projectStructure // ✅ تمرير الهيكل
});
}

function checkIfTruncated(text) {
    // الفحص الأساسي: هل النموذج طلب الاستمرار بنفسه؟
    if (text.includes('<|CONTINUE|>')) {
        return true;
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
             if (abortController.signal.aborted) {
          console.log("🛑 Google stream aborted by user");
          break;
             }
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
  const text = await apiFunction(keyInfo, messages, signal);

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

async function callGroqAPI(keyInfo, messages, signal = null) {
  const controller = new AbortController();
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }
  
  const requestBody = {
    model: keyInfo.modelConfig.modelName,
    messages,
    temperature: keyInfo.modelConfig.temperature,
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
async function callOpenRouterAPI(keyInfo, messages, signal = null) {
  const controller = new AbortController();
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }
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
            'https://generativelanguage.googleapis.com/v1beta/models/gemma-3-1b-it:generateContent',
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

async function callDeepSeekAPI(keyInfo, messages, signal = null) {
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
      temperature: keyInfo.modelConfig.temperature,
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

async function routeTaskMandatory(message, history = [], files = [], clientId = null) {
  // بناء سياق المحادثة من history
  let historyContext = "";
  if (history && history.length > 0) {
    const lastMessages = history.slice(-4); // آخر 4 رسائل للسياق
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

Return ONLY valid JSON. No markdown. No explanations.

JSON format:
{
  "is_code_related": true/false,
  "task_type": "code" | "general" | "pdf" | "pptx" | "docx",
  "project_structure": []  // ONLY include if task_type is "code"
}

DETECTION RULES:
- If user asks to CREATE a document: "create a PDF", "make a PowerPoint", "create a Word document" → task_type = pdf/pptx/docx
- If user asks to MODIFY/EDIT an existing document: "edit this document", "add more text", "make it longer", "improve this file" → task_type = pdf/pptx/docx
- If user asks about code or programming → task_type = "code"
- If user asks general questions → task_type = "general"

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
User: "create a PDF about AI" → {"is_code_related": false, "task_type": "pdf"}
User: "what is AI?" → {"is_code_related": false, "task_type": "general"}
User: "write a function in JavaScript" → {"is_code_related": true, "task_type": "code", "project_structure": []}
User: "make me a chess game" → {"is_code_related": true, "task_type": "code", "project_structure": [{"file": "index.html", "description": "Main chess board"}, {"file": "css/chess.css", "description": "Chess board styling"}, {"file": "js/chess.js", "description": "Chess game logic"}]}
`;

  // استخدم نموذج خفيف وسريع
  const modelId = "gemma";
  const modelConfig = MODEL_CONFIGS[modelId];
  const keyInfo = getSafeKeyForModel(modelId);

  const genAI = new GoogleGenerativeAI(keyInfo.token);
  const model = genAI.getGenerativeModel({
    model: modelConfig.modelName,
    generationConfig: { temperature: 0, maxOutputTokens: 400 }
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  console.log("TASK RESULTS: ", text);
  
  try {
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found");
    
    const parsed = JSON.parse(match[0]);
    
    // ✅ إرسال project_structure إلى العميل إذا كانت المهمة كود
    if (parsed.task_type === "code" && parsed.project_structure) {
      console.log(`📋 [PLANNER] Project structure: ${parsed.project_structure.length} files`);
      
      // إرسال هيكل المشروع للعميل
      return {
       ...parsed,
       project_structure: parsed.project_structure // ✅ تمرير الهيكل داخلياً
      };
    }
    
    return parsed;
    
  } catch (error) {
    console.log("[[[ERROR in parsing tasks..]]] using fallback");
    // fallback ذكي: تحقق من وجود كلمات مفتاحية في السياق والملفات
    const fullContext = (historyContext + " " + message + " " + filesInfo).toLowerCase();
    
    // تحقق من وجود ملفات DOCX/PPTX/PDF مع طلب تعديل
    if ((fullContext.includes('docx') || fullContext.includes('word')) && 
        (fullContext.includes('اضف') || fullContext.includes('عدل') || fullContext.includes('زيد') || fullContext.includes('more') || fullContext.includes('add'))) {
      return { is_code_related: false, task_type: "docx" };
    }
    if ((fullContext.includes('pptx') || fullContext.includes('powerpoint') || fullContext.includes('باوربوينت')) && 
        (fullContext.includes('اضف') || fullContext.includes('عدل') || fullContext.includes('زيد'))) {
      return { is_code_related: false, task_type: "pptx" };
    }
    if (fullContext.includes('pdf') && 
        (fullContext.includes('اضف') || fullContext.includes('عدل') || fullContext.includes('زيد'))) {
      return { is_code_related: false, task_type: "pdf" };
    }
    
    // إذا كان هناك ملفات من نوع docx/pptx/pdf والرسالة تدل على تعديل
    if (files && files.some(f => f.type === 'docx' || f.type === 'pptx' || f.type === 'pdf')) {
      const firstDocType = files.find(f => f.type === 'docx' || f.type === 'pptx' || f.type === 'pdf')?.type;
      if (firstDocType) return { is_code_related: false, task_type: firstDocType };
    }
    
    // ✅ إنشاء project_structure افتراضي للمشاريع الجديدة
    const isNewProject = message.includes('اصنع') || message.includes('create') || message.includes('build') || message.includes('make');
    const isGame = message.includes('لعبة') || message.includes('game');
    
    let project_structure = [];
    if (isNewProject && isGame) {
      project_structure = [
        {"file": "index.html", "description": "Main HTML structure"},
        {"file": "css/style.css", "description": "Game styling"},
        {"file": "js/game.js", "description": "Core game logic"},
        {"file": "js/ui.js", "description": "UI and score display"}
      ];
    } else if (isNewProject) {
      project_structure = [
        {"file": "index.html", "description": "Main HTML"},
        {"file": "css/style.css", "description": "Styling"},
        {"file": "js/main.js", "description": "Main functionality"}
      ];
    }
    
    return { 
      is_code_related: true, 
      task_type: "code",
      project_structure: project_structure
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
const routeResult = await routeTaskMandatory(message, history, files, clientId);



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
const modelConfig =
  MODEL_CONFIGS[finalModel] || MODEL_CONFIGS['gemini-3-flash'];


let executionMode = "CODE";

if (routeResult.project_structure) {
  executionContext.project_structure = routeResult.project_structure;
  console.log(`📦 Project structure stored for execution: ${routeResult.project_structure.length} files`);
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

const built = await buildSystemPrompt({
  routeResult,
  settings,
  taskInfo,
  reasoningSummary,
  visionImages,
  files,
  history,
  message,
  projectStructure: executionContext.project_structure // ✅ تمرير الهيكل
});

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
        
        const wrappedOnChunk = (text) => {
            partialResponse += text;
            // فحص إذا وصلنا للحد الذي يستدعي الاستمرار
            if (partialResponse.length >= continuationThreshold && !needsContinuation) {
                needsContinuation = true;
                console.log(`⚠️ [CONTINUATION] Threshold reached (${partialResponse.length}/${maxTokensLimit}), preparing continuation...`);
                // لا نوقف الـ Stream هنا، سنوقفه بعد اكتمال هذا الـ Chunk بشكل طبيعي
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
    const appearsTruncated = !modelRequestedContinuation && checkIfTruncated(response);
    
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
        generationConfig: { maxOutputTokens: finalKeyInfo.modelConfig.maxTokens, temperature: finalKeyInfo.modelConfig.temperature }
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
        
        // ✅ حفظ الرد النهائي (بعد دمج الاستمرار إن وجد)
        const extractedTasks = extractTasksFromResponse(fullResponse);
        const filesSnapshot = files.map(file => ({
            name: file.name,
            content: file.content,
            type: file.type || getMimeType(file.name)
        }));
        
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
            [],
            finalModelName,
            executionContext.thoughtText,
            extractedTasks,
            filesSnapshot
        );
        
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

// POST /api/register - تسجيل مستخدم جديد
app.post('/api/register', async (req, res) => {
    const { userId, nickname } = req.body;
    
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
    const { userId } = req.query;
    
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
        const modelName = 'gemma-3-27b-it';  // 27B model
        
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

        console.log("📡 Calling Gemma 27B API for welcome messages...");
        
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
            console.error(`❌ Gemma 27B API error: ${response.status} - ${errorText.substring(0, 200)}`);
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        console.log("📝 Raw Gemma 27B response:", text);
        
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
            
            console.log("🎨 Generated welcome messages from Gemma 27B:", result);
            
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

// GET /api/conversation?convId=xxx&userId=xxx
app.get('/api/conversation', async (req, res) => {
  const { convId, userId } = req.query;
  
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
  .select('id, role, content, model, thought, tasks, files_snapshot, created_at')
  .eq('conv_id', convId)
  .order('created_at', { ascending: true })  // ✅ ترتيب تصاعدي
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
  const { userId, conversation } = req.body;
  
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
      for (const msg of messages) {
        await supabase.from('messages').insert({
          conv_id: id,
          role: msg.role,
          content: msg.content,
          model: msg.model || null,
          thought: msg.thought || null,
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
  const { convId, userId } = req.query;
  
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

