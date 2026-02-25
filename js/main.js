/* =========================================================================
   EnglishHub Pro - 核心管家模块 (js/main.js)
   负责：全局变量、账号管理、数据持久化、页面路由、通用工具
   ========================================================================= */

// 1. 全局状态与数据库声明 (所有模块共享)
window.GameState = window.GameState || {};

// 用户与系统核心
let siteStats = JSON.parse(localStorage.getItem('eh_site_stats')) || { pv: 0 };
const GUEST_TRIAL_MS = 7 * 24 * 60 * 60 * 1000;
const USER_TRIAL_MS = 30 * 24 * 60 * 60 * 1000;
let usersDB = JSON.parse(localStorage.getItem('eh_users_db')) || [];
let currentUser = JSON.parse(localStorage.getItem('eh_current_user')) || null;
let selectedRegRole = 'student';
let messagesDB = JSON.parse(localStorage.getItem('eh_messages_db')) || [];

// 业务数据核心
let defaultNotebook = [
    {word:'perspective', cn:'观点', en:'A particular way of considering something.', id:1},
    {word:'efficient', cn:'高效的', en:'Working or operating quickly.', id:2},
    {word:'dynamic', cn:'动态的', en:'Characterized by constant change.', id:3},
    {word:'magnificent', cn:'壮丽的', en:'Impressively beautiful.', id:4},
    {word:'challenge', cn:'挑战', en:'A call to take part in a contest.', id:5}
];
let notebook = [], library = [], bookshelf = [], listenErrors = [];
let gameHistory = [], readHistory = [], audioProgress = {};
let srsPlan = [], currentSRSQueue = [], currentSRSIndex = 0;
const SRS_INTERVALS = [ 12*3600*1000, 24*3600*1000, 3*24*3600*1000, 7*24*3600*1000, 14*24*3600*1000 ];

// 临时状态变量
let curBookIdx = -1;
let currentGameType = ''; 
let currentGameMode = 'lib';
let currentResetCode = ''; 
let currentResetEmail = '';
let currentChatMsgId = null;

// =========================================================================
// 2. 数据持久化与加载引擎
// =========================================================================
function getPrefix() { return currentUser ? `eh_u_${currentUser.id}_` : `eh_guest_`; }

function recordPV() {
    siteStats.pv++;
    localStorage.setItem('eh_site_stats', JSON.stringify(siteStats));
}

function loadUserData() {
    let prefix = getPrefix();
    if(!currentUser) {
        notebook = JSON.parse(localStorage.getItem(prefix+'nb')) || JSON.parse(localStorage.getItem('eh_pro_nb_data')) || defaultNotebook.slice();
        library = JSON.parse(localStorage.getItem(prefix+'lib')) || JSON.parse(localStorage.getItem('eh_pro_lib_data')) || [];
        bookshelf = JSON.parse(localStorage.getItem(prefix+'bs')) || JSON.parse(localStorage.getItem('eh_pro_bs_data')) || [];
        listenErrors = JSON.parse(localStorage.getItem(prefix+'l_err')) || JSON.parse(localStorage.getItem('eh_pro_listen_errors')) || [];
        srsPlan = JSON.parse(localStorage.getItem(prefix+'srs_plan')) || [];
    } else {
        notebook = JSON.parse(localStorage.getItem(prefix+'nb')) || defaultNotebook.slice();
        library = JSON.parse(localStorage.getItem(prefix+'lib')) || [];
        bookshelf = JSON.parse(localStorage.getItem(prefix+'bs')) || [];
        listenErrors = JSON.parse(localStorage.getItem(prefix+'l_err')) || [];
        srsPlan = JSON.parse(localStorage.getItem(prefix+'srs_plan')) || [];
    }
    
    if (!Array.isArray(notebook)) notebook = defaultNotebook.slice();
    if (notebook.length < 5) {
        let missingCount = 5 - notebook.length;
        notebook = notebook.concat(defaultNotebook.slice(0, missingCount));
    }

    gameHistory = JSON.parse(localStorage.getItem(prefix+'g_hist')) || [];
    readHistory = JSON.parse(localStorage.getItem(prefix+'r_hist')) || [];
    audioProgress = JSON.parse(localStorage.getItem(prefix+'a_prog')) || {};
}

function saveUserData() { 
    try {
        let prefix = getPrefix();
        localStorage.setItem(prefix+'nb', JSON.stringify(notebook)); 
        localStorage.setItem(prefix+'lib', JSON.stringify(library)); 
        localStorage.setItem(prefix+'bs', JSON.stringify(bookshelf)); 
        localStorage.setItem(prefix+'l_err', JSON.stringify(listenErrors)); 
        localStorage.setItem(prefix+'g_hist', JSON.stringify(gameHistory)); 
        localStorage.setItem(prefix+'r_hist', JSON.stringify(readHistory)); 
        localStorage.setItem(prefix+'a_prog', JSON.stringify(audioProgress)); 
        localStorage.setItem(prefix+'srs_plan', JSON.stringify(srsPlan)); 
    } catch(e) {}
}

function syncDataLive() { 
    loadUserData(); 
    updateBadges(); 
}

// =========================================================================
// 3. 身份验证与权限网关
// =========================================================================
function initAuth() { 
    if (!usersDB.find(u => u.role === 'admin')) {
        usersDB.push({ id: 'admin_0', email: 'admin', password: 'admin', role: 'admin', nickname: '系统超级管理员', avatar: '👑', expireAt: 9999999999999 });
        localStorage.setItem('eh_users_db', JSON.stringify(usersDB));
    }
    messagesDB.forEach(m => {
        if(!m.replies) m.replies = [];
        if(m.unreadAdmin === undefined) m.unreadAdmin = false;
        if(m.unreadUser === undefined) m.unreadUser = false;
        if(!m.status) m.status = 'open';
    });
    localStorage.setItem('eh_messages_db', JSON.stringify(messagesDB));

    renderUserNav(); 
    loadUserData(); 
    if(typeof renderMessages === 'function') renderMessages(); 
    updateBadges();
}

function requireAuth() {
    if (!currentUser) {
        document.getElementById('auth-prompt-msg').classList.remove('hidden');
        switchAuthTab('login'); openModal('modal-auth');
        return false;
    }
    if (currentUser.role !== 'admin' && currentUser.expireAt && Date.now() > currentUser.expireAt) {
        alert("⛔ 您的体验期已结束！请联系管理员充值或延长权限。");
        currentUser = null; localStorage.removeItem('eh_current_user');
        renderUserNav(); switchAuthTab('login'); openModal('modal-auth');
        return false;
    }
    return true;
}

function checkGuestTrial() {
    let guestInit = localStorage.getItem('eh_guest_used_time');
    if (guestInit && Date.now() - parseInt(guestInit) > GUEST_TRIAL_MS) return false;
    return true;
}

function guestLogin() {
    let guestInit = localStorage.getItem('eh_guest_used_time');
    if(guestInit) {
        if(Date.now() - parseInt(guestInit) > GUEST_TRIAL_MS) {
            alert("⛔ 此设备的 7 天游客免费体验期已结束！\n请注册正式账号以继续使用。"); return;
        }
    } else {
        localStorage.setItem('eh_guest_used_time', Date.now());
        guestInit = Date.now();
    }
    currentUser = {
        id: 'guest_' + Date.now(), email: 'guest', password: '', role: 'guest',
        nickname: '游客体验官', avatar: '👀', expireAt: parseInt(guestInit) + GUEST_TRIAL_MS
    };
    localStorage.setItem('eh_current_user', JSON.stringify(currentUser));
    document.getElementById('auth-prompt-msg').classList.add('hidden');
    closeModals(); renderUserNav(); loadUserData(); updateBadges(); showPage('home');
    alert("🎉 游客登录成功！您享有 7 天全功能免费体验。");
}

function doLogout() {
    if(confirm("确定要退出当前账号吗？")) { 
        currentUser = null; 
        localStorage.removeItem('eh_current_user'); 
        loadUserData(); 
        updateBadges(); 
        showPage('home'); 
        renderUserNav(); 
    }
}

// =========================================================================
// 4. 路由系统 (页面切换)
// =========================================================================
function showPage(id) {
    try {
        let blockNav = false;
        if (currentUser) {
            if (currentUser.role !== 'admin' && currentUser.expireAt && Date.now() > currentUser.expireAt) {
                alert("⛔ 您的体验期已结束，系统已自动登出。\n请联系管理员延长权限。");
                currentUser = null; localStorage.removeItem('eh_current_user'); loadUserData(); renderUserNav(); openModal('modal-auth'); blockNav = true;
            }
        } else {
            if (!checkGuestTrial()) {
                if (id !== 'home') { alert("⛔ 您的7天游客免费体验期已结束！\n请注册或登录账号以继续使用。"); openModal('modal-auth'); blockNav = true; } 
                else { openModal('modal-auth'); }
            }
        }
        if (blockNav && id !== 'home') id = 'home'; 

        recordPV(); 
        syncDataLive(); 
        let views = document.querySelectorAll('.view'); for(let i=0; i<views.length; i++) { views[i].classList.add('hidden'); }
        let navs = document.querySelectorAll('.nav-item'); for(let i=0; i<navs.length; i++) { navs[i].classList.remove('active'); }
        let targetView = document.getElementById('p-' + id); if(targetView) { targetView.classList.remove('hidden'); }
        let navPrefix = id.split('-')[0]; let navEl = document.getElementById('nav-' + navPrefix); if(navEl) { navEl.classList.add('active'); }
        
        // 跨模块调用 (利用 JS 晚绑定的特性，即使在其他文件也不报错)
        if(id === 'vocab-nb' && typeof renderNB === 'function') renderNB();
        if(id === 'vocab-bs' && typeof renderBS === 'function') renderBS();
        if(id === 'vocab-srs' && typeof renderVocabSRS === 'function') renderVocabSRS();
        if(id === 'read-library' && typeof renderLibrary === 'function') renderLibrary();
        if(id === 'listen-main' && typeof renderListenErrors === 'function') renderListenErrors(); 
        if(id === 'profile' && typeof renderProfileData === 'function') renderProfileData(); 
        if(id === 'admin' && typeof renderAdminPanel === 'function') renderAdminPanel(); 
        
        window.scrollTo(0, 0); 
    } catch(e) { console.error(e); }
}

// =========================================================================
// 5. 通用 UI 交互 (弹窗、红点、TTS)
// =========================================================================
function openModal(id) { let modal = document.getElementById(id); if(modal) modal.style.display = 'flex'; }
function closeModals() { let overlays = document.querySelectorAll('.modal-overlay'); for(let i=0; i<overlays.length; i++) overlays[i].style.display = 'none'; }
function speak(t) { try { window.speechSynthesis.speak(new SpeechSynthesisUtterance(t)); } catch(e) {} }

function updateBadges() {
    if (!currentUser) return;
    let adminBadge = document.getElementById('admin-notif-badge');
    let userBadge = document.getElementById('notif-badge');
    
    if(currentUser.role === 'admin') {
        let unreadCount = messagesDB.filter(m => m.unreadAdmin).length;
        if(adminBadge) { adminBadge.innerText = unreadCount; if(unreadCount > 0) adminBadge.classList.remove('hidden'); else adminBadge.classList.add('hidden'); }
    } else {
        let unreadCount = messagesDB.filter(m => m.uid === currentUser.id && m.unreadUser).length;
        let navNotif = document.getElementById('nav-notif'); if(navNotif) navNotif.style.display = 'block';
        if(userBadge) { userBadge.innerText = unreadCount; if(unreadCount > 0) userBadge.classList.remove('hidden'); else userBadge.classList.add('hidden'); }
    }
}

// =========================================================================
// 6. 通用工具：AI 翻译及音标获取
// =========================================================================
async function fetchInfo(word) { 
    try { 
        let d_res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`); let d = await d_res.json();
        let t_res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${word}`); let t = await t_res.json();
        let rawCnTrans = t[0][0][0] || ''; let cleanCn = rawCnTrans.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
        const isOk = Array.isArray(d); let phoneticSymbol = '';
        if (isOk) { if (d[0].phonetic) { phoneticSymbol = d[0].phonetic; } else if (d[0].phonetics && d[0].phonetics.length > 0) { let pObj = d[0].phonetics.find(p => p.text); if (pObj) phoneticSymbol = pObj.text; } }
        return { word: word, phonetic: phoneticSymbol, cn: cleanCn || '暂无翻译', en: isOk && d[0].meanings[0] && d[0].meanings[0].definitions[0] ? d[0].meanings[0].definitions[0].definition : '', id: Date.now() + Math.random() }; 
    } catch(e) { return { word: word, cn: '解析失败，请手动修改', en: '', phonetic: '', id: Date.now() }; } 
}

// 将某些核心函数挂载到 window，防止内联 onclick 找不到
window.showPage = showPage;
window.openModal = openModal;
window.closeModals = closeModals;
window.requireAuth = requireAuth;
window.speak = speak;
window.fetchInfo = fetchInfo;
window.saveUserData = saveUserData;
window.syncDataLive = syncDataLive;