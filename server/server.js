import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// إعداد تطبيق Express
const app = express();
app.use(cors());
app.use(bodyParser.json());

// قائمة العملاء لتلقي رسائل SSE
let clients = [];

/**
 * دالة البث لإرسال رسائل SSE لجميع العملاء المتصلين
 * @param {object} data - البيانات المراد إرسالها.
 */
function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(c => {
    try { c.res.write(msg); }
    catch(e) { console.error("❌ Broadcast error:", e); }
  });
}

// لخدمة الملفات الساكنة (static files) من مجلد 'client'
app.use(express.static(path.join(__dirname, '..', 'client')));

// =======================
// 🟦 API CHAT
// =======================
app.post('/api/chat', async (req, res) => {
  const { message, code } = req.body;
  
  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_KEY) {
    console.log("❌ ERROR: GEMINI_API_KEY is NOT SET");
    broadcast({ type:'assistant_message', text:'No GEMINI_API_KEY set on server.'});
    return res.json({ status: 'no-key' });
  }

  try{
    // إرسال رسالة "جاري المعالجة..." فوراً لردع الإطار الزمني (Timeout)
    broadcast({ type: 'assistant_message', text: 'Processing...' }); 
    
    // بناء حمولة (Payload) واجهة برمجة تطبيقات Gemini الصحيحة
    const payload = {
      contents: [{
        role: "user",
        parts: [{
          // إرسال رسالة المستخدم بالإضافة إلى الكود الحالي كنص واحد
          text: message + "\n\nCurrent code:\n" + (code||'')
        }]
      }],
      // إعدادات التوليد
      generationConfig: {
        maxOutputTokens: 800,
        temperature: 0.2,
      },
    };

    // نداء واجهة برمجة تطبيقات Gemini للبث (Streaming)
    const resp = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:streamGenerateContent?key='
  + GEMINI_KEY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    // التعامل مع أخطاء الاستجابة لـ API
    if(!resp.ok){
      const text = await resp.text();
      console.log("❌ API Response Error:", resp.status, text);
      broadcast({ type:'assistant_message', text: `API Error (${resp.status}): ${text}` });
      return res.json({ status:'api-error' });
    }

    const decoder = new TextDecoder('utf-8');
    const reader = resp.body.getReader();
    let buffer = '';

    while(true){
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: true });

      // معالجة تدفق JSON (كل سطر هو كائن JSON منفصل)
      const lines = buffer.split('\n');
      buffer = lines.pop(); // الاحتفاظ بالسطر الأخير غير المكتمل في المخزن المؤقت
      
      for(const line of lines){
        if(line.trim().length === 0) continue;
        try{
          const parsed = JSON.parse(line);
          // استخراج الجزء النصي من استجابة Gemini
          const part = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;

          if (part){
            broadcast({ type:'assistant_message', text: part });
          }
        }catch(e){
          // تجاهل أخطاء التحليل للخطوط الجزئية أو غير الصالحة
        }
      }
      if(done) break;
    }
    
    // رسالة اكتمال البث
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

  // إرسال رسالة أولية للتأكد من اتصال العميل
  res.write(`data: ${JSON.stringify({type:"connected", text:"SSE connection established."})}\n\n`);

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
