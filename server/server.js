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

// قائمة العملاء لتلقي رسائل SSE
let clients = [];

// دالة البث لإرسال رسائل SSE لجميع العملاء المتصلين
function broadcast(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(client => {
    try {
      client.res.write(message);
    } catch (e) {
      console.error('Error broadcasting to client:', e.message);
    }
  });
}

// لخدمة الملفات الساكنة (static files) من مجلد 'client'
app.use(express.static(path.join(__dirname, '..', 'client')));

// لخدمة index.html لجميع المسارات الأخرى
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});


app.post('/api/chat', async (req, res) => {
  const { message, convId, code } = req.body;
  
  // ❌ حذف إرسال رسالة "Processing..." هنا
  // broadcast({ type: 'assistant_message', text: 'Processing...' }); // تم حذف هذا السطر

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if(!GEMINI_KEY){
    // ✅ إبقاء رسالة الخطأ هنا، ولكن يجب أن تكون الوحيدة التي تخرج
    setTimeout(()=> broadcast({ type:'assistant_message', text:'No GEMINI_API_KEY set on server.'}), 400);
    return res.json({ status: 'no-key' });
  }
  
  try{
    // بناء حمولة API لـ Gemini
    const geminiPayload = {
      contents: [{
        parts: [{ 
          text: message + "\n\nCurrent code:\n" + (code || '')
        }]
      }],
      generationConfig: {
        systemInstruction: "You are an expert programmer and code assistant. Provide concise, helpful explanations and write clean, working code. The response should be in markdown format. If you provide code, wrap it in a code block."
      }
    };

    // نداء API لـ Gemini مع تفعيل البث
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=' + GEMINI_KEY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(geminiPayload)
    });

    if(!resp.ok){
      const txt = await resp.text();
      broadcast({ type:'assistant_message', text: 'API Error: ' + txt.substring(0, 100) });
      return res.json({ status: 'api-error' });
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while(true){
      const { value, done } = await reader.read();
      if(done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      const lines = buffer.split('\n');
      buffer = lines.pop(); // الاحتفاظ بالسطر الأخير غير المكتمل في المخزن المؤقت
      
      for(const line of lines){
        if(line.trim().length === 0) continue;
        try{
          const parsed = JSON.parse(line);
          // تصحيح: تحليل بنية استجابة Gemini
          const chunk = parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts[0].text;
          
          if(chunk){
            broadcast({ type:'assistant_message', text: chunk });
          }
        }catch(e){
          // تجاهل أخطاء التحليل للخطوط الجزئية أو غير الصالحة
        }
      }
    }
    
    // رسالة اكتمال البث
    broadcast({ type:'assistant_message', text:'\n[STREAM COMPLETE]' });
    res.json({ status:'ok' });

  }catch(err){
    console.error(err);
    broadcast({ type:'assistant_message', text: 'Server error: ' + err.message });
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
  const newClient = { id, res };
  clients.push(newClient);

  // إرسال رسالة أولية للتأكد من اتصال العميل
  newClient.res.write('data: {"type": "connected", "text": "SSE connection established."}\n\n');

  req.on('close', ()=> { 
    clients = clients.filter(c => c.id !== id);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});