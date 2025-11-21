import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
// استيراد مكتبة Google AI
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, '..', 'client')));

let clients = [];

// دالة إرسال البيانات للعميل (الواجهة)
function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(c => {
    try { c.res.write(msg); }
    catch(e) { console.error("❌ Broadcast error:", e); }
  });
}

app.post('/api/chat', async (req, res) => {
  const { message, code } = req.body;
  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_KEY) {
    broadcast({ type:'assistant_message', text:'No GEMINI_API_KEY set on server.'});
    return res.json({ status: 'no-key' });
  }

  try {
    // إعداد النموذج باستخدام المكتبة الرسمية
    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    
    // --- التصحيح هنا: استخدام getGenerativeModel بدلاً من getModel ---
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // إرسال رسالة فارغة للبدء
    broadcast({ type: 'assistant_message', text: ' ' }); 
const systemInstruction = `You are an expert web developer.

CRITICAL RULES:
1. **Chat vs Code:**
   - The main chat area is for EXPLANATION and DISCUSSION only.
   - DO NOT write large code blocks (like HTML/CSS/JS files) in the chat.
   - You can use small inline snippets (e.g., \`const x = 1\`) for explanation.

2. **Project Updates:**
   - IF the user asks to change the code or add a feature, you MUST output the **FULL MODIFIED FILE** inside this specific tag:
     <CODE_UPDATE>
     ... (Put the full file content here) ...
     </CODE_UPDATE>

3. **Formatting:**
   - Place the <CODE_UPDATE> block at the VERY END of your response.
   - Do not put triple backticks (\`\`\`) around the code inside the <CODE_UPDATE> tag. Just raw code.
   - Use Markdown formatting (bold, lists) for your chat explanation to make it readable.`;
    
    const fullPrompt = systemInstruction + "\n\nUser Query: " + message + "\n\nCurrent Project Code:\n" + (code || '');

    // بدء الـ Stream باستخدام المكتبة
    const result = await model.generateContentStream(fullPrompt);

    // قراءة الـ Stream وإرساله للواجهة
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        broadcast({ type: "assistant_message", text: chunkText });
      }
    }

    // إنهاء الـ Stream
    broadcast({ type: "assistant_message", text: "\n[STREAM COMPLETE]" });
    res.json({ status: "ok" });

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