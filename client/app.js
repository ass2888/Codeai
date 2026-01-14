const APP_VERSION = 'v1.275.6'; // يمكنك تحديث هذا يدوياً عند كل تحديث للكاش
const versionEl = document.getElementById('appVersion');
if(versionEl) versionEl.textContent = APP_VERSION;

const SETTINGS_KEY = 'codeai_settings';
const RENDER_SERVER_URL = 'https://codeai-0sh2.onrender.com'; // تأكدنا من الرابط

// --- في بداية الملف أو بعد المتغيرات الثابتة ---

const translations = {
    en: {
        settings: "Settings",
        theme: "Theme",
        language: "Language",
        convStyle: "Conv. Style",
        prefLang: "Pref. Code Lang",
        close: "Close",
        newChat: "New chat +",
        convs: "Conversations",
        sendPlaceholder: "Type a message...",
        deleteConfirm: "Confirm Deletion",
        deleteMsgFile: "Are you sure you want to delete this file?",
        deleteMsgConv: "Are you sure you want to delete this conversation?",
        delete: "Delete",
        cancel: "Cancel",
        save: "Save",
        runAll: "ALL",
        edit: "Edit",
        back: "Back",
        projectCode: "Project Code"
    },
    ar: {
        settings: "الإعدادات",
        theme: "المظهر",
        language: "لغة التطبيق",
        convStyle: "أسلوب المحادثة",
        prefLang: "لغة البرمجة",
        close: "إغلاق",
        newChat: "محادثة جديدة +",
        convs: "المحادثات السابقة",
        sendPlaceholder: "اكتب رسالتك هنا...",
        deleteConfirm: "تأكيد الحذف",
        deleteMsgFile: "هل أنت متأكد من حذف هذا الملف؟",
        deleteMsgConv: "هل أنت متأكد من حذف هذه المحادثة؟",
        delete: "حذف",
        cancel: "إلغاء",
        save: "حفظ",
        runAll: "الكل",
        edit: "تعديل",
        back: "رجوع",
        projectCode: "كود المشروع"
    }
};

// تحديث دالة applySettings لتشمل الإعدادات الجديدة
function applySettings() {
    const defaultSettings = {
        accentColor: '#333333',
        fontSize: 'Medium',
        detailLevel: 'Detailed',
        convStyle: 'Detailed', // جديد
        prefLanguage: 'HTML'   // جديد
    };
    
    let settings = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (!settings) {
        settings = defaultSettings;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    // ... الكود السابق ...
    
    return settings;
}

// دالة لتطبيق الترجمة على النصوص
function updateUIText() {
    const lang = localStorage.getItem('codeai_lang') || 'en';
    const t = translations[lang];

    // تحديث النصوص الثابتة عبر data-i18n attribute (يجب إضافته في HTML للعناصر التي تريد ترجمتها)
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) el.textContent = t[key];
    });

    // تحديثات يدوية للعناصر ذات النصوص المباشرة
    document.querySelector('#settingsPage h2').textContent = t.settings;
    document.getElementById('newChatBtn').textContent = t.newChat;
    document.getElementById('closeSettings').textContent = t.close;
    document.getElementById('input').placeholder = t.sendPlaceholder;
    
    // تحديث اتجاه الصفحة
    if(lang === 'ar') {
        document.body.style.fontFamily = "'Tajawal', sans-serif";
    } else {
        document.body.style.fontFamily = "'Segoe UI', Tahoma, sans-serif";
    }
}



// دالة لتحميل الإعدادات من التخزين المحلي وتطبيقها
function applySettings() {
    const defaultSettings = {
        accentColor: '#333333',
        fontSize: 'Medium',     // Small, Medium, Large
        detailLevel: 'Detailed' // Concise, Detailed, Verbose
    };
    
    let settings = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (!settings) {
        settings = defaultSettings;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

document.querySelector('.welcome-logo').addEventListener('contextmenu', function(e) {
    e.preventDefault();
}, false);
    // 1. تطبيق لون التمييز
    document.documentElement.style.setProperty('--accent-color', settings.accentColor);
    
    // 2. تطبيق حجم الخط
    let scale = 1.0;
    if (settings.fontSize === 'Small') scale = 0.85;
    else if (settings.fontSize === 'Large') scale = 1.15;
    document.documentElement.style.setProperty('--font-size-scale', scale);
    
    return settings;
}

// دالة لحفظ إعداد واحد وتطبيق التغييرات (لاستخدامها في معالجات أحداث واجهة الإعدادات)
function saveSetting(key, value) {
    let settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    settings[key] = value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    applySettings(); // أعد تطبيق جميع الإعدادات
}

// >> استدعاء الدالة عند تحميل الصفحة <<
let currentSettings = applySettings(); 
// ... يجب أن تستمر بقية أكواد JavaScript هنا ...

    
    
    let deleteMode = 'file'; // 'file' or 'conv'
    let itemToDeleteId = null; // ID للمحادثة أو Index للملف
    const LINE_HEIGHT = 22; 



document.addEventListener('DOMContentLoaded', () => {// --- التحقق من الأصول (Assets Check) ---
// ملاحظة: نستخدم مسارات نسبية الآن لأن index.html و assets في نفس المستوى داخل client
const requiredAssets = [
    'assets/export-dark.png', 'assets/export-light.png',
    'assets/import-dark.png', 'assets/import-light.png'
];


let assetsMissing = false;
requiredAssets.forEach(src => {
    const img = new Image();
    img.onerror = () => {
        // التحقق فقط وعدم إزعاج المستخدم إلا إذا فشلت الصور الهامة فعلاً
        console.warn("Asset not found:", src);
        document.body.classList.add('assets-error');
    };
    img.src = src;
});
// إنشاء عنصر الضباب ديناميكياً
const blurOverlay = document.createElement('div');
blurOverlay.id = 'mainBlurOverlay';
document.body.appendChild(blurOverlay);

// إغلاق القائمة عند النقر على الضباب
blurOverlay.addEventListener('click', () => {
    closeMenu();
});
    // --- دالة تحديث الضبابية (يجب أن تكون في الأعلى) ---
    
    function updateOverlayOpacity(percent) {
        if (!blurOverlay) return;
        const safePercent = Math.min(Math.max(percent, 0), 1);
        if (safePercent > 0) {
            blurOverlay.classList.add('active');
            blurOverlay.style.opacity = safePercent;
        } else {
            blurOverlay.style.opacity = 0;
            setTimeout(() => { 
                if (blurOverlay.style.opacity == 0) blurOverlay.classList.remove('active'); 
            }, 300);
        }
    }

    // --- Constants & Setup ---
    
    let convs = [];
    try {
        convs = JSON.parse(localStorage.getItem('codeai_convs') || '[]');
    } catch(e) { console.error("Storage corrupted", e); convs=[]; }
    
    let activeId = null;
    let isStreaming = false;
    let safeBuffer = "";
    let typeQueue = []; 
    let typeInterval = null; 
    let currentAiMsgElement = null; 
    let fullMarkdownBuffer = ""; 
    let streamCursor = 0;
    window.lastParsedIndex = 0;
    // --- متغيرات إعادة المحاولة (طلب 3) ---
    let retryCount = 0;
    const maxRetries = 5; // 2s, 4s, 8s, 16s, 32s (5 attempts)
    let retryTimeout = null;
    let statusCountdownInterval = null;
    

    // إدارة الملفات
    let projectFiles = [{ name: 'index.html', content: '// Start coding...' }];
    let activeFileIndex = 0;
    let longPressTimer;
// أضف هذا المتغير مع باقي المتغيرات العامة في الأعلى
    let isPygameInstalled = false;


    // --- Elements ---
    const messagesEl = document.getElementById('messages');
    const codeArea = document.getElementById('codeArea');
    const highlightingContent = document.getElementById('highlighting-content');
    const inputEl = document.getElementById('input');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const topLogo = document.getElementById('topLogo');
    const menuBtn = document.getElementById('menuBtn');
    const menuPanel = document.getElementById('menuPanel');
    const codezone = document.getElementById('codezone');
    const settingsPage = document.getElementById('settingsPage');
    // --- Paste & highlighting optimizations (REPLACE EXISTING related handlers) ---
let isPasting = false;
let highlightTimeout = null;
let saveStateTimeout = null;
const HIGHLIGHT_DEBOUNCE = 400;    // ms after typing to highlight
const SAVE_DEBOUNCE = 1000;        // ms after typing to save to localStorage
const PASTE_THRESHOLD = 3000;      // length considered "large" paste
const PRISM_MAX_LENGTH = 20000;    // above this, skip Prism highlight (fallback to plain text)
    // (طلب 3) بيانات الاقتراحات (عربي وانجليزي)
const suggestionsData = {
    ar: [
        "اريد منك صناعة لعبة جديدة",
        "ساعدني في تعديل الكود",
        "علمني لغة برمجة بايثون",
        "اشرح لي كيف يعمل هذا الكود",
        "أوجد الأخطاء في الكود وصححها",
        "قم بتحسين تصميم واجهة المستخدم",
        "أضف تعليقات توضيحية للكود",
        "حول هذا الكود إلى دالة",
        "كيف أجعل الموقع متجاوباً؟"
    ],
    en: [
        "Create a new game for me",
        "Help me fix this code",
        "Teach me Python programming",
        "Explain how this code works",
        "Find bugs and fix them",
        "Improve the UI design",
        "Add comments to the code",
        "Refactor this into a function",
        "How to make it responsive?"
    ]
};
let currentSuggestionLang = 'ar';

// استبدل دالة runBrython الحالية بهذا الكود:
function runBrython(userCode) {
    const consoleView = document.getElementById('consoleOutputView');
    const canvas = document.getElementById('gameCanvas');
    const iframe = document.getElementById('previewFrame');
    const previewOverlay = document.getElementById('previewOverlay');

    // تجهيز الواجهة
    if(previewOverlay) previewOverlay.classList.add('active');
    if(iframe) iframe.style.display = 'none';
    if(consoleView) consoleView.style.display = 'none';
    
    if(canvas) {
        canvas.style.display = 'block';
        // تنظيف الكانفاس
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // حذف السكربتات القديمة لمنع التكرار
    document.querySelectorAll('.user-python-script').forEach(el => el.remove());

    const pythonBoilerplate = `
from browser import document, window
import sys

# إيقاف الحلقات السابقة
if hasattr(window, 'cancelAnimationFrame') and hasattr(window, 'currentGameReq'):
    window.cancelAnimationFrame(window.currentGameReq)

class DOMOutput:
    def write(self, data):
        try:
            if not data or data == '\\n': return
            console_div = document.getElementById("consoleOutputView")
            if console_div: 
                console_div.style.display = "block"
                console_div.innerHTML += str(data).replace('\\n', '<br>')
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
    // استخدام ID عشوائي لتجنب الكاش
    script.id = 'py_run_' + Math.floor(Math.random() * 10000);
    script.innerHTML = pythonBoilerplate;
    document.body.appendChild(script);

    if (window.brython) {
        setTimeout(() => {
            // تشغيل السكربت المحدد فقط
            try { window.brython({ debug: 1, ids: [script.id] }); } catch(err) { console.error(err); }
        }, 150);
    }
}



// (طلب 3) دالة لإنشاء أزرا
function renderSuggestions() {
    const bar = document.getElementById('suggestionBar');
    if (!bar) return;
    
    bar.innerHTML = ''; 
    
    const list = suggestionsData[currentSuggestionLang] || suggestionsData['ar'];
    
    list.forEach(text => {
        const chip = document.createElement('div');
        chip.className = 'suggestion-chip';
        chip.textContent = text;
        
        chip.onclick = () => {
            // --- التصحيح هنا: الآيدي الصحيح هو input ---
            const textarea = document.getElementById('input'); 
            if(textarea) {
                textarea.value = text;
                textarea.focus();
                
                // تفعيل حدث الإدخال لضبط الارتفاع وحالة الزر
                const event = new Event('input', { bubbles: true });
                textarea.dispatchEvent(event);
            }
        };
        
        bar.appendChild(chip);
    });
}



    // --- Settings Logic ---
        // ... دوال الإعدادات السابقة ...

    window.setConvStyle = function(style) {
        saveSetting('convStyle', style); // دالة saveSetting الموجودة مسبقاً
        document.getElementById('stylePopover').classList.remove('show');
        updateSettingsUI();
    };

    window.setPrefLang = function(plang) {
        saveSetting('prefLanguage', plang);
        document.getElementById('prefLangPopover').classList.remove('show');
        updateSettingsUI();
    };

    // تحديث دالة updateSettingsUI لتعرض القيم الجديدة
    function updateSettingsUI() {
        const t = localStorage.getItem('codeai_theme') || 'dark';
        const l = localStorage.getItem('codeai_lang') || 'en';
        
        // استرجاع الإعدادات الجديدة
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
        const s = settings.convStyle || 'Detailed';
        const p = settings.prefLanguage || 'HTML';

        document.getElementById('themeValue').textContent = t.charAt(0).toUpperCase() + t.slice(1);
        document.getElementById('langValue').textContent = l === 'en' ? 'English' : 'العربية';
        
        document.getElementById('styleValue').textContent = s;
        document.getElementById('prefLangValue').textContent = p;

        document.documentElement.setAttribute('data-theme', t);
        document.documentElement.setAttribute('lang', l);
        
        updateUIText(); // استدعاء الترجمة
    }


    updateSettingsUI();

    window.setTheme = function(mode) {
        localStorage.setItem('codeai_theme', mode);
        document.getElementById('themePopover').classList.remove('show');
        updateSettingsUI();
    };

    window.setLanguage = function(lang) {
        localStorage.setItem('codeai_lang', lang);
        document.getElementById('langPopover').classList.remove('show');
        updateSettingsUI();
        renderMessages();
    };

codeArea.addEventListener('paste', (e) => {
    const pasteText = (e.clipboardData && e.clipboardData.getData) ? e.clipboardData.getData('text') : '';
    if (!pasteText) return;
    // mark as pasting to prevent immediate heavy work
    if (pasteText.length > PASTE_THRESHOLD) {
        isPasting = true;
        // Allow paste to go through, then schedule a single update after short delay
        clearTimeout(highlightTimeout);
        clearTimeout(saveStateTimeout);
        // small delay to let browser insert clipboard into textarea
        setTimeout(() => {
            // update codeArea value already contains pasted text
            
        }, 50);
    }
});



// --- 1. تعريف العناصر والمتغيرات الأساسية (تأكد من وجودها مرة واحدة) ---
    const lineNumbersEl = document.getElementById('lineNumbers');
    const highlightLayer = document.querySelector('.code-highlight-layer');
    

renderSuggestions();

function updateView() {
    let text = codeArea.value;
    
    // هذا السطر يحل مشكلة اختفاء السطر الأخير
    // إذا انتهى النص بـ Enter، نضيف مسافة وهمية ليظهر السطر الجديد
    if(text[text.length-1] === "\n") {
        text += " ";
    }

    // تحديث المحتوى
    highlightingContent.textContent = text;
    
    // تفعيل التلوين
    if(window.Prism) Prism.highlightElement(highlightingContent);

    // تحديث الأرقام
    const numberOfLines = codeArea.value.split('\n').length;
    updateLineNumbers(numberOfLines);
    
    // مزامنة السكرول
    syncScroll();
}
// تحديث المعاينة (محدثة: كشف الأخطاء + إرسالها للـ Outpu

// 2. دالة تشغيل الكود (المحدثة)
// ابحث عن دالة runCode واستبدلها بهذا الكود المحدث
async function runCode() {
    const currentFile = projectFiles[activeFileIndex];
    if (!currentFile) return;

    const ext = currentFile.name.split('.').pop().toLowerCase();
    const code = currentFile.content;

    // عناصر العرض
    const iframe = document.getElementById('previewFrame');
    const canvas = document.getElementById('gameCanvas');
    const consoleView = document.getElementById('consoleOutputView');
    const previewOverlay = document.getElementById('previewOverlay');

    // 1. فتح نافذة المعاينة وتجهيز الواجهة
    previewOverlay.classList.add('active');
    
    // إخفاء الجميع مبدئياً لتجنب التداخل
    iframe.style.display = 'none';
    canvas.style.display = 'none'; // سيتم إظهاره داخل runBrython إذا لزم الأمر
    consoleView.style.display = 'none';
    consoleView.innerHTML = ''; // تنظيف المخرجات السابقة

    // 2. التوجيه حسب نوع الملف
    if (['html', 'css', 'js'].includes(ext)) {
        // --- وضع الويب (HTML/JS) ---
        iframe.style.display = 'block';
        updatePreview(); // دالتك القديمة للمواقع

    } else if (ext === 'py') {
        // --- وضع البايثون (Brython) ---
        // سواء كانت لعبة أو كود نصي، Brython سيتولى الأمر محلياً
        runBrython(code);

    } else {
        // ملفات غير مدعومة
        consoleView.style.display = 'block';
        consoleView.innerHTML = `<div style="color:orange">Running .${ext} files is not supported yet.</div>`;
    }
}
// دالة تشغيل Brython النهائية (إصلاح التنسيق + السرعة + الأخطاء)
function runBrython(userCode) {
    const consoleView = document.getElementById('consoleOutputView');
    const canvas = document.getElementById('gameCanvas');
    const iframe = document.getElementById('previewFrame');
    const gamePreview = document.getElementById('gamePreview'); // شاشة التحميل القديمة
    const previewOverlay = document.getElementById('previewOverlay');

    // 1. فتح نافذة المعاينة
    previewOverlay.classList.add('active');

    // 2. إصلاح التنسيق (إخفاء العناصر المزاحمة)
    iframe.style.display = 'none';       // إخفاء المتصفح
    gamePreview.style.display = 'none';  // هام: إخفاء شاشة "Starting Game" السوداء
    canvas.style.display = 'block';      // إظهار اللعبة
    consoleView.style.display = 'none';  // إخفاء الكونسول مبدئياً

    // 3. تنظيف الكانفاس
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 4. حذف السكربتات القديمة
    document.querySelectorAll('.user-python-script').forEach(el => el.remove());

    // 5. تجهيز كود بايثون
    const pythonBoilerplate = `
from browser import document, window
import sys

# إيقاف أي حلقات تكرار سابقة (Animation Frames) لتسريع اللعبة
if hasattr(window, 'cancelAnimationFrame') and hasattr(window, 'currentGameReq'):
    window.cancelAnimationFrame(window.currentGameReq)

class DOMOutput:
    def write(self, data):
        try:
            # نتجاهل التحديث إذا لم يكن هناك نص حقيقي لتسريع الأداء
            if not data or data == '\\n': return
            
            console_div = document.getElementById("consoleOutputView")
            console_div.innerHTML += str(data).replace('\\n', '<br>')
            # لا نجبر الشاشة على الظهور تلقائياً لمنع تغطية اللعبة
        except:
            pass
    def flush(self): pass

sys.stdout = DOMOutput()
sys.stderr = DOMOutput()

# --- كود المستخدم ---
try:
${userCode.split('\n').map(line => '    ' + line).join('\n')}
except Exception as e:
    print(f"<span style='color:red'>{e}</span>")
    # إظهار الكونسول عند حدوث خطأ فقط
    document["consoleOutputView"].style.display = "block"
`;

    // 6. إنشاء السكريبت
    let script = document.createElement('script');
    script.type = 'text/python';
    script.className = 'user-python-script';
    // استخدام ID بسيط وبدون رموز خاصة لتجنب KeyError
    const scriptID = 'py_run_' + Math.floor(Math.random() * 10000);
    script.id = scriptID;
    script.innerHTML = pythonBoilerplate;
    
    document.body.appendChild(script);

    // 7. تشغيل Brython (مع تأخير بسيط جداً لضمان تحميل العنصر)
    if (window.brython) {
        setTimeout(() => {
            try {
                window.brython({
                    debug: 1,
                    ids: [scriptID] // تشغيل هذا السكربت حصراً
                });
            } catch(err) {
                console.error("Brython Exec Error:", err);
            }
        }, 150); // زيادة الوقت قليلاً (150ms) لحل مشكلة no script with id
    }
}














// 4. دالة تحديث المعاينة وإصلاح السطور (حل مشكلة الـ Token)
function updatePreview() {
    const htmlFile = projectFiles.find(f => f.name.endsWith('.html'))?.content || "";
    const cssFile = projectFiles.find(f => f.name.endsWith('.css'))?.content || "";
    const jsFile = projectFiles.find(f => f.name.endsWith('.js'))?.content || "";

    const previewFrame = document.getElementById('previewFrame');
    
    // حل مشكلة حساب السطور: نضع السكربت في سطر واحد مضغوط لتقليل الـ Offset
    // نستخدم فكرة تقسيم كلمة script لتجنب خطأ Invalid Token
    const startTag = '<' + 'script' + '>';
    const endTag = '<' + '/' + 'script' + '>';

    const errorScript = `
    ${startTag}
    (function(){
        const OFFSET = 40; // تم تقليل عدد الأسطر المحقونة ليكون الحساب دقيقاً
        window.onerror = function(msg, url, line, col) {
            const correctedLine = line - OFFSET;
            window.parent.postMessage({type:'console', level:'error', msg:'❌ Line ' + correctedLine + ': ' + msg}, '*');
            return false;
        };
        console.log = (...a) => window.parent.postMessage({type:'console', level:'log', msg: a.join(' ')}, '*');
    })();
    ${endTag}`;

    const combinedHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>${cssFile}</style>
            ${errorScript}
        </head>
        <body>
            ${htmlFile}
            ${startTag}
            try {
                ${jsFile}
            } catch(e) { console.error(e.message); }
            ${endTag}
        </body>
        </html>
    `;

    previewFrame.srcdoc = combinedHTML;
}

// دالة مساعدة للطباعة في الـ Output
function addToOutput(message, level) {
    const outputContent = document.getElementById('outputContent');
    if (!outputContent) return;
    
    const div = document.createElement('div');
    div.className = `log-item ${level}`;
    div.textContent = message;
    outputContent.appendChild(div);
    outputContent.scrollTop = outputContent.scrollHeight;
}



// دالة المزامنة
function syncScroll() {
    const highlightPre = document.querySelector('.code-highlight-layer');
    if(highlightPre) {
        highlightPre.scrollTop = codeArea.scrollTop;
        highlightPre.scrollLeft = codeArea.scrollLeft;
    }
    lineNumbersEl.scrollTop = codeArea.scrollTop;
}


// دالة توليد أرقام الأسطر
function updateLineNumbers(count) {
    // نتأكد هل تغير العدد فعلاً لتقليل الضغط على المتصفح
    if (lineNumbersEl.childElementCount !== count) {
        let linesHTML = '';
        for (let i = 1; i <= count; i++) {
            linesHTML += `<div>${i}</div>`;
        }
        lineNumbersEl.innerHTML = linesHTML;
    }
}

// ربط الأحداث
codeArea.addEventListener('input', updateView);
codeArea.addEventListener('scroll', syncScroll); // ربط السكرول
codeArea.addEventListener('keydown', (e) => {
    // دعم زر التاب (اختياري لتحسين التجربة)
    if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand('insertText', false, '    ');
    }
});

// تشغيل أولي
updateView();

    // دالة تحديث أرقام الأسطر
    

    // --- 3. معالجة الأحداث (Event Handlers) الموحدة ---

    // أ) عند الكتابة العادية (Input)
    codeArea.addEventListener('input', () => {
        // 1. تحديث المتغيرات
        projectFiles[activeFileIndex].content = codeArea.value;
        
        // 2. تحديث العرض فوراً (أو تأخيره قليلاً إذا كان لصقاً ضخماً)
        if (!isPasting) {
            updateView();
        }

        // 3. حفظ الحالة (Save) بعد توقف الكتابة بثانية
        clearTimeout(saveStateTimeout);
        saveStateTimeout = setTimeout(() => {
            const conv = convs.find(c => c.id === activeId);
            if (conv) {
                conv.files = projectFiles;
                conv.code = projectFiles[0].content;
            }
            saveState();
        }, SAVE_DEBOUNCE);
    });

    // ب) عند اللصق (Paste)
    codeArea.addEventListener('paste', (e) => {
        // نضع علامة أننا نقوم باللصق لمنع التحديث الثقيل المتكرر
        isPasting = true;
        
        // ننتظر قليلاً حتى يقوم المتصفح بوضع النص داخل الـ textarea
        setTimeout(() => {
            isPasting = false;
            // إجبار التحديث
            projectFiles[activeFileIndex].content = codeArea.value;
            updateView(); 
        }, 50);
    });
// في قسم الـ Script

// دالة المزامنة


// تفعيل المزامنة عند السكرول
codeArea.addEventListener('scroll', syncScroll);

// تفعيل المزامنة عند الكتابة واللمس (لضمان عدم التأخر)
codeArea.addEventListener('input', syncScroll);
codeArea.addEventListener('touchmove', syncScroll);


    // تشغيل أولي
    updateView();

    
  
    


    

    if (typeof marked !== 'undefined') {
        marked.setOptions({ gfm: true, breaks: true });
    }

    // --- Event Listeners (UI) ---
    

    document.getElementById('newChatBtn').addEventListener('click', () => {
        activeId = null;
        codeArea.value = '// start';
        updateView();
        renderMessages();
        menuPanel.classList.remove('open');
        menuBtn.classList.remove('active');
    });

    document.getElementById('openSettings').addEventListener('click', () => {
        settingsPage.classList.add('open');
        menuPanel.classList.remove('open');
        menuBtn.classList.remove('active');
    });

    document.getElementById('closeSettings').addEventListener('click', () => {
        settingsPage.classList.remove('open');
    });

    document.getElementById('themeBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('themePopover').classList.toggle('show');
        document.getElementById('langPopover').classList.remove('show');
    });
    
    document.getElementById('langBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('langPopover').classList.toggle('show');
        document.getElementById('themePopover').classList.remove('show');
    });
    
       // ... داخل DOMContentLoaded ...

    // زر نمط المحادثة
    document.getElementById('styleBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('stylePopover').classList.toggle('show');
        // إغلاق القوائم الأخرى
        document.getElementById('themePopover').classList.remove('show');
        document.getElementById('langPopover').classList.remove('show');
        document.getElementById('prefLangPopover').classList.remove('show');
    });

    // زر اللغة المفضلة
    document.getElementById('prefLangBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('prefLangPopover').classList.toggle('show');
        // إغلاق القوائم الأخرى
        document.getElementById('themePopover').classList.remove('show');
        document.getElementById('langPopover').classList.remove('show');
        document.getElementById('stylePopover').classList.remove('show');
    });

    // إغلاق الجميع عند النقر خارجاً (تحديث الكود الموجود)
    document.addEventListener('click', () => {
        document.querySelectorAll('.popover-options').forEach(el => el.classList.remove('show'));
    });


// --- Improved Swipe Codezone Logic ---
// ==========================================
// 1. منطق سحب صفحة الكود (Codezone) - محدث ومنفصل
// ==========================================
let codeStartX = 0;
let codeStartY = 0;

// استخدام codezone.addEventListener بدلاً من document لتقليل التداخل



    document.getElementById('closeCodeBtn').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // 1. إزالة كلاس الفتح
        codezone.classList.remove('open');
        
        // 2. إعادة الموقع إلى الوضع الطبيعي (خارج الشاشة يميناً)
        codezone.style.transform = 'translateX(0)'; 
        
        // 3. إخفاء الضبابية إذا كانت موجودة
        if (typeof updateOverlayOpacity === 'function') {
            updateOverlayOpacity(0);
        } else {
            const overlay = document.getElementById('mainBlurOverlay');
            if (overlay) {
                overlay.style.opacity = '0';
                overlay.classList.remove('active');
            }
        }
    });
        // Preview Logic
    const runFab = document.getElementById('runFab');
    
    runFab.addEventListener('click', () => {
        // نستدعي الدالة التي تقرر هل تشغل اللعبة أم الموقع
        runCode(); 
    });


    const previewOverlay = document.getElementById('previewOverlay');
    
    document.getElementById('closePreviewMain').addEventListener('click', () => {
        previewOverlay.classList.remove('active');
    });

    // Input Logic
    inputEl.addEventListener('input', function() {
       // --- بداية التعديل: فحص اللغة ---
        const isArabic = /[\u0600-\u06FF]/.test(this.value);
        this.style.direction = isArabic ? 'rtl' : 'ltr';
        // -----------------------------

        checkInputState(); // التأكد من استدعاء هذه الدالة
        
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 150) + 'px';
        this.style.overflowY = this.scrollHeight > 150 ? 'auto' : 'hidden';
    });
    inputEl.addEventListener('keydown', e => { 
        if(e.key==='Enter' && !e.shiftKey){ 
            e.preventDefault(); 
            document.getElementById('sendBtn').click(); 
        }
    });

    document.getElementById('sendBtn').addEventListener('click', ()=> {
        const v = inputEl.value.trim();
        if(!v) return;
        inputEl.value=''; 
        inputEl.style.height = 'auto';
        sendMessage(v);
    });

    // --- Tab & File Management System ---
    const tabModal = document.getElementById('tabModal');
    const tabNameInput = document.getElementById('tabNameInput');
    let editingTabIndex = -1;
    const deleteConfirmModal = document.getElementById('deleteConfirmModal');
    const delModalMsg = document.getElementById('delModalMsg');
    const delModalTitle = document.getElementById('delModalTitle');
    const realDeleteBtn = document.getElementById('realDeleteBtn');
    
    // 1. تعديل زر الحذف في المودال الأول ليقوم فقط بفتح مودال التأكيد
    document.getElementById('modalDeleteBtn').addEventListener('click', () => {
        if (editingTabIndex > -1 && projectFiles.length > 1) {
            // إغلاق مودال التعديل أولاً
            closeTabModal();
            
            // تجهيز نصوص مودال التأكيد حسب اللغة
            const currentLang = localStorage.getItem('codeai_lang') || 'en';
            const fileName = projectFiles[editingTabIndex].name;
            
            if (currentLang === 'ar') {
                delModalTitle.textContent = "تأكيد الحذف";
                delModalMsg.textContent = `هل أنت متأكد أنك تريد حذف الملف "${fileName}"؟`;
                realDeleteBtn.textContent = "حذف";
                document.getElementById('cancelDeleteConfirmBtn').textContent = "إلغاء";
            } else {
                delModalTitle.textContent = "Confirm Deletion";
                delModalMsg.textContent = `Are you sure you want to delete "${fileName}"?`;
                realDeleteBtn.textContent = "Delete";
                document.getElementById('cancelDeleteConfirmBtn').textContent = "Cancel";
            }
            
            // فتح مودال التأكيد
            deleteConfirmModal.classList.add('active');
        }
    });
// --- منطق الحذف الموحد ---

    // 1. زر "تأكيد الحذف" الأحمر النهائي
    realDeleteBtn.addEventListener('click', () => {
        const currentLang = localStorage.getItem('codeai_lang') || 'en';
        
        if (deleteMode === 'file') {
            // منطق حذف الملف (القديم)
            if (editingTabIndex > -1 && projectFiles.length > 1) {
                projectFiles.splice(editingTabIndex, 1);
                if (activeFileIndex >= projectFiles.length) activeFileIndex = projectFiles.length - 1;
                else if (activeFileIndex > editingTabIndex) activeFileIndex--;
                
                codeArea.value = projectFiles[activeFileIndex].content;
                updateView();
                renderTabs();
            }
        } else if (deleteMode === 'conv') {
            // منطق حذف المحادثة (الجديد)
            convs = convs.filter(c => c.id !== itemToDeleteId);
            saveState();
            
            // إذا حذفنا المحادثة المفتوحة حالياً
            if (activeId === itemToDeleteId) {
                activeId = null;
                messagesEl.innerHTML = '';
                welcomeScreen.classList.remove('hidden');
                topLogo.style.opacity = '0';
                // تصفير المحرر
                projectFiles = [{ name: 'index.html', content: '// Start coding...' }];
                activeFileIndex = 0;
                renderTabs();
                updateView();
            }
            renderConversations();
            document.getElementById('convOptionsModal').classList.remove('active');
        }

        // إغلاق مودال التأكيد
        deleteConfirmModal.classList.remove('active');
        editingTabIndex = -1;
    });

    // 2. زر حذف الملف (من داخل مودال تبويب الملفات)
    document.getElementById('modalDeleteBtn').addEventListener('click', () => {
        if (editingTabIndex > -1 && projectFiles.length > 1) {
            closeTabModal();
            deleteMode = 'file'; // تحديد الوضع
            
            // النصوص
            const fileName = projectFiles[editingTabIndex].name;
            const currentLang = localStorage.getItem('codeai_lang') || 'en';
            setupDeleteModalText(currentLang, fileName, false);
            
            deleteConfirmModal.classList.add('active');
        }
    });

    // دالة مساعدة لضبط نصوص الحذف
    function setupDeleteModalText(lang, name, isConv) {
        if (lang === 'ar') {
            delModalTitle.textContent = "تأكيد الحذف";
            delModalMsg.textContent = isConv 
                ? `هل أنت متأكد من حذف المحادثة "${name}"؟ هذا الإجراء لا يمكن التراجع عنه.`
                : `هل أنت متأكد من حذف الملف "${name}"؟`;
            realDeleteBtn.textContent = "حذف نهائي";
            document.getElementById('cancelDeleteConfirmBtn').textContent = "إلغاء";
        } else {
            delModalTitle.textContent = "Confirm Deletion";
            delModalMsg.textContent = isConv
                ? `Are you sure you want to delete conversation "${name}"? This action cannot be undone.`
                : `Are you sure you want to delete "${name}"?`;
            realDeleteBtn.textContent = "Delete";
            document.getElementById('cancelDeleteConfirmBtn').textContent = "Cancel";
        }
    }


    function openTabModal(index) {
        editingTabIndex = index;
        tabNameInput.value = projectFiles[index].name;
        
        const delBtn = document.getElementById('modalDeleteBtn');
        if (projectFiles.length <= 1) delBtn.style.display = 'none';
        else delBtn.style.display = 'block';

        tabModal.classList.add('active');
    }
    
    // دالة عامة لإغلاق المودالات بأنميشن (للطلب 2 وغيره)
function closeAnimatedModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.add('closing');
    setTimeout(() => {
        modal.classList.remove('active');
        modal.classList.remove('closing');
    }, 300); // نفس مدة الأنميشن في CSS
}
    
function closeTabModal() {
        tabModal.classList.add('closing');
        setTimeout(() => {
            tabModal.classList.remove('active');
            tabModal.classList.remove('closing');
            // قمنا بإزالة: editingTabIndex = -1; من هنا
            // لأننا نحتاج القيمة أن تبقى موجودة لمودال التأكيد
        }, 300);
    }

    // يجب إضافة التصفير هنا عند إلغاء المودال الأول يدوياً
    document.getElementById('modalCancelBtn').addEventListener('click', () => {
        closeTabModal();
        editingTabIndex = -1; // تصفير آمن
    });
    
    document.getElementById('modalSaveBtn').addEventListener('click', () => {
        if (editingTabIndex > -1) {
            const newName = tabNameInput.value.trim();
            if (newName) {
                projectFiles[editingTabIndex].name = newName;
                renderTabs();
            }
        }
        closeTabModal();
    });

    
function renderTabs() {
    const container = document.getElementById('tabsContainer');
    const addBtn = document.getElementById('addTabBtn');
    
    // مسح القديم
    Array.from(container.children).forEach(child => {
        if (child.id !== 'addTabBtn') container.removeChild(child);
    });

    const totalTabs = projectFiles.length;

    projectFiles.forEach((file, index) => {
        const tab = document.createElement('div');
        tab.className = `tab ${index === activeFileIndex ? 'active' : ''}`;
        tab.textContent = file.name;
        
        // --- منطق z-index الجديد (تم التعديل) ---
        if (index === activeFileIndex) {
            tab.style.zIndex = 5000; // النشط دائماً في القمة
        } else {
            // الترتيب التنازلي للتبويبات غير النشطة:
            // هذا يضمن أن اليسار يغطي اليمين
            // 0 (اليسار) يأخذ 100، 1 يأخذ 99، وهكذا.
            tab.style.zIndex = 100 - index; 
        }

        tab.addEventListener('click', () => switchTab(index));

        // أحداث اللمس (Long Press)
        tab.addEventListener('touchstart', () => {
            longPressTimer = setTimeout(() => openTabModal(index), 800);
        });
        tab.addEventListener('touchend', () => clearTimeout(longPressTimer));
        tab.addEventListener('contextmenu', (e) => { 
            e.preventDefault();
            openTabModal(index);
        });
        
        container.insertBefore(tab, addBtn);
    });
}
    

    function switchTab(index) {
        projectFiles[activeFileIndex].content = codeArea.value;
        activeFileIndex = index;
        codeArea.value = projectFiles[index].content;
        updateView();
        renderTabs();
    }

    function addNewTab() {
        projectFiles[activeFileIndex].content = codeArea.value;
        const newName = "Untitled" + (projectFiles.length > 0 ? projectFiles.length : "") + ".html";
        projectFiles.push({ name: newName, content: "" });
        activeFileIndex = projectFiles.length - 1;
        codeArea.value = "";
        updateView();
        renderTabs();
    }

    // --- Button Actions ---
    document.getElementById('btnExport').addEventListener('click', () => {
        const currentFile = projectFiles[activeFileIndex];
        currentFile.content = codeArea.value;
        
        const blob = new Blob([currentFile.content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = currentFile.name;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    });

    document.getElementById('btnCopy').addEventListener('click', () => {
        navigator.clipboard.writeText(codeArea.value).then(() => {
            const btn = document.getElementById('btnCopy');
            const originalText = btn.textContent;
            btn.textContent = "✔";
            setTimeout(() => btn.textContent = originalText, 1500);
        });
    });
    
    // --- Edit Mode Logic ---
    const btnEdit = document.getElementById('btnEdit');
    // الوضع الافتراضي: للقراءة فقط
    let isEditMode = false;
    codeArea.setAttribute('readonly', 'true'); 

    btnEdit.addEventListener('click', () => {
        isEditMode = !isEditMode;
        if (isEditMode) {
            codeArea.removeAttribute('readonly');
            btnEdit.classList.add('active-edit');
            codeArea.focus();
        } else {
            codeArea.setAttribute('readonly', 'true');
            btnEdit.classList.remove('active-edit');
        }
    });

    const fileInput = document.getElementById('importFileInput');
    document.getElementById('btnImport').addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            const content = e.target.result;
            codeArea.value = content;
            projectFiles[activeFileIndex].content = content;
            projectFiles[activeFileIndex].name = file.name;
            updateView();
            renderTabs();
        };
        reader.readAsText(file);
        fileInput.value = '';
    });

    document.getElementById('addTabBtn').addEventListener('click', addNewTab);
    
    function renderMessages(){
    messagesEl.innerHTML = '';
    
    if(!activeId || !convs.find(c=>c.id===activeId)) {
        welcomeScreen.classList.remove('hidden');
        return;
    }
    welcomeScreen.classList.add('hidden');

    const conv = convs.find(c=>c.id===activeId);
    
    conv.messages.forEach((m, index) => {
        const d = document.createElement('div');
        
        // فحص اللغة
        const isArabic = /[\u0600-\u06FF]/.test(m.text);
        const dirClass = isArabic ? 'rtl' : 'ltr';
        
       let extraClass = (m.role === 'ai') ? ' static' : ''; 
    
    d.className = 'msg ' + (m.role === 'user' ? 'user' : 'ai') + ' ' + dirClass + extraClass;
        
        let htmlContent = typeof marked !== 'undefined' ? marked.parse(m.text || '') : m.text;
        
        if (m.role === 'user') {
            d.innerHTML = htmlContent;
        } else {
            // --- التعديل الجوهري (طلب 4): هيكل الأيقونة والنص ---
            // رمز الأيقونة يعتمد على الاتجاه (يمكنك تغييره لصورة شعار)
            const avatarSymbol = '>'; 
            
            d.innerHTML = `
                <div class="ai-avatar">${avatarSymbol}</div>
                <div class="ai-content">${htmlContent}</div>
            `;
            
            // في حالة الستريمنج (الكتابة المباشرة)
            if (isStreaming && index === conv.messages.length - 1) {
                currentAiMsgElement = d; // نحفظ الحاوية الكبيرة
                // لا نضع النص هنا لأن typeLoop سيقوم بذلك
            } else {
                // للمحادثات القديمة: إضافة الأزرار
                addMessageActions(d.querySelector('.ai-content'), m.text);
            }
        }
        
        messagesEl.appendChild(d);
    });
    
    // سكرول للأسفل
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    // تحديث حالة زر الإرسال بناءً على وجود نص في الصندوق
    checkInputState();
}
   
    
    

// --- متغيرات ودوال نظام الحالة (Status System) ---
let currentStatusEl = null;   // عنصر الحالة الحالي
let statusInterval = null;    // مؤقت حركة النقاط
let statusDotCount = 3;       // عدد النقاط الحالي
let statusDirection = -1;     // اتجاه الحركة (-1 للحذف، 1 للإضافة)
let currentStatusBase = "";   // النص الأساسي (Sending, Thinking...)

function showStatus(baseText) {
    // إزالة القديم إن وجد
    removeStatus();

    currentStatusBase = baseText;
    statusDotCount = 3; 
    statusDirection = -1;

    // إنشاء العنصر
    currentStatusEl = document.createElement('div');
    currentStatusEl.className = 'status-indicator';
    currentStatusEl.innerText = baseText + "...";
    
    messagesEl.appendChild(currentStatusEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // بدء أنميشن النقاط (3 -> 0 -> 3)
    statusInterval = setInterval(() => {
        // تحديث عدد النقاط
        statusDotCount += statusDirection;
        
        if (statusDotCount <= 0) {
            statusDotCount = 0;
            statusDirection = 1; // عكس الاتجاه للإضافة
        } else if (statusDotCount >= 3) {
            statusDotCount = 3;
            statusDirection = -1; // عكس الاتجاه للحذف
        }

        const dots = ".".repeat(statusDotCount);
        if (currentStatusEl) {
            currentStatusEl.innerText = currentStatusBase + dots;
        }
    }, 300); // سرعة التحديث (تغيير نقطة كل 300 ملي ثانية)
}

function ensureTypingCursor() {
    if (!currentAiMsgElement) return;

    let cursor = currentAiMsgElement.querySelector('.typing-cursor-styled');
    if (!cursor) {
        cursor = document.createElement('span');
        cursor.className = 'typing-cursor-styled';
        currentAiMsgElement.appendChild(cursor);
    }
}

function updateStatusText(newBase) {
    currentStatusBase = newBase;
    // يتم التحديث الفعلي للنص في الدورة القادمة للـ Interval
    // أو يمكن التحديث فوراً لتجنب التأخير
    if (currentStatusEl) {
        const dots = ".".repeat(statusDotCount);
        currentStatusEl.innerText = newBase + dots;
    }
}

function removeStatus() {
    if (statusInterval) clearInterval(statusInterval);
    if (currentStatusEl) {
        currentStatusEl.remove();
        currentStatusEl = null;
    }
}

    function saveState(){ localStorage.setItem('codeai_convs', JSON.stringify(convs)); }
    // تم تحديث الدالة لتقبل معامل اختياري isRetry
async function sendMessage(text, isRetry = false){
    if(!text) return;
  
    // في المحاولة الأولى فقط نقوم بتعطيل الواجهة وإضافة الرسائل
    if (!isRetry) {
        document.getElementById('sendBtn').classList.add('disabled');
        welcomeScreen.classList.add('hidden');
        retryCount = 0; // تصفير عداد المحاولات
        clearTimeout(retryTimeout);
        clearInterval(statusCountdownInterval);

        if (!activeId) {
          
            const newId = Date.now().toString();
            projectFiles = [{ name: 'index.html', content: '// Start coding...' }];
            activeFileIndex = 0;
            convs.unshift({ id: newId, title: text.substring(0, 30), messages: [], files: projectFiles, code: '' });
            activeId = newId;
            // DEBUG --- console.log({ id: newId, title: text.substring(0, 30), messages: [], files: projectFiles, code: '' });
            renderConversations();
        }

        const conv = convs.find(c=>c.id===activeId);
        conv.messages.push({role:'user', text});
        saveState();

        appendUserMessage(text); 

        conv.messages.push({role:'ai', text:''}); 
        saveState();
    }

    // 1. الحالة: Sending
    showStatus("Sending"); 

    isStreaming = true;
    serverFinished = false;
    safeBuffer = ""; fullMarkdownBuffer = ""; typeQueue = []; streamCursor = 0; currentAiMsgElement = null;



    // تجهيز الإعدادات الحالية
     currentSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    const appTheme = localStorage.getItem('codeai_theme') || 'dark'; // نحتاج الثيم بشكل منفصل
    
    // تجهيز سياق التاريخ (آخر رسالتين + الرسالة الحالية تتم إضافتها في السيرفر أو هنا)
    // هنا سنرسل آخر 4 رسائل (2 مستخدم + 2 ذكاء اصطناعي) لضمان السياق
    // داخل sendMessage في app.js
const conv = convs.find(c=>c.id===activeId);
let historyContext = [];

// إضافة تحقق للتأكد من وجود المحادثة والرسائل
if (conv && conv.messages) {
    historyContext = conv.messages.slice(-4); 
} else {
    historyContext = []; // مصفوفة فارغة إذا كانت محادثة جديدة
}


    try {
        const response = await fetch(RENDER_SERVER_URL + '/api/chat', { 
            method:'POST', 
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ 
                message: text, 
                convId: activeId, 
                files: projectFiles,
                // البيانات الجديدة
                history: historyContext, 
                settings: {
                    ...currentSettings,
                    theme: appTheme
                }
            })
        });
        // ... باقي الكود ...


        // --- (طلب 3) فحص خطأ 503 ---
        if (response.status === 503) {
            handle503Error(text);
            return; // الخروج لانتظار المحاولة القادمة
        }
        // ---------------------------

        if(response.ok) {
            // إذا نجح الاتصال، نصفر عداد المحاولات
            retryCount = 0;
            updateStatusText("Thinking");
        } else {
            // معالجة أخطاء أخرى غير 503 (اختياري)
            throw new Error(`Server Error: ${response.status}`);
        }

    } catch(err){
        console.error(err);
        // إذا كان الخطأ شبكة وليس رد من السيرفر، يمكن اعتباره مثل 503
        if (!navigator.onLine || err.message.includes('Failed to fetch')) {
             handle503Error(text);
        } else {
             retryCount = 0; // خطأ قاتل آخر، لا نعيد المحاولة
             finalizeError("Sorry, an error occurred.");
        }
    }
}

// --- (طلب 3) دوال معالجة خطأ 503 وإعادة المحاولة ---

function handle503Error(text) {
    removeStatus(); // إزالة الحالة الحالية (Sending...)
    isStreaming = false;

    if (retryCount < maxRetries) {
        // حساب وقت الانتظار: 2 أس (عدد المحاولات + 1) -> 2, 4, 8, 16, 32
        let delaySec = Math.pow(2, retryCount + 1);
        retryCount++;

        // بدء العد التنازلي في شريط الحالة
        startCountdownStatus(delaySec, text);

    } else {
        // استنفذنا كل المحاولات
        retryCount = 0;
        finalizeError("Server error, please try again later.");
    }
}

function startCountdownStatus(seconds, textToRetry) {
    let remaining = seconds;

    // تحديث النص فوراً
    updateStatusText(`Sending in ${remaining}s`);

    // مؤقت لتحديث الرقم كل ثانية
    clearInterval(statusCountdownInterval);
    statusCountdownInterval = setInterval(() => {
        remaining--;
        if (remaining > 0) {
            updateStatusText(`Sending in ${remaining}s`);
        } else {
            clearInterval(statusCountdownInterval);
            // انتهى الوقت، نعيد المحاولة
            sendMessage(textToRetry, true); 
        }
    }, 1000);
}

// دالة مساعدة لإنهاء العملية بخطأ وإظهاره في الدردشة
function finalizeError(errorMsg) {
    removeStatus();
    isStreaming = false;
    checkInputState(); // إعادة تفعيل زر الإرسال

    const d = document.createElement('div');
    d.className = 'msg ai ltr error'; // كلاس error لتنسيق مختلف إن أردت
    d.style.color = '#ff4444';
    d.innerHTML = `<div class="ai-avatar" style="color:#ff4444">!</div><div class="ai-content">${errorMsg}</div>`;
    messagesEl.appendChild(d);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // إزالة الرسالة الفارغة الأخيرة من المصفوفة
    const conv = convs.find(c => c.id === activeId);
    if (conv && conv.messages.length > 0 && conv.messages[conv.messages.length-1].role === 'ai') {
        conv.messages.pop();
        saveState();
    }
}
// --------------------------------------------------
    
// دالة مساعدة جديدة لإضافة رسالة المستخدم (محدثة لطلب 4)
function appendUserMessage(text) {
    const d = document.createElement('div');
    
    const isArabic = /[\u0600-\u06FF]/.test(text);
    const dirClass = isArabic ? 'rtl' : 'ltr';
    
    d.className = 'msg user new-msg ' + dirClass;
    d.innerText = text; 

    // --- (طلب 4) إضافة زر النسخ المخفي ---
    const copyBtn = document.createElement('button');
    copyBtn.className = 'user-copy-btn';
    copyBtn.title = 'Copy Message';
    
    // حدث النسخ
    copyBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // لمنع تفعيل حدث النقر على الرسالة نفسها
        navigator.clipboard.writeText(text).then(() => {
            // تأثير بصري سريع للزر
            copyBtn.style.backgroundColor = 'var(--accent-color)';
            setTimeout(() => copyBtn.style.backgroundColor = '', 200);
        });
    });

    d.appendChild(copyBtn);

    // حدث النقر على الرسالة لإظهار/إخفاء الزر
    d.addEventListener('click', function() {
        // إزالة الكلاس من أي رسالة أخرى نشطة أولاً
        document.querySelectorAll('.msg.user.active').forEach(el => {
            if (el !== this) el.classList.remove('active');
        });
        // تبديل الحالة للرسالة الحالية
        this.classList.toggle('active');
    });
    // ------------------------------------
    
    messagesEl.appendChild(d);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}


   
    // إصلاح خلل ReferenceError: summarizeConversation
function summarizeConversation() {
    if (!activeId) return;
    const conv = convs.find(c => c.id === activeId);
    if (!conv || conv.messages.length === 0) return;

    // البحث عن أول رسالة للمستخدم
    const firstUserMsg = conv.messages.find(m => m.role === 'user');
    
    if (firstUserMsg) {
        // نأخذ أول سطر أو أول 40 حرف ليكون عنوان المحادثة
        let newTitle = firstUserMsg.text.split('\n')[0].substring(0, 40);
        if (firstUserMsg.text.length > 40) newTitle += '...';
        
        // تحديث العنوان والحفظ
        conv.title = newTitle;
        saveState();
        renderConversations();
    }
}
    
    
    const convOptionsModal = document.getElementById('convOptionsModal');
    const convRenameInput = document.getElementById('convRenameInput');
    let editingConvId = null;

    function renderConversations() {
        const c = document.getElementById('convList');
        c.innerHTML = '';
        convs.forEach(cv => {
            const el = document.createElement('div');
            el.style.padding = '14px';
            el.style.borderBottom = '1px solid var(--border-color)';
            el.style.cursor = 'pointer';
            el.style.color = 'var(--text-color)';
            el.style.userSelect = 'none'; // منع تحديد النص عند الضغط المطول
            el.textContent = cv.title;

            // فتح المحادثة (نقر عادي)
            el.addEventListener('click', () => {
                activeId = cv.id;
                if (cv.files && Array.isArray(cv.files)) {
                    projectFiles = cv.files;
                } else {
                    projectFiles = [{ name: 'index.html', content: cv.code || '' }];
                }
                activeFileIndex = 0;
                codeArea.value = projectFiles[0].content;
                renderTabs();
                updateView();
                renderMessages();
                menuPanel.classList.remove('open');
                menuBtn.classList.remove('active');
            });

            // الضغط المطول (للتعديل والحذف)
            let pressTimer;
            el.addEventListener('touchstart', () => {
                pressTimer = setTimeout(() => openConvOptions(cv), 800);
            });
            el.addEventListener('touchend', () => clearTimeout(pressTimer));
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                openConvOptions(cv);
            });

            c.appendChild(el);
        });
    }

    function openConvOptions(conv) {
        editingConvId = conv.id;
        convRenameInput.value = conv.title;
        convOptionsModal.classList.add('active');
    }

    // أزرار مودال خيارات المحادثة
    document.getElementById('btnCloseConvModal').addEventListener('click', () => {
        closeAnimatedModal('convOptionsModal');
    });

    document.getElementById('btnSaveConvName').addEventListener('click', () => {
        if (editingConvId) {
            const newName = convRenameInput.value.trim();
            if (newName) {
                const cv = convs.find(c => c.id === editingConvId);
                if (cv) {
                    cv.title = newName;
                    saveState();
                    renderConversations();
                }
            }
        }
        closeAnimatedModal('convOptionsModal');
    });

    document.getElementById('btnDeleteConv').addEventListener('click', () => {
        if (editingConvId) {
            deleteMode = 'conv';
            itemToDeleteId = editingConvId;
            
            // إغلاق مودال الخيارات وفتح مودال التأكيد
            convOptionsModal.classList.remove('active');
            
            const cv = convs.find(c => c.id === editingConvId);
            const currentLang = localStorage.getItem('codeai_lang') || 'en';
            setupDeleteModalText(currentLang, cv ? cv.title : 'Conversation', true);
            
            deleteConfirmModal.classList.add('active');
        }
    });
    
    // دالة فحص حالة زر الإرسال
function checkInputState() {
    const btn = document.getElementById('sendBtn');
    const val = inputEl.value.trim();
    
    // إذا كان هناك كتابة (أو ستريمنج)، اجعله معطلاً، إلا إذا انتهى الستريمنج وكان الحقل ممتلئاً
    if (val.length === 0 || isStreaming) {
        btn.classList.add('disabled');
    } else {
        btn.classList.remove('disabled');
    }
}

// أضف مستمع الحدث لحقل الإدخال ليتم الفحص عند كل حرف
inputEl.addEventListener('input', function() {
    checkInputState();
    // ... بقية كود تغيير ارتفاع الصندوق الموجود سابقاً ...
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 150) + 'px';
    this.style.overflowY = this.scrollHeight > 150 ? 'auto' : 'hidden';
});
    
    
    // متغيرات التحكم
let typeTimeout = null;
let serverFinished = false; // هل انتهى السيرفر من الإرسال؟
function startTyping() {
    function typeLoop() {
        if (typeQueue.length > 0) {
            const char = typeQueue.shift();
            fullMarkdownBuffer += char;

            if (currentAiMsgElement) {
                // --- تعديل: الكتابة داخل عنصر المحتوى وليس الحاوية الرئيسية ---
                const contentEl = currentAiMsgElement.querySelector('.ai-content');
                
                if (contentEl) {
                    // أثناء الكتابة نعرض النص الخام (Markdown)
                    contentEl.textContent = fullMarkdownBuffer;
                }
                
                messagesEl.scrollTop = messagesEl.scrollHeight;
            }

            // ... (بقية منطق السرعة كما هو دون تغيير) ...
            const writtenLen = fullMarkdownBuffer.length;
            const MIN_DELAY = 2; const MAX_DELAY = 40; const ACCELERATION_POINT = 400;
            const progress = Math.min(writtenLen / ACCELERATION_POINT, 1);
            let delay = MAX_DELAY - (progress * (MAX_DELAY - MIN_DELAY));
            delay = Math.round(delay);

            typeTimeout = setTimeout(typeLoop, delay);
        } else {
            if (serverFinished) {
                finishMessageProcessing();
            } else {
                typeTimeout = null; 
            }
        }
    }
    typeLoop();
}


function updateTypingCursor() {
    if (!currentAiMsgElement) return;

    let cursor = currentAiMsgElement.querySelector('.typing-cursor-styled');
    if (!cursor) {
        cursor = document.createElement('span');
        cursor.className = 'typing-cursor-styled';
        currentAiMsgElement.appendChild(cursor);
    }

    const style = window.getComputedStyle(currentAiMsgElement);
    const lineHeight = parseFloat(style.lineHeight);

    const lines = currentAiMsgElement.textContent.split('\n').length;
    cursor.style.top = ((lines - 1) * lineHeight) + 'px';
}



// دالة جديدة لإنهاء المعالجة وإظهار الأز
function finishMessageProcessing() {
    typeTimeout = null;
    serverFinished = false;
    removeStatus();

    if (activeId && currentAiMsgElement) {
       
       currentAiMsgElement.classList.add('static');
        // 1. حفظ النص النهائي في المصفوفة
        const conv = convs.find(c => c.id === activeId);
        if (conv && conv.messages.length > 0) {
            // التأكد من أن النص ليس فارغاً
            conv.messages[conv.messages.length - 1].text = fullMarkdownBuffer;
            saveState();
        }
        
        // 2. تحويل النص من ماركداون إلى HTML
        let html = typeof marked !== 'undefined' ? marked.parse(fullMarkdownBuffer) : fullMarkdownBuffer;
        
        // الوصول لعنصر المحتوى وتحديثه
        const contentEl = currentAiMsgElement.querySelector('.ai-content');
        if (contentEl) {
            contentEl.innerHTML = html;
            // إضافة أزرار النسخ/الإعادة داخل حاوية المحتوى
            addMessageActions(contentEl, fullMarkdownBuffer);
        }
        
        // تحديث الملفات
        processFilesUpdate(safeBuffer);
    }
    
    isStreaming = false;
    
    // --- تعديل (طلب 3): إعادة تفعيل زر الإرسال ---
    checkInputState(); 
}



    
    // --- Helper for Message Actions (محدث لطلب 1) ---
    function addMessageActions(msgElement, fullText) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'msg-actions';

        const btnCopy = document.createElement('button');
        // إضافة كلاس الأيقونة وإزالة النص 'C'
        btnCopy.className = 'action-btn btn-copy-icon';
        btnCopy.title = 'Copy Response';
        btnCopy.onclick = () => {
            navigator.clipboard.writeText(fullText).then(() => {
                // تأثير بصري بسيط عند النسخ (اختياري)
                btnCopy.style.transform = 'scale(1.2)';
                setTimeout(() => btnCopy.style.transform = '', 200);
            });
        };

        const btnRetry = document.createElement('button');
        btnRetry.className = 'action-btn';
        btnRetry.textContent = 'R'; // يبقى نصاً كما هو
        btnRetry.title = 'Retry';
        btnRetry.onclick = () => handleRetryOrEdit('retry');

        const btnEdit = document.createElement('button');
        // إضافة كلاس الأيقونة وإزالة النص 'E'
        btnEdit.className = 'action-btn btn-edit-icon';
        btnEdit.title = 'Edit & Resend';
        btnEdit.onclick = () => handleRetryOrEdit('edit');

        actionsDiv.appendChild(btnCopy);
        actionsDiv.appendChild(btnRetry);
        actionsDiv.appendChild(btnEdit);
        
        msgElement.appendChild(actionsDiv);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }


    function handleRetryOrEdit(mode) {
        const conv = convs.find(c => c.id === activeId);
        if (!conv || conv.messages.length < 2) return;

        const userMsgIndex = conv.messages.length - 2;
        const lastUserText = conv.messages[userMsgIndex].text;

        conv.messages.splice(userMsgIndex, 2);
        saveState();
        renderMessages();

        if (mode === 'edit') {
            inputEl.value = lastUserText;
            inputEl.focus();
            inputEl.style.height = 'auto';
            inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
        } else {
            sendMessage(lastUserText);
        }
    }
    
    // دالة لتطبيق التعديلات (Patch) على المحتوى
    // 1. دالة تطبيق التعديلات (Patch) القوية
// استبدل دالة applyPatch القديمة بهذه الدالة الجديدة القوية
function applyPatch(originalContent, patchString) {
    let newContent = originalContent;
    
    // تنظيف نص الـ Diff من أي شوائب ماركداون إضافية قد يضيفها النموذج
    const cleanPatch = patchString
        .replace(/<<<<<<< SEARCH/g, '<<<<<<< SEARCH')
        .replace(/>>>>>>> REPLACE/g, '>>>>>>> REPLACE');

    // تقسيم الـ Diff إلى كتل بناءً على SEARCH
    // نستخدم تعبير نمطي للبحث عن البلوكات
    const blockRegex = /<<<<<<< SEARCH\s*([\s\S]*?)\s*=======\s*([\s\S]*?)\s*>>>>>>> REPLACE/g;
    
    let match;
    while ((match = blockRegex.exec(cleanPatch)) !== null) {
        const searchBlock = match[1]; // الكود القديم (بدون trim حاد للحفاظ على المسافات قدر الإمكان)
        const replaceBlock = match[2]; // الكود الجديد

        // نحاول البحث عن النص كما هو
        if (newContent.includes(searchBlock)) {
            newContent = newContent.replace(searchBlock, replaceBlock);
        } else {
            // محاولة ذكية: إذا فشل البحث المطابق، نجرب البحث مع تجاهل المسافات الزائدة في البداية والنهاية
            const trimmedSearch = searchBlock.trim();
            const trimmedReplace = replaceBlock.trim();
            
            // هذه المحاولة قد تكون خطرة قليلاً لكنها تحل مشكلة المسافات التي يضيفها النموذج
            if (newContent.includes(trimmedSearch)) {
                newContent = newContent.replace(trimmedSearch, trimmedReplace);
            } else {
                console.warn("⚠️ Failed to apply specific patch block. Text not found in file.");
                console.log("Expected to find:", searchBlock);
            }
        }
    }
    
    return newContent;
}

function applyPatchManual(originalContent, diffBlock) {
    const searchRegex = /<<<<<<< SEARCH\s*([\s\S]*?)\s*=======\s*([\s\S]*?)\s*>>>>>>> REPLACE/g;
    let newContent = originalContent;
    let match;

    while ((match = searchRegex.exec(diffBlock)) !== null) {
        const searchText = match[1].trim();
        const replaceText = match[2].trim();

        // تنظيف النص الأصلي والنص المطلوب البحث عنه من المسافات الزائدة لضمان المطابقة
        if (newContent.includes(searchText)) {
            newContent = newContent.replace(searchText, replaceText);
        } else {
            // محاولة مطابقة أكثر مرونة إذا فشلت المطابقة التامة
            console.warn("Could not find exact match for DIFF block");
        }
    }
    return newContent;
}


// 2. دالة معالجة النصوص الواردة (DIFF Parser)
function processFilesUpdate(fullText) {
    if (typeof window.lastParsedIndex === 'undefined') window.lastParsedIndex = 0;
console.log(fullText)
    // Regex شامل لجميع الأوامر الجديدة
    const blockRegex = /<(FILE|REPLACE|ADD_TO)\s+(?:name|file|target)="([^"]+)"(?:\s+position="([^"]+)")?\s*>([\s\S]*?)<\/\1>/gi;
    
    let match;
    blockRegex.lastIndex = window.lastParsedIndex;

    while ((match = blockRegex.exec(fullText)) !== null) {
        const type = match[1].toUpperCase();
        const fileName = match[2];
        const position = match[3] || "end";
        const content = match[4].trim();

        let targetFile = projectFiles.find(f => f.name === fileName);

        if (type === 'FILE') {
            updateFileContent(fileName, content); // إنشاء أو استبدال كامل
        } 
        else if (targetFile) {
            if (type === 'ADD_TO') {
                // إضافة للنهاية أو البداية دون تكرار
                if (position === 'end') {
                    targetFile.content = targetFile.content.trimEnd() + "\n\n" + content;
                } else {
                    targetFile.content = content + "\n\n" + targetFile.content.trimStart();
                }
                console.log(`✅ Added code to ${position} of ${fileName}`);
            } 
            else if (type === 'REPLACE') {
                // استبدال جزئي ذكي
                targetFile.content = applyQuickReplace(targetFile.content, content);
            }

            // تحديث المحرر إذا كان الملف مفتوحاً
            if (projectFiles[activeFileIndex].name === fileName) {
                const cursor = codeArea.selectionStart;
                codeArea.value = targetFile.content;
                updateView();
                codeArea.setSelectionRange(cursor, cursor);
            }
        }
        
        window.lastParsedIndex = blockRegex.lastIndex;
    }
    renderTabs();
}

// دالة الاستبدال السريع
function applyQuickReplace(original, diffBlock) {
    const regex = /<<<<<<< SEARCH\s*([\s\S]*?)\s*=======\s*([\s\S]*?)\s*>>>>>>> REPLACE/g;
    let result = original;
    let match;
    while ((match = regex.exec(diffBlock)) !== null) {
        const search = match[1].trim();
        const replace = match[2].trim();
        if (result.includes(search)) {
            result = result.replace(search, replace);
            console.log("✅ Quick Replace successful");
        } else {
            console.warn("⚠️ Text not found for replacement:", search);
        }
    }
    return result;
}



    
    

    // دالة مساعدة لتحديث أو إنشاء ملف
    function updateFileContent(fileName, content) {
        const existingIndex = projectFiles.findIndex(f => f.name === fileName);
        if (existingIndex !== -1) {
            projectFiles[existingIndex].content = content;
            // تحديث المحرر فقط إذا كان هذا هو الملف المفتوح
            if (existingIndex === activeFileIndex) {
                // نحفظ مكان المؤشر والسكرول قبل التحديث لمنع القفز
                const scrollTop = codeArea.scrollTop;
                const selectionStart = codeArea.selectionStart;
                
                codeArea.value = content;
                updateView();
                
                // إعادة السكرول والمؤشر (اختياري، لكن يحسن التجربة)
                codeArea.scrollTop = scrollTop;
                // codeArea.setSelectionRange(selectionStart, selectionStart);
            }
        } else {
            projectFiles.push({ name: fileName, content: content });
            // إذا كان ملفاً جديداً، نفتح تبويب له ونعرضه فوراً
            if (projectFiles.length === 1) { // أول ملف
                 activeFileIndex = 0;
                 codeArea.value = content;
                 updateView();
            }
        }
    }

    

    // --- SSE Handling ---
    if (typeof EventSource !== 'undefined') {
    const sse = new EventSource(RENDER_SERVER_URL + '/api/events');

    sse.onmessage = (e) => {
        try {
          console.log("STARTED (SSE) SUCCESSFULY")
            // تجاهل keep-alive
            if (!e.data || e.data.startsWith(':')) return;

            const payload = JSON.parse(e.data);
// DEBUG --- console.log(payload)
            switch (payload.type) {
                case 'assistant_message':
                    handleAssistantMessage(payload);
                    break;

                case 'frame':
                    updateGameFrame(payload.image);
                    break;

                default:
                    // أنواع أخرى مستقبلية
                    break;
            }

        } catch (err) {
            console.error("Stream Error:", err, e.data);
        }
    };

    sse.onerror = (err) => {
        console.error("SSE connection error:", err);
    };
}

function updateGameFrame(base64Image) {
    const img = document.getElementById('gameFrame');
    const loading = document.getElementById('gameLoading');

    if (!img || !base64Image) return;

    if (loading) loading.style.display = 'none';
    img.style.display = 'block';

    img.src = `data:image/png;base64,${base64Image}`;
}

function handleAssistantMessage(payload) {

    // 1) بداية الكتابة (Writing)
    if (
        safeBuffer.length === 0 &&
        payload.text &&
        payload.text !== '\n[STREAM COMPLETE]'
    ) {
        updateStatusText("Writing");

        if (!currentAiMsgElement) {
            const d = document.createElement('div');
            d.className = 'msg ai ltr';

            d.innerHTML = `
                <div class="ai-avatar">></div>
                <div class="ai-content"></div>
            `;

            messagesEl.insertBefore(d, currentStatusEl);
            currentAiMsgElement = d;
        }
    }

    // 2) عنصر احتياطي في حال ضاع المرجع
    if (!currentAiMsgElement && isStreaming) {
        const allMsgs = document.querySelectorAll('.msg.ai');
        if (allMsgs.length > 0) {
            currentAiMsgElement = allMsgs[allMsgs.length - 1];
        }
    }

    // 3) نها
    if (payload.text === '\n[STREAM COMPLETE]') {
        serverFinished = true;

        if (typeQueue.length === 0) {
            finishMessageProcessing();
            
            // --- أضف هذا السطر هنا (التصحيح) ---
            if (currentAiMsgElement) {
                extractAndSyncFiles(currentAiMsgElement.innerText);
            }
            // ------------------------------------
        }
        return;
    }
// 4) استقبال النص
    const chunk = payload.text || "";
    safeBuffer += chunk;

    // ============== التعديل يبدأ هنا ==============
    
    // 5) تعطيل فصل الدردشة عن FILE / DIFF لكي ترى كل شيء في الشات
    let chatDisplay = safeBuffer;
    
    // نبحث عن بداية وسم FILE أو DIFF أو بداية كتلة SEARCH
// داخل handleAssistantMessage
const tagIndex = safeBuffer.search(/<(FILE|REPLACE|ADD_TO)/);
if (tagIndex !== -1) {
    chatDisplay = safeBuffer.substring(0, tagIndex);
}


    const newTextToAdd = chatDisplay.substring(streamCursor);
    
    // ------------------

    // استدعاء المعالجة يجب أن يتم على safeBuffer الكامل
    processFilesUpdate(safeBuffer); 
    /* -يق هذا الكود المسبب للإخفاء ---
    const tagMatch = safeBuffer.match(/<(FILE|DIFF)/);
    if (tagMatch) {
        chatDisplay = safeBuffer.substring(0, tagMatch.index);
    }*/
    
   
    // ============== التعديل ينتهي هنا ==============

    // 6) الكتابة المتدرجة
    
    if (newTextToAdd.length > 0) {
        streamCursor += newTextToAdd.length;

        for (let char of newTextToAdd) {
            typeQueue.push(char);
        }

        if (!typeTimeout) {
            startTyping();
        }
    }

    // 7) تحديث الملفات
    processFilesUpdate(safeBuffer);
}

    // تهيئة أولية
    renderConversations(); 
    renderTabs();
    renderMessages();
    setTimeout(updateView, 100);
    
    
    
// --- منطق المعاينة والكونسول ---
        // =========================================
    // إصلاح زر Run All (تشغيل الكل / المعاينة الكاملة)
    // =========================================
    const btnRunAll = document.getElementById('btnRunAll'); // تأكد أن الآيدي في HTML هو runAllBtn
    
    if (btnRunAll) {
        btnRunAll.addEventListener('click', async () => {
            // 1. تجميع كل الملفات في ملف واحد (للمواقع)
            const fullCode = compileFullProject();
            
            // 2. التحقق من الملف النشط حالياً
            const currentFile = projectFiles[activeFileIndex];
            const ext = currentFile.name.split('.').pop().toLowerCase();

            // 3. التوجيه الذكي
            if (ext === 'py') {
                // إذا كنا واقفين على ملف بايثون، شغله كبايثون
                await runCode(); 
            } else {
                // إذا كنا في ملف ويب (HTML/CSS/JS)، شغل نظام المعاينة الكامل
                const previewOverlay = document.getElementById('previewOverlay');
                const iframe = document.getElementById('previewFrame');
                const canvas = document.getElementById('gameCanvas');
                const consoleView = document.getElementById('consoleOutputView');

                // إظهار النافذة
                previewOverlay.classList.add('active');
                
                // إعداد العرض: إظهار الإطار وإخفاء الباقي
                iframe.style.display = 'block';
                canvas.style.display = 'none';
                consoleView.style.display = 'none';
                
                // ضخ الكود المجمع في الإطار
                iframe.srcdoc = fullCode;
            }
        });
    }

    const consoleOutputView = document.getElementById('consoleOutputView');
    const btnToggleOutput = document.getElementById('btnToggleOutput');
    
    // دالة تجميع المشروع وتشغيل الكونسول - الإصدار النهائي// دالة تجميع المشروع وتشغيل الكونسول - الإصدار المصحح// دالة تجميع المشروع - الإصدار المحسن (Capture All Errors)
    
    // دالة تجميع المشروع وتشغيل الكونسول - الإصدار المحسن لالتقاط Syntax 
    function compileFullProject() {
    let htmlFile = projectFiles.find(f => f.name.endsWith('.html'));
    if (!htmlFile) htmlFile = projectFiles[0];
    
    let finalHtml = htmlFile.content;

    // 1. سكربت التقاط الأخطاء (يجب أن يكون في البداية تماماً)
    const consoleScript = `
    <script>
    (function(){
        function sendToParent(type, args) {
            try {
                const msg = args.map(a => {
                    if (a instanceof Error) return 'Error: ' + a.message;
                    if (typeof a === 'object') return JSON.stringify(a);
                    return String(a);
                }).join(' ');
                window.parent.postMessage({ type: 'console', level: type, msg: msg }, '*');
            } catch(e) {}
        }
        const _log = console.log, _err = console.error, _warn = console.warn;
        console.log = (...a) => { _log(...a); sendToParent('log', a); };
        console.error = (...a) => { _err(...a); sendToParent('error', a); };
        console.warn = (...a) => { _warn(...a); sendToParent('warn', a); };
        
        // التقاط جميع الأخطاء بما فيها Syntax
        window.onerror = function(msg, url, line, col, error) {
            var extra = "";
            if(line) extra += " [Line: " + (line -34) + "]";
            if(col) extra += " [Col: " + col + "]";
            sendToParent('error', ["❌ " + msg + extra]);
            return false; 
        };
        
        // التقاط الوعود المرفوضة
        window.addEventListener('unhandledrejection', function(event) {
            sendToParent('error', ["⚠️ Unhandled Promise Rejection: " + event.reason]);
        });
    })();
    <\/script>`;

    if (finalHtml.includes('<head>')) {
        finalHtml = finalHtml.replace('<head>', '<head>' + consoleScript);
    } else {
        finalHtml = consoleScript + finalHtml;
    }

    // 2. دمج CSS
    const cssFiles = projectFiles.filter(f => f.name.endsWith('.css'));
    let cssBlock = '<style>';
    cssFiles.forEach(f => cssBlock += `\n/* ${f.name} */\n${f.content}\n`);
    cssBlock += '</style>';
    if (finalHtml.includes('</head>')) finalHtml = finalHtml.replace('</head>', cssBlock + '</head>');
    else finalHtml += cssBlock;

    // 3. دمج JS (بدون try-catch حول الكود نفسه)
    const jsFiles = projectFiles.filter(f => f.name.endsWith('.js'));
    let jsBlock = '';
    jsFiles.forEach(f => {
        // نضع الكود كما هو تماماً، وأي خطأ فيه سيلتقطه window.onerror الموجود بالأعلى
        jsBlock += `<script>\n// File: ${f.name}\n${f.content}\n<\/script>`;
    });

    if (finalHtml.includes('</body>')) finalHtml = finalHtml.replace('</body>', jsBlock + '</body>');
    else finalHtml += jsBlock;

    return finalHtml;
}


// إضافة دعم التعرف على اللغات
function getLanguageFromExtension(fileName) {
    const ext = fileName.split('.').pop();
    const map = {
        'js': 'javascript',
        'py': 'python',
        'cpp': 'cpp',
        'java': 'java',
        'php': 'php',
        'html': 'html',
        'css': 'css'
    };
    return map[ext] || 'text';
}

// أضف هذه الدالة لمعالجة استخراج الملفات من رد النموذج
function extractAndSyncFiles(text) {
    // regex للبحث عن كود محصور بين اسم الملف وعلامات الماركداون
    const filePattern = /File:\s*([\w\.-]+)\n```[\w]*\n([\s\S]*?)```/g;
    let match;
    let found = false;

    while ((match = filePattern.exec(text)) !== null) {
        const fileName = match[1].trim();
        const fileContent = match[2].trim();

        const fileIndex = projectFiles.findIndex(f => f.name === fileName);
        if (fileIndex > -1) {
            projectFiles[fileIndex].content = fileContent;
            found = true;
            console.log(`✅ Updated file: ${fileName}`);
        }
    }
    
    if (found) {
        renderFiles(); // تحديث القائمة في الواجهة
        if (typeof updatePreview === 'function') updatePreview();
    }
}

    // تشغيل زر Run All  
    btnRunAll.addEventListener('click', () => {
        // للمشاريع المتعددة (ويب)، نستخدم التجميع
        projectFiles[activeFileIndex].content = codeArea.value;
        const currentExt = projectFiles[activeFileIndex].name.split('.').pop();
        
        // إذا كنا في ملف بايثون، شغل runCode العادية
        if(currentExt === 'py') {
            runCode();
        } else {
            // إذا كان ويب، شغل المجمع
            const previewOverlay = document.getElementById('previewOverlay');
            const iframe = document.getElementById('previewFrame');
            const canvas = document.getElementById('gameCanvas');
            
            previewOverlay.classList.add('active');
            // تأكد من إخفاء الكانفاس وإظهار الإطار
            canvas.style.display = 'none';
            iframe.style.display = 'block';
            
            const fullCode = compileFullProject();
            iframe.srcdoc = fullCode;
        }
    });

    

    // تبديل عرض الكونسول
    btnToggleOutput.addEventListener('click', () => {
        consoleOutputView.classList.toggle('active');
        // تغيير لون الزر للدلالة على التفعيل
        if(consoleOutputView.classList.contains('active')){
            btnToggleOutput.style.background = 'var(--text-color)';
            btnToggleOutput.style.color = 'var(--bg-primary)';
        } else {
            btnToggleOutput.style.background = '';
            btnToggleOutput.style.color = '';
        }
    });
    
    // استقبال رسائل الكونسول من الـ iframe (محدث)
    window.addEventListener('message', (event) => {
        // التأكد من أن الرسالة قادمة من المعاينة
        let data = event.data;
        
        // محاولة فك التشفير إذا كانت الرسالة نصية
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch(e) {}
        }

        if (data && data.type === 'console') {
            const div = document.createElement('div');
            // تحديد اللون بناءً على نوع الرسالة
            div.className = `console-log-item ${data.level}`;
            div.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
            div.style.padding = '4px 0';
            
            // إضافة وقت الرسالة (اختياري)
            const time = new Date().toLocaleTimeString('en-US', {hour12: false, hour: "numeric", minute: "numeric", second: "numeric"});
            div.innerHTML = `<span style="opacity:0.5; font-size:11px; margin-right:5px">[${time}]</span> ${data.msg}`;
            
            consoleOutputView.appendChild(div);
            // النزول لآخر السطر
            consoleOutputView.scrollTop = consoleOutputView.scrollHeight;
        }
    });
// --- منطق السحب السلس 1:1 مع تأثير الضباب ---
// ============================================================
    // بداية كود السحب السلس المعدل (Smooth Drag Logic)
    // ============================================================

    
    let currentX = 0;
    let isDragging = false;
    const sideMenuWidth = 320; // نفس عرض القائمة في CSS
    let isDraggingMenu;
    // دالة لتحديث الشفافية (الضباب) بناء على النسبة
    

    // 1. عند لمس الشاشة (Touch Start)
    document.addEventListener('touchstart', (e) => {
        // إذا ضغطنا داخل منطقة الكود، لا نفعل شيئاً (للسماح بالسكرول الأفقي للكود)
        if (e.target.closest('pre') || e.target.closest('code')) return;

        startX = e.touches[0].clientX;
        
        // شروط بدء السحب:
        const isMenuOpen = menuPanel.classList.contains('open');
        
        // أ) القائمة مغلقة: يجب أن يبدأ السحب من الحافة اليسرى (أول 30px)
        if (!isMenuOpen && startX > 450) return;
        
        // ب) القائمة مفتوحة: السحب مسموح من أي مكان لإغلاقها
        
        isDragging = true;
        
        // هام جداً: إيقاف الترانزيشن فوراً لتتحرك القائمة مع الاصبع بدون تأخير
        menuPanel.style.transition = 'none';
    }, { passive: true });

    // 2. أثناء تحريك الإصبع (Touch Move)
    document.addEventListener('touchmove', (e) => {
      const isCodePageOpen = document.querySelector('.codezone').classList.contains('open'); 

    // 2. إذا كانت مفتوحة، أوقف دالة القائمة الجانبية فوراً
    if (isCodePageOpen) {
        return; // خروج من الدالة، لن تتحرك القائمة الجانبية
    }
        if (!isDragging) return;

        const x = e.touches[0].clientX;
        const deltaX = x - startX; // الفرق بين نقطة البداية والمكان الحالي
        let newTranslateX = 0;

        // حساب الموقع الجديد بدقة
        if (menuPanel.classList.contains('open')) {
            // إذا كانت مفتوحة، نحن نسحب للإغلاق (الفرق بالسالب)
            // القيمة تبدأ من 320 وتنقص
            newTranslateX = sideMenuWidth + deltaX;
        } else {
            // إذا كانت مغلقة، نحن نسحب للفتح (الفرق بالموجب)
            newTranslateX = deltaX;
        }

        // تقييد الحركة (Clamp) لا تتجاوز 0 ولا 320
        // Math.max(0, ...) يمنعها تروح يسار أكثر من اللازم
        // Math.min(320, ...) يمنعها تروح يمين أكثر من اللازم
        newTranslateX = Math.max(0, Math.min(newTranslateX, sideMenuWidth));

        // تطبيق الحركة فورياً
        menuPanel.style.transform = `translateX(${newTranslateX}px)`;

        // تطبيق تأثير الضباب المتدرج
        const openPercentage = newTranslateX / sideMenuWidth;
        updateOverlayOpacity(openPercentage);

    }, { passive: true });

    // 3. عند رفع الإصبع (Touch End)
    document.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;

        // استرجاع الأنيميشن للحركة النهائية
        menuPanel.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';

        // معرفة الموقع الحالي
        const currentTransform = menuPanel.style.transform;
        // استخراج الرقم من string مثل "translateX(150px)"
        const match = currentTransform.match(/translateX\(([\d.]+)px\)/);
        const currentPos = match ? parseFloat(match[1]) : 0;

        // المنطق: هل تجاوزنا النصف (50%)؟
        if (currentPos >= (sideMenuWidth / 2)) {
            // فتح القائمة بالكامل
            openMenu(); 
        } else {
            // إغلاق القائمة (إلغاء السحب)
            closeMenu();
        }
    });


let codeDragX = 0;
let isDraggingCodezone = false;
let hasMoved = false;
const CODEZONE_WIDTH = window.innerWidth; // لأن العرض 100%


document.addEventListener('touchstart', e => {
    if (menuPanel.classList.contains('open')) return;

    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;

    isDraggingCodezone = true;
    hasMoved = false; // 👈 مهم جداً
    codezone.style.transition = 'none';
}, { passive: true });

document.addEventListener('touchmove', e => {
  const isCodePageOpen = document.querySelector('.codezone').classList.contains('open'); 

    // 2. إذا كانت مفتوحة، أوقف دالة القائمة الجانبية فوراً
    if (isCodePageOpen) {
        return; // خروج من الدالة، لن تتحرك القائمة الجانبية
    }
    if (!isDraggingCodezone) return;

    const currentX = e.touches[0].clientX;
    const diffX = currentX - startX;

    // تجاهل الحركات الصغيرة (نقرة)
    if (Math.abs(diffX) < 5) return;

    hasMoved = true; // 👈 تم سحب فعلي

    codeDragX = Math.min(0, Math.max(-CODEZONE_WIDTH, diffX));
    codezone.style.transform = `translateX(${codeDragX}px)`;
    e.stopPropagation(); 
}, { passive: true });

document.addEventListener('touchend', () => {
    if (!isDraggingCodezone) return;

    isDraggingCodezone = false;
    codezone.style.transition = '';

    // 👇 إذا لم يحدث سحب حقيقي → تجاهل
    if (!hasMoved) {
        codeDragX = 0;
        return;
    }

    if (Math.abs(codeDragX) > CODEZONE_WIDTH / 2) {
        codezone.classList.add('open');
        codezone.style.transform = 'translateX(-100%)';
    } else {
        codezone.classList.remove('open');
        codezone.style.transform = 'translateX(0)';
    }

    codeDragX = 0;
}, { passive: true });

    // دوال المساعدة (تأكد من وجودها أو تحديثها)
    function openMenu() {
        menuPanel.style.transform = `translateX(${sideMenuWidth}px)`; // أو 100%
        menuPanel.classList.add('open');
        menuBtn.classList.add('active');
        // تثبيت الضباب
        blurOverlay.classList.add('active');
        blurOverlay.style.opacity = 1;
    }

    function closeMenu() {
        menuPanel.style.transform = `translateX(0px)`;
        menuPanel.classList.remove('open');
        menuBtn.classList.remove('active');
        // إزالة الضباب
        blurOverlay.style.opacity = 0;
        setTimeout(() => blurOverlay.classList.remove('active'), 300);
    }

// تعديل زر القائمة ليستخدم الدوال الجديدة
menuBtn.addEventListener('click', () => {
    if (menuPanel.classList.contains('open')) closeMenu();
    else openMenu();
});

// أحداث اللمس (Touch Events)
document.addEventListener('touchstart', e => {
    // لا نسمح بالسحب إذا كانت منطقة الكود مفتوحة
    if (codezone.classList.contains('open')) return;
    
    menuStartX = e.touches[0].clientX;
    menuStartY = e.touches[0].clientY;
    
    // إذا كانت القائمة مغلقة، السحب يبدأ من الحافة اليسرى فقط (أول 40px)
    if (!menuPanel.classList.contains('open') && menuStartX > 40) return;
    
    isDraggingMenu = true;
    // إلغاء الترانزيشن أثناء السحب ليكون التجاوب فوري
    menuPanel.style.transition = 'none'; 
}, {passive: true});

document.addEventListener('touchmove', e => {
    if (!isDraggingMenu) return;

    const currentX = e.touches[0].clientX;
    const diffX = currentX - menuStartX;
    
    // حساب الموضع الجديد (Clamp between 0 and menuWidth)
    let newTranslateX = 0;

    if (menuPanel.classList.contains('open')) {
        // إذا كانت مفتوحة، السحب لليسار يقلل القيمة
        newTranslateX = sideMenuWidth + diffX; 
    } else {
        // إذا كانت مغلقة، السحب لليمين يزيد القيمة
        newTranslateX = diffX;
    }

    // حدود الحركة (لا تتجاوز العرض ولا تقل عن 0)
    newTranslateX = Math.max(0, Math.min(newTranslateX, sideMenuWidth));

    // تطبيق الحركة
    menuPanel.style.transform = `translateX(${newTranslateX}px)`;

    // حساب نسبة الشفافية للضباب (0 to 1)
    const percentage = newTranslateX / sideMenuWidth;
    blurOverlay.style.opacity = percentage.toFixed(2);
    if(percentage > 0) blurOverlay.classList.add('active');

}, {passive: true});

document.addEventListener('touchend', e => {
    if (!isDraggingMenu) return;
    isDraggingMenu = false;

    // استرجاع الموضع الحالي من الـ style
    const currentTransform = menuPanel.style.transform;
    const match = currentTransform.match(/translateX\(([\d.]+)px\)/);
    const currentX = match ? parseFloat(match[1]) : (menuPanel.classList.contains('open') ? sideMenuWidth : 0);

    const threshold = sideMenuWidth / 2; // منتصف المسافة (50%)

    // القرار: هل نفتح أم نغلق؟
    if (currentX >= threshold) {
        openMenu(); // افتح بالكامل
    } else {
        closeMenu(); // أغلق بالكامل
    }
});

// تفعيل زر فتح الكود العلوي
document.getElementById('codeToggleBtn').addEventListener('click', () => {
    codezone.classList.add('open');
    updateView(); // تحديث المحرر للتأكد من ظهور النص
});


    
    checkInputState();
})

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        
        const updateBanner = document.getElementById('update-banner');
        const reloadButton = document.getElementById('reload-app-btn');
        // قم بتغيير 'send-button-id' إلى الـ ID الحقيقي لزر الإرسال لديك
        const sendBtn = document.getElementById('send-button-id'); 
        
        let newWorker; 

        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                
                registration.addEventListener('updatefound', () => {
                    newWorker = registration.installing;
                    
                    newWorker.addEventListener('statechange', () => {
                        // عندما يصبح الـ Worker الجديد في حالة waiting (جاهز)
                        if (newWorker.state === 'installed') {
                            if (navigator.serviceWorker.controller) {
                                // يوجد SW قديم يتحكم، ويوجد تحديث ينتظر التفعيل
                                updateBanner.style.display = 'block'; 
                                
                                // إيقاف زر الإرسال كما طلبت
                                if (sendBtn) sendBtn.disabled = true;
                         sendBtn.classList.add('disabled');
                            } 
                        }
                    });
                });
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
            });
 // التعامل مع زر إعادة التحميل (Refresh)
        reloadButton.addEventListener('click', () => {
            // التعديل: فرض إعادة التحميل مباشرة
            window.location.reload();
        });
        // التعامل مع زر إعادة التحميل
        
        // إعادة تحميل الصفحة بعد أن يتولى الـ Service Worker الجديد السيطرة
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            // يتم استدعاؤه بعد أن يقوم الـ Worker الجديد بتفعيل نفسه
            // هذا يضمن أن النسخة الجديدة تعمل فوراً
            window.location.reload();
        });
        
    });
}