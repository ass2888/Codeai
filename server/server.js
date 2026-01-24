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

const G3 = process.env.GEMINI_API_KEY;
const G2 = process.env.GEMINI_KEY;
const G1 = process.env.G1;

// كائن لتتبع الاستهلاك لكل مفتاح
let usageStats = {
    G1: { 
        gemini: { rpm: 0, tpm: 0, rpd: 0, lastMinute: Date.now(), lastDay: Date.now() },
        gemma: { rpm: 0, tpm: 0, rpd: 0, lastMinute: Date.now(), lastDay: Date.now() }
    },
    G2: { 
        gemini: { rpm: 0, tpm: 0, rpd: 0, lastMinute: Date.now(), lastDay: Date.now() },
        gemma: { rpm: 0, tpm: 0, rpd: 0, lastMinute: Date.now(), lastDay: Date.now() }
    },
    G3: { 
        gemini: { rpm: 0, tpm: 0, rpd: 0, lastMinute: Date.now(), lastDay: Date.now() },
        gemma: { rpm: 0, tpm: 0, rpd: 0, lastMinute: Date.now(), lastDay: Date.now() }
    }
};

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

function getSafeKey(modelType = 'gemini') {
    const keys = ['G1', 'G2', 'G3'];
    const limits = LIMITS[modelType.toUpperCase()];
    
    for (let keyId of keys) {
        const keyToken = process.env[keyId];
        if (!keyToken) continue;

        refreshStats(keyId, modelType);
        const stats = usageStats[keyId][modelType];

        const isRpmSafe = stats.rpm < (limits.RPM - 1);
        const isTpmSafe = stats.tpm < (limits.TPM * 0.9);
        const isRpdSafe = stats.rpd < limits.RPD;
        
        if (isRpmSafe && isTpmSafe && isRpdSafe) {
            console.log(`✅ Using ${modelType.toUpperCase()} Key ${keyId} | RPM: ${stats.rpm}/${limits.RPM}`);
            return { 
                id: keyId, 
                token: keyToken,
                modelType: modelType
            };
        }
    }
    return null;
}

function updateUsage(keyId, modelType, tokens) {
    if (!usageStats[keyId] || !usageStats[keyId][modelType]) {
        console.error(`❌ Invalid stats for ${keyId}.${modelType}`);
        return;
    }
    
    const stats = usageStats[keyId][modelType];
    stats.rpm += 1;
    stats.rpd += 1;
    stats.tpm += tokens;
    
    console.log(`📊 Updated ${modelType.toUpperCase()} usage for ${keyId}: RPM=${stats.rpm}, TPM=${stats.tpm}`);
}

function estimateTokens(text) {
    // تقدير تقريبي للتوكنز (كلمة = ~1.3 توكنز)
    const words = text.split(/\s+/).length;
    return Math.ceil(words * 1.3);
}

async function summarizeConversationWithGemma(convId, userMessage, aiResponse) {
    // الحصول على مفتاح لـ Gemma
    const gemmaKeyInfo = getSafeKey('gemma');
    if (!gemmaKeyInfo) {
        console.warn("⚠️ No available keys for Gemma summarization");
        return generateFallbackSummary(userMessage);
    }

    try {
        const summaryPrompt = `أنت مساعد متخصص في تلخيص المحادثات التقنية.

القوانين الصارمة:
1. اقرأ محادثة المستخدم والرد الأول فقط
2. لخص الموضوع في جملة واحدة واضحة
3. استخدم أقل من 40 حرفاً
4. بلغة المحادثة الأصلية
5. لا تضيف أي تعليقات أو علامات أو أمثلة
6. أجب فقط بالتلخيص النهائي

المحادثة:
المستخدم: ${userMessage}
المساعد: ${aiResponse.substring(0, 200)}

التلخيص:`;

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
                        maxOutputTokens: 60,
                        temperature: 0.2,
                        topP: 0.8
                    }
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Gemma API error: ${response.status}`);
        }

        const data = await response.json();
        const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        // تنظيف وتحسين التلخيص
        const cleanedSummary = cleanSummary(summary, userMessage);
        
        // تحديث الاستخدام
        const tokens = estimateTokens(summaryPrompt + cleanedSummary);
        updateUsage(gemmaKeyInfo.id, 'gemma', tokens);
        
        console.log(`📝 Auto-summary for ${convId}: "${cleanedSummary}"`);
        return cleanedSummary;
        
    } catch (error) {
        console.error("❌ Gemma summarization failed:", error);
        // استخدام بديل بسيط
        return generateFallbackSummary(userMessage);
    }
}

function cleanSummary(summary, userMessage) {
    if (!summary) return generateFallbackSummary(userMessage);
    
    // إزالة علامات التنصيص والمسافات الزائدة
    let cleaned = summary.trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\.$/, '')
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ');
    
    // تأكد من الطول
    if (cleaned.length > 40) {
        cleaned = cleaned.substring(0, 37) + '...';
    }
    
    // إذا كان فارغاً أو قصيراً جداً
    if (cleaned.length < 3) {
        return generateFallbackSummary(userMessage);
    }
    
    return cleaned;
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

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(c => {
    try { c.res.write(msg); }
    catch(e) { console.error("❌ Broadcast error:", e); }
  });
}

app.post('/api/chat', async (req, res) => {
  // 1. نستقبل مصفوفة الملفات بدلاً من كود واحد
const { message, files, convId, history, settings } = req.body;

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
        history: []
    };
}

const activeKeyInfo = getSafeKey();
    
    if (!activeKeyInfo) {
        broadcast({ type: 'assistant_message', text: '⚠️ جميع المفاتيح وصلت للحد الأقصى حالياً، يرجى الانتظار دقيقة.' });
        return res.json({ status: 'limit-reached' });
    }


  

  try {
    const genAI = new GoogleGenerativeAI(activeKeyInfo.token);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        generationConfig: { 
            maxOutputTokens: 100000, // رفع الحد الأقصى بشكل كبير
            temperature: 0.7 
        }
    });

const estimatedRequestTokens = estimateTokens(message + JSON.stringify(files || ""));

    // تحديث العدادات (بشكل مؤقت قبل الطلب)
        usageStats[activeKeyInfo.id].rpm += 1;
        usageStats[activeKeyInfo.id].rpd += 1;
        usageStats[activeKeyInfo.id].tpm += estimatedRequestTokens;

    broadcast({ type: 'assistant_message', text: ' ' });

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



    const result = await model.generateContentStream(fullPrompt);

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        usageStats[activeKeyInfo.id].tpm += estimateTokens(chunkText);
        broadcast({ type: "assistant_message", text: chunkText });
        conversationMemory[convId].history.push(chunkText);
      }
    }
    
    console.log(`✅ [SUCCESS] Response completed for ConvID: ${convId}`);
    console.log(`📊 Current Stats for ${activeKeyInfo.id}: RPM:${usageStats[activeKeyInfo.id].rpm}, TPM:${usageStats[activeKeyInfo.id].tpm}`);
      

    broadcast({ type: "assistant_message", text: "\n[STREAM COMPLETE]" });
     // --- التلخيص التلقائي للمحادثات الجديدة ---
    const conversation = conversationMemory[convId];
    if (conversation && conversation.history && conversation.history.length === 1) {
        // هذا هو الرد الأول في محادثة جديدة
        // نجمع النص الكامل من الرد
        const fullAIResponse = conversation.history.join('');
        
        // ننتظر قليلاً ثم نرسل للتلخيص (غير متزامن)
        setTimeout(async () => {
            try {
                const summary = await summarizeConversationWithGemma(convId, message, fullAIResponse);
                
                if (summary) {
                    // إرسال التلخيص للعميل لتحديث عنوان المحادثة
                    broadcast({ 
                        type: "conversation_summary", 
                        convId: convId,
                        summary: summary
                    });
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
    usageStats[activeKeyInfo.id].rpm -= 1;
    console.error("API Error:", err);
    broadcast({ type:'assistant_message', text: `Error: ${err.message}` });
    res.json({ status:'error' });
  }
});

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();

  const id = Date.now();
  clients.push({ id, res });
  
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    clients = clients.filter(c => c.id !== id);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

