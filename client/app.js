import {
  runBrython,
  RENDER_SERVER_URL,
  startServerConnection,
  // أي دوال أخرى أخرجتها
} from './core.js';


const SETTINGS_KEY = 'codeai_settings';
let safeBuffer = "";
let typeQueue = []; 
let typeInterval = null; 
let currentAiMsgElement = null; 
let fullMarkdownBuffer = ""; 
let streamCursor = 0;
// تعريف المتغيرات هنا بدلاً من استيرادها لتتمكن من تعديلها
let activeId = null;
let activeFileIndex = 0;
let isStreaming = false;
let projectFiles = [{ name: 'index.html', content: '// Start coding...' }];
let retryCount = 0;
const maxRetries = 5;
let retryTimeout = null;
let statusCountdownInterval = null;

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
const currentSettings = applySettings(); 
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

    // --- Constants & Setup ---
    
    let convs = [];
    try {
        convs = JSON.parse(localStorage.getItem('codeai_convs') || '[]');
    } catch(e) { console.error("Storage corrupted", e); convs=[]; }
    
    
    
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

// ضع هذا الكود داخل DOMContentLoaded في app.js
// ============================================================
// 1. تعريف متغير المخزن المؤقت في بداية الملف مع باقي المتغيرات
// ============================================================
let incomingPacketBuffer = []; // مخزن لتأخير عرض النص
// ... (باقي المتغيرات الموجودة لديك مثل safeBuffer, typeQueue) ...

// ============================================================
// 2. تحديث دالة handleServerPacket (لحل مشكلة الأنميشن)
// ============================================================// تعديل handleServerPacket في app.js// 1. تعديل متغيرات التحكم (تأكد أنها معرفة في الأعلى)
let typeTimeout = null;
let serverFinished = false; 

// 2. دالة استقبال البيانات من السيرفر (المنطق الجديد)
// ============================================================
// تعديل منطق استقبال البيانات (لحل مشكلة ظهور كلمة STREAM COMPLETE)
// ============================================================



window.handleServerPacket = (payload) => {
    // 1. استلام النص الخام
    let chunk = payload.text || "";
    
    // 2. فحص وجود علامة النهاية داخل النص (حتى لو كانت مدموجة)
    const endMarker = "[STREAM COMPLETE]";
    if (chunk.includes(endMarker) || payload.type === 'done') {
        serverFinished = true;
        
        // حذف العلامة من النص حتى لا تظهر للمستخدم
        chunk = chunk.replace(endMarker, "").replace(endMarker, ""); 
    }

    // 3. إذا تبقى نص بعد الحذف، أرسله للكتابة
    if (chunk.length > 0) {
        processTextChunk(chunk);
    }

    // 4. إدارة التوقف
    if (serverFinished) {
        // إذا لم يكن هناك شيء يُكتب حالياً (الطابور فارغ)، ننهي فوراً
        if (typeQueue.length === 0 && !typeTimeout) {
            finishMessageProcessing();
        } 
        // ملاحظة: إذا كان الطابور ممتلئاً، ستتكفل دالة typeLoop بالإنهاء عند فراغه
    }
};

// ============================================================
// تعديل حلقة الكتابة (لضمان ظهور الأزرار دائماً)
// ============================================================

function startTyping() {
    if (typeTimeout) return; // حماية من التكرار

    function typeLoop() {
        if (typeQueue.length > 0) {
            // كتابة الحروف
            const char = typeQueue.shift();
            fullMarkdownBuffer += char;

            if (currentAiMsgElement) {
                const contentEl = currentAiMsgElement.querySelector('.ai-content');
                if (contentEl) contentEl.textContent = fullMarkdownBuffer;
                messagesEl.scrollTop = messagesEl.scrollHeight;
            }

            // حساب التأخير (تسريع الكتابة إذا تراكم النص)
            const queueLen = typeQueue.length;
            let delay = queueLen > 50 ? 2 : (queueLen > 20 ? 5 : 15);
            
            typeTimeout = setTimeout(typeLoop, delay);
        } else {
            // الطابور فارغ
            typeTimeout = null;
            
            // هل انتهى السيرفر؟ إذا نعم، نفذ الإنهاء
            if (serverFinished) {
                finishMessageProcessing();
            }
        }
    }
    typeLoop(); 
}


// 4. دالة إنهاء المعالجة (Finish Processing)
function finishMessageProcessing() {
    // تنظيف المؤقتات
    if (typeTimeout) clearTimeout(typeTimeout);
    typeTimeout = null;
    serverFinished = false;
    
    removeStatus(); // حذف "Thinking..."

    if (activeId && currentAiMsgElement) {
        const conv = convs.find(c => c.id === activeId);
        
        // 1. تحديث نص الرسالة في الذاكرة
        if (conv && conv.messages.length > 0) {
            conv.messages[conv.messages.length - 1].text = fullMarkdownBuffer;
            saveState();
        }
        
        // 2. تحويل الماركداون وتحديث الواجهة
        const contentEl = currentAiMsgElement.querySelector('.ai-content');
        if (contentEl) {
            let html = typeof marked !== 'undefined' ? marked.parse(fullMarkdownBuffer) : fullMarkdownBuffer;
            contentEl.innerHTML = html;
            
            // هام جداً: إضافة الأزرار الآن
            addMessageActions(contentEl, fullMarkdownBuffer);
        }

        // 3. إخفاء الأفاتار (الحل النهائي)
        const avatar = currentAiMsgElement.querySelector('.ai-avatar');
        if (avatar) {
            // نغير المحتوى بدلاً من الإخفاء إذا أردت بقاء المساحة، أو نخفيه تماماً
            avatar.style.display = 'none'; 
            
            // إضافة كلاس للرسالة لإزالة أي هوامش زائدة
            currentAiMsgElement.classList.add('finished');
        }
        
        // معالجة تحديثات الملفات إن وجدت
        processFilesUpdate(safeBuffer);
    }
    
    isStreaming = false;
    checkInputState();
}




// ============================================================
// 3. دالة مساعدة جديدة (يجب إضافتها لمعالجة النصوص)
// الغرض: فصل منطق المعالجة عن منطق الاستلام
// ============================================================
function processTextChunk(chunk) {
    if (safeBuffer.length === 0 && chunk.trim()) {
        updateStatusText("Writing");
        // إنشاء فقاعة الرسالة (نفس الكود القديم لديك)
        if (!currentAiMsgElement) {
            const d = document.createElement('div');
            d.className = 'msg ai rtl';
            d.innerHTML = `
                <div class="ai-avatar">></div>
                <div class="ai-content"></div>
            `;
            if (currentStatusEl && currentStatusEl.parentNode === messagesEl) {
                messagesEl.insertBefore(d, currentStatusEl);
            } else {
                messagesEl.appendChild(d);
            }
            currentAiMsgElement = d;
        }
    }

    safeBuffer += chunk;
    const isArabic = /[\u0600-\u06FF]/.test(safeBuffer);
    if(currentAiMsgElement) {
        currentAiMsgElement.classList.remove('rtl', 'ltr');
        currentAiMsgElement.classList.add(isArabic ? 'rtl' : 'ltr');
    }

    // فصل نص الدردشة عن الأكواد
    let chatDisplay = safeBuffer;
    const tagMatch = safeBuffer.match(/<(FILE|DIFF)/);
    if (tagMatch) {
        chatDisplay = safeBuffer.substring(0, tagMatch.index);
    }

    // إضافة للحروف للطابور
    const newTextToAdd = chatDisplay.substring(streamCursor);
    if (newTextToAdd.length > 0) {
        streamCursor += newTextToAdd.length;
        for (let char of newTextToAdd) {
            typeQueue.push(char);
        }
        if (!typeTimeout) {
            startTyping();
        }
    }

    // استدعاء دالة التحديث الموجودة لديك
    processFilesUpdate(safeBuffer);
}

// ============================================================
// 4. تعديل finishMessageProcessing (لحذف الأفاتار)
// ============================================================


            
// ============================================================
// 5. تعديل sendMessage (لإخفاء الاقتراحات)
// ============================================================


// ============================================================
// 6. تحسين دالة DIFF MODE (إصلاح المشكلة الصامتة)
// المشكلة غالباً في المسافات البيضاء (Whitespace)
// ============================================================
window.processFilesUpdate = function(fullText) {
    if (typeof window.lastParsedIndex === 'undefined') window.lastParsedIndex = 0;
    
    // تحسين Regex ليكون أكثر مرونة مع المسافات والأسطر الجديدة
    const fileRegex = /<(FILE|DIFF)\s+(?:name|file)\s*=\s*"([^"]+)"\s*>([\s\S]*?)<\/\1>/g;
    
    let match;
    fileRegex.lastIndex = window.lastParsedIndex;

    while ((match = fileRegex.exec(fullText)) !== null) {
        const tagType = match[1];
        const fileName = match[2].trim();
        // تنظيف المحتوى من كتل الماركداون ```
        let content = match[3].replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '');

        if (tagType === 'FILE') {
            updateFileContent(fileName, content.trim());
        } else if (tagType === 'DIFF') {
            // --- إصلاح منطق DIFF ---
            // نبحث عن الملف المقصود
            const targetFile = projectFiles.find(f => f.name === fileName);
            if (targetFile) {
                // نحاول استخراج كتل البحث والاستبدال النمطية
                // <<<<<<< SEARCH
                // ... code ...
                // =======
                // ... code ...
                // >>>>>>> REPLACE
                const diffBlockRegex = /<{7}\s*SEARCH\s*\n([\s\S]*?)\n={7}\s*\n([\s\S]*?)\n>{7}\s*REPLACE/g;
                let diffMatch;
                let newFileContent = targetFile.content;
                let changesMade = false;

                while ((diffMatch = diffBlockRegex.exec(content)) !== null) {
                    const searchBlock = diffMatch[1]; // لا تقم بعمل trim هنا للحفاظ على المسافات بدقة
                    const replaceBlock = diffMatch[2];
                    
                    // إذا وجدنا النص تماماً
                    if (newFileContent.includes(searchBlock)) {
                        newFileContent = newFileContent.replace(searchBlock, replaceBlock);
                        changesMade = true;
                    } else {
                        // محاولة ثانية: البحث بدون مسافات بيضاء (أقل دقة لكن مفيد في حالة اختلاف المسافات)
                        // هذا الحل "القذر" لكنه فعال للمشاكل الصامتة
                        const cleanContent = newFileContent.replace(/\s+/g, ' ');
                        const cleanSearch = searchBlock.replace(/\s+/g, ' ');
                         // ملاحظة: التطبيق العملي هنا معقد لذا سنكتفي بالمحاولة الأولى الدقيقة
                         // إذا فشل الاستبدال، يمكن إشعار المستخدم (اختياري)
                         console.warn("Could not find exact match for Diff in file:", fileName);
                    }
                }

                if (changesMade) {
                    targetFile.content = newFileContent;
                    // تحديث العرض إذا كان هذا هو الملف المفتوح
                    if (projectFiles[activeFileIndex].name === fileName) {
                        codeArea.value = newFileContent;
                        updateView();
                    }
                }
            }
        }
        window.lastParsedIndex = fileRegex.lastIndex;
        renderTabs();
    }
};
    



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
    function updateSettingsUI() {
        const t = localStorage.getItem('codeai_theme') || 'dark';
        const l = localStorage.getItem('codeai_lang') || 'en';
        
        document.getElementById('themeValue').textContent = t.charAt(0).toUpperCase() + t.slice(1);
        document.getElementById('langValue').textContent = l === 'en' ? 'English' : 'العربية';
        
        document.documentElement.setAttribute('data-theme', t);
        document.documentElement.setAttribute('lang', l);
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
updateMessagesBottomOffset()
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














// 4. دالة تحديث المعاينة وإصلاح السطور (حل مشكلة الـ Token)


// دالة مساعدة للطباعة في الـ Output




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
    menuBtn.addEventListener('click', () => {
        menuPanel.classList.toggle('open');
        menuBtn.classList.toggle('active');
    });

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

    document.addEventListener('click', () => {
        document.getElementById('themePopover').classList.remove('show');
        document.getElementById('langPopover').classList.remove('show');
    });

// متغيرات السحب
let touchStartX = 0;
let touchStartY = 0;
let isCodeZoneOpenAtStart = false; // هل كانت صفحة الكود مفتوحة عند بداية اللمس؟

// 1. عند وضع الإصبع
document.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    
    // تسجيل الحالة لحظة اللمس (مهم جداً)
    isCodeZoneOpenAtStart = codezone.classList.contains('open');
}, {passive: true});

// 2. عند رفع الإصبع
document.addEventListener('touchend', e => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;

    // شرط: الحركة أفقية وليست عمودية، ومسافتها كافية
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 60) {
        
        // --- السيناريو أ: صفحة الكود كانت مفتوحة ---
        if (isCodeZoneOpenAtStart) {
            // سحب لليمين (diffX موجب) -> يعني إغلاق الكود
            if (diffX > 0) {
                codezone.classList.remove('open');
                // توقف هنا فوراً! لا تكمل الكود حتى لا تفتح القائمة
                return; 
            }
        }

        // --- السيناريو ب: صفحة الكود كانت مغلقة ---
        if (!isCodeZoneOpenAtStart) {
            
            // 1. فتح القائمة الجانبية (سحب لليمين)
            // شرط إضافي: يجب أن يبدأ السحب من حافة الشاشة اليسرى (أول 40px)
            if (diffX > 0 && touchStartX < 40) {
                menuPanel.classList.add('open');
                menuBtn.classList.add('active');
                return;
            }

            // 2. إغلاق القائمة الجانبية (سحب لليسار)
            if (diffX < 0 && menuPanel.classList.contains('open')) {
                menuPanel.classList.remove('open');
                menuBtn.classList.remove('active');
                return;
            }

            // 3. فتح صفحة الكود (سحب لليسار بقوة)
            // شرط: القائمة الجانبية مغلقة
            if (diffX < -60 && !menuPanel.classList.contains('open')) {
                codezone.classList.add('open');
                updateView();
                return;
            }
        }
    }
}, {passive: false});

    
    
    

    document.getElementById('closeCodeBtn').addEventListener('click', () => {
        codezone.classList.remove('open');
    });
        // Preview Logic
    const runFab = document.getElementById('runFab');
    runFab.addEventListener('click', () => {
        // للمشاريع المتعددة (ويب)، نستخدم التجميع
        projectFiles[activeFileIndex].content = codeArea.value;
        consoleOutputView.innerHTML = ''; 
        const currentExt = projectFiles[activeFileIndex].name.split('.').pop();
        // إذا كنا في ملف بايثون، شغل runCode العادية
        if(currentExt === 'py') {
            runCode();
        } else {
            // إذا كان ويب، شغل المجمع
            const previewOverlay = document.getElementById('previewOverlay');
            const iframe = document.getElementById('previewFrame');
            
            
            previewOverlay.classList.add('active');
            // تأكد من إخفاء الكانفاس وإظهار الإطار
          
            iframe.style.display = 'block';
            
            const fullCode = compileFullProject();
            iframe.srcdoc = fullCode;
        }
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

async function sendMessage(text, isRetry = false){
    if(!text) return;

    // في المحاولة الأولى فقط نقوم بتعطيل الواجهة وإضافة الرسائل
    if (!isRetry) {
        document.getElementById('sendBtn').classList.add('disabled');
        welcomeScreen.classList.add('hidden');
        retryCount = 0; // تصفير عداد المحاولات
        clearTimeout(retryTimeout);
        clearInterval(statusCountdownInterval);
        showStatus("Sending");
        isStreaming = true;
        serverFinished = false;
        const suggestionsWrapper = document.querySelector('.suggestions-wrapper');
    // أو إذا كان الآيدي suggestionBar حسب ما رأيت في الكود
    const suggestionBar = document.getElementById('suggestionBar'); 
    
    if (suggestionsWrapper) suggestionsWrapper.style.display = 'none';
    updateMessagesBottomOffset()
     // إخفاء الحاوية الأب
    
        // تصفير المتغيرات التي نقلناها
        safeBuffer = ""; 
        fullMarkdownBuffer = ""; 
        typeQueue = []; 
        streamCursor = 0; 
        currentAiMsgElement = null;


        if (!activeId) {
            const newId = Date.now().toString();
            projectFiles = [{ name: 'index.html', content: '// Start coding...' }];
            activeFileIndex = 0;
            convs.unshift({ id: newId, title: text.substring(0, 30), messages: [], files: projectFiles, code: '' });
            activeId = newId;
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

    try {
        const response = await fetch(RENDER_SERVER_URL + '/api/chat', { 
            method:'POST', 
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ message: text, convId: activeId, files: projectFiles })
        });

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
 } catch (error) {
   console.log(error)
        console.warn("Offline or Server Error, switching to Simulation Mode");

        // === هنا كود المحاكاة للتجربة المحلية ===
        // نتحقق إذا كان الخطأ بسبب الشبكة، نقوم بتشغيل رد وهمي
        
/*        removeStatus(); // إزالة حالة "Sending"
        
        const fakeResponseLines = [
            "أهلاً بك! يبدو أنك تعمل في الوضع المحلي (Offline).",
            "هذه رسالة تجريبية لتختبر شكل الفقاعات وتأثير الكتابة.",
            "بما أن الاتصال بالسيرفر غير موجود، قمت بتوليد هذا الرد يدوياً.",
            "يمكنك الآن تعديل الألوان والخطوط ومشاهدة النتائج فوراً.",
            "Hello 'user'"
        ];

        let delay = 0;
        
        // محاكاة تدفق البيانات كأنها قادمة من السيرفر
        fakeResponseLines.forEach((line, index) => {
            setTimeout(() => {
                // إرسال النص
                window.handleServerPacket({ type: 'assistant_message', text: line + "\n" });
                
                // إذا كان السطر الأخير، نرسل إشارة الانتهاء
                if (index === fakeResponseLines.length - 1) {
                    setTimeout(() => {
                        window.handleServerPacket({ type: 'assistant_message', text: '\n[STREAM COMPLETE]' });
                    }, 500);
                }
            }, delay);
            delay += 1000; // تأخير ثانية بين كل سطر
        });*/
 } 
}

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
   
    function renderMessages() {
    messagesEl.innerHTML = '';
    
    if(!activeId || !convs.find(c=>c.id===activeId)) {
        welcomeScreen.classList.remove('hidden');
        return;
    }
    welcomeScreen.classList.add('hidden');

    const conv = convs.find(c=>c.id===activeId);
    
    conv.messages.forEach((m, index) => {
        const d = document.createElement('div');
        
        // --- التعديل: فحص اللغة لكل رسالة (سواء مستخدم أو نموذج) ---
        const isArabic = /[\u0600-\u06FF]/.test(m.text || '');
        const dirClass = isArabic ? 'rtl' : 'ltr';
        
        d.className = 'msg ' + (m.role === 'user' ? 'user' : 'ai') + ' ' + dirClass;
        
        let htmlContent = typeof marked !== 'undefined' ? marked.parse(m.text || '') : m.text;
        
        if (m.role === 'user') {
            d.innerHTML = htmlContent;
            // إضافة زر النسخ للمستخدم
            const copyBtn = document.createElement('button');
            copyBtn.className = 'user-copy-btn';
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(m.text);
            });
            d.appendChild(copyBtn);
        } else {
            // --- تعديل الأفاتار ليكون > فقط ---
            const avatarSymbol = '>'; 
            
            d.innerHTML = `
                <div class="ai-avatar">${avatarSymbol}</div>
                <div class="ai-content">${htmlContent}</div>
            `;
            
            // إضافة الأزرار للرسائل المكتملة
            if (!(isStreaming && index === conv.messages.length - 1)) {
                // نمرر عنصر ai-content ليتم وضع الأزرار داخله أو تحته
                const contentEl = d.querySelector('.ai-content');
                addMessageActions(contentEl, m.text);
            } else {
                currentAiMsgElement = d;
            }
        }
        
        messagesEl.appendChild(d);
    });
    
    messagesEl.scrollTop = messagesEl.scrollHeight;
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
    updateMessagesBottomOffset()
    // ... بقية كود تغيير ارتفاع الصندوق الموجود سابقاً ...
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 150) + 'px';
    this.style.overflowY = this.scrollHeight > 150 ? 'auto' : 'hidden';
});
    
    
  



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
    
    

    const consoleOutputView = document.getElementById('consoleOutputView');
    const btnToggleOutput = document.getElementById('btnToggleOutput');
    
    // دالة تجميع المشروع وتشغيل الكونسول - الإصدار النهائي// دالة تجميع المشروع وتشغيل الكونسول - الإصدار المصحح// دالة تجميع المشروع - الإصدار المحسن (Capture All Errors)
    
    // دالة تجميع المشروع وتشغيل الكونسول - الإصدار المحسن لالتقاط Syntax 
    


// إضافة دعم التعرف على اللغات


// أضف هذه الدالة لمعالجة استخراج الملفات من رد النموذج


    // تشغيل زر Run All
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

// --- منطق سحب القائمة الجانبية (المعدل) ---
let menuStartX = 0;
let menuStartY = 0;

document.addEventListener('touchstart', e => {
    menuStartX = e.touches[0].clientX;
    menuStartY = e.touches[0].clientY;
}, {passive: true});
// منطق سحب القائمة الجانبية (المعدل)
document.addEventListener('touchend', e => {
    // إصلاح 4: إذا كانت صفحة الكود مفتوحة، لا تفعل شيئاً للقائمة الجانبية
    if (codezone.classList.contains('open')) return;

    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - menuStartX;
    const diffY = endY - menuStartY;

    // التأكد أن السحب أفقي
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 80) {
        // سحب لليمين (فتح القائمة)
        if (diffX > 0 && !codezone.classList.contains('open')) {
             menuPanel.classList.add('open');
             menuBtn.classList.add('active');
        }
        
        // سحب لليسار (إغلاق القائمة)
         if (diffX < 0 && menuPanel.classList.contains('open')) {
             menuPanel.classList.remove('open');
             menuBtn.classList.remove('active');
        }
    }
}, {passive: true});

// تفعيل زر فتح الكود العلوي
document.getElementById('codeToggleBtn').addEventListener('click', () => {
    codezone.classList.add('open');
    updateView(); // تحديث المحرر للتأكد من ظهور النص
});

// --- Version Display Logic ---
    const APP_VERSION = 'v1.274.9'; // يمكنك تحديث هذا يدوياً عند كل تحديث للكاش
    const versionEl = document.getElementById('appVersion');
    if(versionEl) versionEl.textContent = APP_VERSION;
    
    checkInputState();
    
        // --- دوال التشغيل والمعالجة (تم نقلها من core.js) ---

    // 1. دالة تجميع المشروع
    function compileFullProject() {
        let htmlFile = projectFiles.find(f => f.name.endsWith('.html')) || { content: '<!DOCTYPE html><html><head></head><body></body></html>' };
        let cssContent = projectFiles.filter(f => f.name.endsWith('.css')).map(f => `<style>${f.content}</style>`).join('\n');
        let jsContent = projectFiles.filter(f => f.name.endsWith('.js')).map(f => `<script>${f.content}</script>`).join('\n');
        let pyContent = projectFiles.filter(f => f.name.endsWith('.py')).map(f => `<script type="text/python">${f.content.trim()}</script>`).join('\n');

        let fullCode = htmlFile.content;
        if (pyContent.trim() !== "") {
            const brythonScripts = `
    <script src="https://cdnjs.cloudflare.com/ajax/libs/brython/3.10.5/brython.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/brython/3.10.5/brython_stdlib.min.js"></script>`;
            fullCode = fullCode.replace('</head>', `${brythonScripts}\n${cssContent}\n</head>`)
                             .replace(/<body/i, '<body onload="brython()"');
        } else {
            fullCode = fullCode.replace('</head>', `${cssContent}\n</head>`);
        }
        fullCode = fullCode.replace('</body>', `${jsContent}\n${pyContent}\n</body>`);
        return fullCode;
    }

    // 2. دالة تشغيل الكود
    window.runCode = async function() { // جعلناها global لتعمل مع الأزرار
        const currentFile = projectFiles[activeFileIndex];
        if (!currentFile) return;
        const ext = currentFile.name.split('.').pop().toLowerCase();
        
        const previewOverlay = document.getElementById('previewOverlay');
        const iframe = document.getElementById('previewFrame');
        const canvas = document.getElementById('gameCanvas');
        const consoleView = document.getElementById('consoleOutputView');

        previewOverlay.classList.add('active');
        iframe.style.display = 'none';
        canvas.style.display = 'none';
        consoleView.style.display = 'none';

        if (['html', 'css', 'js'].includes(ext)) {
            iframe.style.display = 'block';
            iframe.srcdoc = compileFullProject();
        } else if (ext === 'py') {
            runBrython(currentFile.content); // مستوردة من core.js
        }
    };

    // 3. دالة معالجة تحديث الملفات
    

    function updateFileContent(fileName, content) {
        const existingIndex = projectFiles.findIndex(f => f.name === fileName);
        if (existingIndex !== -1) {
            projectFiles[existingIndex].content = content;
            if (existingIndex === activeFileIndex) {
                codeArea.value = content;
                updateView();
            }
        } else {
            projectFiles.push({ name: fileName, content: content });
            if (projectFiles.length === 1) {
                 activeFileIndex = 0;
                 codeArea.value = content;
                 updateView();
            }
        }
    }

    // 4. دالة استخراج الملفات النهائية
    window.extractAndSyncFiles = function(text) {
        const filePattern = /File:\s*([\w\.-]+)\n```[\w]*\n([\s\S]*?)```/g;
        let match;
        while ((match = filePattern.exec(text)) !== null) {
            updateFileContent(match[1].trim(), match[2].trim());
        }
    };

    // 5. دالة معالجة خطأ 503
    window.handle503Error = function(text) {
        removeStatus();
        isStreaming = false;
        if (retryCount < maxRetries) {
            let delaySec = Math.pow(2, retryCount + 1);
            retryCount++;
            updateStatusText(`Retrying in ${delaySec}s`);
            setTimeout(() => sendMessage(text, true), delaySec * 1000);
        } else {
            retryCount = 0;
            finalizeError("Server busy. Please try again.");
        }
    };

function updateMessagesBottomOffset() {
    const messages = document.getElementById('messages');
    const suggestionBar = document.getElementById('suggestionBar');
    const inputBar = document.querySelector('.input-bar');

    let offset = 0;

    if (suggestionBar && suggestionBar.offsetParent !== null) {
        offset += suggestionBar.offsetHeight;
    }
    if (inputBar && inputBar.offsetParent !== null) {
        offset += inputBar.offsetHeight;
    }

    messages.style.paddingBottom = offset + 20 + 'px';
}
startServerConnection(); 

})//DOM Closing

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
