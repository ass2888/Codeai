import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    }
};

// أضف تعريف النماذج بعد تعريف LIMITS
// بعد تعريف LIMITS أضف:
const MODEL_CONFIGS = {
    'gemini-3-flash': {
        provider: 'google',
        modelName: 'gemini-3-flash-preview',
        displayName: 'Gemini 3 Flash',
        maxTokens: 100000,
        temperature: 0.7,
        supportsStreaming: true,
        features: ['fast', 'latest']
    },
    'gemini-2.5-pro': {
        provider: 'google',
        modelName: 'gemini-2.5-pro-preview-03-25',
        displayName: 'Gemini 2.5 Pro',
        maxTokens: 1000000,
        temperature: 0.7,
        supportsStreaming: false,
        features: ['long-context', 'reasoning', 'advanced']
    },
    'gemini-2.5': {
        provider: 'google',
        modelName: 'gemini-2.5-flash-preview-03-25',
        displayName: 'Gemini 2.5',
        maxTokens: 100000,
        temperature: 0.7,
        supportsStreaming: true,
        features: ['fast', 'efficient', 'balanced']
    },
    'deepseek-coder': {
        provider: 'deepseek',
        modelName: 'deepseek-coder',
        displayName: 'DeepSeek Coder',
        maxTokens: 16000,
        temperature: 0.7,
        supportsStreaming: true,
        apiUrl: 'https://api.deepseek.com/v1/chat/completions',
        features: ['coding', 'open-source']
    },
    'deepseek-chat': {
        provider: 'deepseek',
        modelName: 'deepseek-chat',
        displayName: 'DeepSeek Chat',
        maxTokens: 16000,
        temperature: 0.7,
        supportsStreaming: true,
        apiUrl: 'https://api.deepseek.com/v1/chat/completions',
        features: ['general', 'open-source']
    }
};

const D1 = process.env.D1; // D = deepseek
const G3 = process.env.GEMINI_API_KEY; 
const G2 = process.env.GEMINI_KEY;
const G1 = process.env.G1; // G = Gemini

// كائن لتتبع الاستهلاك لكل مفتاح
// تهيئة كاملة لـ usageStats
let usageStats = {};

// تهيئة جميع المفاتيح
// غيّر السطر ليصبح:
['G1', 'G2', 'G3', 'D1'].forEach(keyId => {
    usageStats[keyId] = {
        gemini: { 
            rpm: 0, 
            tpm: 0, 
            rpd: 0, 
            lastMinute: Date.now(), 
            lastDay: Date.now() 
        },
        gemma: { 
            rpm: 0, 
            tpm: 0, 
            rpd: 0, 
            lastMinute: Date.now(), 
            lastDay: Date.now() 
        },
        deepseek: { // ⬅ أضف هذا
            rpm: 0, 
            tpm: 0, 
            rpd: 0, 
            lastMinute: Date.now(), 
            lastDay: Date.now() 
        }
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

/**
 * الحصول على مفتاح آمن لنموذج معين
 */
/**
 * الحصول على مفتاح آمن لنموذج معين (معدل لمنع التداخل)
 */
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
    return null;
}

function getSafeKeyForModel(requestedModel) {
    const modelConfig = MODEL_CONFIGS[requestedModel];
    if (!modelConfig) {
        console.log(`❌ Model config not found: ${requestedModel}`);
        return getSafeKey();
    }
    
    const limits = modelConfig.provider === 'deepseek' ? 
        { RPM: 60, TPM: 1000000, RPD: 1000 } : 
        { RPM: 3, TPM: 230000, RPD: 17 };
    
    let keys = modelConfig.provider === 'deepseek' ? ['D1'] : ['G1', 'G2', 'G3'];
    const modelType = modelConfig.provider === 'deepseek' ? 'deepseek' : 'gemini';
    
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
    
    return null;
}

async function sendResponseUnified({
  model,
  prompt,
  supportsStreaming,
  provider,
  onChunk,
  onComplete
}) {
  let fullResponse = "";
if (provider === 'google') {
  if (supportsStreaming) {
    // 🔹 Streaming models (Flash, etc.)
    const result = await model.generateContentStream(prompt);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        fullResponse += text;
        onChunk(text);
      }
    }
  } else {
    // 🔹 Non-streaming models (Pro, future models)
    const result = await model.generateContent(prompt);
    const text =
      result.response?.text?.() ||
      result.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "";

    if (text) {
      fullResponse = text;
      onChunk(text); // 👈 Chunk واحد فقط
    }
  }
  } else if (provider === 'deepseek') {
    const messages = [
      { role: "system", content: "You are a helpful AI coding assistant." },
      { role: "user", content: prompt }
    ];
    
    const response = await callDeepSeekAPI(keyInfo, messages);
    
    if (supportsStreaming) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (line.startsWith('data: ') && line.slice(6) !== '[DONE]') {
            try {
              const content = JSON.parse(line.slice(6)).choices[0]?.delta?.content || '';
              if (content) {
                fullResponse += content;
                onChunk(content);
              }
            } catch (e) {}
          }
        }
      }
    } else {
      const data = await response.json();
      const content = data.choices[0]?.message?.content || '';
      if (content) {
        fullResponse = content;
        onChunk(content);
      }
    }
  }

  onComplete(fullResponse);
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

app.post('/api/chat', async (req, res) => {
  // 1. نستقبل مصفوفة الملفات بدلاً من كود واحد
const { message, files, convId, history, settings, clientId } = req.body;
const requestedModel = settings?.selectedModel || 'gemini-3-flash';
  const modelConfig = MODEL_CONFIGS[requestedModel] || MODEL_CONFIGS['gemini-3-flash'];
let finalKeyInfo = getSafeKeyForModel(requestedModel);
  let usedModelName = modelConfig.displayName; 
  let provider = modelConfig.provider;
    
    console.log(`🎯 Requested model: ${modelConfig.displayName} (Provider: ${modelConfig.provider})`);
console.log(`🔑 Using Key: ${keyInfo.id} for ${modelConfig.provider}`);
    
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
          modelName: 'gemini-2.0-flash-exp', // أو المتاح لديك
          maxTokens: 100000,
          temperature: 0.7,
          supportsStreaming: true
      };
  } else {
      // إذا نجحنا، نستخدم الاسم الرسمي
      usedModelName = finalKeyInfo.modelConfig.displayName;
  }


console.log(`🎯 ===== GEMINI REQUEST STARTED =====`);
console.log(`📌 Conversation ID: ${convId}`);
console.log(`🔑 Using Gemini Key: ${activeKeyInfo.id}`);
console.log(`📊 Current Gemini usage: RPM=${usageStats[activeKeyInfo.id].gemini.rpm}, TPM=${usageStats[activeKeyInfo.id].gemini.tpm}`);
console.log(`📝 User message: ${message.substring(0, 100)}...`);

  

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
    broadcast({ type: 'assistant_message', text: ' ' }, clientId);
    
    
    console.log(`🤖 Selected Gemini model: ${modelConfig.modelName}`);
const estimatedRequestTokens = estimateTokens(message + JSON.stringify(files || ""));

    // تحديث العدادات (بشكل مؤقت قبل الطلب)
        usageStats[activeKeyInfo.id].gemini.rpm += 1;
usageStats[activeKeyInfo.id].gemini.rpd += 1;
usageStats[activeKeyInfo.id].gemini.tpm += estimatedRequestTokens;

    

    // 1. تحديد النمط البصري بناءً على الثيم (Dark/Light)
    let visualStyleInstruction = "";
    if (settings && settings.theme === 'light') {
        visualStyleInstruction = `
--- VISUAL STYLE (LIGHT THEME) ---
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
--- DEFAULT VISUAL STYLE (DARK THEME) ---
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
// 3. تعليمات النظام الجديدة
    const systemInstruction = `You are an expert, friendly web developer.

--- INFO ---

- YOUR GOAL -
Help the user by editing existing files or CREATING new files based on their request.
- ABOUT -
1. Identity & Platform:
You are Codeai (in arabic (كوداي)), an integrated AI chat assistant and code editor. You operate within the Codeai PWA, designed to provide a seamless coding and assistance experience.
2.​Capabilities & Constraints:
You support code generation and live previews for the following languages only: HTML, CSS, JavaScript, Java, Python, PHP, and C++. Ensure all technical solutions and previews align with these supported environments.
3. If the user asks for anything that doesn't relate to coding, answer them normally; you aren't for coding only.

--- USER SETTINGS ---
- Preferred Language: ${prefLang} (Default to this if starting a new project).
- Theme: ${settings?.theme || 'dark'}

${visualStyleInstruction}
4. ALWAYS include the following block at the very beginning of every CSS file or <style> tag:
* {
    -webkit-tap-highlight-color: transparent;
}
5. NEVER use alert(), Make your own modal instead.
6. Try always to add simple animations for buttons, modals, cards, and almost everything that makes the app/game better

${personaInstruction}



--- RULES ---
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
--- OUTPUT FORMAT (STRICT) ---
To create a file, use this EXACT format at the end of your response:

<FILE name="filename.ext">
... FULL code content here ...
</FILE>
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




    const fullPrompt = `
${systemInstruction}

--- CONVERSATION CONTEXT (LAST 2 TURNS) ---
${historyText}

--- CURRENT USER MESSAGE ---
${message}

--- CURRENT PROJECT FILES ---
${filesContext}
`;

console.log("==================== FULL PROMPT SENT TO GEMINI ====================");
    console.log(fullPrompt);
    console.log("====================================================================");



    

    
await sendResponseUnified({
    model,
    prompt: fullPrompt,
    supportsStreaming: finalKeyInfo.modelConfig.supportsStreaming,
      provider: provider,
    keyInfo: finalKeyInfo,
    onChunk: (text) => {
         if (usageStats[finalKeyInfo.id] && usageStats[finalKeyInfo.id][provider]) {
              usageStats[finalKeyInfo.id][provider].tpm += estimateTokens(text);
          }
          // ✅ الإرسال للمستخدم المحدد فقط
          broadcast({ type: "assistant_message", text }, clientId);
    },
    onComplete: (fullResponse) => {
        if (conversationMemory[convId]) {
              conversationMemory[convId].history.push(fullResponse);
          }
          
          // ✅✅✅ إرسال اسم النموذج في نهاية الرد ✅✅✅
          broadcast({ 
              type: 'session_info', 
              modelName: usedModelName, // سيظهر هذا الاسم في الواجهة
              convId: convId
          }, clientId);

    }
});

// بعد اكتمال الـ stream

    console.log(`✅ [SUCCESS] Response completed for ConvID: ${convId}`);
    
      
      console.log(`✅ ===== GEMINI REQUEST COMPLETED =====`);
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
  } catch (err) {
    console.error(`❌ ===== GEMINI REQUEST FAILED =====`);
    console.error(`🔧 Error details:`, err.message);
    console.error(`🔧 Stack:`, err.stack?.substring(0, 300));
    console.error("❌ Generation Error:", err);
    broadcast({ type:'assistant_message', text: `Error: ${err.message}` }, clientId);
    res.json({ status:'error' });
    
    // تصحيح تحديث الاستخدام
    if (activeKeyInfo) {
        usageStats[activeKeyInfo.id].gemini.rpm = Math.max(0, (usageStats[activeKeyInfo.id].gemini.rpm || 0) - 1);
    }
    
    console.error("API Error:", err);
    
    
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

