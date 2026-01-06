export const RENDER_SERVER_URL = 'https://codeai-0sh2.onrender.com'; 

// دالة تشغيل بايثون (تظل هنا لأنها مستقلة)
export function runBrython(userCode) {
    const canvas = document.getElementById('gameCanvas');
    const iframe = document.getElementById('previewFrame');
    
    // إعداد العناصر
    if(iframe) iframe.style.display = 'none';
    if(canvas) {
        canvas.style.display = 'block';
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // تنظيف السكريبتات القديمة
    document.querySelectorAll('.user-python-script').forEach(el => el.remove());

    const pythonBoilerplate = `
from browser import document, window
import sys
if hasattr(window, 'cancelAnimationFrame') and hasattr(window, 'currentGameReq'):
    window.cancelAnimationFrame(window.currentGameReq)
class DOMOutput:
    def write(self, data):
        try:
            if not data or data == '\\n': return
            console_div = document.getElementById("consoleOutputView")
            if console_div: console_div.innerHTML += str(data).replace('\\n', '<br>')
        except: pass
    def flush(self): pass
sys.stdout = DOMOutput()
sys.stderr = DOMOutput()
try:
${userCode.split('\n').map(line => '    ' + line).join('\n')}
except Exception as e:
    print(f"<span style='color:red'>{e}</span>")
`;

    let script = document.createElement('script');
    script.type = 'text/python';
    script.className = 'user-python-script';
    script.innerHTML = pythonBoilerplate;
    document.body.appendChild(script);

    if (window.brython) {
        setTimeout(() => {
            try { window.brython({ debug: 1 }); } catch(err) { console.error(err); }
        }, 100);
    }
}

// إعداد الاتصال بالسيرفر
// core.js

// ... (دالة runBrython وباقي الكود كما هو) ...

// دالة إعداد الاتصال بالسيرفر (نقوم بتصديرها لنستدعيها لاحقاً)
export function startServerConnection() {
    if (typeof EventSource !== 'undefined') {
        const sse = new EventSource(RENDER_SERVER_URL + '/api/events');

        sse.onmessage = (e) => {
            try {
                if (!e.data || e.data.startsWith(':')) return;
                const payload = JSON.parse(e.data);

                if (payload.type === 'assistant_message') {
                    // نرسل البيانات إلى app.js
                    if (window.handleServerPacket) {
                        window.handleServerPacket(payload);
                    } else {
                        console.warn("handleServerPacket not ready yet!");
                    }
                } else if (payload.type === 'frame') {
                    const img = document.getElementById('gameFrame');
                    const loading = document.getElementById('gameLoading');
                    if (img && payload.image) {
                        if (loading) loading.style.display = 'none';
                        img.style.display = 'block';
                        img.src = `data:image/png;base64,${payload.image}`;
                    }
                }
            } catch (err) {
                console.error("Stream Error:", err);
            }
        };
        
        sse.onerror = (err) => {
            console.warn("SSE disconnected, waiting for reconnect...");
        };
    }
}

