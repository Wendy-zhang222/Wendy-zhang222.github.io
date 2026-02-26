// js/core.js
// =========================================================================
// 【核心一】全局初始化与对象池声明
// =========================================================================
window.GameState = window.GameState || {};

let curBookIdx = -1;
let score = 0;
let gameTimers = [];      
let selectedCards = [];   
let flippedCards = [];    

let siteStats = JSON.parse(localStorage.getItem('eh_site_stats')) || { pv: 0 };
function recordPV() {
    siteStats.pv++;
    localStorage.setItem('eh_site_stats', JSON.stringify(siteStats));
}

// 全局系统公告 & B站专栏数据
let sysAnnouncement = localStorage.getItem('eh_sys_announcement') || "";
let bilibiliLinks = JSON.parse(localStorage.getItem('eh_bili_links')) || [];

const GUEST_TRIAL_MS = 7 * 24 * 60 * 60 * 1000;
const USER_TRIAL_MS = 30 * 24 * 60 * 60 * 1000;

let usersDB = JSON.parse(localStorage.getItem('eh_users_db')) || [];
let currentUser = JSON.parse(localStorage.getItem('eh_current_user')) || null;
let selectedRegRole = 'student';

let defaultNotebook = [
    {word:'perspective', cn:'观点', en:'A particular way of considering something.', id:1},
    {word:'efficient', cn:'高效的', en:'Working or operating quickly.', id:2},
    {word:'dynamic', cn:'动态的', en:'Characterized by constant change.', id:3},
    {word:'magnificent', cn:'壮丽的', en:'Impressively beautiful.', id:4},
    {word:'challenge', cn:'挑战', en:'A call to take part in a contest.', id:5}
];

let notebook = [], library = [], bookshelf = [], listenErrors = [];
let gameHistory = [], readHistory = [], audioProgress = {};
let messagesDB = JSON.parse(localStorage.getItem('eh_messages_db')) || [];

let srsPlan = [], currentSRSQueue = [], currentSRSIndex = 0;
const SRS_INTERVALS = [ 12*3600*1000, 24*3600*1000, 3*24*3600*1000, 7*24*3600*1000, 14*24*3600*1000 ];

let currentGameType = ''; 
let currentGameMode = 'lib';
let currentResetCode = ''; 
let currentResetEmail = '';

let parsedClozeAnswers = [], clozeRawText = '', parsedListeningQuiz = [];
let correctSortOrder = [], currentSortOrder = [], draggedSortIndex = null;
let mediaRecorder, audioChunks = [], parsedSubtitles = []; 
let currentAudioFileName = "", lastSaveTime = 0, currentChatMsgId = null;

function getPrefix(uid) { return uid ? `eh_u_${uid}_` : (currentUser ? `eh_u_${currentUser.id}_` : `eh_guest_`); }

// =========================================================================
// 【核心二】数据加载与存储隔离
// =========================================================================
function loadUserData() {
    let prefix = getPrefix();
    notebook = JSON.parse(localStorage.getItem(prefix+'nb')) || defaultNotebook.slice();
    library = JSON.parse(localStorage.getItem(prefix+'lib')) || [];
    bookshelf = JSON.parse(localStorage.getItem(prefix+'bs')) || [];
    listenErrors = JSON.parse(localStorage.getItem(prefix+'l_err')) || [];
    srsPlan = JSON.parse(localStorage.getItem(prefix+'srs_plan')) || [];
    
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
function saveData() { saveUserData(); }
function syncDataLive() { loadUserData(); updateBadges(); renderSysAnnouncement(); renderBiliHome(); }

// =========================================================================
// B站专栏动态渲染逻辑 (与留言板完美并列，支持响应式布局)
// =========================================================================
function renderBiliHome() {
    let pHome = document.getElementById('p-home');
    if (!pHome) return;
    
    let msgBoard = pHome.querySelector('.msg-board');
    if (!msgBoard) return;

    // 1. 动态创建一个并列的父容器 (Flexbox 布局)
    let bottomWrapper = document.getElementById('home-bottom-wrapper');
    if (!bottomWrapper) {
        bottomWrapper = document.createElement('div');
        bottomWrapper.id = 'home-bottom-wrapper';
        // 核心 CSS：电脑端并排，手机端宽度不足时自动折叠为上下排列
        bottomWrapper.style.cssText = 'display: flex; flex-wrap: wrap; gap: 30px; align-items: flex-start; margin-top: 40px;';
        
        // 把容器插到留言板原来的位置，并把留言板移入容器内
        pHome.insertBefore(bottomWrapper, msgBoard);
        bottomWrapper.appendChild(msgBoard);
        
        // 调整留言板样式以适配双栏
        msgBoard.style.flex = '1 1 400px'; 
        msgBoard.style.marginTop = '0';
    }
    
    // 2. 动态创建 B站专栏 容器
    let biliContainer = document.getElementById('bili-home-container');
    if (!biliContainer) {
        biliContainer = document.createElement('div');
        biliContainer.id = 'bili-home-container';
        biliContainer.style.flex = '1 1 400px'; 
        // 将 B 站专栏插入到留言板的左侧
        bottomWrapper.insertBefore(biliContainer, msgBoard);
    }
    
    // 3. 渲染判断
    if (!bilibiliLinks || bilibiliLinks.length === 0) {
        // 如果没视频，隐藏 B站区域，右侧留言板会自动 100% 铺满！
        biliContainer.innerHTML = '';
        biliContainer.style.display = 'none';
        return;
    }
    
    biliContainer.style.display = 'block';
    let html = `
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
            <h2 style="margin:0; font-size:1.8rem; color:var(--text);">📺 B站专栏推荐</h2>
            <span style="background:#fb7299; color:white; padding:4px 10px; border-radius:12px; font-size:0.85rem; font-weight:bold; box-shadow:0 2px 5px rgba(251,114,153,0.3);">Bilibili</span>
        </div>
        <div style="display:grid; grid-template-columns: 1fr; gap:25px;">
    `;
    
    bilibiliLinks.forEach(item => {
        html += `
            <div class="main-card" style="padding:0; border-radius:15px; overflow:hidden; background:#000; box-shadow:var(--shadow); border: 1px solid var(--border);">
                <div style="position:relative; width:100%; padding-top:56.25%;">
                    <iframe src="//player.bilibili.com/player.html?bvid=${item.bvid}&page=1&high_quality=1&danmaku=0" 
                            scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" 
                            style="position:absolute; top:0; left:0; width:100%; height:100%; border:none;"></iframe>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    biliContainer.innerHTML = html;
}

function addBiliVideo() {
    let input = document.getElementById('admin-bili-input').value.trim();
    if (!input) return alert("请输入完整的 B站视频链接 或 BVID！");
    
    // 智能正则提取：无论用户输入整段网址还是纯 BV 号，都能精准抓取
    let match = input.match(/(BV[1-9A-HJ-NP-Za-km-z]{10})/i);
    if (!match) return alert("❌ 无法识别有效的 BVID！\n请检查链接是否正确，例如：https://www.bilibili.com/video/BV1xx...");
    
    let bvid = match[0];
    if (bilibiliLinks.find(v => v.bvid === bvid)) return alert("⚠️ 该视频已经存在于专栏中啦！");
    
    bilibiliLinks.unshift({ id: 'bili_' + Date.now(), bvid: bvid, date: new Date().toLocaleDateString() });
    localStorage.setItem('eh_bili_links', JSON.stringify(bilibiliLinks));
    document.getElementById('admin-bili-input').value = '';
    
    renderAdminPanel(); // 刷新后台
    renderBiliHome();   // 刷新前台
    alert("✅ B站视频成功添加到首页专栏！");
}

function deleteBiliVideo(id) {
    if (confirm("确定要将此视频从首页专栏移除吗？")) {
        bilibiliLinks = bilibiliLinks.filter(v => v.id !== id);
        localStorage.setItem('eh_bili_links', JSON.stringify(bilibiliLinks));
        renderAdminPanel();
        renderBiliHome();
    }
}

// =========================================================================
// 系统公告渲染 (置于底部双栏的上方)
// =========================================================================
function renderSysAnnouncement() {
    let pHome = document.getElementById('p-home');
    if(!pHome) return;
    let oldAnnounce = document.getElementById('sys-announce-banner');
    if (oldAnnounce) oldAnnounce.remove();
    
    if(sysAnnouncement && sysAnnouncement.trim() !== '') {
        let banner = document.createElement('div');
        banner.id = 'sys-announce-banner';
        banner.style.cssText = 'background: linear-gradient(90deg, #4f46e5, #ec4899); color: white; padding: 15px 20px; border-radius: 15px; margin-bottom: 20px; font-weight: 800; font-size: 1.1rem; display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 15px rgba(79, 70, 229, 0.3); animation: fadein 0.5s;';
        banner.innerHTML = `<span style="font-size:1.5rem;">📢</span> <span>${sysAnnouncement}</span>`;
        
        let bottomWrapper = document.getElementById('home-bottom-wrapper');
        let msgBoard = pHome.querySelector('.msg-board');
        
        // 保证公告横幅永远插在留言板和B站专栏的最上方
        if (bottomWrapper) {
            pHome.insertBefore(banner, bottomWrapper);
        } else if (msgBoard) {
            pHome.insertBefore(banner, msgBoard);
        } else {
            pHome.appendChild(banner);
        }
    }
}

// =========================================================================
// 【红点提醒系统】
// =========================================================================
function updateBadges() {
    if (!currentUser) return;
    let adminBadge = document.getElementById('admin-notif-badge');
    let userBadge = document.getElementById('notif-badge');
    
    if(currentUser.role === 'admin') {
        let unreadCount = messagesDB.filter(m => m.unreadAdmin).length;
        if(adminBadge) { adminBadge.innerText = unreadCount; if(unreadCount > 0) adminBadge.classList.remove('hidden'); else adminBadge.classList.add('hidden'); }
    } else {
        let unreadCount = messagesDB.filter(m => m.uid === currentUser.id && m.unreadUser).length;
        let navNotif = document.getElementById('nav-notif');
        if(navNotif) navNotif.style.display = 'block';
        if(userBadge) { userBadge.innerText = unreadCount; if(unreadCount > 0) userBadge.classList.remove('hidden'); else userBadge.classList.add('hidden'); }
    }
}

// =========================================================================
// 【核心三】权限网关与 UI 路由交互
// =========================================================================
function initAuth() { 
    if (!usersDB.find(u => u.role === 'admin')) {
        usersDB.push({ id: 'admin_0', email: 'admin', password: 'admin', role: 'admin', nickname: '系统超级管理员', avatar: '👑', expireAt: 9999999999999, status: 'active' });
        localStorage.setItem('eh_users_db', JSON.stringify(usersDB));
    }
    renderUserNav(); loadUserData(); renderMessages(); updateBadges(); renderSysAnnouncement(); renderBiliHome();
}

function requireAuth() {
    if (!currentUser) {
        document.getElementById('auth-prompt-msg').classList.remove('hidden');
        switchAuthTab('login'); openModal('modal-auth');
        return false;
    }
    if (currentUser.status === 'banned') {
        alert("⛔ 您的账号因违规操作已被封禁，请联系管理员。");
        doLogout(); return false;
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

function getGuestIdentity() {
    let identity = localStorage.getItem('eh_guest_identity');
    if(identity) return JSON.parse(identity);
    let randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    let newIdentity = { id: 'guest_' + Date.now(), nickname: '游客_' + randomStr, avatar: '👀' };
    localStorage.setItem('eh_guest_identity', JSON.stringify(newIdentity));
    return newIdentity;
}

function guestLogin() {
    let guestInit = localStorage.getItem('eh_guest_used_time');
    if(guestInit) {
        if(Date.now() - parseInt(guestInit) > GUEST_TRIAL_MS) { alert("⛔ 此设备的 7 天游客免费体验期已结束！\n请注册正式账号以继续使用。"); return; }
    } else {
        localStorage.setItem('eh_guest_used_time', Date.now());
        guestInit = Date.now();
    }

    let identity = getGuestIdentity();
    const guestUser = {
        id: identity.id, email: '免注册体验', password: '', role: 'guest',
        nickname: identity.nickname, avatar: identity.avatar, expireAt: parseInt(guestInit) + GUEST_TRIAL_MS, status: 'active'
    };
    
    let existUser = usersDB.find(u => u.id === identity.id);
    if(existUser && existUser.status === 'banned') { alert("⛔ 当前设备涉及违规操作，已被拒绝访问。"); return; }
    if(!existUser) { usersDB.push(guestUser); localStorage.setItem('eh_users_db', JSON.stringify(usersDB)); }

    currentUser = existUser || guestUser; 
    localStorage.setItem('eh_current_user', JSON.stringify(currentUser));
    
    document.getElementById('auth-prompt-msg').classList.add('hidden');
    closeModals(); renderUserNav(); loadUserData(); updateBadges(); showPage('home');
    alert(`🎉 登录成功！欢迎回来，${currentUser.nickname}。\n您享有 7 天全功能免费体验。`);
}

// =========================================================================
// 互动社区留言板
// =========================================================================
function submitMessage() {
    if(!requireAuth()) return;
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if(!text) return alert("写点什么再发布吧！");
    
    const newMsg = {
        id: Date.now(), uid: currentUser.id, name: currentUser.nickname, avatar: currentUser.avatar,
        text: text.replace(/</g, "&lt;").replace(/>/g, "&gt;"),
        time: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString().slice(0, 5),
        pinned: false, replies: [], status: 'open', unreadAdmin: true, unreadUser: false
    };
    messagesDB.unshift(newMsg);
    localStorage.setItem('eh_messages_db', JSON.stringify(messagesDB));
    input.value = ''; renderMessages(); updateBadges();
    alert("发布成功！管理员会尽快给您回复。");
}

function renderMessages() {
    const list = document.getElementById('msg-list');
    if(!list) return;
    
    let sorted = messagesDB.slice().sort((a,b) => {
        if(a.pinned && !b.pinned) return -1;
        if(!a.pinned && b.pinned) return 1;
        return b.id - a.id;
    });

    if(sorted.length === 0) { list.innerHTML = `<p style="text-align:center; color:var(--text-light); padding:20px;">暂无反馈，快来抢占沙发吧！</p>`; return; }

    let isAdmin = currentUser && currentUser.role === 'admin';
    list.innerHTML = sorted.map(m => {
        let canReply = isAdmin || (currentUser && currentUser.id === m.uid);
        let replyBtnText = m.replies && m.replies.length > 0 ? `💬 参与对话 (${m.replies.length})` : `💬 开启对话`;
        let unreadDot = '';
        if (isAdmin && m.unreadAdmin) unreadDot = `<span style="display:inline-block; width:8px; height:8px; background:var(--accent); border-radius:50%; margin-left:5px;"></span>`;
        if (!isAdmin && currentUser && currentUser.id === m.uid && m.unreadUser) unreadDot = `<span style="display:inline-block; width:8px; height:8px; background:var(--accent); border-radius:50%; margin-left:5px;"></span>`;

        return `
        <div class="msg-item ${m.pinned ? 'pinned' : ''}">
            <div class="msg-avatar">${m.avatar}</div>
            <div class="msg-content">
                <div class="msg-header">
                    <div class="msg-name">${m.name} ${m.pinned ? '<span style="font-size:0.8rem; background:var(--warning); color:#fff; padding:2px 6px; border-radius:4px;">置顶</span>' : ''}</div>
                    <div class="msg-time">${m.time}</div>
                </div>
                <div class="msg-text">${m.text}</div>
                <div class="msg-admin-controls">
                    ${canReply ? `<button class="btn btn-outline" style="padding: 4px 10px; font-size: 0.8rem; border-color:var(--primary); color:var(--primary);" onclick="openChatDialog(${m.id})">${replyBtnText} ${unreadDot}</button>` : ''}
                    ${isAdmin ? `
                    <button class="btn btn-outline" style="padding: 4px 10px; font-size: 0.8rem;" onclick="togglePinMsg(${m.id})">${m.pinned ? '取消置顶' : '📌 置顶'}</button>
                    <button class="btn btn-outline" style="padding: 4px 10px; font-size: 0.8rem; border-color:var(--success); color:var(--success);" onclick="rewardUser('${m.uid}')">🎁 奖励7天</button>
                    <button class="btn btn-outline" style="padding: 4px 10px; font-size: 0.8rem; border-color:var(--accent); color:var(--accent);" onclick="delMsg(${m.id})">删除</button>` : ''}
                </div>
            </div>
        </div>`
    }).join('');
}

function openChatDialog(msgId) {
    currentChatMsgId = msgId;
    let m = messagesDB.find(x => x.id === msgId);
    if(!m) return;
    
    if (currentUser.role === 'admin') m.unreadAdmin = false;
    else if (currentUser.id === m.uid) m.unreadUser = false;
    localStorage.setItem('eh_messages_db', JSON.stringify(messagesDB));
    updateBadges(); renderMessages(); 
    if(document.getElementById('p-admin').classList.contains('hidden') === false) renderAdminMsgList();

    renderChatHistory();
    document.getElementById('chat-title').innerText = "沟通对话";
    openModal('modal-chat');
}

function renderChatHistory() {
    let m = messagesDB.find(x => x.id === currentChatMsgId);
    let container = document.getElementById('chat-history-container');
    if(!m || !container) return;

    let html = `
        <div class="chat-bubble chat-left" style="background:#fefce8; border-left:4px solid var(--warning);">
            <div style="font-weight:bold; font-size:0.85rem; color:var(--text-light); margin-bottom:4px;">${m.name} (发起内容)</div>
            ${m.text}
            <div class="chat-time">${m.time}</div>
        </div>
    `;

    if (m.replies && m.replies.length > 0) {
        m.replies.forEach(r => {
            let isMe = (currentUser.role === 'admin' && r.fromAdmin) || (currentUser.role !== 'admin' && !r.fromAdmin);
            let bubbleClass = isMe ? 'chat-right' : 'chat-left';
            let senderName = r.fromAdmin ? '👑 管理员' : m.name;
            html += `
            <div class="chat-bubble ${bubbleClass}">
                <div style="font-weight:bold; font-size:0.8rem; margin-bottom:4px; opacity:0.8;">${senderName}</div>
                ${r.text}
                <div class="chat-time">${r.time}</div>
            </div>`;
        });
    }
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

function sendChatReply() {
    let text = document.getElementById('chat-reply-input').value.trim();
    if(!text) return;
    let m = messagesDB.find(x => x.id === currentChatMsgId);
    if(!m) return;

    let isAdmin = currentUser.role === 'admin';
    if(!m.replies) m.replies = [];
    
    m.replies.push({ fromAdmin: isAdmin, text: text.replace(/</g, "&lt;").replace(/>/g, "&gt;"), time: new Date().toLocaleTimeString().slice(0, 5) });

    if (isAdmin) m.unreadUser = true; else m.unreadAdmin = true;
    localStorage.setItem('eh_messages_db', JSON.stringify(messagesDB));
    document.getElementById('chat-reply-input').value = '';
    renderChatHistory(); updateBadges(); renderMessages(); 
    if(document.getElementById('p-admin').classList.contains('hidden') === false) renderAdminMsgList();
}

function openNotifModal() {
    if(!currentUser) return;
    let list = document.getElementById('notif-list-body');
    let myMsgs = messagesDB.filter(m => m.uid === currentUser.id);
    
    if(myMsgs.length === 0) { list.innerHTML = `<p style="text-align:center; color:var(--text-light);">您还没有提交过反馈意见~</p>`; } 
    else {
        list.innerHTML = myMsgs.map(m => `
            <div style="padding: 15px; border: 1px solid var(--border); border-radius: 12px; margin-bottom: 10px; cursor:pointer; transition:0.2s;" onclick="openChatDialog(${m.id})" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">
                <div style="font-weight:bold; color:var(--text); display:flex; justify-content:space-between;">
                    <span>${m.text.length > 20 ? m.text.substring(0, 20) + '...' : m.text}</span>
                    ${m.unreadUser ? `<span style="background:var(--accent); color:white; font-size:0.7rem; padding:2px 6px; border-radius:10px;">新回复</span>` : ''}
                </div>
                <div style="font-size:0.8rem; color:var(--text-light); margin-top:5px;">时间: ${m.time} | 包含 ${m.replies ? m.replies.length : 0} 条沟通记录</div>
            </div>
        `).join('');
    }
    openModal('modal-notif');
}

function togglePinMsg(id) { let m = messagesDB.find(x => x.id === id); if(m) m.pinned = !m.pinned; localStorage.setItem('eh_messages_db', JSON.stringify(messagesDB)); renderMessages(); if(document.getElementById('p-admin').classList.contains('hidden') === false) renderAdminMsgList(); }
function delMsg(id) { if(confirm("确定删除该反馈记录？")) { messagesDB = messagesDB.filter(x => x.id !== id); localStorage.setItem('eh_messages_db', JSON.stringify(messagesDB)); renderMessages(); if(document.getElementById('p-admin').classList.contains('hidden') === false) renderAdminMsgList(); updateBadges(); } }
function rewardUser(uid) {
    let u = usersDB.find(x => x.id === uid); if(!u) return alert("该用户可能是游客或已被删除，无法操作。");
    if(Date.now() > u.expireAt) u.expireAt = Date.now() + 7 * 24 * 3600 * 1000; else u.expireAt += 7 * 24 * 3600 * 1000;
    localStorage.setItem('eh_users_db', JSON.stringify(usersDB)); alert(`🎁 已成功为用户 [${u.nickname}] 增加 7 天使用期限！`); if(document.getElementById('p-admin').classList.contains('hidden') === false) renderAdminPanel();
}

// =========================================================================
// 用户界面控制 (UI Controls)
// =========================================================================
function renderUserNav() {
    const navArea = document.getElementById('nav-user-area');
    const adminNav = document.getElementById('nav-admin');
    const notifNav = document.getElementById('nav-notif');

    if(currentUser) {
        let initial = currentUser.avatar || currentUser.nickname.charAt(0).toUpperCase();
        navArea.innerHTML = `<div class="user-nav"><div class="user-avatar">${initial}</div><span>${currentUser.nickname}</span></div>`;
        if (currentUser.role === 'admin' && adminNav) { adminNav.style.display = 'block'; if(notifNav) notifNav.style.display = 'none'; } 
        else { if (adminNav) adminNav.style.display = 'none'; if (notifNav) notifNav.style.display = 'block'; }
    } else {
        navArea.innerHTML = `<button class="btn" style="padding: 8px 20px; font-size: 0.95rem;">登录 / 注册</button>`;
        if (adminNav) adminNav.style.display = 'none';
        if (notifNav) notifNav.style.display = 'none';
    }
}

function handleUserNavClick() { 
    if(currentUser) showPage('profile'); 
    else { document.getElementById('auth-prompt-msg').classList.add('hidden'); switchAuthTab('login'); openModal('modal-auth'); } 
}

function switchAuthTab(tab) {
    document.getElementById('form-login').classList.add('hidden'); 
    document.getElementById('form-register').classList.add('hidden');
    document.getElementById('form-forgot').classList.add('hidden');
    let formAdmin = document.getElementById('form-admin'); if(formAdmin) formAdmin.classList.add('hidden');
    
    if(tab === 'admin') {
        document.getElementById('auth-tabs-header').style.display = 'none'; document.getElementById('guest-login-top-area').style.display = 'none'; document.getElementById('auth-footer').style.display = 'none'; document.getElementById('form-admin').classList.remove('hidden');
    } else if (tab === 'forgot') {
        document.getElementById('auth-tabs-header').style.display = 'none'; document.getElementById('guest-login-top-area').style.display = 'none'; document.getElementById('auth-footer').style.display = 'none'; 
        document.getElementById('form-forgot').classList.remove('hidden');
        document.getElementById('forgot-step-1').classList.remove('hidden');
        document.getElementById('forgot-step-2').classList.add('hidden');
    } else {
        document.getElementById('auth-tabs-header').style.display = 'flex'; document.getElementById('guest-login-top-area').style.display = 'block'; document.getElementById('auth-footer').style.display = 'block';
        document.getElementById('tab-login').classList.remove('active'); document.getElementById('tab-register').classList.remove('active');
        document.getElementById('tab-' + tab).classList.add('active'); document.getElementById('form-' + tab).classList.remove('hidden');
    }
}

function selectRole(role) {
    selectedRegRole = role;
    document.getElementById('role-student').classList.remove('active'); document.getElementById('role-teacher').classList.remove('active');
    document.getElementById('role-' + role).classList.add('active');
}

function doRegister() {
    const email = document.getElementById('reg-email').value.trim(); const pwd1 = document.getElementById('reg-pwd').value.trim(); const pwd2 = document.getElementById('reg-pwd2').value.trim();
    if(!email || !pwd1) return alert("请填写邮箱和密码！"); if(pwd1 !== pwd2) return alert("两次输入的密码不一致！");
    if(usersDB.find(u => u.email === email)) return alert("该邮箱已注册，请直接登录！");
    const newUser = { id: Date.now(), email: email, password: pwd1, role: selectedRegRole, nickname: email.split('@')[0], avatar: email.charAt(0).toUpperCase(), expireAt: Date.now() + USER_TRIAL_MS, status: 'active' };
    usersDB.push(newUser); localStorage.setItem('eh_users_db', JSON.stringify(usersDB));
    currentUser = newUser; localStorage.setItem('eh_current_user', JSON.stringify(currentUser));
    document.getElementById('auth-prompt-msg').classList.add('hidden');
    closeModals(); renderUserNav(); loadUserData(); updateBadges(); showPage('home'); alert("🎉 注册成功！您已获得系统 30 天免费使用权限。");
}

function doLogin() {
    const email = document.getElementById('login-email').value.trim(); const pwd = document.getElementById('login-pwd').value.trim();
    if(!email || !pwd) return alert("请填写完整邮箱和密码！");
    const user = usersDB.find(u => u.email === email && u.password === pwd);
    if(!user || user.role === 'admin') return alert("❌ 账号或密码错误！"); 
    if (user.status === 'banned') return alert("⛔ 您的账号因违规操作已被封禁，禁止登录。");
    if (!user.expireAt) user.expireAt = Date.now() + USER_TRIAL_MS; 
    if (Date.now() > user.expireAt) { alert("⛔ 您的 30 天使用期已结束！\n请联系管理员延长权限。"); return; }
    currentUser = user; localStorage.setItem('eh_current_user', JSON.stringify(currentUser));
    document.getElementById('auth-prompt-msg').classList.add('hidden'); 
    closeModals(); renderUserNav(); loadUserData(); updateBadges(); showPage('home');
}

function doAdminLogin() {
    const email = document.getElementById('admin-email').value.trim(); const pwd = document.getElementById('admin-pwd').value.trim();
    if(!email || !pwd) return alert("请填写管理员账号和密码！");
    const user = usersDB.find(u => u.role === 'admin' && u.email === email && u.password === pwd);
    if(!user) return alert("❌ 账号或密码错误或无管理员权限！");
    currentUser = user; localStorage.setItem('eh_current_user', JSON.stringify(currentUser));
    closeModals(); renderUserNav(); loadUserData(); updateBadges(); showPage('admin');
}

function doLogout() {
    if(confirm("确定要退出当前账号吗？")) { currentUser = null; localStorage.removeItem('eh_current_user'); loadUserData(); updateBadges(); showPage('home'); renderUserNav(); }
}

function showPage(id) {
    try {
        let blockNav = false;
        if (currentUser) {
            if(currentUser.status === 'banned') {
                alert("⛔ 您的账号状态异常，系统已自动登出。"); currentUser = null; localStorage.removeItem('eh_current_user'); loadUserData(); renderUserNav(); openModal('modal-auth'); blockNav = true;
            } else if (currentUser.role !== 'admin' && currentUser.expireAt && Date.now() > currentUser.expireAt) {
                alert("⛔ 您的体验期已结束，系统已自动登出。\n请联系管理员延长权限。"); currentUser = null; localStorage.removeItem('eh_current_user'); loadUserData(); renderUserNav(); openModal('modal-auth'); blockNav = true;
            }
        } else {
            if (!checkGuestTrial()) {
                if (id !== 'home') { alert("⛔ 您的7天游客免费体验期已结束！\n请注册或登录账号以继续使用。"); openModal('modal-auth'); blockNav = true; } 
                else { openModal('modal-auth'); }
            }
        }
        if (blockNav && id !== 'home') id = 'home'; 

        recordPV(); syncDataLive(); 
        let views = document.querySelectorAll('.view'); for(let i=0; i<views.length; i++) { views[i].classList.add('hidden'); }
        let navs = document.querySelectorAll('.nav-item'); for(let i=0; i<navs.length; i++) { navs[i].classList.remove('active'); }
        let targetView = document.getElementById('p-' + id); if(targetView) { targetView.classList.remove('hidden'); }
        let navPrefix = id.split('-')[0]; let navEl = document.getElementById('nav-' + navPrefix); if(navEl) { navEl.classList.add('active'); }
        
        // 跨文件渲染函数调用
        if(id === 'home') renderBiliHome(); // 确保每次回首页都渲染 B 站视频
        if(id === 'vocab-nb' && typeof renderNB === 'function') renderNB();
        if(id === 'vocab-bs' && typeof renderBS === 'function') renderBS();
        if(id === 'vocab-srs' && typeof renderVocabSRS === 'function') renderVocabSRS();
        if(id === 'read-library' && typeof renderLibrary === 'function') renderLibrary();
        if(id === 'listen-main' && typeof renderListenErrors === 'function') renderListenErrors(); 
        if(id === 'profile') renderProfileData(); 
        if(id === 'admin') renderAdminPanel(); 
        window.scrollTo(0, 0); 
    } catch(e) { console.error(e); }
}

// =========================================================================
// 管理员后台高级权限控制 (Admin Powers)
// =========================================================================
function setGlobalAnnouncement() {
    let text = document.getElementById('admin-sys-announce').value.trim();
    sysAnnouncement = text;
    localStorage.setItem('eh_sys_announcement', text);
    renderSysAnnouncement();
    alert("📢 全局公告更新成功，用户将在首页看到此消息！");
}

function toggleBanUser(uid) {
    let u = usersDB.find(x => x.id == uid);
    if(u) {
        let isBanned = u.status === 'banned';
        if(confirm(isBanned ? `确定要解封账号 [${u.nickname}] 吗？` : `警告：确定要封禁账号 [${u.nickname}] 吗？封禁后该用户将无法访问系统。`)) {
            u.status = isBanned ? 'active' : 'banned';
            localStorage.setItem('eh_users_db', JSON.stringify(usersDB));
            renderAdminPanel();
        }
    }
}

function resetUserScore(uid) {
    let u = usersDB.find(x => x.id == uid);
    if(u && confirm(`确定要清空账号 [${u.nickname}] 的所有游戏战绩吗？此操作不可逆！`)) {
        let prefix = getPrefix(u.id);
        localStorage.setItem(prefix+'g_hist', JSON.stringify([]));
        alert("✅ 该用户战绩已被清空！");
    }
}

function switchAdminTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('#p-admin .read-container').forEach(el => el.classList.add('hidden'));
    
    document.getElementById('tab-admin-' + tab).classList.add('active'); 
    let target = document.getElementById('admin-view-' + tab);
    if(target) target.classList.remove('hidden');
    
    if(tab === 'msgs') renderAdminMsgList();
}

function renderAdminMsgList() {
    const list = document.getElementById('admin-msg-list');
    let sorted = messagesDB.slice().sort((a,b) => b.id - a.id);
    if(sorted.length === 0) { list.innerHTML = `<p style="color:var(--text-light);">暂无任何用户反馈。</p>`; return; }
    
    list.innerHTML = sorted.map(m => `
        <div style="background:var(--white); border: 2px solid ${m.unreadAdmin ? 'var(--accent)' : 'var(--border)'}; border-radius:15px; padding:20px; margin-bottom:15px; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <div><span style="font-weight:900; color:var(--primary); font-size:1.1rem;">${m.name}</span> <span style="color:var(--text-light); font-size:0.85rem; margin-left:10px;">${m.time}</span></div>
                <div>${m.unreadAdmin ? '<span style="background:var(--accent); color:white; font-size:0.8rem; padding:4px 8px; border-radius:12px; font-weight:bold;">未读反馈</span>' : '<span style="background:var(--border); color:var(--text-light); font-size:0.8rem; padding:4px 8px; border-radius:12px;">已查阅</span>'}</div>
            </div>
            <div style="color:var(--text); line-height:1.6; margin-bottom:15px; background:var(--bg); padding:10px; border-radius:8px;">${m.text}</div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <button class="btn btn-outline" style="padding: 6px 15px; font-size: 0.9rem;" onclick="openChatDialog(${m.id})">💬 沟通回复 (${m.replies ? m.replies.length : 0})</button>
                <button class="btn btn-outline" style="padding: 6px 15px; font-size: 0.9rem; border-color:var(--success); color:var(--success);" onclick="rewardUser('${m.uid}')">🎁 奖励7天</button>
                <button class="btn btn-outline" style="padding: 6px 15px; font-size: 0.9rem; border-color:var(--accent); color:var(--accent);" onclick="delMsg(${m.id})">删除记录</button>
            </div>
        </div>
    `).join('');
}

function renderAdminPanel() {
    if(!currentUser || currentUser.role !== 'admin') { showPage('home'); return; }
    document.getElementById('admin-stat-pv').innerText = siteStats.pv;
    document.getElementById('admin-stat-users').innerText = usersDB.filter(u => u.role !== 'admin').length;
    document.getElementById('admin-stat-msgs').innerText = messagesDB.length;

    let panelTop = document.querySelector('#p-admin .hub-grid');
    
    // 1. 动态注入公告面板
    let announceArea = document.getElementById('admin-announce-area');
    if(!announceArea) {
        announceArea = document.createElement('div');
        announceArea.id = 'admin-announce-area';
        announceArea.style.cssText = 'background: var(--primary-light); padding: 20px; border-radius: 20px; border: 2px dashed #c7d2fe; margin-bottom: 20px;';
        announceArea.innerHTML = `
            <h3 style="margin-top:0; color:var(--primary); font-size:1.2rem;">📢 发布全局系统公告</h3>
            <div style="display:flex; gap:10px;">
                <input type="text" id="admin-sys-announce" value="${sysAnnouncement}" placeholder="输入公告内容，展示在首页顶部 (留空则不显示)" style="flex:1; margin:0;">
                <button class="btn" onclick="setGlobalAnnouncement()">更新公告</button>
            </div>`;
        panelTop.parentNode.insertBefore(announceArea, panelTop);
    }
    
    // 2. 动态注入 B站专栏 管理面板
    let biliArea = document.getElementById('admin-bili-area');
    if(!biliArea) {
        biliArea = document.createElement('div');
        biliArea.id = 'admin-bili-area';
        biliArea.style.cssText = 'background: #fff0f6; padding: 25px; border-radius: 20px; border: 2px dashed #ff85c0; margin-bottom: 30px;';
        panelTop.parentNode.insertBefore(biliArea, panelTop); 
    }
    
    let biliListHtml = bilibiliLinks.length === 0 ? '<p style="color:var(--text-light); font-size:0.95rem; margin-top:15px;">首页专栏暂无视频，快去添加吧！</p>' : 
        bilibiliLinks.map(v => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:white; padding:12px 15px; border-radius:12px; margin-bottom:10px; border:1px solid #ffd6e7; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                <div style="font-weight:bold; color:#eb2f96; font-size:1.1rem;">📺 ${v.bvid} <span style="font-weight:normal; font-size:0.85rem; color:#8c8c8c; margin-left:10px;">(添加于 ${v.date})</span></div>
                <button class="btn btn-outline" style="padding:6px 15px; font-size:0.85rem; border-color:#ff4d4f; color:#ff4d4f;" onclick="deleteBiliVideo('${v.id}')">移除</button>
            </div>
        `).join('');

    biliArea.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
            <span style="font-size:1.8rem; filter: drop-shadow(0 2px 4px rgba(251,114,153,0.3));">📺</span>
            <h3 style="margin:0; color:#eb2f96; font-size:1.3rem;">B 站首页专栏管理</h3>
        </div>
        <div style="display:flex; gap:10px; margin-bottom:20px;">
            <input type="text" id="admin-bili-input" placeholder="请粘贴 B站视频的链接，或者直接输入 BVID (例如: BV1xxxx...)" style="flex:1; margin:0; border-color:#ffadd2; outline:none;" onfocus="this.style.borderColor='#eb2f96'" onblur="this.style.borderColor='#ffadd2'">
            <button class="btn" style="background: linear-gradient(135deg, #fb7299, #ff4d4f); box-shadow: 0 4px 10px rgba(251,114,153,0.3);" onclick="addBiliVideo()">+ 添加视频到首页</button>
        </div>
        <div style="max-height: 250px; overflow-y:auto; padding-right:5px;">
            ${biliListHtml}
        </div>
    `;

    const tbody = document.getElementById('admin-user-list'); let html = '';
    usersDB.forEach((u) => {
        if(u.role === 'admin') return; 
        if(!u.expireAt) u.expireAt = Date.now() + USER_TRIAL_MS;
        let isExpired = Date.now() > u.expireAt;
        let isBanned = u.status === 'banned';
        
        let dateStr = new Date(u.expireAt).toLocaleDateString();
        let statusHtml = '';
        if(isBanned) statusHtml = `<span style="color: white; background: var(--accent); padding:2px 8px; border-radius:8px; font-weight:bold; font-size:0.85rem;">已封禁🚫</span>`;
        else if(isExpired) statusHtml = `<span style="color: var(--accent); font-weight:bold;">${dateStr} (已过期)</span>`;
        else statusHtml = `<span style="color: var(--success); font-weight:bold;">${dateStr}</span>`;
        
        let roleStr = u.role === 'teacher' ? '👨‍🏫 教师' : (u.role === 'guest' ? '👀 游客' : '👨‍🎓 学生');
        let tzOffset = (new Date()).getTimezoneOffset() * 60000;
        let dateVal = (new Date(u.expireAt - tzOffset)).toISOString().split('T')[0];

        let banBtn = isBanned 
            ? `<button class="btn btn-outline" style="padding: 6px 15px; font-size: 0.85rem; border-color: var(--success); color: var(--success);" onclick="toggleBanUser('${u.id}')">解除封禁</button>`
            : `<button class="btn btn-outline" style="padding: 6px 15px; font-size: 0.85rem; border-color: var(--warning); color: var(--warning);" onclick="toggleBanUser('${u.id}')">封禁账号</button>`;

        html += `<tr style="border-bottom: 1px solid var(--border); opacity: ${isBanned ? '0.6' : '1'};">
            <td style="padding: 15px;">
                <div style="font-weight: 900; color: var(--text); font-size:1.1rem;">${u.email}</div>
                <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 4px;">昵称: ${u.nickname}</div>
                <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 2px;">ID: <span style="font-family:monospace;">${u.id}</span></div>
            </td>
            <td style="padding: 15px; color: var(--text-light); font-weight:bold;">${roleStr}</td>
            <td style="padding: 15px;">
                <div style="margin-bottom: 10px;">${statusHtml}</div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <input type="date" value="${dateVal}" onchange="extendUserTrial('${u.id}', 0, this.value)" style="padding: 6px 10px; font-size: 0.9rem; border-radius: 8px; border: 2px solid var(--border); margin:0; width: auto; flex:1;" ${isBanned?'disabled':''}>
                    <button class="btn btn-outline" style="padding: 6px 12px; font-size: 0.85rem; flex-shrink:0;" onclick="extendUserTrial('${u.id}', 30)" ${isBanned?'disabled':''}>+ 30天</button>
                </div>
            </td>
            <td style="padding: 15px;">
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    ${banBtn}
                    <button class="btn btn-outline" style="padding: 6px 15px; font-size: 0.85rem; border-color: #f59e0b; color: #f59e0b;" onclick="resetUserScore('${u.id}')">清空战绩</button>
                    <button class="btn btn-outline" style="padding: 6px 15px; font-size: 0.85rem; border-color: var(--accent); color: var(--accent);" onclick="deleteUser('${u.id}')">彻底删除</button>
                </div>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center; padding: 20px; color: var(--text-light);">暂无注册用户</td></tr>';
    renderAdminMsgList();
}

function extendUserTrial(uid, days, specificDateStr = null) {
    let u = usersDB.find(x => x.id == uid);
    if(u) {
        if(specificDateStr) { u.expireAt = new Date(specificDateStr + 'T23:59:59').getTime(); } 
        else {
            if (Date.now() > u.expireAt && days > 0) { u.expireAt = Date.now() + days * 24 * 3600 * 1000; } 
            else { u.expireAt += days * 24 * 3600 * 1000; }
        }
        localStorage.setItem('eh_users_db', JSON.stringify(usersDB)); renderAdminPanel();
    }
}

function deleteUser(uid) {
    if(confirm("警告：确定要彻底删除该用户及其所有数据吗？此操作不可逆！")) {
        usersDB = usersDB.filter(x => x.id != uid);
        localStorage.setItem('eh_users_db', JSON.stringify(usersDB)); renderAdminPanel();
    }
}

function renderProfileData() {
    if(!currentUser) { showPage('home'); return; }
    document.getElementById('prof-avatar-display').innerText = currentUser.avatar; document.getElementById('prof-nickname-display').innerText = currentUser.nickname;
    let roleName = currentUser.role === 'teacher' ? '👨‍🏫 教师身份' : (currentUser.role === 'admin' ? '👑 系统超级管理员' : '👨‍🎓 学生身份');
    if(currentUser.role === 'guest') roleName = '👀 游客体验官';
    document.getElementById('prof-role-display').innerText = roleName;
    
    let expireHtml = '';
    if (currentUser.role === 'admin') { expireHtml = '权限状态: 永久无限期'; } else {
        if(!currentUser.expireAt) currentUser.expireAt = Date.now() + USER_TRIAL_MS;
        let dStr = new Date(currentUser.expireAt).toLocaleDateString();
        expireHtml = Date.now() > currentUser.expireAt ? `⚠️ 已过期 (${dStr})` : `⏳ 账号有效期至: ${dStr}`;
    }
    document.getElementById('prof-expire-display').innerText = expireHtml;
    document.getElementById('prof-nickname').value = currentUser.nickname; document.getElementById('prof-avatar').value = currentUser.avatar; document.getElementById('prof-pwd').value = '';

    let gHistHtml = gameHistory.map(g => `<div style="margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--border);"><b>${g.game}</b> : <span style="color:var(--accent); font-weight:bold;">${g.score} 分</span> <br><span style="font-size:0.8em;">${g.date}</span></div>`).join('');
    document.getElementById('prof-game-hist').innerHTML = gHistHtml || '暂无记录。';
    let rHistHtml = readHistory.map(r => `<div style="margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--border);"><span style="color:var(--primary); font-weight:600;">${r.content}</span> <br><span style="font-size:0.8em;">${r.date}</span></div>`).join('');
    document.getElementById('prof-read-hist').innerHTML = rHistHtml || '暂无记录。';
}

function saveProfile() {
    const nn = document.getElementById('prof-nickname').value.trim(); const pwd = document.getElementById('prof-pwd').value.trim(); const av = document.getElementById('prof-avatar').value.trim();
    if(!nn) return alert("昵称不能为空！");
    currentUser.nickname = nn; currentUser.avatar = av || nn.charAt(0).toUpperCase(); if(pwd) currentUser.password = pwd;
    let userInDb = usersDB.find(u => u.id === currentUser.id);
    if(userInDb) { userInDb.nickname = currentUser.nickname; userInDb.avatar = currentUser.avatar; if(pwd) userInDb.password = currentUser.password; }
    localStorage.setItem('eh_users_db', JSON.stringify(usersDB)); localStorage.setItem('eh_current_user', JSON.stringify(currentUser));
    renderProfileData(); renderUserNav(); renderMessages(); alert("✅ 个人资料更新成功！");
}

function openModal(id) { let modal = document.getElementById(id); if(modal) modal.style.display = 'flex'; }
function closeModals() { let overlays = document.querySelectorAll('.modal-overlay'); for(let i=0; i<overlays.length; i++) overlays[i].style.display = 'none'; }
function speak(t) { try { window.speechSynthesis.speak(new SpeechSynthesisUtterance(t)); } catch(e) {} }
