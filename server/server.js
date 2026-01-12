import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!conversationMemory[convId]) {
    conversationMemory[convId] = {
        summary: "",
        history: []
    };
}

  if (!GEMINI_KEY) {
    broadcast({ type:'assistant_message', text:'No GEMINI_API_KEY set on server.'});
    return res.json({ status: 'no-key' });
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-3-flash",
        generationConfig: { 
            maxOutputTokens: 100000, // رفع الحد الأقصى بشكل كبير
            temperature: 0.7 
        }
    });

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
3. Python for Web: When generating Python code for preview, ALWAYS use 'Brython' syntax. 
   - Use 'from browser import document, window, html'.
   - Interact with the DOM or <canvas> instead of using 'input()'.
   - Avoid infinite 'while' loops that block the main thread; use 'timer' or 'requestAnimationFrame' for animations.

--- USER SETTINGS ---
- Preferred Language: ${prefLang} (Default to this if starting a new project).
- Theme: ${settings?.theme || 'dark'}

${visualStyleInstruction}

${personaInstruction}

4. ALWAYS include the following block at the very beginning of every CSS file or <style> tag:
* {
    -webkit-tap-highlight-color: transparent;
}

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
--- OUTPUT FORMAT (STRICT) ---
To create a file, use this EXACT format at the end of your response:

<FILE name="filename.ext">
... FULL code content here ...
</FILE>
`;

 // 5. دمج التاريخ (Context)
    let historyText = "";
    if (history && Array.isArray(history)) {
        historyText = history.map(msg => 
            `[${msg.role.toUpperCase()}]: ${msg.text.substring(0, 500)}` // تقليل النص لتوفير التوكنز
        ).join("\n");
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


    const result = await model.generateContentStream(fullPrompt);

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        broadcast({ type: "assistant_message", text: chunkText });
        conversationMemory[convId].history.push(chunkText);
      }
    }

    broadcast({ type: "assistant_message", text: "\n[STREAM COMPLETE]" });
    res.json({ status: "ok" });
if (conversationMemory[convId].history.length > 20) { // زدن الحد قليلاً
        // نقوم بالتلخيص في الخلفية دون انتظار
        

    }
  } catch (err) {
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

