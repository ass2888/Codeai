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

    const systemInstruction = `You are an expert web developer assisting with a specific project.

RULES:
1. **Context:** You will be provided with the "Current Project Code". Your task is to MODIFY it based on the "User Query".
2. **Integration:** Integrate new features (e.g., buttons, styles) seamlessly into the existing code. DO NOT remove existing styles or scripts unless explicitly asked. DO NOT reset the file to a blank template unless the input code is empty.
3. **Chat Behavior:** Answer the user's questions naturally in the text. You can use standard markdown \`\`\` snippets for small explanations or examples ONLY.
4. **Project Update:** IF you need to update the project code, you must provide the **FULL, COMPLETE FILE** inside a special tag: <CODE_UPDATE> ... </CODE_UPDATE>.
5. **Placement:** Place this <CODE_UPDATE> block strictly at the **very end** of your response.
6. **Constraint:** DO NOT put the full project code in the normal chat text. The chat should remain clean for conversation.`;
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