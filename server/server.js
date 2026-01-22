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
    RPM: 3,      // حد الطلبات في الدقيقة (نضع 14 للأمان بدلاً من 15)
    TPM: 230000,  // حد التوكنز في الدقيقة (نضع 900 ألف للأمان بدلاً من مليون)
    RPD: 17     // حد الطلبات في اليوم (نضع 1400 للأمان بدلاً من 1500)
};

const G3 = process.env.GEMINI_API_KEY;
const G2 = process.env.GEMINI_KEY;
const G1 = process.env.G1;

// كائن لتتبع الاستهلاك لكل مفتاح
let usageStats = {
    G1: { rpm: 0, tpm: 0, rpd: 0, lastMinute: Date.now(), lastDay: Date.now() },
    G2: { rpm: 0, tpm: 0, rpd: 0, lastMinute: Date.now(), lastDay: Date.now() },
    G3: { rpm: 0, tpm: 0, rpd: 0, lastMinute: Date.now(), lastDay: Date.now() }
};

/**
 * دالة لتصفير العدادات عند مرور دقيقة أو يوم
 */
function refreshStats(keyId) {
    const now = Date.now();
    // تصفير الدقيقة
    if (now - usageStats[keyId].lastMinute > 60000) {
        usageStats[keyId].rpm = 0;
        usageStats[keyId].tpm = 0;
        usageStats[keyId].lastMinute = now;
    }
    // تصفير اليوم
    if (now - usageStats[keyId].lastDay > 86400000) {
        usageStats[keyId].rpd = 0;
        usageStats[keyId].lastDay = now;
    }
}

function getSafeKey() {
    const keys = ['G1', 'G2', 'G3'];
    
    for (let keyId of keys) {
        const keyToken = process.env[keyId];
        if (!keyToken) continue;

        refreshStats(keyId); // تحديث العدادات أولاً

        const stats = usageStats[keyId];
        const isRpmSafe = stats.rpm < (LIMITS.RPM - 1);
        const isTpmSafe = stats.tpm < (LIMITS.TPM * 0.9); // ترك 10% هامش أمان للتوكنز
        const isRpdSafe = stats.rpd < LIMITS.RPD;
        // نتحقق من الحدود (بترك هامش أمان 10%)
        if (isRpmSafe && isTpmSafe && isRpdSafe) {
            console.log(`✅ Using Key ${keyId} | RPM: ${stats.rpm}/${LIMITS.RPM} | TPM: ${stats.tpm}`);
            return { id: keyId, token: keyToken };
        } else {
            console.warn(`⚠️ Key ${keyId} reached limits, checking next...`);
        }
    }
    return null; // لا يوجد مفتاح متاح حالياً
}

function estimateTokens(text) {
    return Math.ceil(text.length / 4);
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
        model: "gemini-3-flash-preview",
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

