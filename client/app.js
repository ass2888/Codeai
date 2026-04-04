const APP_VERSION = 'v1.281.83'; // يمكنك تحديث هذا يدوياً عند كل تحديث للكاش
const versionEl = document.getElementById('appVersion');
if(versionEl) {
    if (!localStorage.getItem('userId')) {
        localStorage.setItem('userId', crypto.randomUUID());
    }
    const userId = localStorage.getItem('userId');
    versionEl.innerHTML = `${APP_VERSION}<br><span style="font-size:9px;opacity:0.6;">user-${userId}</span>`;
}

const SETTINGS_KEY = 'codeai_settings';
const RENDER_SERVER_URL = 'https://codeai-0sh2.onrender.com'; // تأكدنا من الرابط
let activeGesture = null; 
// 'menu' | 'codezone' | null

let lastLog = "";
let lastTime = 0;
const originalLog = console.log;

// إعادة تعريف console.log عالمياً لمنع التكرار
console.log = function(...args) {
    const msg = args.join(' ');
    const now = Date.now();

    // إذا كانت الرسالة مكررة في أقل من 100 ملي ثانية، يتم تجاهلها
    if (msg === lastLog && (now - lastTime) < 300) return;

    lastLog = msg;
    lastTime = now;

    // إرسال للكونسول الأصلي
    originalLog.apply(console, args);

    // تحديث الشاشة السوداء (Console Output)
    const out = document.getElementById('consoleOutput');
    if (out) {
        const div = document.createElement('div');
        div.textContent = "> " + msg;
        out.appendChild(div);
        out.scrollTop = out.scrollHeight;
    }
};

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
        edit: "Edit",
        back: "Back",
        Project: "Project Code",
        runButtonSettings: "Run button",
        defaultRunMode: "Default Run Mode",
        runAll: "All (Default)",
        runSingle: "Single File",
        btnRunAllShortcut: "Run All Files",
        btnRunSingleShortcut: "Run Current File",
        console: "Console",
        preview: "Preview",
        welcomeSub: "What can I help you with?",
        updateMsg: "There is a new update available!",
        updateBtn: "Update",
        undo: "Undo",
        redo: "Redo",
        import: "Import",
        export: "Export",
        copy: "Copy",
        rename: "Rename",
        fileSettings: "File Settings",
        fileName: "File Name",
        deleteConversation: "Delete Conversation",
        theme: "Theme",
        Language: "Language",
        settings: "Settings",
        Simple: "Simple (Non-tech)",
        Detailed1: "Detailed",
        Detailed: "Detailed (Developers)",
        darktheme: "Dark",
        lighttheme: "Light",
        What: "What can I help you with?",
        fontSize: "Font Size",
        small: "Small",
        medium: "Medium",
        large: "Large",
        xlarge: "Extra Large",
        thinking: "Analysis",
        hideThinking: "Hide",
        account: "Account",
        accountSettings: "Account Settings",
        changeNickname: "Change Nickname",
        newNickname: "New Nickname",
        update: "Update",
        nicknameUpdated: "Nickname updated successfully!",
        nicknameError: "Please enter a valid nickname (2-30 characters)",
        nicknameTaken: "This nickname is already taken",
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
        edit: "تعديل",
        back: "رجوع",
        Project: "كود المشروع",
        runButtonSettings: "إعدادات زر التشغيل",
        defaultRunMode: "طريقة التشغيل الافتراضية",
        runAll: "الكل (افتراضي)",
        runSingle: "ملف واحد",
        btnRunAllShortcut: "تشغيل كافة الملفات",
        btnRunSingleShortcut: "تشغيل الملف الحالي",
        console: "الكونسول",
        preview: "المعاينة",
        welcomeSub: "كيف يمكنني مساعدتك اليوم؟",
        updateMsg: "يوجد تحديث جديد متاح!",
        updateBtn: "تحديث",
        undo: "تراجع",
        redo: "إعادة",
        import: "استيراد",
        export: "تصدير",
        copy: "نسخ",
        rename: "إعادة تسمية",
        fileSettings: "إعدادات الملف",
        fileName: "اسم الملف",
        deleteConversation: "حذف المحادثة",
        theme: "السمة",
        Language: "اللغة",
        settings: "الاعدادات",
        Simple: "مبسطة (لغير المبرمجين)",
        Detailed1: "دقيق",
        Detailed: "دقيق",
        darktheme: "داكن",
        lighttheme: "فاتح",
        What: "كيف يمكنني مساعدتك؟",
        fontSize: "حجم الخط",
        small: "صغير",
        medium: "متوسط", 
        large: "كبير",
        xlarge: "كبير جداً",
        thinking: "التفكير",
        hideThinking: "إخفاء",
        account: "الحساب",
        accountSettings: "إعدادات الحساب",
        changeNickname: "تغيير الاسم",
        newNickname: "الاسم الجديد",
        update: "تحديث",
        nicknameUpdated: "تم تحديث الاسم بنجاح!",
        nicknameError: "الرجاء إدخال اسم صحيح (2-30 حرفاً)",
        nicknameTaken: "هذا الاسم مستخدم بالفعل",
    }
};

let currentRunMode = 'all'; // الافتراضي هو كل الملفات

function setRunMode(mode) {
    currentRunMode = mode;
    const highlight = document.getElementById('toggleHighlight');
    const options = document.querySelectorAll('.toggle-option');
    const lang = localStorage.getItem('codeai_lang') || 'en';

    if (mode === 'all') {
        highlight.style.left = '4px';
        options[0].classList.add('active');
        options[1].classList.remove('active');
    } else {
        highlight.style.left = 'calc(50% + 2px)';
        options[0].classList.remove('active');
        options[1].classList.add('active');
    }

    // تحديث زر الاختصار: إذا كان الافتراضي "الكل"، الزر يشغل "ملف واحد" والعكس
    const btnShortcut = document.getElementById('btnRunShortcut');
    if (btnShortcut) {
        btnShortcut.textContent = mode === 'all' ? 
            translations[lang].btnRunSingleShortcut : // "تشغيل الملف الحالي"
            translations[lang].btnRunAllShortcut;    // "تشغيل كل الملفات"
    }
}

// تفعيل عمل زر الاختصار
document.getElementById('btnRunShortcut')?.addEventListener('click', () => {
    // إذا كان المود الحالي 'الكل'، نطلب تشغيل 'منفرد' عبر الزر، والعكس
    const targetMode = currentRunMode === 'all' ? 'single' : 'all';
    runCode(targetMode); 
    // إغلاق المودال بعد الضغط
    const modal = document.getElementById('previewModal');
    if(modal) modal.style.display = 'none';
});

// تحديث دالة runCode لتدعم النوع المحدد
async function runCodemode(mode = null) {
    const runMode = mode || currentRunMode; // استخدام المود الممرر أو الافتراضي
    
    if (runMode === 'all') {
        // كود تشغيل جميع الملفات (المعاينة الكاملة للمشروع)
        updatePreview(true); 
    } else {
        // كود تشغيل الملف المحدد فقط
        const currentFile = projectFiles[activeFileIndex];
        updatePreview(false, currentFile);
    }
}



// دالة تطبيق حجم الخط على الواجهة
function applyFontSize() {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    const fontSize = (settings.fontSize || 'medium').toLowerCase();
    
    // إزالة جميع فئات الأحجام ثم إضافة الفئة المطلوبة
    document.body.classList.remove('font-small', 'font-medium', 'font-large', 'font-xlarge');
    document.body.classList.add('font-' + fontSize);
    
    // تحديث أنماط CSS ديناميكياً
    updateFontVariables(fontSize);
}

// دالة مساعدة لتحديث متغيرات CSS
function updateFontVariables(size) {
    const sizes = {
        'small': { base: '12px', chat: '13px', code: '12px', header: '18px' },
        'medium': { base: '16px', chat: '17px', code: '13px', header: '21px' },
        'large': { base: '18px', chat: '19px', code: '14px', header: '25px' },
        'xlarge': { base: '20px', chat: '21px', code: '15px', header: '31px' }
    };
    
    const config = sizes[size] || sizes.medium;
    
    document.documentElement.style.setProperty('--font-size-base', config.base);
    document.documentElement.style.setProperty('--chat-font-size', config.chat);
    document.documentElement.style.setProperty('--code-font-size', config.code);
    document.documentElement.style.setProperty('--header-font-size', config.header);
}

// تحديث دالة applySettings لتشمل الإعدادات الجديدة
function applySettings() {
    const defaultSettings = {
        accentColor: '#333333',
        fontSize: 'medium', // تغيير إلى lowercase لتتوافق مع CSS
        detailLevel: 'Detailed',
        convStyle: 'Detailed',
        prefLanguage: 'HTML'
    };
    
    let settings = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (!settings) {
        settings = defaultSettings;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    // تطبيق لون التمييز
    document.documentElement.style.setProperty('--accent-color', settings.accentColor);
    
    // تطبيق حجم الخط
    applyFontSize();
    
    return settings;
}
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
function renderSuggestions() {
    // منع السحب عند التفاعل مع شريط الاقتراحات
const bar = document.getElementById('suggestionBar');
if (bar) {
    ['touchstart', 'touchmove', 'mousedown', 'mousemove'].forEach(evt => {
        bar.addEventListener(evt, (e) => {
            e.stopPropagation(); // منع انتقال الحدث للعناصر الأب (مثل منطقة الكود)
        }, { passive: false });
    });
}

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
// دالة لتطبيق الترجمة على النصوص
function updateUIText() {
    const lang = localStorage.getItem('codeai_lang') || 'en';
    const t = translations[lang];

    // تحديث النصوص الثابتة عبر data-i18n attribute (يجب إضافته في HTML للعناصر التي تريد ترجمتها)
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) el.textContent = t[key];
    });
    
    currentSuggestionLang = lang
    renderSuggestions()

    // تحديثات يدوية للعناصر ذات النصوص المباشرة
    document.querySelector('#settingsPage h2').textContent = t.settings;
    document.getElementById('newChatBtn').textContent = t.newChat;
    document.getElementById('closeSettings').textContent = t.close;
    document.getElementById('input').placeholder = t.sendPlaceholder;
    // تحديث نصوص إعدادات الحساب
const accountSettingsTitle = document.querySelector('#accountSettingsModal h2');
if (accountSettingsTitle) accountSettingsTitle.textContent = t.accountSettings;

const nicknameHint = document.querySelector('.nickname-hint');
if (nicknameHint) nicknameHint.textContent = t.changeNickname;

const saveBtn = document.getElementById('saveNicknameBtn');
if (saveBtn) saveBtn.textContent = t.update;

const cancelBtn = document.getElementById('cancelNicknameBtn');
if (cancelBtn) cancelBtn.textContent = t.cancel;
    // تحديث اتجاه الصفحة
    if(lang === 'ar') {
        document.body.style.fontFamily = "'Tajawal', sans-serif";
    } else {
        document.body.style.fontFamily = "'Segoe UI', Tahoma, sans-serif";
    }
}



// دالة لتحميل الإعدادات من التخزين المحلي وتطبيقها


// دالة لحفظ إعداد واحد وتطبيق التغييرات (لاستخدامها في معالجات أحداث واجهة الإعدادات)
function saveSetting(key, value) {
    let settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    settings[key] = value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    
    if (key === 'fontSize') {
        applyFontSize(); // تطبيق حجم الخط مباشرة
    } else {
        applySettings(); // تطبيق الإعدادات الأخرى
    }
}

// >> استدعاء الدالة عند تحميل الصفحة <<
let currentSettings = applySettings(); 
// ... يجب أن تستمر بقية أكواد JavaScript هنا ...

// --- حفظ واسترجاع التحليل النهائي (Thought Process) ---
const THOUGHT_PREFIX = 'thought_';


// دالة مساعدة لتوليد رابط المعاينة لملفات المستندات
function getDocumentViewerUrl(file, embedded = true) {
    const ext = file.name.split('.').pop().toLowerCase();
    const fileUrl = file.url || `/generated/${file.name}`;
    
    // استخدم Google Docs Viewer لملفات DOCX و PPTX
    if (ext === 'docx' || ext === 'pptx') {
        const baseUrl = 'https://docs.google.com/gview';
        const param = embedded ? 'embedded=true&url=' : 'url=';
        return `${baseUrl}?${param}${encodeURIComponent(fileUrl)}`;
    }
    
    // للملفات الأخرى (مثل PDF) استخدم الرابط المباشر
    return fileUrl;
}


function saveThoughtForMessage(convId, messageIndex, thoughtText) {
    if (!convId || !thoughtText) return;
    
    const key = THOUGHT_PREFIX + convId + '_' + messageIndex;
    try {
        localStorage.setItem(key, thoughtText);
        console.log(`💾 Saved thought for message ${messageIndex} in conversation ${convId}`);
    } catch(e) {
        console.error('Failed to save thought:', e);
    }
}

function getThoughtForMessage(convId, messageIndex) {
    if (!convId) return null;
    
    const key = THOUGHT_PREFIX + convId + '_' + messageIndex;
    try {
        return localStorage.getItem(key);
    } catch(e) {
        console.error('Failed to retrieve thought:', e);
        return null;
    }
}

function clearThoughtForMessage(convId, messageIndex) {
    if (!convId) return;
    
    const key = THOUGHT_PREFIX + convId + '_' + messageIndex;
    try {
        localStorage.removeItem(key);
    } catch(e) {
        console.error('Failed to clear thought:', e);
    }
}
    
    let deleteMode = 'file'; // 'file' or 'conv'
    let itemToDeleteId = null; // ID للمحادثة أو Index للملف
    const LINE_HEIGHT = 22; 

window.closeAnimatedModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        // الانتظار 300 ملي ثانية (وقت الأنميشن) قبل إخفاء العنصر تماماً من الشاشة
        setTimeout(() => {
            modal.style.display = 'none';
        }, );
    }
};

// ==========================================
// دوال Supabase API (جديدة)
// ==========================================

const API_BASE_URL = RENDER_SERVER_URL; // 'https://codeai-0sh2.onrender.com'
// جلب جميع محادثات المستخدم (قائمة فقط)
async function fetchConversationsFromServer() {
    const userId = localStorage.getItem('userId');
    if (!userId) return [];
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/user?userId=${userId}`);
        if (!response.ok) throw new Error('Failed to fetch conversations');
        
        const data = await response.json();
        
        // تحديث الإعدادات المحلية من السيرفر
        if (data.settings && Object.keys(data.settings).length > 0) {
            const currentSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            const mergedSettings = { ...currentSettings, ...data.settings };
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(mergedSettings));
            applySettings();
        }
        
        // تحويل بيانات المحادثات من API إلى نفس هيكل convs القديم
        return data.conversations.map(conv => ({
            id: conv.id,
            title: conv.title,
            messages: [],
            files: [],
            hasActivity: false,
            created_at: conv.created_at,
            updated_at: conv.updated_at
        }));
        
    } catch (error) {
        console.error("❌ Error fetching conversations:", error);
        return [];
    }
}

// جلب جميع محادثات المستخدم
// جلب جميع محادثات المستخدم (قائمة فقط)
// جلب محادثة كاملة (رسائل + ملفات)
async function fetchConversationFromServer(convId) {
    const userId = localStorage.getItem('userId');
    if (!userId || !convId) return null;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/conversation?convId=${convId}&userId=${userId}`);
        if (!response.ok) throw new Error('Failed to fetch conversation');
        
        const data = await response.json();
        
        // ✅ تحويل الرسائل مع معالجة آمنة للحقول الجديدة
        const messages = (data.messages || []).map(msg => ({
            role: msg.role,
            text: msg.content || '',
            model: msg.model || null,
            thought: msg.thought || null,
            tasks: msg.tasks || null,           // ✅ آمن - إذا لم يوجد يصبح null
            filesSnapshot: msg.files_snapshot || null,  // ✅ آمن - إذا لم يوجد يصبح null
            created_at: msg.created_at
        }));
        
        // تحويل الملفات
        const files = (data.files || []).map(file => ({
            name: file.name,
            content: file.content || '',
            url: file.url || null,
            previewUrl: file.preview_url || null,
            previewUrls: file.preview_urls || null,
            type: file.type || null,
            isBinary: !!file.url
        }));
        
        return {
            id: data.conversation?.id || convId,
            title: data.conversation?.title || 'New Conversation',
            messages: messages,
            files: files.length ? files : [{ name: 'index.html', content: '// Start coding...' }],
            hasActivity: false,
            created_at: data.conversation?.created_at || new Date().toISOString(),
            updated_at: data.conversation?.updated_at || new Date().toISOString()
        };
        
    } catch (error) {
        console.error("❌ Error fetching conversation:", error);
        // ✅ إرجاع هيكل افتراضي بدلاً من null لمنع الانهيار
        return {
            id: convId,
            title: 'Conversation',
            messages: [],
            files: [{ name: 'index.html', content: '// Start coding...' }],
            hasActivity: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
    }
}

// حفظ محادثة كاملة على السيرفر
async function saveConversationToServer(conversation) {
  const lastMsg = conversation.messages[conversation.messages.length - 1];
    console.log("💾 saveConversationToServer called with tasks:", !!lastMsg?.tasks);
    console.log("💾 saveConversationToServer called with snapshot:", !!lastMsg?.filesSnapshot);
    const userId = localStorage.getItem('userId');
    if (!userId || !conversation) return false;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/conversation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                conversation: {
                    id: conversation.id,
                    title: conversation.title,
                    messages: conversation.messages.map(msg => ({
                        role: msg.role,
                        content: msg.text,
                        model: msg.model || null,
                        thought: msg.thought || null,
                        tasks: msg.tasks || null,
                        files_snapshot: msg.filesSnapshot || null,  // ✅ لقطة الملفات
                        created_at: msg.created_at || new Date().toISOString()
                    })),
                    files: conversation.files.map(file => ({
                        name: file.name,
                        content: file.content || null,
                        url: file.url || null,
                        previewUrl: file.previewUrl || null,
                        previewUrls: file.previewUrls || null,
                        type: file.type || null,
                        created_at: new Date().toISOString()
                    }))
                }
            })
        });
        
        if (!response.ok) throw new Error('Failed to save conversation');
        return true;
        
    } catch (error) {
        console.error("❌ Error saving conversation:", error);
        return false;
    }
}

// حذف محادثة من السيرفر
async function deleteConversationFromServer(convId) {
    const userId = localStorage.getItem('userId');
    if (!userId || !convId) return false;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/conversation?convId=${convId}&userId=${userId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete conversation');
        return true;
        
    } catch (error) {
        console.error("❌ Error deleting conversation:", error);
        return false;
    }
}

// تحديث عنوان المحادثة
async function updateConversationTitle(convId, newTitle) {
    const conv = convs.find(c => c.id === convId);
    if (conv) {
        conv.title = newTitle;
        await saveConversationToServer(conv);
    }
}

// DOM Opening
document.addEventListener('DOMContentLoaded', () => {// --- التحقق من الأصول (Assets Check) ---
// ملاحظة: نستخدم مسارات نسبية الآن لأن index.html و assets في نفس المستوى داخل client

// =========================================
// كود السبلاش المحسن والمصحح
// =========================================

function initSplashScreen() {
    const splash = document.getElementById('splashScreen');
    const video = document.getElementById('splashVideo');
    const logo = document.getElementById('splashLogo');
    const version = document.getElementById('splashVersion');
    const videoContainer = document.getElementById('splashVideoContainer');
    
    if (!splash || !video) {
        
        return;
    }
    
    
    
    // 1. إخفاء اللوقو والنص في البداية (تأكيد إضافي)
    if (logo) logo.style.display = 'none';
    if (version) version.style.display = 'block';
    
    // 2. منع التفاعل مع الصفحة خلف السبلاش
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    console.log(isLight)
    if (isLight) {
video.src = isLight 
    ? 'assets/splash-light.mp4' 
    : 'assets/splash-dark.mp4';
}
video.load();
    // 3. بدء تشغيل الفيديو
    video.play().then(() => {
        
    }).catch((error) => {
        
        
        // استخدام الصورة كبديل
        
        
    });
    
    // 4. بعد ثانية واحدة: إظهار التطبيق خلف الفيديو
    setTimeout(() => {
        splash.classList.add('app-visible');
        splash.style.zIndex = '60';
    }, 2500);
    
    // دالة معالجة انتهاء الفيديو
    function handleVideoEnd() {
        ;
        
        // تأكد من أن الفيديو مخفي أولاً
        if (videoContainer) {
            videoContainer.classList.add('hidden');
            
        }
        
        // الانتظار 300ms للانتقال السلس
        setTimeout(() => {
            // إظهار اللوقو (الذي كان تحت الفيديو طوال الوقت)
            if (logo) {
                logo.style.display = 'block';
                
                // تأخير بسيط قبل إضافة الكلاس للأنيميشن
                setTimeout(() => {
                    logo.classList.add('visible');
                    
                }, 50);
            }
            
            // بعد 500ms من ظهور اللوقو، إظهار نص النسخة
            setTimeout(() => {
                if (version) {
                    version.style.display = 'block';
                    
                    setTimeout(() => {
                        version.classList.add('visible');
                        
                    }, 100);
                }
                
                // بعد 2 ثانية من ظهور كل شيء، إخفاء السبلاش كاملة
                setTimeout(() => {
                    splash.classList.add('hidden');
                    
                    
                    // إعادة السماح بالتفاعل مع الصفحة
                    document.body.style.overflow = '';
                    document.body.style.touchAction = '';
                    

                    setTimeout(() => {
                        if (splash && splash.parentNode) {
                            splash.style.display = 'none';
                            
                        }
                    }, 500);
                }, 2000);
            }, 500);
        }, 300);
    }
    
    // 5. عند انتهاء الفيديو تلقائياً
    video.onended = function() {
    video.currentTime = video.duration - 0.05;
    video.pause();
    
};

// في نهاية دالة initSplashScreen، بعد إخفاء السبلاش
setTimeout(async () => {
    // التحقق من وجود حساب
    const hasAccount = await checkUserRegistration();
    
    if (!hasAccount) {
        // إظهار شاشة التسجيل
        const welcomeAuthScreen = document.getElementById('welcomeAuthScreen');
        if (welcomeAuthScreen) {
            welcomeAuthScreen.style.display = 'flex';
            welcomeAuthScreen.classList.add('open');
        }
        
        // إخفاء عناصر التطبيق الرئيسية حتى التسجيل
        document.querySelector('.root').style.display = 'none';
        document.querySelector('.topbar').style.display = 'none';
        document.getElementById('menuBtn').style.display = 'none';
        document.getElementById('codeToggleBtn').style.display = 'none';
    } else {
        // المستخدم مسجل، أظهر التطبيق
        document.querySelector('.root').style.display = '';
        document.querySelector('.topbar').style.display = '';
        document.getElementById('menuBtn').style.display = '';
        document.getElementById('codeToggleBtn').style.display = '';
        
        // تحميل المحادثات
        await loadConversations();
        
        if (activeId) {
            const conv = convs.find(c => c.id === activeId);
            if (conv) {
                const fullConv = await fetchConversationFromServer(activeId);
                if (fullConv) {
                    conv.messages = fullConv.messages;
                    conv.files = fullConv.files;
                    projectFiles = conv.files;
                    renderTabs();
                    renderMessages();
                }
            }
        }
        
        applySettings();
        checkInputState();
    }
}, 5000);
    
    // 6. بديل: إذا لم ينته الفيديو بعد 5.5 ثوان
  /*  setTimeout(() => {
        // تحقق إذا ما زالت السبلاش ظاهرة والفيديو لم ينته بعد
        if (splash && !splash.classList.contains('hidden') && video.duration > 0) {
            
            handleVideoEnd();
        }
    }, 5500); */
    
    // 7. سلامة: إخفاء السبلاش بعد 8 ثوان كحد أقصى
  /*  setTimeout(() => {
        if (splash && !splash.classList.contains('hidden')) {
            
            splash.classList.add('hidden');
            
            document.body.style.overflow = '';
            document.body.style.touchAction = '';
            
            setTimeout(() => {
                splash.style.display = 'none';
            }, 500);
        }
    }, 8000); */
}

// تشغيل السبلاش بعد تحميل الصفحة

    // تأخير بسيط لضمان تحميل كل العناصر
    setTimeout(initSplashScreen, 300);


// بديل: إذا كان DOMContentLoaded حدث بالفعل
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initSplashScreen, 300);
}

const SV = document.getElementById('splashVersion');
if (SV) {
    SV.textContent = APP_VERSION;
    SV.style.display = 'block';
}

setTimeout(() => {
    const welcomeSub = document.querySelector('.welcome-sub');
    if (welcomeSub) {
        
    }
}, 1500); // بعد انتهاء السبلاش

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

// =========================================
// Account Settings Logic
// =========================================
// =========================================
// Avatar Color Selection Logic - فقط لصفحة الحساب
// =========================================

// الألوان المتاحة
const avatarColors = [
    '#f44336', '#ff5722', '#ff9800', '#ffc107',  // أحمر ← برتقالي ← أصفر
    '#4caf50', '#8bc34a', '#00bcd4', '#2196f3',  // أخضر ← أزرق
    '#3f51b5', '#9c27b0', '#e91e63', '#795548',  // أزرق داكن ← بني
    '#FFFFFF', '#000000', '#9e9e9e', '#607d8b'    // أبيض ← أسود ← رمادي
];

// تحميل اللون المحفوظ
function getSavedAvatarColor() {
    const savedColor = localStorage.getItem('codeai_avatar_color');
    // التحقق من أن اللون المحفوظ موجود في قائمة الألوان
    if (savedColor && avatarColors.includes(savedColor)) {
        return savedColor;
    }
    // إذا لم يكن موجوداً، نرجع اللون الافتراضي
    return '#2196f3';
}

function applyAvatarColor(color) {
    // تطبيق على الأفاتار في شاشة إعدادات الحساب
    const avatar = document.querySelector('.account-settings-avatar-circle');
    if (avatar) {
        avatar.style.background = `linear-gradient(135deg, ${color}, ${adjustColor(color, -20)})`;
        
        // تحديد لون النص: أسود فقط للون الأبيض، والباقي أبيض
        const textColor = color === '#FFFFFF' ? '#000000' : '#FFFFFF';
        const textSpan = avatar.querySelector('span');
        if (textSpan) {
            textSpan.style.color = textColor;
        }
    }
    
    // تحديث لون الأفاتار في صفحة الإعدادات
    const accountAvatar = document.querySelector('.account-avatar');
    if (accountAvatar) {
        accountAvatar.style.background = `linear-gradient(135deg, ${color}, ${adjustColor(color, -20)})`;
        const textSpan = accountAvatar.querySelector('span');
        if (textSpan) {
            const textColor = color === '#FFFFFF' ? '#000000' : '#FFFFFF';
            textSpan.style.color = textColor;
        }
    }
    
    // حفظ اللون
    localStorage.setItem('codeai_avatar_color', color);
}

// دالة لحساب اللون المناسب للنص (أسود أو أبيض) بناءً على سطوع الخلفية
function getContrastColor(hexColor) {
    // تحويل hex إلى RGB
    let r, g, b;
    
    if (hexColor.startsWith('#')) {
        r = parseInt(hexColor.slice(1, 3), 16);
        g = parseInt(hexColor.slice(3, 5), 16);
        b = parseInt(hexColor.slice(5, 7), 16);
    } else {
        // إذا كان اللون ليس hex، نعيد أبيض
        return '#FFFFFF';
    }
    
    // حساب السطوع (صيغة WCAG)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    
    // إذا كان السطوع عالياً (لون فاتح) نستخدم أسود، وإلا نستخدم أبيض
    return brightness > 128 ? '#000000' : '#FFFFFF';
}

// تحديث دالة applyAvatarColor القديمة - إضافة لون النص
const originalApplyAvatarColor = applyAvatarColor;
window.applyAvatarColor = function(color) {
    originalApplyAvatarColor(color);
    // تحديث لون النص للأفاتار في جميع المواضع
    document.querySelectorAll('.account-avatar span, .account-settings-avatar-circle span').forEach(span => {
        const parent = span.parentElement;
        const bgColor = parent.style.background;
        // استخراج اللون من gradient
        const colorMatch = bgColor.match(/linear-gradient\(135deg, (#[0-9a-f]{6}),/i);
        if (colorMatch) {
            span.style.color = getContrastColor(colorMatch[1]);
        }
    });
};

// دالة لتعديل درجة اللون (تفتيح/تغميق)
function adjustColor(color, percent) {
    let r, g, b;
    if (color.startsWith('#')) {
        r = parseInt(color.slice(1, 3), 16);
        g = parseInt(color.slice(3, 5), 16);
        b = parseInt(color.slice(5, 7), 16);
    } else {
        return color;
    }
    
    // للألوان الفاتحة جداً (مثل الأبيض)، لا نغمق كثيراً
    if (color === '#FFFFFF') {
        return '#f5f5f5';
    }
    
    // للألوان الداكنة جداً (مثل الأسود)، لا نفتح كثيراً
    if (color === '#000000') {
        return '#1a1a1a';
    }
    
    r = Math.min(255, Math.max(0, r + percent));
    g = Math.min(255, Math.max(0, g + percent));
    b = Math.min(255, Math.max(0, b + percent));
    
    return `rgb(${r}, ${g}, ${b})`;
}

// متغيرات popover
const avatarColorPopover = document.getElementById('avatarColorPopover');
let activePopoverAvatar = null;

// فتح popover عند النقر على الأفاتار في شاشة الحساب فقط
// فتح popover عند النقر على الأفاتار في شاشة الحساب فقط
// فتح popover عند النقر على الأفاتار في شاشة الحساب فقط
function openAvatarColorPopover(avatarElement, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    if (avatarColorPopover.classList.contains('show')) {
        closeAvatarColorPopover();
        return;
    }
    
    console.log('Opening avatar color popover...');
    
    activePopoverAvatar = avatarElement;
    
    const savedColor = getSavedAvatarColor();
    document.querySelectorAll('.avatar-color-option').forEach(option => {
        const color = option.getAttribute('data-color');
        if (color === savedColor) {
            option.classList.add('active');
        } else {
            option.classList.remove('active');
        }
    });
    
    // حساب موقع الأفاتار
    const rect = avatarElement.getBoundingClientRect();
    const popoverWidth = 280;
    const popoverHeight = 320;
    
    let left = rect.left + (rect.width / 2) - (popoverWidth / 2);
    let top = rect.top - popoverHeight - 10;
    
    if (top < 10) {
        top = rect.bottom + 10;
    }
    if (left < 10) left = 10;
    if (left + popoverWidth > window.innerWidth - 10) left = window.innerWidth - popoverWidth - 10;
    
    avatarColorPopover.style.left = `${left}px`;
    avatarColorPopover.style.top = `${top}px`;
    avatarColorPopover.style.transform = 'scale(0.9)';
    avatarColorPopover.style.opacity = '0';
    
    avatarColorPopover.classList.add('show');
    
    // أنيميشن الظهور
    setTimeout(() => {
        avatarColorPopover.style.transform = 'scale(1)';
        avatarColorPopover.style.opacity = '1';
    }, 10);
    
    setTimeout(() => {
        document.addEventListener('click', closeAvatarColorPopoverOnOutside);
    }, 100);
}

// إغلاق popover مع أنيميشن
function closeAvatarColorPopover() {
    if (!avatarColorPopover.classList.contains('show')) return;
    
    // أنيميشن الإغلاق
    avatarColorPopover.style.transform = 'scale(0.9)';
    avatarColorPopover.style.opacity = '0';
    
    setTimeout(() => {
        avatarColorPopover.classList.remove('show');
        avatarColorPopover.style.transform = '';
        avatarColorPopover.style.opacity = '';
    }, 200);
    
    activePopoverAvatar = null;
    document.removeEventListener('click', closeAvatarColorPopoverOnOutside);
}

// إغلاق popover


// إغلاق عند النقر خارج
function closeAvatarColorPopoverOnOutside(event) {
    if (!avatarColorPopover.contains(event.target) && 
        !event.target.closest('.account-settings-avatar-circle')) {
        closeAvatarColorPopover();
    }
}

// ربط حدث النقر على الأفاتار في شاشة إعدادات الحساب فقط
// ربط حدث النقر على الأفاتار في شاشة إعدادات الحساب فقط
function bindSettingsAvatarClick() {
    // نستخدم setTimeout للتأكد من أن DOM جاهز
    setTimeout(() => {
        const settingsAvatar = document.querySelector('.account-settings-avatar-circle');
        if (settingsAvatar) {
            // تأكد من أن العنصر مرئي
            console.log('Settings avatar found:', settingsAvatar);
            console.log('Avatar dimensions:', settingsAvatar.offsetWidth, 'x', settingsAvatar.offsetHeight);
            
            // إذا كان العنصر غير مرئي، حاول إصلاحه
            if (settingsAvatar.offsetWidth === 0 || settingsAvatar.offsetHeight === 0) {
                console.log('Avatar is hidden, forcing visibility...');
                settingsAvatar.style.visibility = 'visible';
                settingsAvatar.style.opacity = '1';
                settingsAvatar.style.display = 'flex';
            }
            
            if (!settingsAvatar._bound) {
                settingsAvatar._bound = true;
                settingsAvatar.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    console.log('Avatar clicked! Opening popover...');
                    openAvatarColorPopover(settingsAvatar, e);
                });
                console.log('Avatar click handler bound successfully');
            }
        } else {
            console.log('Settings avatar not found, retrying in 500ms...');
            setTimeout(bindSettingsAvatarClick, 500);
        }
    }, 300);
}

// اختيار لون
document.querySelectorAll('.avatar-color-option').forEach(option => {
    option.addEventListener('click', (e) => {
        e.stopPropagation();
        const color = option.getAttribute('data-color');
        
        // تحديث اللون النشط
        document.querySelectorAll('.avatar-color-option').forEach(opt => {
            opt.classList.remove('active');
        });
        option.classList.add('active');
        
        // تطبيق اللون
        applyAvatarColor(color);
        
        // إغلاق popover
        closeAvatarColorPopover();
    });
});

// زر إعادة الضبط
const resetColorBtn = document.getElementById('resetAvatarColor');
if (resetColorBtn) {
    resetColorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const defaultColor = '#2196f3';
        
        // إزالة النشاط من جميع الألوان
        document.querySelectorAll('.avatar-color-option').forEach(opt => {
            opt.classList.remove('active');
            if (opt.getAttribute('data-color') === defaultColor) {
                opt.classList.add('active');
            }
        });
        
        // تطبيق اللون الافتراضي
        applyAvatarColor(defaultColor);
        
        // إغلاق popover
        closeAvatarColorPopover();
    });
}

// تطبيق اللون المحفوظ عند تحميل الصفحة
const savedColor = getSavedAvatarColor();
applyAvatarColor(savedColor);

// تحديث اللون عند إعادة عرض الأفاتار في شاشة الإعدادات
function updateAvatarColors() {
    const color = getSavedAvatarColor();
    applyAvatarColor(color);
}

// استدعاء عند فتح شاشة إعدادات الحساب
const originalUpdateAccountDisplay = updateAccountDisplay;
if (originalUpdateAccountDisplay) {
    window.updateAccountDisplay = function() {
        originalUpdateAccountDisplay();
        updateAvatarColors();
    };
}
// تحديث عرض الحساب
// استبدل دالة updateAccountDisplay الموجودة بهذه النسخة المحدثة
// تحديث عرض الحساب
// تحديث عرض الحساب
function updateAccountDisplay() {
    const nickname = currentNickname || localStorage.getItem('codeai_nickname') || 'User';
    const initial = nickname.charAt(0).toUpperCase();
    
    const avatarSpan = document.getElementById('avatarInitial');
    const nicknameSpan = document.getElementById('accountNickname');
    const settingsAvatarSpan = document.getElementById('settingsAvatarInitial');
    const currentNicknameSpan = document.getElementById('currentNickname');
    const userIdSpan = document.getElementById('userIdDisplay');
    
    if (avatarSpan) avatarSpan.textContent = initial;
    if (nicknameSpan) nicknameSpan.textContent = nickname;
    if (settingsAvatarSpan) settingsAvatarSpan.textContent = initial;
    if (currentNicknameSpan) currentNicknameSpan.textContent = nickname;
    if (userIdSpan) userIdSpan.textContent = localStorage.getItem('userId')?.substring(0, 8) + '...';
    
    const convCountSpan = document.getElementById('convCountDisplay');
    if (convCountSpan) convCountSpan.textContent = convs.length;
    
    // إعادة تطبيق اللون المحفوظ
    const savedColor = getSavedAvatarColor();
    applyAvatarColor(savedColor);
    
    // تأكيد أن الأفاتار مرئي
    const settingsAvatar = document.querySelector('.account-settings-avatar-circle');
    if (settingsAvatar) {
        settingsAvatar.style.visibility = 'visible';
        settingsAvatar.style.opacity = '1';
        settingsAvatar.style.display = 'flex';
    }
    
    // ربط حدث النقر على اسم المستخدم لفتح التعديل
    bindNicknameClick();
    
    // ربط حدث النقر على الأفاتار
    bindSettingsAvatarClick();
}

// ربط حدث النقر على اسم المستخدم
function bindNicknameClick() {
    const nicknameDisplay = document.getElementById('nicknameDisplay');
    const currentNicknameSpan = document.getElementById('currentNickname');
    
    if (nicknameDisplay && !nicknameDisplay._bound) {
        nicknameDisplay._bound = true;
        nicknameDisplay.style.cursor = 'pointer';
        nicknameDisplay.addEventListener('click', (e) => {
            e.stopPropagation();
            openNicknameEdit();
        });
    }
}

// فتح نموذج تعديل الاسم
function openNicknameEdit() {
    const newNicknameInput = document.getElementById('newNicknameInput');
    const nicknameDisplay = document.getElementById('nicknameDisplay');
    const nicknameEditForm = document.getElementById('nicknameEditForm');
    
    if (newNicknameInput) {
        newNicknameInput.value = currentNickname || '';
        nicknameDisplay.style.display = 'none';
        nicknameEditForm.style.display = 'flex';
        newNicknameInput.focus();
    }
}

// فتح إعدادات الحساب
// فتح إعدادات الحساب
// فتح إعدادات الحساب
const accountSection = document.getElementById('accountSection');
const accountSettingsModal = document.getElementById('accountSettingsModal');
const closeAccountSettings = document.getElementById('closeAccountSettings');

if (accountSection) {
    accountSection.addEventListener('click', () => {
        updateAccountDisplay();
        
        // إزالة كلاس الإغلاق إذا كان موجوداً
        accountSettingsModal.classList.remove('closing');
        
        // فتح المودال
        accountSettingsModal.classList.add('open');
        
        // ربط حدث النقر على الأفاتار بعد فتح الشاشة
        setTimeout(() => {
            bindSettingsAvatarClick();
        }, 100);
    });
}

if (closeAccountSettings) {
    closeAccountSettings.addEventListener('click', () => {
        // إضافة كلاس الإغلاق لبدء الأنيميشن
        accountSettingsModal.classList.add('closing');
        
        // بعد انتهاء الأنيميشن، إزالة الكلاس open
        setTimeout(() => {
            accountSettingsModal.classList.remove('open');
            accountSettingsModal.classList.remove('closing');
        }, 300);
    });
}

// إغلاق عند النقر خارج المحتوى
if (accountSettingsModal) {
    accountSettingsModal.addEventListener('click', (e) => {
        if (e.target === accountSettingsModal) {
            // إضافة كلاس الإغلاق لبدء الأنيميشن
            accountSettingsModal.classList.add('closing');
            
            setTimeout(() => {
                accountSettingsModal.classList.remove('open');
                accountSettingsModal.classList.remove('closing');
            }, 300);
        }
    });
}

// إذا كان هناك زر رجوع داخل شاشة الحساب
const backButton = document.querySelector('.account-back-btn');
if (backButton) {
    backButton.addEventListener('click', () => {
        // إضافة كلاس الإغلاق
        accountSettingsModal.classList.add('closing');
        
        setTimeout(() => {
            accountSettingsModal.classList.remove('open');
            accountSettingsModal.classList.remove('closing');
        }, 300);
    });
}

// تعديل الاسم
const editNicknameBtn = document.getElementById('editNicknameBtn');
const nicknameEditForm = document.getElementById('nicknameEditForm');
const nicknameDisplay = document.getElementById('nicknameDisplay');
const newNicknameInput = document.getElementById('newNicknameInput');
const saveNicknameBtn = document.getElementById('saveNicknameBtn');
const cancelNicknameBtn = document.getElementById('cancelNicknameBtn');

if (editNicknameBtn) {
    editNicknameBtn.addEventListener('click', () => {
        newNicknameInput.value = currentNickname || '';
        nicknameDisplay.style.display = 'none';
        nicknameEditForm.style.display = 'flex';
        newNicknameInput.focus();
    });
}

if (cancelNicknameBtn) {
    cancelNicknameBtn.addEventListener('click', () => {
        nicknameDisplay.style.display = 'flex';
        nicknameEditForm.style.display = 'none';
    });
}

if (saveNicknameBtn) {
    saveNicknameBtn.addEventListener('click', async () => {
        const newNickname = newNicknameInput.value.trim();
        
        if (!newNickname || newNickname.length < 2 || newNickname.length > 30) {
            const errorDiv = document.getElementById('nicknameError');
            const t = translations[localStorage.getItem('codeai_lang') || 'en'];
            if (errorDiv) {
                errorDiv.textContent = t.nicknameError;
                errorDiv.style.display = 'block';
                setTimeout(() => errorDiv.style.display = 'none', 3000);
            }
            return;
        }
        
        if (!/^[a-zA-Z0-9\u0600-\u06FF\s_-]+$/.test(newNickname)) {
            const errorDiv = document.getElementById('nicknameError');
            const t = translations[localStorage.getItem('codeai_lang') || 'en'];
            if (errorDiv) {
                errorDiv.textContent = t.nicknameError;
                errorDiv.style.display = 'block';
                setTimeout(() => errorDiv.style.display = 'none', 3000);
            }
            return;
        }
        
        // تحديث الاسم على السيرفر
        try {
            const response = await fetch(`${API_BASE_URL}/api/update-nickname`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: localStorage.getItem('userId'),
                    nickname: newNickname
                })
            });
            
            const result = await response.json();
            
            if (!response.ok && result.error === 'Nickname already taken') {
                const t = translations[localStorage.getItem('codeai_lang') || 'en'];
                const errorDiv = document.getElementById('nicknameError');
                if (errorDiv) {
                    errorDiv.textContent = t.nicknameTaken;
                    errorDiv.style.display = 'block';
                    setTimeout(() => errorDiv.style.display = 'none', 3000);
                }
                return;
            }
            
            if (response.ok) {
                currentNickname = newNickname;
                localStorage.setItem('codeai_nickname', newNickname);
                
                // تحديث الواجهة
                updateAccountDisplay();
                
                // إغلاق نموذج التعديل
                nicknameDisplay.style.display = 'flex';
                nicknameEditForm.style.display = 'none';
                
                // عرض رسالة نجاح
                const t = translations[localStorage.getItem('codeai_lang') || 'en'];
                showToast(t.nicknameUpdated, 'success');
            }
            
        } catch (error) {
            console.error("Error updating nickname:", error);
            showToast("Failed to update nickname", 'error');
        }
    });
}

// زر تسجيل الخروج
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        // مسح بيانات المستخدم
        localStorage.removeItem('codeai_nickname');
        localStorage.removeItem('codeai_settings');
        localStorage.removeItem('codeai_lang');
        localStorage.removeItem('codeai_theme');
        localStorage.removeItem('codeai_selected_model');
        
        // إعادة تحميل الصفحة لإظهار شاشة التسجيل
        window.location.reload();
    });
}

// تحميل الاسم المحفوظ
async function loadUserNickname() {
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/user?userId=${userId}`);
        const data = await response.json();
        
        if (data.nickname) {
            currentNickname = data.nickname;
            localStorage.setItem('codeai_nickname', currentNickname);
            updateAccountDisplay();
        }
    } catch (error) {
        console.error("Error loading nickname:", error);
    }
}

// استدعاء عند التحميل
loadUserNickname();


    // --- Constants & Setup ---
    
    
    let isRegistered = false;
    let currentNickname = null;
    let convs = [];
    let isSending = false; 
    let allowMicWhenEmpty = true; // هذه الجديدة: السماح بالمايك بعد الإرسال
    let activeId = null;
    let isStreaming = false;
    let safeBuffer = "";
    let typeQueue = []; 
    let typeInterval = null; 
    let currentAiMsgElement = null; 
    let fullMarkdownBuffer = ""; 
    let streamCursor = 0;
    let audioContext;
    let analyser;
    let sourceNode;
    let waveData;
    let waveRAF;
    window.lastParsedIndex = 0;
    // --- متغيرات إعادة المحاولة (طلب 3) ---
    let retryCount = 0;
    const maxRetries = 5; // 2s, 4s, 8s, 16s, 32s (5 attempts)
    let retryTimeout = null;
    let statusCountdownInterval = null;
    let activeStageText = "";
    let isStageMessage = false;

    let streamingConvId = null; 
    let activeAttachments = []; // مصفوفة لتخزين الأخطاء المتعددة
let stageElement = null;
let stageTextCurrent = "";
let typingInterval = null;
let deletingInterval = null;
let isStageActive = false;
    let currentStreamModel = null; // لتخزين اسم النموذج القادم من السيرفر
// توليد معرف فريد لهذه الجلسة (التبويب)
let currentThoughtText = null; // لتخزين التفكير القادم من السيرفر
window.fastTyping = false;

const myClientId = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
console.log("🆔 My Client ID:", myClientId);
let selectedModel = 'gemini-3-flash';
const MODEL_NAMES = {
    'auto': 'Auto',
    'codeai-code-r': 'Codeai code-R 1.0',
    'gemini-3.1-flash-lite-preview': 'Gemini 3.1 Flash Lite',
    'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
    'gemini-3-flash': 'Gemini 3 Flash',
    'gemini-2.5-pro': 'Gemini 2.5 Pro ',
    'gemini-2.5': 'Gemini 2.5',
    'qwen-coder': 'Qwen 3 Coder 480B',
    'chimera-r1': 'Deepseek Chimera R1T2',
    'hermes-3': 'Hermes 3 405B',
    'gpt-oss': 'GPT-OSS 20B',
    'solar-pro': 'Solar Pro 3',
    'trinity-large': 'Trinity Large 400B',
    'llama-3.3-70b': 'LLaMA 3.3 70B',
    'llama-3.1-instant': 'LLaMA 3.1 8B Instant',
    'groq-compound': 'Groq Compound',
    'gpt-oss-120b': 'GPT-OSS 120B',
};


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


// دوال دعم الصور - أضفها هنا
function isImageFile(filename) {
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];
    const ext = filename.split('.').pop().toLowerCase();
    return imageExtensions.includes(ext);
}

// عدّل دالة updatePreviewButtonVisibility الموجودة لتصبح هكذا:
function updatePreviewButtonVisibility() {
    const runFab = document.getElementById('runFab');
    const btnRunOptions = document.getElementById('btnRunOptions');
    const currentFile = projectFiles[activeFileIndex];
    if (!currentFile) return;
    
    const ext = currentFile.name.split('.').pop().toLowerCase();
    
    if (isImageFile(currentFile.name)) {
        runFab.style.display = 'none';
        if (btnRunOptions) btnRunOptions.style.display = 'none';
        
        let statusMsg = document.getElementById('imageStatusMsg');
        if (!statusMsg) {
            statusMsg = document.createElement('div');
            statusMsg.id = 'imageStatusMsg';
            statusMsg.style.cssText = `
                position: absolute;
                bottom: 20px;
                right: 20px;
                background: var(--accent-color);
                color: white;
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 13px;
                z-index: 100;
            `;
            document.querySelector('.code-editor-container').appendChild(statusMsg);
        }
        statusMsg.textContent = '🖼️ Image file - Preview disabled';
        statusMsg.style.display = 'block';
        
    } else if (ext === "pdf") {
        runFab.style.display = '';
        if (btnRunOptions) btnRunOptions.style.display = 'none';
        
        const statusMsg = document.getElementById('imageStatusMsg');
        if (statusMsg) statusMsg.remove();
        
        if (runFab._fileHandler) {
            runFab.removeEventListener('click', runFab._fileHandler);
        }
        
        const fileUrl = currentFile.url || `/generated/${currentFile.name}`;
        runFab._fileHandler = () => window.open(fileUrl, '_blank');
        runFab.addEventListener('click', runFab._fileHandler);
        
// داخل دالة updatePreviewButtonVisibility
} else if (ext === "docx" || ext === "pptx") {
    runFab.style.display = '';
    if (btnRunOptions) btnRunOptions.style.display = 'none';
    
    const statusMsg = document.getElementById('imageStatusMsg');
    if (statusMsg) statusMsg.remove();
    
    if (runFab._fileHandler) {
        runFab.removeEventListener('click', runFab._fileHandler);
    }
    
    // 🟢 استخدم الدالة المساعدة للحصول على رابط فتح المستند في نافذة خارجية (embedded=false)
    const viewerUrl = getDocumentViewerUrl(currentFile, false);
    runFab._fileHandler = () => window.open(viewerUrl, '_blank');
    runFab.addEventListener('click', runFab._fileHandler);
} else {
        if (runFab._fileHandler) {
            runFab.removeEventListener('click', runFab._fileHandler);
            runFab._fileHandler = null;
        }
        runFab.style.display = '';
        if (btnRunOptions) btnRunOptions.style.display = '';
        
        const statusMsg = document.getElementById('imageStatusMsg');
        if (statusMsg) statusMsg.remove();
    }
}

// دالة لحفظ محتوى الصورة في localStorage بشكل صحيح
function saveImageToProject(file, content) {
    // التأكد من أن المحتوى مخزن بشكل صحيح
    if (content instanceof Blob) {
        const reader = new FileReader();
        reader.onloadend = function() {
            file.content = reader.result;
        };
        reader.readAsDataURL(content);
    } else if (typeof content === 'string' && content.startsWith('data:')) {
        file.content = content;
    }
}

// تحديث دالة switchTab لضمان عرض الصورة عند الرجوع للتبويب
const originalSwitchTab = switchTab;
// دالة لفحص وإصلاح الصور عند تحميل المحادثة
function validateAndFixImages(files) {
    if (!Array.isArray(files)) return files;

    return files.map(file => {
        if (isImageFile(file.name)) {
            file.type = 'image';

            // لا تلمس content إطلاقًا
            if (!file.content) {
                console.warn(`⚠️ Image ${file.name} has no content`);
            }
        }
        return file;
    });
}

function saveCurrentFile() {
    const file = projectFiles[activeFileIndex];
    if (!file) return;

    if (isImageFile(file.name)) {
        // ❌ لا تلمس محتوى الصورة
        return;
    }

    file.content = codeArea.value;
}

// استخدمها عند تحميل المحادثة

function displayDocumentInEditor(file) {
    const codeArea = document.getElementById('codeArea');
    const lineNumbers = document.getElementById('lineNumbers');
    const codeHighlightLayer = document.querySelector('.code-highlight-layer');

    codeArea.style.display = 'none';
    lineNumbers.style.display = 'none';
    if (codeHighlightLayer) codeHighlightLayer.style.display = 'none';

    let docContainer = document.getElementById('documentPreviewContainer');
    if (!docContainer) {
        docContainer = document.createElement('div');
        docContainer.id = 'documentPreviewContainer';
        docContainer.style.cssText = `
            width: 100%;
            height: 100%;
            background: var(--bg-primary);
            position: relative;
            overflow: hidden;
        `;

        const iframe = document.createElement('iframe');
        iframe.id = 'documentPreviewFrame';
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
        `;

        docContainer.appendChild(iframe);

        const editorContainer = document.querySelector('.code-editor-container') || codeArea.parentNode;
        editorContainer.appendChild(docContainer);
    }

    const iframe = document.getElementById('documentPreviewFrame');

    if (!file || !file.url) {
        console.warn("⚠️ No URL for document:", file?.name);
        iframe.src = 'about:blank';
        docContainer.style.display = 'block';
        return;
    }

    console.log("📄 Displaying document:", file.name, file.url);

    // استخدم الدالة المساعدة للحصول على رابط المعاينة (مع embedded=true)
    const viewerUrl = getDocumentViewerUrl(file, true);
    iframe.src = viewerUrl;
    docContainer.style.display = 'block';

    // 🟢 لا تخفي زر التشغيل إذا كان الملف مستندًا (DOCX أو PPTX)
    if (!isDocumentFile(file.name)) {
        hidePreviewButton();
    }
}

// تحديث دالة displayImageInEditor لتكون أكثر قوة
function displayImageInEditor(file) {
    const codeArea = document.getElementById('codeArea');
    const lineNumbers = document.getElementById('lineNumbers');
    const codeHighlightLayer = document.querySelector('.code-highlight-layer');
    
    // إخفاء عناصر الكود العادية
    codeArea.style.display = 'none';
    lineNumbers.style.display = 'none';
    if (codeHighlightLayer) codeHighlightLayer.style.display = 'none';
    
    // إنشاء أو تحديث عنصر عرض الصورة
    let imageContainer = document.getElementById('imagePreviewContainer');
    if (!imageContainer) {
        imageContainer = document.createElement('div');
        imageContainer.id = 'imagePreviewContainer';
        imageContainer.style.cssText = `
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-primary);
            padding: 20px;
            box-sizing: border-box;
            overflow: auto;
            position: relative;
        `;
        
        const img = document.createElement('img');
        img.id = 'imagePreview';
        img.style.cssText = `
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        `;
        imageContainer.appendChild(img);
        
        const infoDiv = document.createElement('div');
        infoDiv.id = 'imageInfo';
        infoDiv.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            backdrop-filter: blur(5px);
        `;
        imageContainer.appendChild(infoDiv);
        
        const editorContainer = document.querySelector('.code-editor-container') || codeArea.parentNode;
        editorContainer.appendChild(imageContainer);
    }
    
    const img = document.getElementById('imagePreview');
    const info = document.getElementById('imageInfo');
    
    // التحقق من وجود المحتوى
    if (!file || !file.content) {
        console.warn("⚠️ No content for image:", file?.name);
        img.src = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'%3E%3Crect width=\'100\' height=\'100\' fill=\'%23333\'/%3E%3Ctext x=\'50\' y=\'50\' font-size=\'14\' fill=\'%23ff4444\' text-anchor=\'middle\' dy=\'.3em\'%3E⚠️ No Data%3C/text%3E%3C/svg%3E';
        info.textContent = `${file?.name || 'Unknown'} | Error: No content`;
        imageContainer.style.display = 'flex';
        return;
    }
    
    console.log("🖼️ Displaying image:", file.name, "Content type:", typeof file.content);
    console.log("Content preview:", file.content ? file.content.substring(0, 50) + "..." : "null");
    
    // عرض الصورة باستخدام الدالة المساعدة
    const imageData = loadImageFromStorage(file);
    
    if (imageData) {
        img.src = imageData;
        console.log("✅ Image loaded successfully");
        
        // حساب حجم الصورة تقريبي
        let size = 0;
        if (typeof file.content === 'string' && file.content.startsWith('data:')) {
            size = Math.round((file.content.length * 0.75) / 1024);
        }
        info.textContent = `${file.name} | ${size} KB`;
    } else {
        console.error("❌ Failed to load image data");
        img.src = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'%3E%3Crect width=\'100\' height=\'100\' fill=\'%23333\'/%3E%3Ctext x=\'50\' y=\'50\' font-size=\'14\' fill=\'%23ff4444\' text-anchor=\'middle\' dy=\'.3em\'%3E❌ Failed to Load%3C/text%3E%3C/svg%3E';
        info.textContent = `${file.name} | Error: Failed to load`;
    }
    
    imageContainer.style.display = 'flex';
}

// تحديث دالة hideImagePreview
function hideImagePreview() {
    const imageContainer = document.getElementById('imagePreviewContainer');
    if (imageContainer) {
        imageContainer.style.display = 'none';
    }
    
    const codeArea = document.getElementById('codeArea');
    const lineNumbers = document.getElementById('lineNumbers');
    const codeHighlightLayer = document.querySelector('.code-highlight-layer');
    
    codeArea.style.display = '';
    lineNumbers.style.display = '';
    if (codeHighlightLayer) codeHighlightLayer.style.display = '';
}

// دالة لتحضير الملفات للحفظ
function prepareFilesForSave() {
    return projectFiles.map(file => {
        if (isImageFile(file.name) && file.content) {
            // الصور محفوظة كـ Data URLs وهي جاهزة للحفظ
            return file;
        }
        return file;
    });
}

// استخدمها في دالة saveState
// const originalSaveState = saveState;


function runBrython(userCode) {
    const consoleView = document.getElementById('console-view');
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








    // --- Settings Logic ---

function closePopover(el) {
    if (!el || !el.classList.contains('show')) return;
    el.classList.remove('show');
    el.classList.add('hide');
    setTimeout(() => {
        el.classList.remove('hide');
    }, 220);
}

    window.setConvStyle = function(style) {
    saveSetting('convStyle', style);
    closePopover(document.getElementById('stylePopover'));
    updateSettingsUI();
};

window.setPrefLang = function(plang) {
    saveSetting('prefLanguage', plang);
    closePopover(document.getElementById('prefLangPopover'));
    updateSettingsUI();
};

window.setFontSize = function(size) {
    saveSetting('fontSize', size);
    closePopover(document.getElementById('fontSizePopover'));
    updateSettingsUI();
};
    // تحديث دالة updateSettingsUI لتعرض القيم الجديدة
    function updateSettingsUI() {
    const t = localStorage.getItem('codeai_theme') || 'dark';
    const l = localStorage.getItem('codeai_lang') || 'en';
    
    // استرجاع الإعدادات
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    const s = settings.convStyle || 'Detailed';
    const p = settings.prefLanguage || 'HTML';
    const fontSize = settings.fontSize || 'medium';
    
    // تحديث القيم
    document.getElementById('themeValue').textContent = translations[l][t +'theme'];
    document.getElementById('langValue').textContent = l === 'en' ? 'English' : 'العربية';
    
    // استخدام innerHTML للترجمة الصحيحة
    document.getElementById('styleValue').innerHTML = `<span data-i18n="${s}">${translations[l][s] || s}</span>`;
    document.getElementById('prefLangValue').textContent = p;
    
    // تحديث حجم الخط مع الترجمة
    const fontSizeEl = document.getElementById('fontSizeValue');
    if (fontSizeEl) {
        fontSizeEl.innerHTML = `<span data-i18n="${fontSize}">${translations[l][fontSize] || fontSize}</span>`;
    }
    
    const currentTheme = document.documentElement.getAttribute('data-theme');
if (currentTheme !== t) {
    document.documentElement.setAttribute('data-theme', t);
}
    document.documentElement.setAttribute('lang', l);
    
    updateUIText(); // تطبيق الترجمات
    applyFontSize(); // تطبيق حجم الخط
}


    updateSettingsUI();

    window.setTheme = function(mode) {
    localStorage.setItem('codeai_theme', mode);
    closePopover(document.getElementById('themePopover'));
    const theme = mode;
    const splashVideo = document.getElementById('splashVideo');
if (splashVideo) {
    const isLight = theme === 'light';
    splashVideo.src = isLight ? 'assets/splash-light.mp4' : 'assets/splash-dark.mp4';
    splashVideo.load();
    splashVideo.addEventListener('loadedmetadata', function handler() {
        splashVideo.currentTime = splashVideo.duration - 0.05;
        splashVideo.pause();
        splashVideo.removeEventListener('loadedmetadata', handler);
    });
}
    updateSettingsUI();
};

window.setLanguage = function(lang) {
    localStorage.setItem('codeai_lang', lang);
    closePopover(document.getElementById('langPopover'));
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
    
    } else if (ext === 'pdf') {

    iframe.style.display = 'block';
    iframe.src = `/generated/${fileName}`;
    
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
    // إنشاء خريطة للملفات (CSS و JS) وروابط الـ Blob الخاصة بها
    const fileMap = {};
    projectFiles.forEach(file => {
        const blob = new Blob([file.content], { type: getMimeType(file.name) });
        fileMap[file.name] = URL.createObjectURL(blob);
    });

    let content = htmlFile.content;

    // استبدال الروابط في HTML بـ Blob URLs لتعمل الملفات معاً
    for (const [name, url] of Object.entries(fileMap)) {
        const regex = new RegExp(`(src|href)=["']\\.?/?${name}["']`, 'g');
        content = content.replace(regex, `$1="${url}"`);
    }
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
    const outputContent = document.getElementById('console-view');
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
       const file = projectFiles[activeFileIndex];

    // ⛔ لا تلمس محتوى الصور أبداً
    if (file && isImageFile(file.name)) return;
       
        // 1. تحديث المتغيرات
        file.content = codeArea.value;
        
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
            saveConversationToServer(conv).catch(console.error);
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
            saveCurrentFile();
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
    
// في نهاية DOMContentLoaded، بعد تعريف الدوال
document.getElementById('registerBtn')?.addEventListener('click', async () => {
    const nicknameInput = document.getElementById('nicknameInput');
    const nickname = nicknameInput.value.trim();
    const errorDiv = document.getElementById('nicknameError');
    const registerBtn = document.getElementById('registerBtn');
    const btnText = registerBtn.querySelector('.btn-text');
    const btnSpinner = registerBtn.querySelector('.btn-spinner');
    
    // التحقق من صحة الإدخال
    if (!nickname) {
        errorDiv.textContent = 'Please enter a nickname';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (nickname.length < 2) {
        errorDiv.textContent = 'Nickname must be at least 2 characters';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (nickname.length > 30) {
        errorDiv.textContent = 'Nickname must be less than 30 characters';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (!/^[a-zA-Z0-9\u0600-\u06FF\s_-]+$/.test(nickname)) {
        errorDiv.textContent = 'Nickname can only contain letters, numbers, spaces, underscores and hyphens';
        errorDiv.style.display = 'block';
        return;
    }
    
    // إخفاء الخطأ السابق
    errorDiv.style.display = 'none';
    
    // إظهار حالة التحميل
    registerBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'block';
    
    try {
        const result = await registerUser(nickname);
        
        if (result.success) {
            // إخفاء شاشة التسجيل
            const welcomeAuthScreen = document.getElementById('welcomeAuthScreen');
            welcomeAuthScreen.style.display = 'none';
            
            // إظهار التطبيق
            document.querySelector('.root').style.display = '';
            document.querySelector('.topbar').style.display = '';
            document.getElementById('menuBtn').style.display = '';
            document.getElementById('codeToggleBtn').style.display = '';
            
            // تحميل المحادثات
            await loadConversations();
            
            // عرض رسالة ترحيب
            showToast(`Welcome ${nickname}!`, 'success');
            
            // تطبيق الإعدادات
            applySettings();
            checkInputState();
            
        } else {
            // عرض الخطأ
            errorDiv.textContent = result.error || 'Registration failed. Please try again.';
            errorDiv.style.display = 'block';
            
            // إعادة تعيين الزر
            registerBtn.disabled = false;
            btnText.style.display = 'block';
            btnSpinner.style.display = 'none';
        }
        
    } catch (error) {
        console.error("Registration error:", error);
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.style.display = 'block';
        
        registerBtn.disabled = false;
        btnText.style.display = 'block';
        btnSpinner.style.display = 'none';
    }
});

// إضافة حدث Enter في حقل الإدخال
document.getElementById('nicknameInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('registerBtn').click();
    }
});

    // استبدل كود newChatBtn الحالي بهذا
document.getElementById('newChatBtn').addEventListener('click', () => {
    activeId = null;
    codeArea.value = '// start';
    updateView();
    
    // ✅ إظهار شاشة الترحيب (اللوقو)
    welcomeScreen.classList.remove('hidden');
    welcomeScreen.style.display = '';
    
    renderMessages();  // هذا سيعرض شاشة الترحيب
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

        // --- تعديل 2: إصلاح تداخل قوائم الإعدادات ---
    
    // مصفوفة بجميع معرفات القوائم المنبثقة
    const popoverIds = ['themePopover', 'langPopover', 'stylePopover', 'prefLangPopover', 'fontSizePopover'];

    function togglePopover(targetId) {
    popoverIds.forEach(id => {
        if (id !== targetId) {
            closePopover(document.getElementById(id));
        }
    });

    const target = document.getElementById(targetId);
    if (target.classList.contains('show')) {
        closePopover(target);
    } else {
        target.classList.remove('hide');
        target.classList.add('show');
    }
}

    // تطبيق الدالة الموحدة على الأزرار
    document.getElementById('themeBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        togglePopover('themePopover');
    });
    
    document.getElementById('langBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        togglePopover('langPopover');
    });

    document.getElementById('styleBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        togglePopover('stylePopover');
    });

    document.getElementById('prefLangBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        togglePopover('prefLangPopover');
    });
    
    document.getElementById('fontSizeBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePopover('fontSizePopover');
});

    // إغلاق الجميع عند النقر خارجاً
    document.addEventListener('click', (e) => {
    if (!e.target.closest('.setting-row-btn') && !e.target.closest('.popover-options')) {
        popoverIds.forEach(id => closePopover(document.getElementById(id)));
    }
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
        resetCodezoneDragState()
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
        // --- تعديل: معالجة الإدخال العربي وإصلاح الفراغات ---
    inputEl.addEventListener('input', function() {
        const val = this.value;
        const isArabic = /[\u0600-\u06FF]/.test(val);
        
        // نحصل على الغلاف للتحكم في الزر والحقل معاً
        const wrapper = document.querySelector('.input-wrapper');
        
        if (isArabic) {
            // إضافة كلاس الوضع العربي: سيقوم الـ CSS بقلب الـ Padding ومكان الزر
            wrapper.classList.add('rtl-mode');
        } else {
            // إزالة الكلاس: يعود للوضع الإنجليزي الطبيعي
            wrapper.classList.remove('rtl-mode');
        }

        checkInputState();
        
        // ضبط الارتفاع التلقائي
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 150) + 'px';
        this.style.overflowY = this.scrollHeight > 150 ? 'auto' : 'hidden';

        // تحديث مكان شريط الاقتراحات
        const bar = document.getElementById('suggestionBar');
        if (bar) {
            const inputHeight = this.offsetHeight;
            bar.style.bottom = (inputHeight + 12) + 'px'; 
        }
    });

    // --- نظام إرفاق الصور (Attachments) ---
let activeImageAttachments = []; // مصفوفة لتخزين الصور المرفقة مؤقتاً

const attachImgBtn = document.getElementById('attachImgBtn');
const imageFileInput = document.getElementById('imageFileInput');
const imageAttachmentsBar = document.getElementById('imageAttachmentsBar');

// عند النقر على الزر الدائري (+)
attachImgBtn?.addEventListener('click', () => {
    imageFileInput.click(); // يفتح نافذة اختيار الملفات
});

// عند اختيار المستخدم للصور
imageFileInput?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    files.forEach(file => {
        // التأكد من أن الملف صورة
        if (!file.type.startsWith('image/')) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            // إضافة الصورة للمصفوفة
            activeImageAttachments.push({
                id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                dataUrl: event.target.result,
                file: file
            });
            renderImageAttachments();
            updateAttachmentsUI()
            checkInputState(); // لتحديث حالة زر الإرسال
        };
        reader.readAsDataURL(file);
    });
    
    // تصفير حقل الإدخال للسماح باختيار نفس الصورة مجدداً إذا لزم الأمر
    imageFileInput.value = ''; 
});

// دالة رسم الصور في شريط الكتابة
function renderImageAttachments() {
    if (!imageAttachmentsBar) return;
    
    imageAttachmentsBar.innerHTML = '';
    
    // إخفاء أو إظهار الشريط بناءً على عدد الصور
    if (activeImageAttachments.length === 0) {
        imageAttachmentsBar.classList.remove('active');
        return;
    }
    
    imageAttachmentsBar.classList.add('active');
    
    activeImageAttachments.forEach(attachment => {
        const item = document.createElement('div');
        item.className = 'img-attachment-item';
        
        // إنشاء العنصر مع زر الحذف (X)
        item.innerHTML = `
            <img src="${attachment.dataUrl}" alt="attached image">
            <div class="img-delete-btn" onclick="removeImageAttachment('${attachment.id}')">✕</div>
        `;
        
        imageAttachmentsBar.appendChild(item);
    });
}

// دالة الحذف (يجب أن تكون Global لتعمل مع onclick في HTML)
window.removeImageAttachment = function(id) {
    activeImageAttachments = activeImageAttachments.filter(a => a.id !== id);
    renderImageAttachments();
    updateAttachmentsUI()
    checkInputState(); // تحديث الزر
};


function updateAttachmentsUI() {
    const wrapper = document.querySelector('.input-wrapper');
    if (!wrapper) return;
    
    // نتحقق من وجود صور أو أخطاء برمجية مرفقة
    if (activeImageAttachments.length > 0 || activeAttachments.length > 0) {
        wrapper.classList.add('has-attachments');
    } else {
        wrapper.classList.remove('has-attachments');
    }
}

// ==========================================
// ملاحظة هامة جداً للربط مع السيرفر:
// داخل دالة sendMessage الخاصة بك، يجب أن تقوم بتفريغ المصفوفة بعد الإرسال
// عن طريق إضافة السطرين التاليين:
// activeImageAttachments = [];
// renderImageAttachments();
// (يجب أيضاً تمرير هذه الصور في البايلود -Payload- الخاص بطلب الـ Fetch إذا أردت إرسالها للذكاء الاصطناعي).
// ==========================================


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
    // في زر تأكيد الحذف
realDeleteBtn.addEventListener('click', async () => {
    const currentLang = localStorage.getItem('codeai_lang') || 'en';
    
    if (deleteMode === 'conv') {
        // حذف من السيرفر
        await deleteConversationFromServer(itemToDeleteId);
        
        // حذف من المصفوفة المحلية
        convs = convs.filter(c => c.id !== itemToDeleteId);
        
        
        if (activeId === itemToDeleteId) {
            activeId = null;
            messagesEl.innerHTML = '';
            welcomeScreen.classList.remove('hidden');
            topLogo.style.opacity = '0';
            projectFiles = [{ name: 'index.html', content: '// Start coding...' }];
            activeFileIndex = 0;
            renderTabs();
            updateView();
        }
        
        renderConversations();
        document.getElementById('convOptionsModal').classList.remove('active');
    }
    
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
    
function injectThoughtButton(msgElement, thoughtText) {
    if (!thoughtText) return;
msgElement.style.display = 'flex';
    msgElement.style.flexDirection = 'column';
    msgElement.style.alignItems = 'stretch';
msgElement.style.gap = '5px';
    // 1. البحث عن أو إنشاء الهيدر (Header) الذي يضم الأفاتار
    let header = msgElement.querySelector('.msg-header');
    if (!header) {
        // إذا لم يكن هناك هيدر (الهيكل القديم)، نقوم بلف الأفاتار بهيدر
        const avatar = msgElement.querySelector('.ai-avatar');
        if (avatar) {
            header = document.createElement('div');
            header.className = 'msg-header';
            avatar.parentNode.insertBefore(header, avatar);
            header.appendChild(avatar);
        }
    }

    // 2. إنشاء صندوق التفكير (فوق النص content)
    // إنشاء صندوق التفكير
let thoughtBox = msgElement.querySelector('.thought-content');
if (!thoughtBox) {
    thoughtBox = document.createElement('div');
    thoughtBox.className = 'thought-content';
    thoughtBox.style.display = 'none';
    
    // ✅ ضعه قبل الـ ai-content مباشرة
    const contentEl = msgElement.querySelector('.ai-content');
    const headerEl = msgElement.querySelector('.msg-header');
    
    // إذا كان الهيدر موجود، ضع التفكير بعده وقبل المحتوى
    if (headerEl && contentEl) {
        msgElement.insertBefore(thoughtBox, contentEl);
    } else {
        msgElement.appendChild(thoughtBox);
    }
}
    thoughtBox.textContent = thoughtText;

    // 3. إنشاء زر التبديل بجانب الأفاتار
    if (header && !header.querySelector('.thought-toggle-btn')) {
        const btn = document.createElement('button');
        btn.className = 'thought-toggle-btn thought-btn'; // ⚡ إضافة الكلاس الصحيح
        
       const lang = localStorage.getItem('codeai_lang') || 'en';
        btn.textContent = translations[lang].thinking || 'Analysis';
        btn.setAttribute('data-show-text', translations[lang].thinking || 'Analysis');
        btn.setAttribute('data-hide-text', translations[lang].hideThinking || 'Hide');
        btn.style.display = 'inline-block';
        
        btn.onclick = function() {
            if (thoughtBox.style.display === 'none' || !thoughtBox.style.display) {
                thoughtBox.style.display = 'block';
                btn.style.opacity = '1';
            } else {
                thoughtBox.style.display = 'none';
                btn.style.opacity = '0.5';
            }
        };

        header.appendChild(btn);
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
    // ========== إضافة هذه الأسطر الجديدة فقط ==========
    // تحديث ظهور زر المعاينة بناءً على نوع الملف
    updatePreviewButtonVisibility();
    
    // إذا كان الملف النشط صورة، اعرضها
    const currentFile = projectFiles[activeFileIndex];
  if (currentFile) {
    if (isImageFile(currentFile.name)) {
        displayImageInEditor(currentFile);
    } 
    else if (isDocumentFile(currentFile.name)) {
        displayDocumentInEditor(currentFile);
    } 
    else {
        hideImagePreview();
    }
  }
}
    // دالة للتحقق مما إذا كان المحتوى صورة صالحة
function isValidImageContent(content) {
    if (!content) return false;
    if (typeof content === 'string') {
        return content.startsWith('data:image/') || 
               content.startsWith('blob:') ||
               content.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i);
    }
    return content instanceof Blob || content instanceof File;
}

// دالة لتحميل الصور من localStorage بشكل صحيح
function loadImageFromStorage(file) {
    if (!file || !file.content) return null;
    
    // إذا كان المحتوى نصي ويبدأ بـ data:image، فهو جاهز للاستخدام
    if (typeof file.content === 'string' && file.content.startsWith('data:image')) {
        return file.content;
    }
    
    // إذا كان المحتوى نصي عادي، حاول تحويله
    if (typeof file.content === 'string') {
        try {
            // محاولة تحويل النص إلى Base64
            return 'data:image/png;base64,' + btoa(file.content);
        } catch (e) {
            console.warn("Could not convert to base64:", e);
            return null;
        }
    }
    
    return null;
}

function updateActiveTab() {
    document.querySelectorAll('.tab').forEach((tab, i) => {
        tab.classList.toggle('active', i === activeFileIndex);
    });
}

    function switchTab(index) {
    hideImagePreview();

    activeFileIndex = index;
    updateActiveTab();

    const file = projectFiles[index];
    const iframe = document.getElementById('previewFrame');

    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();

    // ===== الصور =====
    if (isImageFile(file.name)) {
        codeArea.style.display = 'none';
        iframe.style.display = 'none';
        displayImageInEditor(file);
        updatePreviewButtonVisibility();
        return;
    }

    // ===== PDF ===== (نفس الكود القديم)
    if (ext === "pdf") {
        codeArea.style.display = "none";
        iframe.style.display = "none";

        const editorContainer = codeArea.parentElement;
        const previewUrls = file.previewUrls || null;

        if (previewUrls && previewUrls.length > 0) {
            const html = previewUrls.map(url => 
                `<img src="${url}" style="width:100%;display:block;margin-bottom:4px;">`
            ).join('');
            editorContainer.innerHTML = `<div style="overflow-y:auto;height:100%;background:#fff;">${html}</div>`;
        } else if (file.previewUrl) {
            const previewUrl = file.previewUrl;
            const loadPages = (i = 1, html = '') => {
                const img = new Image();
                img.onload = () => loadPages(i + 1, html + `<img src="${previewUrl}/page_${i}.png" style="width:100%;display:block;margin-bottom:4px;">`);
                img.onerror = () => {
                    editorContainer.innerHTML = `<div style="overflow-y:auto;height:100%;background:#fff;">${html}</div>`;
                };
                img.src = `${previewUrl}/page_${i}.png`;
            };
            loadPages();
        } else {
            editorContainer.innerHTML = `<div style="color:orange;padding:20px;">Preview not available</div>`;
        }

        updatePreviewButtonVisibility();
        return;
    }

    // ===== DOCX, PPTX ===== (عرض باستخدام Google Docs Viewer)
    // في دالة switchTab، أضف هذا القسم لملفات DOCX/PPTX
    // داخل دالة switchTab
if (ext === "docx" || ext === "pptx") {
    codeArea.style.display = "none";
    // استخدم الدالة المساعدة لعرض المستند في منطقة التحرير
    displayDocumentInEditor(file);
    updatePreviewButtonVisibility();
    return;
}

    // ===== الكود =====
    codeArea.style.display = 'block';
    iframe.style.display = 'none';
    codeArea.value = file.content || '';
    updateView();
    updatePreviewButtonVisibility();
}

    function addNewTab() {
        saveCurrentFile();
        const newName = "Untitled" + (projectFiles.length > 0 ? projectFiles.length : "") + ".html";
        projectFiles.push({ name: newName, content: "" });
        activeFileIndex = projectFiles.length - 1;
        codeArea.value = "";
        updateView();
        renderTabs();
    }
    
    
    // دالة مساعدة لتحديد MIME type
function getMimeType(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const mimeTypes = {
        'html': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        'json': 'application/json',
        'txt': 'text/plain',
        'py': 'text/x-python',
        'pdf': 'application/pdf',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'webp': 'image/webp',
        'bmp': 'image/bmp',
        'ico': 'image/x-icon'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

    // --- Button Actions ---
    document.getElementById('btnExport').addEventListener('click', async () => {
    const currentFile = projectFiles[activeFileIndex];
    
    if (!currentFile) {
        console.error("No file to export");
        return;
    }
    
    // حفظ المحتوى الحالي قبل التصدير (للملفات النصية فقط)
    if (!isImageFile(currentFile.name) && !isDocumentFile(currentFile.name)) {
        currentFile.content = codeArea.value;
    }
    
    let blob;
    let fileName = currentFile.name;
    let mimeType = '';
    
    const ext = fileName.split('.').pop().toLowerCase();
    
    try {
        // 1. للصور: استخدام المحتوى المخزن كـ Data URL
        if (isImageFile(fileName)) {
            if (currentFile.content && currentFile.content.startsWith('data:')) {
                // تحويل Data URL إلى Blob
                const response = await fetch(currentFile.content);
                blob = await response.blob();
                mimeType = blob.type;
            } else {
                console.error("Image has no valid content");
                showToast("Failed to export image", 'error');
                return;
            }
        }
        
        // 2. للمستندات (PDF, DOCX, PPTX): تحميل من URL
        else if (isDocumentFile(fileName)) {
            if (currentFile.url) {
                // تحميل الملف من Supabase
                const response = await fetch(currentFile.url);
                if (!response.ok) throw new Error('Failed to fetch document');
                blob = await response.blob();
                mimeType = response.headers.get('content-type') || getMimeType(fileName);
            } else {
                console.error("Document has no URL");
                showToast("Document URL not found", 'error');
                return;
            }
        }
        
        // 3. للملفات النصية (HTML, CSS, JS, PY, TXT, etc.)
        else {
            const content = currentFile.content || '';
            mimeType = getMimeType(fileName);
            blob = new Blob([content], { type: mimeType });
        }
        
        // إنشاء رابط التحميل
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        
        // تنظيف
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 100);
        
        // عرض رسالة نجاح
        showToast(`✅ Exported ${fileName}`, 'success');
        
    } catch (error) {
        console.error("Export failed:", error);
        showToast(`❌ Failed to export ${fileName}`, 'error');
    }
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
    if (fileInput) {
        fileInput.accept = '.html,.css,.js,.py,.txt,.png,.jpg,.jpeg,.gif,.svg,.webp,.bmp,.ico,.json';
    }
    document.getElementById('btnImport').addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    if (file.type.startsWith('image/')) {
        // للصور: نقرأ كـ Data URL
        reader.onload = function(e) {
            const content = e.target.result; // هذا سيكون Data URL
            
            // إنشاء كائن الملف الجديد
            const newFile = {
                name: file.name,
                content: content, // تأكد من حفظ content
                type: 'image'
            };
            
            // التحقق مما إذا كان الملف الحالي هو الملف الافتراضي
            if (projectFiles.length === 1 && 
                projectFiles[0].name === 'index.html' && 
                projectFiles[0].content === '// Start coding...') {
                // استبدال الملف الافتراضي
                projectFiles[0] = newFile;
                activeFileIndex = 0;
            } else {
                // إضافة كملف جديد
                projectFiles.push(newFile);
                activeFileIndex = projectFiles.length - 1;
            }
            
            console.log("✅ Image saved:", newFile.name, "Content length:", content.length);
            
            // عرض الصورة
            displayImageInEditor(projectFiles[activeFileIndex]);
            renderTabs();
            updatePreviewButtonVisibility();
        };
        reader.readAsDataURL(file);
    } else {
        // للملفات النصية العادية (نفس الكود السابق)
        reader.onload = function(e) {
            const content = e.target.result;
            
            if (projectFiles.length === 1 && 
                projectFiles[0].name === 'index.html' && 
                projectFiles[0].content === '// Start coding...') {
                projectFiles[0] = {
                    name: file.name,
                    content: content
                };
                activeFileIndex = 0;
            } else {
                projectFiles.push({
                    name: file.name,
                    content: content
                });
                activeFileIndex = projectFiles.length - 1;
            }
            
            codeArea.value = content;
            hideImagePreview();
            updateView();
            renderTabs();
            updatePreviewButtonVisibility();
        };
        reader.readAsText(file);
    }
    
    fileInput.value = '';
});

    document.getElementById('addTabBtn').addEventListener('click', addNewTab);
    
    function resetMenuGesture() {
    if (activeGesture === 'menu') activeGesture = null;
    menuPanel.style.transition = '';
}

function resetCodezoneDragState() {
    isDraggingCodezone = false;
    hasMoved = false;
    codeDragX = 0;
    codezone.style.transition = '';
}

function isArabic(text) {
    const pattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return pattern.test(text);
}
    function detectTextDirection(text) {
    const arabicRegex = /[\u0600-\u06FF]/;
    return arabicRegex.test(text)
        ? { dir: 'rtl', lang: 'ar' }
        : { dir: 'ltr', lang: 'en' };
}

function addRestoreButtonToExistingMessage(contentEl, msgElement, filesSnapshot) {
    if (msgElement.querySelector('.restore-checkpoint-btn')) return;
    
    let actionsDiv = msgElement.querySelector('.msg-actions');
    if (!actionsDiv) {
        actionsDiv = document.createElement('div');
        actionsDiv.className = 'msg-actions';
        contentEl.parentNode.appendChild(actionsDiv);
    }
    
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'action-btn restore-checkpoint-btn';
    restoreBtn.innerHTML = '↺ Restore';
    restoreBtn.title = 'Restore files from this checkpoint';
    
    // ✅ إذا لم توجد لقطة ملفات، نعطل الزر
    if (!filesSnapshot || !filesSnapshot.length) {
        restoreBtn.disabled = true;
        restoreBtn.style.opacity = '0.5';
        restoreBtn.title = 'No checkpoint available';
    }
    
    restoreBtn.onclick = async (e) => {
        e.stopPropagation();
        
        if (isRestoring) return;
        if (!filesSnapshot || !filesSnapshot.length) {
            showToast("No files to restore", 'error');
            return;
        }
        
        isRestoring = true;
        restoreBtn.classList.add('restoring');
        restoreBtn.innerHTML = '<span class="restore-spinner"></span> Restoring...';
        
        try {
            projectFiles = filesSnapshot.map(snapshot => ({
                name: snapshot.name,
                content: snapshot.content,
                type: snapshot.type || getMimeType(snapshot.name)
            }));
            
            activeFileIndex = 0;
            renderTabs();
            
            const currentFile = projectFiles[activeFileIndex];
            if (currentFile) {
                if (isImageFile(currentFile.name)) {
                    displayImageInEditor(currentFile);
                } else if (isDocumentFile(currentFile.name)) {
                    displayDocumentInEditor(currentFile);
                } else {
                    hideImagePreview();
                    codeArea.value = currentFile.content || '';
                    updateView();
                }
            }
            
            const conv = convs.find(c => c.id === activeId);
            if (conv) {
                conv.files = projectFiles;
                await saveConversationToServer(conv);
            }
            
            restoreBtn.classList.remove('restoring');
            restoreBtn.classList.add('restored');
            restoreBtn.innerHTML = '✓ Restored';
            
            showToast("Files restored successfully!", 'success');
            
            setTimeout(() => {
                restoreBtn.classList.remove('restored');
                restoreBtn.innerHTML = '↺ Restore';
            }, 3000);
            
        } catch (error) {
            console.error("Restore failed:", error);
            restoreBtn.classList.remove('restoring');
            restoreBtn.innerHTML = '↺ Retry';
            showToast("Failed to restore files", 'error');
            
            setTimeout(() => {
                restoreBtn.innerHTML = '↺ Restore';
            }, 2000);
        } finally {
            isRestoring = false;
        }
    };
    
    const modelLabel = actionsDiv.querySelector('.model-label-tag');
    if (modelLabel) {
        actionsDiv.insertBefore(restoreBtn, modelLabel);
    } else {
        actionsDiv.appendChild(restoreBtn);
    }
}
    
    function renderMessages() {
    messagesEl.innerHTML = '';
    
    if(!activeId || !convs.find(c=>c.id===activeId)) {
        welcomeScreen.classList.remove('hidden');
        const splashScreen = document.getElementById('splashScreen');
        if (splashScreen) splashScreen.style.display = 'flex';
        return;
    }
    
    welcomeScreen.classList.add('hidden');
    const splashScreen = document.getElementById('splashScreen');
    if (splashScreen) splashScreen.style.display = 'none';
    
    const sub = splashScreen?.querySelector('.welcome-sub');
    if (sub) {
        sub.style.animation = 'none';
        sub.style.opacity = '1';
    }

    const conv = convs.find(c=>c.id===activeId);
    
    if (conv && conv.files) {
        conv.files = validateAndFixImages(conv.files);
        projectFiles = (conv.files || []).map(file => {
            if (isImageFile(file.name)) {
                return {
                    ...file,
                    type: 'image',
                    content: file.content || file.data || null
                };
            }
            return file;
        });
    }
    
    if(conv.hasActivity) {
        conv.hasActivity = false;
        saveConversationToServer(conv).catch(console.error);
        renderConversations();
    }

    conv.messages.forEach((m, index) => {
        const d = document.createElement('div');
        
        if (activeId === streamingConvId && !serverFinished && index === conv.messages.length - 1 && m.role === 'ai') {
            isStreaming = true;
            safeBuffer = m.text;
        }
        
        if (m.role === 'user') {
            appendUserMessage(m.text);
        } else {
            d.className = 'msg ai';
            
            let displayText = m.text || '';
            let tasksHTML = '';
            

if (m.tasks && (m.tasks.built?.length || m.tasks.modified?.length || m.tasks.deleted?.length)) {
    // ✅ استخراج المدة من المهام (إن وجدت)
    const duration = m.tasks.duration;
    tasksHTML = generateTasksHTML(m.tasks, duration);  // ✅ تمرير المدة للدالة
}
            // ✅ للمحادثات القديمة التي قد يكون فيها أكواد في النص
            else if (displayText.includes('<FILE') || displayText.includes('<REPLACE') || displayText.includes('<ADD_TO')) {
                const tasks = extractTasksFromResponse(displayText);
                tasksHTML = generateTasksHTML(tasks);
                displayText = extractDisplayText(displayText);
                m.text = displayText;  // تحديث النص في الذاكرة
            }
            
            // تحويل النص إلى HTML
            let htmlContent = typeof marked !== 'undefined' ? marked.parse(displayText) : displayText;
            const finalHTML = tasksHTML + htmlContent;
            
            const { dir, lang } = detectTextDirection(displayText);
            
            d.setAttribute('dir', dir);
            d.setAttribute('lang', lang);
            d.classList.add(dir);
            
            d.innerHTML = `
                <div class="msg-header"></div>
                <div class="ai-content">${finalHTML}</div>
            `;
            
            const contentEl = d.querySelector('.ai-content');
            contentEl.style.direction = dir;
            contentEl.style.textAlign = dir === 'rtl' ? 'right' : 'left';
            
            if (isStreaming && index === conv.messages.length - 1) {
                currentAiMsgElement = d;
            } else {
                addMessageActions(contentEl, displayText, m.model);
                 // ✅ إضافة زر Restore للمحادثات القديمة إذا كانت تحتوي على لقطة ملفات
                if (m.filesSnapshot && m.filesSnapshot.length) {
                    addRestoreButtonToExistingMessage(contentEl, d, m.filesSnapshot);
                }
                const savedThought = getThoughtForMessage(activeId, index);
                if (savedThought) {
                    injectThoughtButton(d, savedThought);
                }
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

   
   // --- دوال نظام إشعار الأخطاء والربط ---

// 1. عند النقر على الشريط الأحمر
document.getElementById('previewErrorBanner')?.addEventListener('click', () => {
    // إخفاء الشريط
    document.getElementById('previewErrorBanner').style.display = 'none';
    
    // فتح الكونسول إذا كان مغلقاً
    const outputView = document.getElementById('consoleOutputView');
    if (outputView.style.display === 'none' || outputView.style.display === '') {
        document.getElementById('btnToggleOutput').click();
    }
});

// 2. دالة ربط الخطأ بالشات
// --- دوال المرفقات الجديدة ---

// 1. دالة إضافة خطأ للقائمة
function attachErrorToChat(fullErrorMsg) {
    // التحقق من التكرار
    const exists = activeAttachments.find(err => err.text === fullErrorMsg);
    if (exists) return; // لا تضف نفس الخطأ مرتين

    // إضافة الخطأ للمصفوفة
    activeAttachments.push({
        id: Date.now() + Math.random(),
        text: fullErrorMsg
    });

    renderAttachments();
    
    // فتح لوحة المفاتيح والتركيز
    // document.getElementById('input').focus(); 
}
const container = document.getElementById('inputAttachments');
    const inputWrapper = document.getElementById('imageAttachmentsBar');
// 2. دالة رسم المرفقات داخل الصندوق
function renderAttachments() {
    
    
    container.innerHTML = ''; // مسح القديم

    if (activeAttachments.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';

    activeAttachments.forEach(err => {
        const chip = document.createElement('div');
        chip.className = 'error-chip';
        
        // تنظيف النص للعرض (أول 30 حرف)
        let displayText = err.text.replace(/^❌\s*/, '').substring(0, 30);
        
        chip.innerHTML = `
            <span>🐞 ${displayText}...</span>
            <span class="chip-close" onclick="removeAttachment('${err.id}')">×</span>
        `;
        
        container.appendChild(chip);
    });
}

// 3. دالة حذف مرفق محدد (يجب جعلها global لتعمل مع onclick في HTML)
window.removeAttachment = function(id) {
    // تحويل id إلى رقم لأن onclick يرسله كنص أحياناً
    activeAttachments = activeAttachments.filter(a => a.id != id);
    renderAttachments();
};


// 3. زر إلغاء الربط (x)
document.getElementById('detachErrorBtn')?.addEventListener('click', (e) => {
    e.stopPropagation(); // منع تفاعل العناصر الأب
    pendingErrorAttachment = null;
    document.getElementById('errorAttachment').style.display = 'none';
});

// دالة تهيئة اختيار النموذج - النسخة المبسطة
function initModelSelector() {
    const modelSelectorBtn = document.getElementById('modelSelectorBtn');
    const modelDropdown = document.getElementById('modelDropdown');
    const modelCloseBtn = document.querySelector('.model-close-btn');
    const modelItems = document.querySelectorAll('.model-item');
    const currentModelName = document.querySelector('.model-name');
    
    if (!modelSelectorBtn || !modelDropdown) return;
    
    // تحديث اسم النموذج الحالي
    function updateCurrentModel() {
        currentModelName.textContent = MODEL_NAMES[selectedModel] || 'Gemini 3 Flash';
        
        // تحديث حالة التحديد في القائمة
        modelItems.forEach(item => {
            const modelType = item.getAttribute('data-model');
            if (modelType === selectedModel) {
                item.classList.add('selected');
                let statusEl = item.querySelector('.model-status');
                if (!statusEl) {
                    statusEl = document.createElement('div');
                    statusEl.className = 'model-status';
                    statusEl.textContent = 'Current';
                    item.appendChild(statusEl);
                }
            } else {
                item.classList.remove('selected');
                const statusEl = item.querySelector('.model-status');
                if (statusEl) statusEl.remove();
            }
        });
        
        // حفظ النموذج المحدد
        localStorage.setItem('codeai_selected_model', selectedModel);
    }
    
    // تحميل النموذج المحفوظ
    const savedModel = localStorage.getItem('codeai_selected_model');
    if (savedModel && MODEL_NAMES[savedModel]) {
        selectedModel = savedModel;
    }
    
    // فتح القائمة
    modelSelectorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        modelDropdown.classList.add('active');
        modelSelectorBtn.classList.add('active');
    });
    
    // إغلاق القائمة
    modelCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeModelDropdown();
    });
    
    // إغلاق عند النقر خارج
    document.addEventListener('click', (e) => {
        if (modelDropdown.classList.contains('active') && 
            !modelSelectorBtn.contains(e.target) && 
            !modelDropdown.contains(e.target)) {
            closeModelDropdown();
        }
    });
    
    // اختيار نموذج
    modelItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const modelType = item.getAttribute('data-model');
            if (modelType && modelType !== selectedModel) {
                selectedModel = modelType;
                updateCurrentModel();
                showModelChangeNotification(MODEL_NAMES[modelType]);
            }
            closeModelDropdown();
        });
    });
    
    // دالة إغلاق
    function closeModelDropdown() {
        modelDropdown.classList.remove('active');
        modelSelectorBtn.classList.remove('active');
    }
    
    // تحديث الواجهة
    updateCurrentModel();
}

function showToast(message, type = 'error') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'error' ? '#ff4444' : '#4caf50'};
        color: white;
        padding: 12px 24px;
        border-radius: 30px;
        font-size: 14px;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s;
        pointer-events: none;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.style.opacity = '1', 10);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// دالة الإشعار
function showModelChangeNotification(modelName) {
    const existingNotification = document.querySelector('.model-notification');
    if (existingNotification) existingNotification.remove();
    
    const notification = document.createElement('div');
    notification.className = 'model-notification';
    notification.textContent = ` Switched to ${modelName}`;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(20px)';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}
initModelSelector();

function hideWelcomeLogo() {
    const welcomeScreen = document.getElementById('welcomeScreen');
    const splashScreen = document.getElementById('splashScreen');
    
    if (welcomeScreen) {
        welcomeScreen.classList.add('hidden');
        welcomeScreen.style.display = 'none';
    }
    
    if (splashScreen) {
        splashScreen.classList.add('hidden');
        splashScreen.style.display = 'none';
    }
}

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
          welcomeScreen.classList.add('hidden');
            hideWelcomeLogo();  // إخفاء اللوقو
    const newId = Date.now().toString();
    projectFiles = [{ name: 'index.html', content: '// Start coding...' }];
    activeFileIndex = 0;
    
    const newConv = {
        id: newId,
        title: text.substring(0, 30),
        messages: [],
        files: projectFiles,
        code: '',
        hasActivity: false,
        created_at: new Date().toISOString()
    };
    
    // ✅ حفظ على السيرفر فوراً
    const saved = await saveConversationToServer(newConv);
            if (!saved) {
                console.error("Failed to create conversation");
                finalizeError("Failed to create conversation. Please try again.");
                return;
            }
    
    convs.unshift(newConv);
    activeId = newId;
    
    renderConversations();
}

        const conv = convs.find(c=>c.id===activeId);
        conv.messages.push({role:'user', text});

        appendUserMessage(text); 

        conv.messages.push({role:'ai', text:''}); 
        saveConversationToServer(conv).catch(console.error);
    }
  // --- التعديل: دمج الخطأ المربوط مع الرسالة ---
    
    // ---------------------------------------------
    
     // تحديث الشرط ليعمل حتى لو النص فارغ والخطأ موجود (اختياري)
    
    // ... باقي الكود كما هو، لكن استخدم finalMessage بدلاً من text عند الإرسال للسيرفر ...
    // 1. الحالة: Sending
    showStatus("Sending"); 

    isStreaming = true;
    streamingConvId = activeId;
    serverFinished = false;
    safeBuffer = ""; fullMarkdownBuffer = ""; typeQueue = []; streamCursor = 0; currentAiMsgElement = null;



    // تجهيز الإعدادات الحالية
     currentSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    const appTheme = localStorage.getItem('codeai_theme') || 'dark'; // نحتاج الثيم بشكل منفصل
    
    
    const currentConv = convs.find(c => c.id === activeId);
    if(currentConv) {
        currentConv.hasActivity = true; // علامة وجود نشاط
        renderConversations(); // تحديث القائمة لإظهار النقطة (رغم أننا بداخلها، لإثبات الحالة)
    }
    // تجهيز سياق التاريخ (آخر رسالتين + الرسالة الحالية تتم إضافتها في السيرفر أو هنا)
    // هنا سنرسل آخر 4 رسائل (2 مستخدم + 2 ذكاء اصطناعي) لضمان السياق
    // داخل sendMessage في app.js
const conv = convs.find(c=>c.id===activeId);

let historyContext = [];


   // --- التعديل الجوهري: دمج جميع الأخطاء ---
    let messageToServer = text || ""; // في حال أرسل فقط أخطاء بدون نص
    
    if (activeAttachments.length > 0) {
        messageToServer += "\n\n--- [RUNTIME ERRORS REPORT] ---\n";
        messageToServer += "I encountered the following errors, please fix them:\n";
        
        activeAttachments.forEach((err, index) => {
            messageToServer += `\nError ${index + 1}:\n${err.text}\n`;
        });
        messageToServer += "\n-------------------------------";
        
        // تفريغ المرفقات بعد التجهيز للإرسال
        activeAttachments = [];
        renderAttachments();
    }
    // ------------------------------------------
        
// إضافة تحقق للتأكد من وجود المحادثة والرسائل
if (conv && conv.messages) {
    historyContext = conv.messages.slice(-4); 
} else {
    historyContext = []; // مصفوفة فارغة إذا كانت محادثة جديدة
}

const cleanedHistory = historyContext.slice(-2).map(msg => ({
        role: msg.role,
        content: msg.text // نرسل النص الظاهر فقط
    }));
    console.log(cleanedHistory)
    console.log(messageToServer)
    try {
      const fd = new FormData();

fd.append("message", messageToServer);
fd.append("convId", activeId);
fd.append("history", JSON.stringify(cleanedHistory));
fd.append("files", JSON.stringify(projectFiles));
fd.append("clientId", myClientId);
if (!localStorage.getItem('userId')) {
    localStorage.setItem('userId', crypto.randomUUID());
}
fd.append("userId", localStorage.getItem('userId'));
fd.append("settings", JSON.stringify({
    ...currentSettings,
    theme: appTheme,
    selectedModel: selectedModel
}));

// إضافة الصور
activeImageAttachments.forEach(img => {
    fd.append("images", img.file, img.file.name);
});

const response = await fetch(RENDER_SERVER_URL + '/api/chat', {
    method: "POST",
    body: fd
});
      /*  const response = await fetch(RENDER_SERVER_URL + '/api/chat', { 
            method:'POST', 
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ 
                message: messageToServer, 
                convId: activeId, 
                files: projectFiles,
                history: cleanedHistory, 
                clientId: myClientId, 
                settings: {
                    ...currentSettings,
                    theme: appTheme,
                    selectedModel: selectedModel
                }
            })
        });  */
        // ... باقي الكود ...

activeImageAttachments = [];
renderImageAttachments();
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
    isSending = true;
allowMicWhenEmpty = false; // منع المايك أثناء الإرسال
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
        saveConversationToServer(conv).catch(console.error);
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
console.log("is:", isArabic)
if (isArabic === true) {
  console.log("truely")
        d.style.direction = 'rtl';
        d.style.textAlign = 'right';
        // يضمن هذا العقار أن النصوص المختلطة (عربي + إنجليزي) تظهر بشكل صحيح سطر بسطر
        d.style.unicodeBidi = 'plaintext'; 
    } else {
        d.style.direction = 'ltr';
        d.style.textAlign = 'left';
    }

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

function ensureStageElement() {
    if (stageElement) return stageElement;

    const d = document.createElement('div');
    d.className = 'msg ai';

    d.innerHTML = `
        <div class="msg-header"></div>
        <div class="ai-content"></div>
    `;

    messagesEl.appendChild(d);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    stageElement = d.querySelector('.ai-content');
    return stageElement;
}

function reverseDeleteViaQueue(text, done) {
    if (!text || text.length === 0) {
        done && done();
        return;
    }

    // أوقف أي كتابة حالية
    typeQueue.length = 0;

    // أضف أوامر حذف (نستخدم رمز خاص)
    for (let i = text.length - 1; i >= 0; i--) {
        typeQueue.push({ delete: true });
    }

    typeQueue.push({ done });

    if (!typeTimeout) startTyping();
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
        saveConversationToServer(conv).catch(console.error);
        renderConversations();
    }
}
    
    
    const convOptionsModal = document.getElementById('convOptionsModal');
    const convRenameInput = document.getElementById('convRenameInput');
    let editingConvId = null;


// التحقق من وجود حساب للمستخدم
async function checkUserRegistration() {
    const userId = localStorage.getItem('userId');
    if (!userId) return false;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/user?userId=${userId}`);
        if (!response.ok) return false;
        
        const data = await response.json();
        
        // إذا كان هناك nickname، المستخدم مسجل
        if (data.nickname) {
            currentNickname = data.nickname;
            isRegistered = true;
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error("❌ Error checking registration:", error);
        return false;
    }
}

// تسجيل مستخدم جديد
async function registerUser(nickname) {
    const userId = localStorage.getItem('userId');
    if (!userId) {
        localStorage.setItem('userId', crypto.randomUUID());
    }
    
    const finalUserId = localStorage.getItem('userId');
    
    try {
        // التحقق من عدم تكرار الاسم
        const checkResponse = await fetch(`${API_BASE_URL}/api/check-nickname`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname })
        });
        
        const checkData = await checkResponse.json();
        
        if (checkData.exists) {
            return { success: false, error: 'Nickname already taken' };
        }
        
        // تسجيل المستخدم
        const registerResponse = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: finalUserId,
                nickname: nickname
            })
        });
        
        const registerData = await registerResponse.json();
        
        if (!registerResponse.ok) {
            return { success: false, error: registerData.error || 'Registration failed' };
        }
        
        currentNickname = nickname;
        isRegistered = true;
        localStorage.setItem('codeai_nickname', nickname);
        
        return { success: true };
        
    } catch (error) {
        console.error("❌ Registration error:", error);
        return { success: false, error: error.message };
    }
}


    // تحميل المحادثات من السيرفر
async function loadConversations() {
    const convList = document.getElementById('convList');
    if (convList) {
        convList.innerHTML = '<div style="padding:20px;text-align:center;opacity:0.5;">Loading...</div>';
    }
    
    const serverConvs = await fetchConversationsFromServer();
    
    // ✅ إزالة المحادثات المؤقتة (التي لم تحفظ بعد)
    const nonTemporaryConvs = convs.filter(c => !c.isTemporary);
    
    // دمج: المحادثات من السيرفر + المحادثات غير المؤقتة المحلية
    const serverMap = new Map(serverConvs.map(c => [c.id, c]));
    
    const mergedConvs = [...nonTemporaryConvs];
    for (const conv of serverConvs) {
        if (!mergedConvs.find(c => c.id === conv.id)) {
            mergedConvs.push(conv);
        }
    }
    
    convs = mergedConvs;
    
    renderConversations();
}

// دالة renderConversations المعدلة
function renderConversations() {
    const c = document.getElementById('convList');
    if (!c) return;
    
    c.innerHTML = '';
    
    if (convs.length === 0) {
        c.innerHTML = '<div style="padding:20px;text-align:center;opacity:0.5;">No conversations yet</div>';
        return;
    }
    
    convs.forEach(cv => {
        const el = document.createElement('div');
        el.className = 'conv-item';
        el.style.cssText = `
            padding: 14px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            color: var(--text-color);
            user-select: none;
            position: relative;
        `;
        
        const titleSpan = document.createElement('span');
        titleSpan.textContent = cv.title || 'New Conversation';
        titleSpan.style.flex = '1';
        titleSpan.style.overflow = 'hidden';
        titleSpan.style.textOverflow = 'ellipsis';
        titleSpan.style.whiteSpace = 'nowrap';
        
        el.appendChild(titleSpan);
        
        if (cv.hasActivity && cv.id !== activeId) {
            const dot = document.createElement('span');
            dot.className = 'unread-dot';
            dot.style.cssText = `
                width: 8px;
                height: 8px;
                background: #2196f3;
                border-radius: 50%;
                display: inline-block;
                margin-left: 8px;
            `;
            el.appendChild(dot);
        }
        
        el.addEventListener('click', async () => {
    // ✅ إظهار مؤشر تحميل في العنصر نفسه
    const originalTitle = titleSpan.textContent;
    titleSpan.innerHTML = '<span class="conv-loading-spinner"></span> Loading...';
    titleSpan.style.opacity = '0.7';
    
    try {
        cv.hasActivity = false;
        
        const fullConv = await fetchConversationFromServer(cv.id);
        if (fullConv) {
            cv.messages = fullConv.messages;
            cv.files = fullConv.files;
        }
        
        activeId = cv.id;
        
        if (cv.files && Array.isArray(cv.files) && cv.files.length) {
            projectFiles = cv.files;
        } else {
            projectFiles = [{ name: 'index.html', content: '// Start coding...' }];
        }
        activeFileIndex = 0;
        
        const codeAreaEl = document.getElementById('codeArea');
        if (codeAreaEl) codeAreaEl.value = projectFiles[0].content || '';
        
        renderTabs();
        updateView();
        renderMessages();
        
        closeMenu();
        menuPanel.classList.remove('open');
        menuBtn.classList.remove('active');
        
        renderConversations();
        
    } catch (error) {
        console.error("Error loading conversation:", error);
        showToast("Failed to load conversation", 'error');
        
        // إعادة النص الأصلي
        titleSpan.textContent = originalTitle;
        titleSpan.style.opacity = '';
    }
});
        
        let pressTimer;
        el.addEventListener('touchstart', () => {
            pressTimer = setTimeout(() => openConvOptions(cv), 500);
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
        console.log("tapped")
    });

    document.getElementById('btnSaveConvName').addEventListener('click', async () => {
    if (editingConvId) {
        const newName = convRenameInput.value.trim();
        if (newName) {
            const cv = convs.find(c => c.id === editingConvId);
            if (cv) {
                cv.title = newName;
                await saveConversationToServer(cv);
                
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
    const sendIconTpl = document.getElementById('sendIcon');
const micIconTpl = document.getElementById('micIcon');
    // دالة فحص حالة زر الإرسال
function checkInputState() {
    const hasText = inputEl.value.trim() !== '';

    if (isSending) {
        // الحالة: جاري الإرسال → زر غير مفعل
        sendBtn.disabled = true;
        sendBtn.classList.add('disabled');
        return;
    }

    // إذا الصندوق فارغ والسماح بالمايك
    if (!hasText && allowMicWhenEmpty) {
        sendBtn.disabled = false;
        sendBtn.classList.remove('disabled');
        sendBtn.dataset.mode = 'mic';
        sendBtn.innerHTML = micIconTpl.innerHTML; // أيقونة المايك
    } else if (hasText) {
        // زر الإرسال
        sendBtn.disabled = false;
        sendBtn.classList.remove('disabled');
        sendBtn.dataset.mode = 'send';
        sendBtn.innerHTML = sendIconTpl.innerHTML; // أيقونة الإرسال
    } else {
        // زر غير مفعل (فارغ بدون مايك)
        sendBtn.disabled = true;
        sendBtn.classList.add('disabled');
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
// --- تعديل 1: دالة الكتابة مع تفعيل الماركداون المباشر ---
function startTyping() {
    function typeLoop() {
        if (typeQueue.length > 0) {
            const item = typeQueue.shift();

// 🧹 حذف عكسي (Stage cleanup)
if (typeof item === 'object' && item.delete) {
    fullMarkdownBuffer = fullMarkdownBuffer.slice(0, -1);
}
// ✅ callback بعد انتهاء الحذف
else if (typeof item === 'object' && item.done) {
    item.done();
    typeTimeout = setTimeout(typeLoop, 0);
    return;
}
// ✍️ كتابة عادية
else {
    fullMarkdownBuffer += item;
};

            if (currentAiMsgElement) {
                const contentEl = currentAiMsgElement.querySelector('.ai-content');
                
                if (contentEl) {
                    // التعديل الجوهري: تحويل النص إلى HTML في كل خطوة
                    // هذا سيجعل العناوين تكبر والخط العريض يظهر فوراً أثناء الكتابة
                    if (typeof marked !== 'undefined') {
                        contentEl.innerHTML = marked.parse(fullMarkdownBuffer);
                    } else {
                        contentEl.textContent = fullMarkdownBuffer;
                    }
                }
                
                messagesEl.scrollTop = messagesEl.scrollHeight;
            }

            // منطق السرعة (بقي كما هو)
            let delay;
            if (window.fastTyping) {
                // 🔥 سرعة قصوى عند انتهاء الـ stream
                delay = 0;
            } else {
                const writtenLen = fullMarkdownBuffer.length;
                const MIN_DELAY = 0.5;
                const MAX_DELAY = 20;
                const ACCELERATION_POINT = 200;
                const progress = Math.min(writtenLen / ACCELERATION_POINT, 1);
                delay = MAX_DELAY - (progress * (MAX_DELAY - MIN_DELAY));
                delay = Math.round(delay);
            }

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

// دالة لاستخراج النص المعروض من الرد الكامل (إزالة أكواد الملفات)
function extractDisplayText(fullText) {
    if (!fullText) return '';
    
    // البحث عن أول علامة ملف
    const tagIndex = fullText.search(/<(FILE|REPLACE|ADD_TO)/);
    if (tagIndex !== -1) {
        return fullText.substring(0, tagIndex).trim();
    }
    
    return fullText;
}

// =========================================
// دوال قائمة المهام (Tasks List)
// =========================================


function extractTasksFromResponse(fullText) {
    const tasks = {
        built: [],   // ملفات تم إنشاؤها
        modified: [], // ملفات تم تعديلها
        deleted: []   // ملفات تم حذفها
    };

    // 1. البحث عن ملفات تم إنشاؤها (FILE)
    const fileRegex = /<FILE\s+name="([^"]+)"\s*>([\s\S]*?)<\/FILE>/gi;
    let match;
    while ((match = fileRegex.exec(fullText)) !== null) {
        const fileName = match[1];
        if (!tasks.built.includes(fileName)) {
            tasks.built.push(fileName);
        }
    }

    // 2. البحث عن ملفات تم تعديلها (REPLACE أو ADD_TO)
    const modifyRegex = /<(REPLACE|ADD_TO)\s+(?:name|file|target)="([^"]+)"[^>]*>[\s\S]*?<\/\1>/gi;
    while ((match = modifyRegex.exec(fullText)) !== null) {
        const fileName = match[2];
        if (!tasks.modified.includes(fileName)) {
            tasks.modified.push(fileName);
        }
    }

    // 3. البحث عن ملفات تم حذفها (نبحث في النص عن إشارات الحذف)
    //    نموذج: <DELETE name="old_file.js" />
    const deleteRegex = /<DELETE\s+name="([^"]+)"\s*\/>/gi;
    while ((match = deleteRegex.exec(fullText)) !== null) {
        const fileName = match[1];
        if (!tasks.deleted.includes(fileName)) {
            tasks.deleted.push(fileName);
        }
    }

    return tasks;
}

function generateTasksHTML(tasks, duration = null) {
    // إذا كان input كائن مهام، استخدمه مباشرة
    if (tasks && typeof tasks === 'object' && !Array.isArray(tasks)) {
        // التأكد من وجود المهام
        if (!tasks.built?.length && !tasks.modified?.length && !tasks.deleted?.length) {
            return '';
        }
        return _generateTasksHTMLFromObject(tasks, duration);
    }
    
    // إذا كان input نصاً، استخرج المهام منه
    if (typeof tasks === 'string') {
        const extractedTasks = extractTasksFromResponse(tasks);
        return _generateTasksHTMLFromObject(extractedTasks);
    }
    
    return '';
}

// متغيرات لتتبع المؤقت وحالة القائمة
let currentTimerInterval = null;
let currentTaskContainer = null;
let currentTasks = { built: [], modified: [], deleted: [] };
let currentTaskListContent = null;
let currentTimerStartTime = null;
let streamStarted = false;

/**
 * إنشاء حاوية قائمة المهام داخل رسالة AI
 */
function createTaskListContainer(msgElement) {
    let container = msgElement.querySelector('.task-list-container');
    if (container) return container;

    container = document.createElement('div');
    container.className = 'task-list-container';
    container.style.order = '-1'; // ✅ يضمن الظهور فوق المحتوى

    const header = document.createElement('div');
    header.className = 'task-list-header';

    const timerInfo = document.createElement('div');
    timerInfo.className = 'timer-info';
    timerInfo.innerHTML = `
        <span class="spinner"></span>
        <span>Working...</span>
        <span class="running-time">Running for 0s</span>
    `;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'task-toggle-btn';
    toggleBtn.innerHTML = '▼';
    toggleBtn.onclick = () => {
        const content = container.querySelector('.task-list-content');
        content.classList.toggle('collapsed');
        toggleBtn.classList.toggle('collapsed');
    };

    header.appendChild(timerInfo);
    header.appendChild(toggleBtn);

    const content = document.createElement('div');
    content.className = 'task-list-content';
    const tasksDiv = document.createElement('div');
    tasksDiv.className = 'tasks-list';
    tasksDiv.innerHTML = '';
    content.appendChild(tasksDiv);

    container.appendChild(header);
    container.appendChild(content);

    // ✅ إدراج القائمة في بداية الرسالة (قبل كل شيء)
    const firstChild = msgElement.firstChild;
    if (firstChild) {
        msgElement.insertBefore(container, firstChild);
    } else {
        msgElement.appendChild(container);
    }

    return container;
}

/**
 * بدء المؤقت (يُستدعى عند بدء الرد)
 */
function startTaskTimer() {
    if (currentTimerInterval) clearInterval(currentTimerInterval);
    currentTimerStartTime = Date.now();
    currentTimerInterval = setInterval(() => {
        if (!currentTaskContainer) return;
        const elapsed = Math.floor((Date.now() - currentTimerStartTime) / 1000);
        const timeSpan = currentTaskContainer.querySelector('.running-time');
        if (timeSpan) timeSpan.textContent = `Running for ${elapsed}s`;
    }, 1000);
}

/**
 * إيقاف المؤقت (عند بدء استقبال النص الحقيقي)
 */
function stopTaskTimer() {
    if (currentTimerInterval) {
        clearInterval(currentTimerInterval);
        currentTimerInterval = null;
    }
    // تغيير النص ليصبح "Running for Xs" ثابتاً
    if (currentTaskContainer) {
        const elapsed = Math.floor((Date.now() - (currentTimerStartTime || Date.now())) / 1000);
        const timeSpan = currentTaskContainer.querySelector('.running-time');
        if (timeSpan) timeSpan.textContent = `Ran for ${elapsed}s`;
        // إزالة السبينر
        const spinner = currentTaskContainer.querySelector('.spinner');
        if (spinner) spinner.style.display = 'none';
        const workingText = currentTaskContainer.querySelector('.timer-info span:nth-child(2)');
        if (workingText) workingText.textContent = 'Completed';
    }
    // زيادة سرعة الكتابة
    if (typeTimeout) {
        // لا حاجة لتعديل typeTimeout نفسه، لكن يمكننا زيادة سرعة الكتابة
        // وذلك بتعديل منطق السرعة في startTyping. سنضيف متغيرًا عامًا
        window.fastTyping = true;
    }
}

/**
 * تحديث قائمة المهام في الوقت الفعلي
 * @param {Object} tasks كائن المهام الجديد (built, modified, deleted)
 */
function updateTaskList(tasks) {
    if (!currentTaskContainer) return;
    const contentDiv = currentTaskContainer.querySelector('.task-list-content .tasks-list');
    if (!contentDiv) return;

    // إنشاء HTML جديد
    const newHTML = _generateTasksHTMLFromObject(tasks);
    // إذا كان هناك تغيير في المحتوى
    if (contentDiv.innerHTML !== newHTML) {
        // أنميشن تلاشي بسيط
        contentDiv.style.transition = 'opacity 0.2s';
        contentDiv.style.opacity = '0';
        setTimeout(() => {
            contentDiv.innerHTML = newHTML;
            contentDiv.style.opacity = '1';
        }, 150);
    }
}

function _generateTasksHTMLFromObject(tasks, duration = null) {
    if (!tasks.built?.length && !tasks.modified?.length && !tasks.deleted?.length) {
        return '';
    }

    let html = '<div class="tasks-list">\n';
    
    // ✅ إضافة الهيدر مع المؤقت إذا كانت المدة موجودة
    if (duration !== null && duration > 0) {
        html += '    <div class="tasks-header-with-timer">\n';
        html += '        <div class="tasks-header">\n';
        html += '            <svg class="tasks-header-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n';
        html += '                <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>\n';
        html += '            </svg>\n';
        html += '            <span>Tasks</span>\n';
        html += '        </div>\n';
        html += `        <div class="task-duration">Completed  Ran for ${duration}s</div>\n`;
        html += '    </div>\n';
    } else {
        // الهيدر العادي بدون مؤقت
        html += '    <div class="tasks-header">\n';
        html += '        <svg class="tasks-header-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n';
        html += '            <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>\n';
        html += '        </svg>\n';
        html += '        <span>Tasks</span>\n';
        html += '    </div>\n';
    }

    // Built files
    if (tasks.built.length) {
        html += `    <div class="task-category built">\n`;
        html += `        <svg class="category-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n`;
        html += `            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/>\n`;
        html += `            <path d="M8 12L11 15L16 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>\n`;
        html += `        </svg>\n`;
        html += `        <span>Created ${tasks.built.length} file${tasks.built.length > 1 ? 's' : ''}</span>\n`;
        html += `    </div>\n`;
        
        tasks.built.forEach(file => {
            html += `    <div class="task-item built">\n`;
            html += `        <svg class="task-icon-svg built" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n`;
            html += `            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/>\n`;
            html += `            <path d="M8 12L11 15L16 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>\n`;
            html += `        </svg>\n`;
            html += `        <span class="task-filename">${escapeHtml(file)}</span>\n`;
            html += `    </div>\n`;
        });
    }

    // Modified files
    if (tasks.modified.length) {
        html += `    <div class="task-category modified">\n`;
        html += `        <svg class="category-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n`;
        html += `            <path d="M17 3L21 7L7 21H3V17L17 3Z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>\n`;
        html += `            <path d="M15 5L19 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>\n`;
        html += `        </svg>\n`;
        html += `        <span>Modified ${tasks.modified.length} file${tasks.modified.length > 1 ? 's' : ''}</span>\n`;
        html += `    </div>\n`;
        
        tasks.modified.forEach(file => {
            html += `    <div class="task-item modified">\n`;
            html += `        <svg class="task-icon-svg modified" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n`;
            html += `            <path d="M17 3L21 7L7 21H3V17L17 3Z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>\n`;
            html += `            <path d="M15 5L19 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>\n`;
            html += `        </svg>\n`;
            html += `        <span class="task-filename">${escapeHtml(file)}</span>\n`;
            html += `    </div>\n`;
        });
    }

    // Deleted files
    if (tasks.deleted.length) {
        html += `    <div class="task-category deleted">\n`;
        html += `        <svg class="category-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n`;
        html += `            <path d="M4 7H20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>\n`;
        html += `            <path d="M6 7L8 21H16L18 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>\n`;
        html += `            <path d="M9 4H15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>\n`;
        html += `        </svg>\n`;
        html += `        <span>Deleted ${tasks.deleted.length} file${tasks.deleted.length > 1 ? 's' : ''}</span>\n`;
        html += `    </div>\n`;
        
        tasks.deleted.forEach(file => {
            html += `    <div class="task-item deleted">\n`;
            html += `        <svg class="task-icon-svg deleted" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n`;
            html += `            <path d="M4 7H20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>\n`;
            html += `            <path d="M10 11V16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>\n`;
            html += `            <path d="M14 11V16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>\n`;
            html += `            <path d="M6 7L8 21H16L18 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>\n`;
            html += `            <path d="M9 4H15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>\n`;
            html += `        </svg>\n`;
            html += `        <span class="task-filename">${escapeHtml(file)}</span>\n`;
            html += `    </div>\n`;
        });
    }

    html += '</div>\n';
    return html;
}

/**
 * دالة مساعدة لتأمين النص من XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// متغير لتتبع حالة استعادة الملفات (لمنع الاستعادة المتكررة)
let isRestoring = false;

function addRestoreButton(contentEl, msgElement) {
    // البحث عن زر الاستعادة الموجود (لتجنب التكرار)
    if (msgElement.querySelector('.restore-checkpoint-btn')) return;
    
    // البحث عن حاوية الأزرار (msg-actions)
    let actionsDiv = msgElement.querySelector('.msg-actions');
    
    // إذا لم توجد حاوية الأزرار، قم بإنشائها
    if (!actionsDiv) {
        actionsDiv = document.createElement('div');
        actionsDiv.className = 'msg-actions';
        contentEl.parentNode.appendChild(actionsDiv);
    }
    
    // إنشاء زر الاستعادة
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'action-btn restore-checkpoint-btn';
    restoreBtn.innerHTML = '↺ Restore';
    restoreBtn.title = 'Restore files from this checkpoint';
    
    // ✅ التحقق من وجود المحادثة والرسائل
    const conv = convs.find(c => c.id === activeId);
    if (!conv || !conv.messages || conv.messages.length === 0) {
        // إذا لم توجد محادثة، نعطل الزر
        restoreBtn.disabled = true;
        restoreBtn.style.opacity = '0.5';
        restoreBtn.title = 'No conversation found';
        const modelLabel = actionsDiv.querySelector('.model-label-tag');
        if (modelLabel) {
            actionsDiv.insertBefore(restoreBtn, modelLabel);
        } else {
            actionsDiv.appendChild(restoreBtn);
        }
        return;
    }
    
    // ✅ الحصول على لقطة الملفات من آخر رسالة (أو من الرسالة الحالية)
    const lastMsgIndex = conv.messages.length - 1;
    const currentMsg = conv.messages[lastMsgIndex];
    const filesSnapshot = currentMsg?.filesSnapshot;
    
    // ✅ إذا لم توجد لقطة ملفات، نعطل الزر
    if (!filesSnapshot || !filesSnapshot.length) {
        restoreBtn.disabled = true;
        restoreBtn.style.opacity = '0.5';
        restoreBtn.title = 'No checkpoint available for this message';
    }
    
    restoreBtn.onclick = async (e) => {
        e.stopPropagation();
        
        if (isRestoring) return;
        
        // ✅ التحقق مرة أخرى عند النقر
        if (!filesSnapshot || !filesSnapshot.length) {
            showToast("No files to restore", 'error');
            return;
        }
        
        isRestoring = true;
        restoreBtn.classList.add('restoring');
        restoreBtn.innerHTML = '<span class="restore-spinner"></span> Restoring...';
        
        try {
            // استعادة الملفات من اللقطة
            projectFiles = filesSnapshot.map(snapshot => ({
                name: snapshot.name,
                content: snapshot.content,
                type: snapshot.type || getMimeType(snapshot.name)
            }));
            
            // تحديث واجهة التبويبات والمحرر
            activeFileIndex = 0;
            renderTabs();
            
            // تحديث محتوى المحرر
            const currentFile = projectFiles[activeFileIndex];
            if (currentFile) {
                if (isImageFile(currentFile.name)) {
                    displayImageInEditor(currentFile);
                } else if (isDocumentFile(currentFile.name)) {
                    displayDocumentInEditor(currentFile);
                } else {
                    hideImagePreview();
                    codeArea.value = currentFile.content || '';
                    updateView();
                }
            }
            
            // حفظ الحالة بعد الاستعادة
            const conv = convs.find(c => c.id === activeId);
            if (conv) {
                conv.files = projectFiles;
                await saveConversationToServer(conv);
            }
            
            // تغيير حالة الزر
            restoreBtn.classList.remove('restoring');
            restoreBtn.classList.add('restored');
            restoreBtn.innerHTML = '✓ Restored';
            
            // عرض رسالة نجاح
            showToast("Files restored successfully!", 'success');
            
            // بعد 3 ثوانٍ، إعادة الزر إلى حالته الطبيعية
            setTimeout(() => {
                restoreBtn.classList.remove('restored');
                restoreBtn.innerHTML = '↺ Restore';
            }, 3000);
            
        } catch (error) {
            console.error("Restore failed:", error);
            restoreBtn.classList.remove('restoring');
            restoreBtn.innerHTML = '↺ Retry';
            showToast("Failed to restore files", 'error');
            
            setTimeout(() => {
                restoreBtn.innerHTML = '↺ Restore';
            }, 2000);
        } finally {
            isRestoring = false;
        }
    };
    
    // إضافة الزر قبل زر النموذج (model-label)
    const modelLabel = actionsDiv.querySelector('.model-label-tag');
    if (modelLabel) {
        actionsDiv.insertBefore(restoreBtn, modelLabel);
    } else {
        actionsDiv.appendChild(restoreBtn);
    }
}

// دالة جديدة لإنهاء المعالجة وإظهار الأز
function finishMessageProcessing() {
  console.log("📦 finishMessageProcessing called, saving with tasks and snapshot...");
    console.log("Tasks:", tasks);
    console.log("Files snapshot count:", filesSnapshot?.length);
    typeTimeout = null;
    serverFinished = false;
    removeStatus();

    if (activeId && currentAiMsgElement) {
        currentAiMsgElement.classList.add('static');
        
        const conv = convs.find(c => c.id === activeId);
        if (conv && conv.messages.length > 0) {
            const lastMsg = conv.messages[conv.messages.length - 1];
            
            const displayText = extractDisplayText(fullMarkdownBuffer);
            
            lastMsg.text = displayText;
            lastMsg.model = currentStreamModel || "Gemini 3 Flash";
            
            let durationSeconds = null;
            if (currentTimerStartTime) {
                durationSeconds = Math.floor((Date.now() - currentTimerStartTime) / 1000);
            }
            
            // ✅ حفظ كائن المهام مع إضافة المدة
            const tasks = extractTasksFromResponse(safeBuffer);
            tasks.duration = durationSeconds;  // ✅ إضافة حقل duration
            
            lastMsg.tasks = tasks;
            
            // ✅ حفظ لقطة الملفات الحالية (نسخة احتياطية)
            // نحتاج إلى نسخة عميقة من الملفات الحالية
            const filesSnapshot = projectFiles.map(file => ({
                name: file.name,
                content: file.content,
                type: file.type || getMimeType(file.name)
            }));
            lastMsg.filesSnapshot = filesSnapshot;
            
            saveConversationToServer(conv).catch(err => {
                console.error("❌ Failed to save to server:", err);
                showToast("Failed to save message, please check your connection");
            });
        }
        
        // ✅ إنشاء HTML للمهام
        const tasks = extractTasksFromResponse(safeBuffer);
        const tasksHTML = generateTasksHTML(tasks);
        
        let html = typeof marked !== 'undefined' ? marked.parse(extractDisplayText(fullMarkdownBuffer)) : extractDisplayText(fullMarkdownBuffer);
        
        const contentEl = currentAiMsgElement.querySelector('.ai-content');
        if (contentEl) {
            contentEl.innerHTML = tasksHTML + html;
            addMessageActions(contentEl, extractDisplayText(fullMarkdownBuffer), currentStreamModel);
            
            // ✅ إضافة زر Restore إلى الرسالة
            addRestoreButton(contentEl, currentAiMsgElement);
        }
        
        processFilesUpdate(safeBuffer);
    }
    
    currentStreamModel = null;
    isStreaming = false;
    isSending = false;
    allowMicWhenEmpty = true;
    checkInputState();
}



    
    // --- Helper for Message Actions (محدث لطلب 1) ---
    // --- Helper for Message Actions (محدث للإصلاح) ---
function addMessageActions(msgElement, fullText, modelName) {
  console.log(modelName)
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'msg-actions';
        actionsDiv.style.order = '1';
        
const modelLabel = document.createElement('span');
    modelLabel.className = 'model-label-tag';
    // تنسيق الاسم
    modelLabel.textContent = `Model: ${modelName || 'Gemini 3 Flash'}`;
    modelLabel.style.fontSize = '13px';
    modelLabel.style.opacity = '0.5';
    modelLabel.style.marginRight = 'auto'; // لدفعه لليسار والأزرار لليمين
    
    modelLabel.style.padding = '2px 5px';
    

    


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
        btnRetry.className = 'action-btn btn-retry-icon';
        btnRetry.textContent = ''; // يبقى نصاً كما هو
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
        actionsDiv.appendChild(modelLabel);
    }


    function handleRetryOrEdit(mode) {
        const conv = convs.find(c => c.id === activeId);
        if (!conv || conv.messages.length < 2) return;

        const userMsgIndex = conv.messages.length - 2;
        const lastUserText = conv.messages[userMsgIndex].text;

        conv.messages.splice(userMsgIndex, 2);
        saveConversationToServer(conv).catch(console.error);
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


function handleIncomingFiles(files) {
    let changed = false;
    
    files.forEach(file => {
        const existingIndex = projectFiles.findIndex(f => f.name === file.name);
        if (existingIndex !== -1) {
            if (file.isBinary) {
                projectFiles[existingIndex].url = file.url || file.path;
                projectFiles[existingIndex].previewUrl = file.previewUrl || null;
                projectFiles[existingIndex].previewUrls = file.previewUrls || null;
                changed = true;
            }
            return;
        }

        projectFiles.push({
            name: file.name,
            type: file.type || file.kind,
            url: file.url || file.path,
            previewUrl: file.previewUrl || null,
            previewUrls: file.previewUrls || null,
            isBinary: true
        });
        changed = true;
    });

    if (changed) {
        renderTabs();
        
        // ✅ حفظ التغييرات
        const conv = convs.find(c => c.id === activeId);
        if (conv) {
            saveConversationToServer(conv).catch(console.error);
        }
    }
}

function isDocumentFile(name) {
    return /\.(pdf|docx|pptx)$/i.test(name);
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
            // ✅ إذا كان الملف المفتوح هو نفسه، حدّث صفحة الكود
if (projectFiles[activeFileIndex]?.name === fileName) {
    codeArea.value = content;
    updateView();
}
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
    const sse = new EventSource(RENDER_SERVER_URL + '/api/events?clientId=' + myClientId);

    sse.onmessage = (e) => {
        try {
          console.log("STARTED (SSE) SUCCESSFULY")
            // تجاهل keep-alive
            if (!e.data || e.data.startsWith(':')) return;

            const payload = JSON.parse(e.data);
            console.log(payload)
            switch (payload.type) {
              case 'session_info':
                    currentStreamModel = payload.modelName;
                    console.log("ℹ️ Response generated by:", currentStreamModel);
                    break;
              
                case 'assistant_message':
                  if (payload.files && Array.isArray(payload.files)) {
                    handleIncomingFiles(payload.files);
                    }

                    handleAssistantMessage(payload);
                    break;
                    
                case 'file_created':
                if (payload.file) {
                    handleIncomingFiles([payload.file]);
                }
                    break;

                case 'frame':
                    updateGameFrame(payload.image);
                    break;
                    
                case 'conversation_summary':
                    handleConversationSummary(payload);
                    console.log("summary :", payload)
                     break;
                
                case 'thought_process':
                     currentThoughtText = payload.text;
    // إذا كانت الرسالة تُكتب حالياً، نظهر الزر فوراً
                     if (currentAiMsgElement) {
                      injectThoughtButton(currentAiMsgElement, currentThoughtText);
                        }
                        console.log("Analisis found", currentThoughtText)
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

/**
 * معالجة تحديث عنوان المحادثة من التلخيص التلقائي
 */
function handleConversationSummary(payload) {
    const { convId, summary } = payload;
    
    const conv = convs.find(c => c.id === convId);
    if (conv) {
        conv.title = summary;
        
        // ✅ حفظ على السيرفر
        saveConversationToServer(conv).catch(console.error);
        
        if (activeId === convId) {
            document.getElementById('topLogo').textContent = summary;
        }
        
        renderConversations();
    }
}

function handleStageUpdate(stage) {
  const text = `${stage.user}\n${stage.model}`;

  if (!currentAiMsgElement) {
    currentAiMsgElement = createAssistantMessage("");
  }

  animateReplaceText(currentAiMsgElement, text);
}

function handleAssistantMessage(payload) {
    // 1. تحديد المحادثة المستهدفة (التي بدأنا فيها التوليد)
    const targetConv = convs.find(c => c.id === streamingConvId);
    if (!targetConv) return;

    const isBackground = (activeId !== streamingConvId); // هل المستخدم في محادثة أخرى؟

    // 2. بداية الكتابة (Writing)
    if (
        safeBuffer.length === 0 &&
        payload.text &&
        payload.text !== '\n[STREAM COMPLETE]'
    ) {
        // إذا كنا في الخلفية، لا نغير الحالة البصرية
        if (!isBackground) {
            updateStatusText("Writing");

            if (!currentAiMsgElement) {
                const d = document.createElement('div');
                d.className = 'msg ai';

    d.style.flexDirection = 'column';
    
    
                   d.innerHTML = `
        <div class="msg-header">
            <div class="ai-avatar">></div>
        </div>
        <div class="ai-content"></div>
    `;
                messagesEl.insertBefore(d, currentStatusEl);
                currentAiMsgElement = d;
                currentTaskContainer = createTaskListContainer(d);
                // ✅ بدء المؤقت
                startTaskTimer();
                streamStarted = false;
                 if (currentThoughtText) {
        injectThoughtButton(d, currentThoughtText);
        currentTasks = { built: [], modified: [], deleted: [] };
        
        // تصفير المتغير لعدم تكراره في رسائل لاحقة بالخطأ
        currentThoughtText = null; 
    
}
            }
        }
    }
    if (payload.type === 'thought_process') {
  currentThoughtText = payload.text;
   if (activeId && streamingConvId === activeId) {
            const conv = convs.find(c => c.id === activeId);
            if (conv && conv.messages.length > 0) {
                const lastMessageIndex = conv.messages.length - 1;
                saveThoughtForMessage(activeId, lastMessageIndex, currentThoughtText);
            }
  }
  if (currentAiMsgElement) {
    injectThoughtButton(currentAiMsgElement, currentThoughtText);
  }
  return;
}

    // 3. عنصر احتياطي في حال ضاع المرجع
    if (!currentAiMsgElement && isStreaming && !isBackground) {
        const allMsgs = document.querySelectorAll('.msg.ai');
        if (allMsgs.length > 0) {
            currentAiMsgElement = allMsgs[allMsgs.length - 1];
        }
    }

    // 4. استقبال النص
    const isStage = payload.stage === true;
    const chunk = payload.text || "";
    
    // 5. معالجة النهاية
    if (payload.text === '\n[STREAM COMPLETE]') {
        serverFinished = true;
        
        if (currentTimerInterval) {
        clearInterval(currentTimerInterval);
        currentTimerInterval = null;
    }
    if (currentTaskContainer) {
        const elapsed = Math.floor((Date.now() - (currentTimerStartTime || Date.now())) / 1000);
        const timeSpan = currentTaskContainer.querySelector('.running-time');
        if (timeSpan) timeSpan.textContent = `Ran for ${elapsed}s`;
        const spinner = currentTaskContainer.querySelector('.spinner');
        if (spinner) spinner.style.display = 'none';
        const workingText = currentTaskContainer.querySelector('.timer-info span:nth-child(2)');
        if (workingText) workingText.textContent = 'Completed';
    }
        
        window.fastTyping = true;
        
        // تحديث آخر رسالة في المصفوفة
        const lastMsg = targetConv.messages[targetConv.messages.length - 1];
        if (lastMsg && lastMsg.role === 'ai') {
            lastMsg.text = safeBuffer;
            // استخراج الملفات من النص الكامل
            extractAndSyncFiles(safeBuffer);
        }

        // إذا كنا في الخلفية، نضع علامة "غير مقروء"
        if (isBackground) {
    targetConv.hasActivity = true;
    
    // ✅ حفظ النص المنقى فقط
    const lastMsg = targetConv.messages[targetConv.messages.length - 1];
    if (lastMsg && lastMsg.role === 'ai') {
        lastMsg.text = extractDisplayText(safeBuffer);
    }
    
    renderConversations();
    saveConversationToServer(targetConv).catch(console.error);
} else {
            // نحن في المحادثة الحالية
            if (typeQueue.length === 0) {
                finishMessageProcessing();
            }
        }
        
        // تنظيف المتغيرات
        streamingConvId = null;
        return;
    }

// 🔄 تحديث مرحلة (Analyzing / Thinking / Applying)
if (isStage && !isBackground) {
    isStageUpdate = true;

    const contentEl = currentAiMsgElement?.querySelector('.ai-content');
    const previousText = contentEl?.textContent || "";

    reverseDeleteViaQueue(previousText, () => {
        safeBuffer = "";
        streamCursor = 0;

        // اكتب stage الجديد حرفًا حرفًا
        for (let char of chunk) {
            typeQueue.push(char);
        }

        if (!typeTimeout) startTyping();
    });

    return;
}

// 🧹 إذا انتهت المراحل وبدأ الرد الحقيقي
if (isStageUpdate && !isStage) {
    isStageUpdate = false;

    const contentEl = currentAiMsgElement?.querySelector('.ai-content');
    const previousText = contentEl?.textContent || "";

    reverseDeleteViaQueue(previousText, () => {
        safeBuffer = "";
        streamCursor = 0;
    });
}

    // 6. إضافة النص للمخزن المؤقت
    safeBuffer += chunk;
   
    if (!isBackground && !isStage) {
        // ✅ أضف شرطاً إضافياً: تأكد أن النص يبدو كـ JSON صالح قبل المحاولة
        // يجب أن يبدأ بـ { وينتهي بـ } تقريباً
       const newTasks = extractTasksFromResponse(safeBuffer);
        // مقارنة مع currentTasks لتجنب التحديث غير الضروري
        if (JSON.stringify(newTasks) !== JSON.stringify(currentTasks)) {
            currentTasks = newTasks;
            updateTaskList(currentTasks);
        }
       
        const trimmed = safeBuffer.trim();
        if (trimmed.startsWith('{') && (trimmed.includes('"type"') || trimmed.includes('"document"'))) {
            // حاول العثور على JSON كامل، ليس مجرد جزء
            let jsonEndIndex = -1;
            let braceCount = 0;
            let inString = false;
            let escape = false;
            
            for (let i = 0; i < safeBuffer.length; i++) {
                const char = safeBuffer[i];
                
                if (escape) {
                    escape = false;
                    continue;
                }
                
                if (char === '\\') {
                    escape = true;
                    continue;
                }
                
                if (char === '"' && !escape) {
                    inString = !inString;
                    continue;
                }
                
                if (!inString) {
                    if (char === '{') braceCount++;
                    if (char === '}') {
                        braceCount--;
                        if (braceCount === 0) {
                            jsonEndIndex = i;
                            break;
                        }
                    }
                }
            }
            
            if (jsonEndIndex !== -1) {
                const jsonString = safeBuffer.substring(0, jsonEndIndex + 1);
                try {
                    const parsed = JSON.parse(jsonString);
                    // التأكد أن هذا JSON خاص بالمستندات
                    if (parsed.type === 'document' && parsed.document) {
                        console.log("📄 Detected document JSON in stream");
                        
                        // إيقاف الـ typing الحالي
                        if (typeTimeout) {
                            clearTimeout(typeTimeout);
                            typeTimeout = null;
                        }
                        
                        // إرسال user_message إذا موجود
                        if (parsed.user_message) {
                            if (currentAiMsgElement) {
                                const contentEl = currentAiMsgElement.querySelector('.ai-content');
                                if (contentEl) {
                                    contentEl.innerHTML = marked.parse(parsed.user_message);
                                }
                            }
                        }
                        
                        // معالجة المستند
                        if (parsed.document) {
                            handleIncomingFiles([{
                                name: parsed.document.file_name,
                                type: parsed.document.document_type,
                                url: `/generated/${parsed.document.file_name}`,
                                isBinary: true
                            }]);
                        }
                        
                        // إزالة JSON المعالج من safeBuffer
                        safeBuffer = safeBuffer.substring(jsonEndIndex + 1);
                        streamCursor = 0;
                        typeQueue = [];
                        
                        return;
                    }
                } catch (e) {
                    // ليس JSON صالح، نكمل بشكل طبيعي
                    console.log("Not a valid JSON document, continuing...");
                }
            }
        }
    }
    // 7. تحديث الملفات (يعمل في الخلفية والخلفية)
    processFilesUpdate(safeBuffer);

    // 8. تحديث الاتجاه للنص (فقط إذا كنا في المحادثة الحالية)
    if (!isBackground && currentAiMsgElement && !currentAiMsgElement._dirDetected && /[A-Za-z\u0600-\u06FF]/.test(safeBuffer)) {
        const { dir, lang } = detectTextDirection(safeBuffer);
        currentAiMsgElement.setAttribute('dir', dir);
        currentAiMsgElement.setAttribute('lang', lang);
        currentAiMsgElement.classList.add(dir);

        const contentEl = currentAiMsgElement.querySelector('.ai-content');
        if (contentEl) {
            contentEl.style.direction = dir;
            contentEl.style.textAlign = dir === 'rtl' ? 'right' : 'left';
            
        }
        currentAiMsgElement._dirDetected = true;
    }

    // 9. فصل النص للعرض في الشات (فقط إذا كنا في المحادثة الحالية)
    if (!isBackground) {
        let chatDisplay = safeBuffer;
        const tagIndex = safeBuffer.search(/<(FILE|REPLACE|ADD_TO)/);
        if (tagIndex !== -1) {
            chatDisplay = safeBuffer.substring(0, tagIndex);
        }

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
    } else {
        // إذا كنا في الخلفية، نحفظ فقط النص بدون عرض
        const lastMsg = targetConv.messages[targetConv.messages.length - 1];
        if (lastMsg && lastMsg.role === 'ai') {
            lastMsg.text = safeBuffer;
        }
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
    

    const consoleOutputView = document.getElementById('consoleOutputView');
    const btnToggleOutput = document.getElementById('btnToggleOutput');
    
    // دالة تجميع المشروع وتشغيل الكونسول - الإصدار النهائي// دالة تجميع المشروع وتشغيل الكونسول - الإصدار المصحح// دالة تجميع المشروع - الإصدار المحسن (Capture All Errors)
    
    // دالة تجميع المشروع وتشغيل الكونسول - الإصدار المحسن لالتقاط Syntax 
    function compileFullProject() {
    let htmlFile = projectFiles.find(f => f.name.endsWith('.html'));
    if (!htmlFile) htmlFile = projectFiles[0];
    
    let finalHtml = htmlFile.content;

    const svgFiles = projectFiles.filter(f => f.name.endsWith('.svg'));
    
    svgFiles.forEach(svgFile => {
        // 1. معالجة عناصر <object>
        const objectRegex = new RegExp(`<object[^>]*data=["']${svgFile.name}["'][^>]*>`, 'g');
        finalHtml = finalHtml.replace(objectRegex, () => {
            // دمج محتوى SVG مباشرة بدلاً من استخدام data
            return svgFile.content;
        });
        
        // 2. معالجة عناصر <use>
        const useRegex = new RegExp(`<use[^>]*xlink:href=["']${svgFile.name}(#[^"']*)["'][^>]*>`, 'g');
        finalHtml = finalHtml.replace(useRegex, () => {
            return svgFile.content;
        });
        
        // 3. معالجة عناصر <img>
        const imgRegex = new RegExp(`<img[^>]*src=["']${svgFile.name}["'][^>]*>`, 'g');
        finalHtml = finalHtml.replace(imgRegex, (match) => {
            // تحويل إلى Data URL للصور
            return match.replace(`src="${svgFile.name}"`, `src="data:image/svg+xml,${encodeURIComponent(svgFile.content)}"`);
        });
    });

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

// تنظيف URLs بعد تحميل الصفحة
    finalHtml += `
        <script>
            window.addEventListener('load', () => {
                // تنظيف Blob URLs بعد الاستخدام
                setTimeout(() => {
                    document.querySelectorAll('[src^="blob:"]').forEach(el => {
                        URL.revokeObjectURL(el.src);
                    });
                }, 1000);
            });
        </script>
    `;

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
    runFab.addEventListener('click', () => {
        // للمشاريع المتعددة (ويب)، نستخدم التجميع
        saveCurrentFile();
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
        // تبديل عرض الكونسول (إصلاح مشكلة عدم الظهور)
    btnToggleOutput.addEventListener('click', () => {
        const isActive = consoleOutputView.classList.toggle('active');
        
        if (isActive) {
            // إجبار الظهور بإلغاء الستايل المباشر الذي يضعه runCode
            consoleOutputView.style.display = 'block'; 
            
            // تنسيق الزر
            btnToggleOutput.style.background = 'var(--text-color)';
            btnToggleOutput.style.color = 'var(--bg-primary)';
        } else {
            consoleOutputView.style.display = 'none';
            
            // إعادة تنسيق الزر
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
               // --- الإضافة الجديدة: منطق الأخطاء ---
            if (data.level === 'error') {
                // 1. إظهار شريط التنبيه في المعاينة
                const errorBanner = document.getElementById('previewErrorBanner');
                if (errorBanner) {
                    errorBanner.style.display = 'flex';
                    // إضافة وميض للزر Output
                    const btnToggle = document.getElementById('btnToggleOutput');
                    btnToggle.style.borderColor = '#ff4444';
                }

                // 2. جعل الرسالة قابلة للنقر للربط
                div.title = "Click to attach this error to chat";
                div.onclick = () => attachErrorToChat(data.msg);
            }
            // ------------------------------------
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


// ==========================================
// منطق سحب صفحة الكود (Codezone) - المحسن (Direction Locking)
// ==========================================




let isCodeGestureDetermined = false; // هل تم تحديد نية المستخدم؟
let isCodeVerticalScroll = false;    // هل المستخدم يقوم بسكرول عمودي؟



// 1. عند لمس الشاشة
document.addEventListener('touchstart', e => {
    // إذا كانت القائمة الجانبية مفتوحة، لا تتدخل
    if (menuPanel.classList.contains('open')) return;

    // تسجيل نقاط البداية
    codeStartX = e.touches[0].clientX;
    codeStartY = e.touches[0].clientY;

    // إعادة تعيين المتغيرات
    isDraggingCodezone = true; // مبدئياً نفترض أنه قد يسحب
    hasMoved = false;
    isCodeGestureDetermined = false; 
    isCodeVerticalScroll = false;

    codezone.style.transition = 'none';
}, { passive: true });

// 2. أثناء التحريك
document.addEventListener('touchmove', e => {
    // التحقق إذا كانت صفحة الكود مفتوحة بالفعل (لمنع التداخل)
    const isCodePageOpen = codezone.classList.contains('open'); 
    if (isCodePageOpen) return; 

    if (!isDraggingCodezone) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - codeStartX;
    const diffY = currentY - codeStartY;

    // --- مرحلة تحديد الاتجاه (Direction Locking) ---
    if (!isCodeGestureDetermined) {
        // ننتظر حركة بسيطة (10 بكسل) لنقرر
        if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
            isCodeGestureDetermined = true;

            // إذا كانت الحركة الرأسية أكبر من الأفقية، فهذا "سكرول" وليس سحب
            if (Math.abs(diffY) > Math.abs(diffX)) {
                isCodeVerticalScroll = true;
                isDraggingCodezone = false; // إلغاء السحب فوراً
                codezone.style.transform = ''; // إعادة الكود لمكانه
                return; // السماح للمتصفح بعمل السكرول الطبيعي
            }
        } else {
            // لم يتحرك الإصبع مسافة كافية للقرار بعد
            return;
        }
    }

    // إذا تم تحديد أن المستخدم يريد السكرول للأسفل/للأعلى، نخرج ولا نفعل شيئاً
    if (isCodeVerticalScroll) return;

    // --- هنا يبدأ السحب الفعلي لصفحة الكود ---
    
    // منع السكرول العمودي للصفحة أثناء سحب الكود أفقياً
    if (e.cancelable) e.preventDefault(); 

    hasMoved = true;

    // حساب الموقع: نسمح بالسحب لليسار فقط (قيم سالبة)
    // Math.min(0, ...) تمنع السحب لليمين
    codeDragX = Math.min(0, Math.max(-CODEZONE_WIDTH, diffX));
    
    codezone.style.transform = `translateX(${codeDragX}px)`;
    
}, { passive: false }); // passive: false مهمة لعمل preventDefault

// 3. عند رفع الإصبع
document.addEventListener('touchend', () => {
    if (!isDraggingCodezone) return;

    isDraggingCodezone = false;
    codezone.style.transition = ''; // استرجاع الأنميشن للإغلاق/الفتح السلس

    // إذا تم اعتبارها سكرول عمودي أو لم يتحرك، لا نفعل شيئاً
    if (isCodeVerticalScroll || !hasMoved) {
        codeDragX = 0;
        return;
    }

    // منطق الفتح/الإغلاق بناءً على مسافة السحب
    // إذا سحب أكثر من ثلث الشاشة (للتسهيل)
    if (Math.abs(codeDragX) > CODEZONE_WIDTH / 3) {
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
    resetMenuGesture();
});





// تعريف العناصر
const btnRunOptions = document.getElementById('btnRunOptions');
const runSettingsModal = document.getElementById('runSettingsModal');

// التحقق من وجود العناصر
if (btnRunOptions && runSettingsModal) {
    btnRunOptions.addEventListener('click', (e) => {
        // 1. منع انتشار النقرة
        e.stopPropagation();
        e.preventDefault();

        // 2. إظهار المودال (نفس منطق باقي المودالات في ملفك)
        runSettingsModal.style.display = 'flex';
        
        // 3. إضافة كلاس التفعيل بعد لحظة بسيطة للأنيميشن
        setTimeout(() => {
            runSettingsModal.classList.add('active');
        }, 10);
    });
}

// كود لإغلاق المودال عند النقر خارج الصندوق (اختياري ولكنه مفيد)
if (runSettingsModal) {
    runSettingsModal.addEventListener('click', (e) => {
        if (e.target === runSettingsModal) {
            runSettingsModal.classList.remove('active');
            setTimeout(() => {
                runSettingsModal.style.display = 'none';
            }, 300);
        }
    });
}


// أحداث اللمس (Touch Events)
// متغيرات لتحديد اتجاه السحب


// متغيرات لتحديد اتجاه السحب


document.addEventListener('touchstart', e => {
    if (menuPanel.classList.contains('open')) return;
    
    startX = e.touches[0].clientX;
    menuStartY = e.touches[0].clientY; // تسجيل نقطة البداية الرأسية
    isDragging = false;
    isVerticalScroll = false;
    isGestureDetermined = false; // إعادة ضبط الحالة
    
    menuPanel.style.transition = 'none';
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - startX;
    const deltaY = currentY - menuStartY;

    // تحديد الاتجاه في أول 10 بكسل من الحركة
    if (!isGestureDetermined) {
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
            // إذا كانت الحركة الرأسية أكبر من الأفقية، نعتبرها سكرول عامودي
            if (Math.abs(deltaY) > Math.abs(deltaX)) {
                isVerticalScroll = true;
            }
            isGestureDetermined = true;
        }
    }

    // إذا تم تحديد أنه سكرول عامودي، لا نفعل شيئاً ونسمح بالمتصفح بالتحرك
    if (isVerticalScroll) return;

    // إذا وصلنا هنا، يعني السحب أفقي (فتح القائمة)
    if (deltaX > 0 && !menuPanel.classList.contains('open')) {
        isDragging = true;
        let newTranslateX = Math.max(0, Math.min(deltaX, sideMenuWidth));
        menuPanel.style.transform = `translateX(${newTranslateX}px)`;
        updateOverlayOpacity(newTranslateX / sideMenuWidth);
        
        // منع المتصفح من السكرول العامودي أثناء سحب القائمة
        if (e.cancelable) e.preventDefault();
    }
}, { passive: false });


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
    resetCodezoneDragState() 
});

// نظام تاريخ التغييرات
let historyStack = [];
let redoStack = [];
const MAX_HISTORY = 50;

// دالة لحفظ الحالة الحالية قبل التغيير
function saveHistory() {
    const currentContent = codeArea.value;
    if (historyStack.length === 0 || historyStack[historyStack.length - 1] !== currentContent) {
        historyStack.push(currentContent);
        if (historyStack.length > MAX_HISTORY) historyStack.shift();
        redoStack = []; // مسح سجل الإعادة عند حدوث تغيير جديد
    }
}

// تنفيذ التراجع
document.getElementById('btnUndo').addEventListener('click', () => {
    if (historyStack.length > 1) {
        redoStack.push(historyStack.pop());
        const targetContent = historyStack[historyStack.length - 1];
        codeArea.value = targetContent;
        projectFiles[activeFileIndex].content = targetContent;
        updateView();
    }
});

// تنفيذ الإعادة
document.getElementById('btnRedo').addEventListener('click', () => {
    if (redoStack.length > 0) {
        const targetContent = redoStack.pop();
        historyStack.push(targetContent);
        codeArea.value = targetContent;
        projectFiles[activeFileIndex].content = targetContent;
        updateView();
    }
});

// تعديل مستمع الـ input الحالي ليقوم بحفظ التاريخ
codeArea.addEventListener('input', () => {
    // ... (كودك الحالي لتحديث projectFiles)
    
    clearTimeout(saveStateTimeout);
    saveStateTimeout = setTimeout(() => {
        saveHistory(); // حفظ في التاريخ بعد توقف الكتابة
        // ... (باقي كود الحفظ التلقائي)
    }, 1000);
});

// حفظ الحالة الأولية عند تحميل الملف
setTimeout(saveHistory, 500);

    
    checkInputState();

setTimeout(() => {
    applyFontSize();
}, 100);


// ==================== Voice Recording ====================


let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let recordTimer;
let recordSeconds = 0;

// عدّاد بالمنتصف
const recordOverlay = document.createElement('div');
recordOverlay.style.cssText = `
position:absolute;
inset:0;
display:none;
align-items:center;
justify-content:center;
font-size:18px;
font-family:monospace;
color:white;
pointer-events:none;
`;
document.querySelector('.input-wrapper').appendChild(recordOverlay);

function animateButtonTransition(button, newMode) {
    console.log('✅ animateButtonTransition is called!', new Date().toLocaleTimeString());
    
    // حفظ الأيقونات المناسبة للوضع الجديد
    const newIcon = newMode === 'send' ? sendIconTpl.innerHTML : micIconTpl.innerHTML;
    
    // إضافة كلاس الأنميشن
    button.classList.add('btn-pop-animation');
    
    // تغيير الأيقونة في منتصف الأنميشن (بعد 150ms من أصل 300ms)
    setTimeout(() => {
        console.log('🔄 Changing icon at middle of animation');
        button.innerHTML = newIcon;
    }, 150);
    
    // إزالة كلاس الأنميشن بعد انتهائه
    setTimeout(() => {
        console.log('❌ Removing animation class');
        button.classList.remove('btn-pop-animation');
    }, 300);
}

// أضف هذا المتغير العام مع باقي المتغيرات في الأعلى
let lastButtonMode = 'mic'; // أو القيمة الافتراضية

function updateSendButton() {
    const hasText = inputEl.value.trim() !== '';
    let newMode = '';
    
    console.log('--- updateSendButton ---');
    console.log('hasText:', hasText);
    console.log('isSending:', isSending);
    console.log('isRecording:', isRecording);
    console.log('lastButtonMode:', lastButtonMode);
    
    if (hasText && !isSending) {
        newMode = 'send';
        sendBtn.disabled = false;
        sendBtn.classList.remove('disabled');
        // لا نغير الأيقونة هنا، ستتغير في منتصف الأنميشن
        console.log('Setting mode to: send');
        
    } else if (!hasText && allowMicWhenEmpty && !isRecording && !isSending) {
        newMode = 'mic';
        sendBtn.disabled = false;
        sendBtn.classList.remove('disabled');
        // لا نغير الأيقونة هنا، ستتغير في منتصف الأنميشن
        console.log('Setting mode to: mic');
        
    } else {
        newMode = 'disabled';
        sendBtn.disabled = true;
        sendBtn.classList.add('disabled');
        // في حالة disabled نغير الأيقونة فوراً (لأنه لا يوجد أنميشن)
        if (lastButtonMode !== newMode) {
            sendBtn.innerHTML = ''; // أو أيقونة معطلة إذا وجدت
        }
        console.log('Setting mode to: disabled');
    }
    
    // تشغيل الأنميشن فقط إذا تغير الوضع فعلاً (باستخدام lastButtonMode)
    if (lastButtonMode !== newMode && newMode !== 'disabled') {
        console.log('🎬 Mode changed from', lastButtonMode, 'to', newMode, '! Playing animation...');
        animateButtonTransition(sendBtn, newMode);
    } else {
        console.log('No mode change or disabled state');
    }
    
    // تحديث الوضعين
    if (newMode !== 'disabled') {
        sendBtn.dataset.mode = newMode;
        lastButtonMode = newMode; // تحديث المتغير العام
    }
}
updateSendButton();

inputEl.addEventListener('input', updateSendButton);

// ضغط مطوّل
sendBtn.addEventListener('mousedown', startRecording);
sendBtn.addEventListener('touchstart', startRecording);

sendBtn.addEventListener('mouseup', stopRecording);
sendBtn.addEventListener('mouseleave', stopRecording);
sendBtn.addEventListener('touchend', stopRecording);

function animateWaves() {
  if (!analyser || !waveData) return;

  analyser.getByteFrequencyData(waveData);

  const bars = document.querySelectorAll('#audio-waves span');
  bars.forEach((bar, i) => {
    const v = waveData[i] || 0;
    bar.style.height = `${Math.max(6, v / 2)}px`;
  });

  waveRAF = requestAnimationFrame(animateWaves);
}

async function startRecording(e) {
  if (inputEl.value.trim() !== '' || isRecording) return;

  e.preventDefault();
  isRecording = true;

  recordSeconds = 0;
  recordOverlay.textContent = '0:00';
  recordOverlay.style.display = 'flex';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // تحديد الصيغة المناسبة للمتصفح تلقائياً
    let mimeType = "";
    const types = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4", // ضروري للآيفون
        "audio/aac",
        "audio/ogg"
    ];

    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            mimeType = type;
            break;
        }
    }

    if (!mimeType) {
        alert("المتصفح لا يدعم تسجيل الصوت!");
        return;
    }

    // إعداد المسجل بالصيغة المدعومة
    mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
    mediaRecorder.stream = stream; // حفظ الستريم لإغلاقه لاحقاً
    audioChunks = [];

    mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) {
            audioChunks.push(e.data);
        }
    };

    mediaRecorder.start();
    
    // تحديث الواجهة
    isRecording = true;
    recordSeconds = 0;
    recordOverlay.textContent = '0:00';
    recordOverlay.style.display = 'flex';

    // === تشغيل الموجات الصوتية (visualizer) ===
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    try {
        sourceNode = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 32;
        waveData = new Uint8Array(analyser.frequencyBinCount);
        sourceNode.connect(analyser);
        
        const wavesEl = document.getElementById('audio-waves');
        if (wavesEl) wavesEl.classList.remove('hidden');
        
        animateWaves();
    } catch (waveErr) {
        console.warn("Wave error:", waveErr);
    }

    // بدء المؤقت
    recordTimer = setInterval(() => {
      recordSeconds++;
      recordOverlay.textContent =
        `${Math.floor(recordSeconds / 60)}:${String(recordSeconds % 60).padStart(2,'0')}`;
    }, 1000);

  } catch (err) {
    // هذا التنبيه سيظهر لك سبب المشكلة الحقيقي
    alert("خطأ في بدء المايكروفون: " + err.message);
    isRecording = false;
  }
}

function stopRecording() {
  if (!isRecording || !mediaRecorder) return;
  isRecording = false;

  // تنظيف الواجهة والمؤقتات
  clearInterval(recordTimer);
  if (recordOverlay) recordOverlay.style.display = 'none';
  if (waveRAF) cancelAnimationFrame(waveRAF);
  
  const wavesEl = document.getElementById('audio-waves');
  if (wavesEl) wavesEl.classList.add('hidden');

  if (audioContext) {
    audioContext.close().catch(console.error);
    audioContext = null;
  }

  // التأكد من إيقاف المسجل بشكل صحيح
  if (mediaRecorder.state !== 'inactive') {
    mediaRecorder.onstop = () => {
      // إنشاء Blob بالصيغة التي تم استخدامها
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      audioChunks = [];
      
      // إرسال الصوت
      sendAudio(blob).catch(err => {
        alert("فشل الإرسال: " + err.message);
      });

      // إغلاق المايكروفون تماماً (إطفاء النقطة البرتقالية/الخضراء)
      if (mediaRecorder.stream) {
          mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
    };

    mediaRecorder.stop();
  } else {
      // تنظيف احتياطي
      if (mediaRecorder.stream) {
          mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
  }
}

// إرسال الصوت
async function sendAudio(blob) {
  // تغيير حالة الزر ليدل على الإرسال
  const sendBtn = document.getElementById('sendBtn');
  const originalContent = sendBtn.innerHTML;
  sendBtn.disabled = true;

  try {
      const fd = new FormData();
      // نحدد الامتداد بناء على نوع الملف، الآيفون يحتاج mp4 أحياناً
      const mimeToExt = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/aac': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
};
const blobMime = blob.type.split(';')[0]; // إزالة codecs إن وجدت
const ext = mimeToExt[blobMime] || 'webm';
      fd.append('audio', blob, `voice.${ext}`);

      const res = await fetch(RENDER_SERVER_URL + '/api/stt', {
        method: 'POST',
        body: fd
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Server Error: ${res.status} - ${errText}`);
      }

      const data = await res.json();

      if (data.text && data.text.trim()) {
        inputEl.value = data.text;
        isSending = false;
        updateSendButton();
        sendMessage(data.text);
      } else {
          alert("لم يتم التعرف على الصوت، حاول مرة أخرى.");
      }

  } catch (err) {
      alert("خطأ في الاتصال بالسيرفر: " + err.message);
  } finally {
      // إعادة الزر لوضعه الطبيعي
      sendBtn.innerHTML = originalContent;
      sendBtn.disabled = false;
      updateSendButton();
  }
}

// في نهاية DOMContentLoaded
(async function init() {
    // تحميل المحادثات من السيرفر
    await loadConversations();
    
    // إذا كانت هناك محادثة نشطة، عرضها
    if (activeId) {
        const conv = convs.find(c => c.id === activeId);
        if (conv) {
            const fullConv = await fetchConversationFromServer(activeId);
            if (fullConv) {
                conv.messages = fullConv.messages;
                conv.files = fullConv.files;
                projectFiles = conv.files;
                renderTabs();
                renderMessages();
            }
        }
    }
    
    // تطبيق الإعدادات
    applySettings();
    checkInputState();
})();
// في نهاية DOMContentLoaded، أضف هذا للاختبار
setTimeout(() => {
    const settingsAvatar = document.querySelector('.account-settings-avatar-circle');
    console.log('Settings avatar found:', settingsAvatar);
    if (settingsAvatar && !settingsAvatar._bound) {
        console.log('Binding avatar click...');
        settingsAvatar._bound = true;
        settingsAvatar.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('Avatar clicked! Opening popover...');
            openAvatarColorPopover(settingsAvatar, e);
        });
    }
}, 1000);
}); //DOM CLOSING

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        
        const updateBanner = document.getElementById('update-banner');
        const reloadButton = document.getElementById('reload-app-btn');
        // قم بتغيير 'send-button-id' إلى الـ ID الحقيقي لزر الإرسال لديك
        const sendBtn = document.getElementById('sendBtn'); 
        
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
