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

app.use(express.static(path.join(__dirname, '..', 'client')));

let clients = [];

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

  try{
    broadcast({ type: 'assistant_message', text: ' ' }); 

    // --- تعديل: إضافة تعليمات للنظام ---
    const systemInstruction = "You are a coding assistant. If you write a full code file or a large snippet, enclose it strictly in ``` code blocks. Do not write large code directly in text paragraphs.";
    
    const payload = {
      contents: [{
        role: "user",
        parts: [{ text: systemInstruction + "\n\nUser Query: " + message + "\n\nCurrent Project Code:\n" + (code||'') }]
      }],
      generationConfig: {
        maxOutputTokens: 2000, // زيادة الحد للسماح بأكواد طويلة
        temperature: 0.2,
      },
    };

    const resp = await fetch('[https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:streamGenerateContent?key=](https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:streamGenerateContent?key=)' + GEMINI_KEY, {
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

      const textMatch = /"text":\s*"((?:[^"\\]|\\.)*)"/g;
      let match;
      let lastIndex = 0;

      while ((match = textMatch.exec(buffer)) !== null) {
          let content = match[1];
          content = content
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
            .replace(/\\u003c/g, '<')
            .replace(/\\u003e/g, '>');
          
          if(content) {
             broadcast({ type:'assistant_message', text: content });
          }
          lastIndex = textMatch.lastIndex;
      }

      if (lastIndex > 0) {
          buffer = buffer.slice(lastIndex);
      }
      if (buffer.length > 20000) buffer = buffer.slice(-5000); 
    }
    
    broadcast({ type:'assistant_message', text:'\n[STREAM COMPLETE]' });
    res.json({ status:'ok' });

  } catch (err) {
    console.error("Error:", err);
    broadcast({ type:'assistant_message', text: 'Server Error.' });
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