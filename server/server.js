import express from 'express';
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

// لخدمة الملفات الساكنة
app.use(express.static(path.join(__dirname, '..', 'client')));

let clients = [];

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(c => {
    try { c.res.write(msg); }
    catch(e) { console.error("❌ Broadcast error:", e); }
  });
}

// =======================
// 🟦 API CHAT (تم الإصلاح)
// =======================
app.post('/api/chat', async (req, res) => {
  const { message, code } = req.body;
  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_KEY) {
    broadcast({ type:'assistant_message', text:'No GEMINI_API_KEY set on server.'});
    return res.json({ status: 'no-key' });
  }

  try{
    // 1. إرسال إشارة بدء
    broadcast({ type: 'assistant_message', text: ' ' }); // مسافة فارغة لكسر حالة الانتظار

    const payload = {
      contents: [{
        role: "user",
        parts: [{ text: message + "\n\nCurrent code:\n" + (code||'') }]
      }],
      generationConfig: {
        maxOutputTokens: 800,
        temperature: 0.2,
      },
    };

    const resp = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:streamGenerateContent?key=' + GEMINI_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if(!resp.ok){
      const text = await resp.text();
      broadcast({ type:'assistant_message', text: `API Error: ${text}` });
      return res.json({ status:'error' });
    }

    const decoder = new TextDecoder('utf-8');
    const reader = resp.body.getReader();
    let buffer = '';

    while(true){
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // تعريف الـ Regex
      const textMatch = /"text":\s*"((?:[^"\\]|\\.)*)"/g;
      let match;
      let lastIndex = 0;

      // استخراج جميع النصوص المتاحة حالياً
      while ((match = textMatch.exec(buffer)) !== null) {
          let content = match[1];
          // تنظيف النص من الرموز الخاصة
          content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          
          if(content) {
             broadcast({ type:'assistant_message', text: content });
          }
          // حفظ موقع آخر حرف تم العثور عليه واستخدامه
          lastIndex = textMatch.lastIndex;
      }

      // 🔥 هذا هو السطر السحري للإصلاح 🔥
      // قص الجزء الذي تم إرساله بالفعل من الـ buffer
      // حتى لا تتم قراءته مرة أخرى في الدورة القادمة
      if (lastIndex > 0) {
          buffer = buffer.slice(lastIndex);
      }
    }
      
      
      // نحتفظ بآخر جزء من الـ Buffer في حال كان النص مقطوعاً في المنتصف
      if (buffer.length > 20000) buffer = buffer.slice(-5000); // تنظيف الذاكرة
    }
    
    broadcast({ type:'assistant_message', text:'\n[STREAM COMPLETE]' });
    res.json({ status:'ok' });

  } catch (err) {
    console.error("Error:", err);
    broadcast({ type:'assistant_message', text: 'Server Error.' });
    res.json({ status:'error' });
  }
});

// =======================
// 🟩 SSE EVENTS
// =======================
app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();

  const id = Date.now();
  clients.push({ id, res });
  
  // إبقاء الاتصال حياً (Heartbeat) لمنع Render من قطع الاتصال
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