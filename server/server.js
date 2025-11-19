import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';      

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// قائمة SSE
let clients = [];

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(c => {
    try { c.res.write(msg); }
    catch(e) { console.error("❌ Broadcast error:", e); }
  });
}

// ملفات الواجهة
app.use(express.static(path.join(__dirname, '..', 'client')));

// =======================
// 🟦 API CHAT
// =======================
app.post('/api/chat', async (req, res) => {

  console.log("========================================");
  console.log("📥 Received /api/chat request");
  console.log("User message:", req.body.message);
  console.log("Conversation:", req.body.convId);
  console.log("========================================");

  const { message, code } = req.body;

  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_KEY) {
    console.log("❌ ERROR: GEMINI_API_KEY is NOT SET");
    broadcast({ type: 'assistant_message', text: 'Server error: The GEMINI_API_KEY environment variable is not set.' });
    return res.json({ status: 'no-key' });
  }

  try {
    // 1. بناء رسالة المستخدم المجمعة (الرسالة + الكود الحالي)
    const combinedPrompt = message + "\n\n### Current Code:\n" + (code || 'No code provided.');

    // 2. تعريف تعليمات النظام (System Instruction)
    const systemInstruction = "أنت مساعد برمجي خبير. مهمتك هي مساعدة المستخدم في كتابة وتصحيح الكود. قدم إجاباتك بتنسيق Markdown واشرح التغييرات التي تجريها في الكود (إذا كانت ذات صلة).";

    // 3. بناء حمولة Gemini Payload
    const payload = {
        contents: [{
            role: "user",
            parts: [{ text: combinedPrompt }]
        }],
        config: {
            systemInstruction: systemInstruction,
            maxOutputTokens: 2048,
            temperature: 0.2
        }
    };

    console.log("⚙ Sending request to Gemini...");

    // 4. إرسال الطلب إلى نقطة نهاية البث (Streaming endpoint)
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=' + GEMINI_KEY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload) // استخدام الحمولة الجديدة
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.log("❌ Gemini API response error:", resp.status, errorText);
      broadcast({ type: 'assistant_message', text: `API Error: ${resp.statusText}. Check server logs for details.` });
      return res.json({ status: 'api-error' });
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: true });
      
      // معالجة المخزن المؤقت للتعامل مع أجزاء JSON المنفصلة بـ \n
      const lines = buffer.split('\n');
      buffer = lines.pop(); // الاحتفاظ بالسطر الأخير غير المكتمل في المخزن المؤقت
      
      for(const line of lines){
        if(line.trim().length === 0) continue;
        try{
          const parsed = JSON.parse(line);
          // تحليل بنية استجابة Gemini
          const part = parsed.candidates?.[0]?.content?.parts?.[0]?.text;

          if (part)
            broadcast({ type:'assistant_message', text: part });
            
        }catch(e){
          // تجاهل أخطاء التحليل للخطوط الجزئية أو غير الصالحة
        }
      }
      if(done) break;
    }

    broadcast({ type:'assistant_message', text:'\n[STREAM COMPLETE]' });
    res.json({ status:'ok' });

  } catch (err) {
    console.log("❌ Server error inside /api/chat:", err);
    broadcast({ type:'assistant_message', text: 'Server error: ' + err.message });
    res.json({ status:'error' });
  }
});


// =======================
// 🟩 SSE EVENTS
// =======================
app.get('/api/events', (req, res) => {
  console.log("🔵 New SSE connection");

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  res.flushHeaders();

  const id = Date.now();
  clients.push({ id, res });

  res.write(`data: {"type":"connected","text":"SSE connection established."}\n\n`);

  req.on('close', () => {
    console.log("🔴 SSE disconnected");
    clients = clients.filter(c => c.id !== id);
  });
});

// =======================
// 🟧 Fallback
// =======================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// بدء التشغيل
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});