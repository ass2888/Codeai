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

let clients = [];

app.use(express.static(path.join(__dirname, '..', 'client')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.post('/api/chat', async (req, res) => {
  const { message, convId, code } = req.body;
  broadcast({ type: 'assistant_message', text: 'Processing...' });

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if(!OPENAI_KEY){
    setTimeout(()=> broadcast({ type:'assistant_message', text:'No OPENAI_API_KEY set on server.'}), 400);
    return res.json({ status: 'no-key' });
  }

  try{
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + OPENAI_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: message + "\n\nCurrent code:\n" + (code||'') }],
        max_tokens: 800,
        temperature: 0.2,
        stream: true
      })
    });

    if(!resp.ok){
      const txt = await resp.text();
      broadcast({ type:'assistant_message', text: 'OpenAI error: ' + txt.substring(0,200) });
      return res.json({ status:'openai-error' });
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    while(true){
      const { done, value } = await reader.read();
      if(done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();
      for(const part of parts){
        if(part.startsWith('data: ')){
          const data = part.replace('data: ','').trim();
          if(data === '[DONE]') continue;
          try{
            const parsed = JSON.parse(data);
            const chunk = parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content;
            if(chunk){
              broadcast({ type:'assistant_message', text: chunk });
            }
          }catch(e){}
        }
      }
    }
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
  clients.push({ id, res });
  req.on('close', ()=> { clients = clients.filter(c => c.id !== id); });
});

function broadcast(payload){
  const s = 'data: ' + JSON.stringify(payload) + '\n\n';
  clients.forEach(c => c.res.write(s));
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, ()=> console.log('Server listening on', PORT));
