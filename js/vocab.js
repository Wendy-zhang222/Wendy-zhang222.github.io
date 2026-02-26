// js/vocab.js
// =========================================================================
// 📚 词库管理与智能背单词 (终极防弹：激光制导强制落盘版)
// =========================================================================

// =========================================================================
// 1. 字典 API 与批量处理
// =========================================================================
async function fetchInfo(word) { 
    try { 
        let d_res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`); 
        let d = await d_res.json();
        let t_res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${word}`); 
        let t = await t_res.json();
        let rawCnTrans = t[0][0][0] || ''; 
        let cleanCn = rawCnTrans.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
        
        const isOk = Array.isArray(d); 
        let phoneticSymbol = '';
        if (isOk) { 
            if (d[0].phonetic) { phoneticSymbol = d[0].phonetic; } 
            else if (d[0].phonetics && d[0].phonetics.length > 0) { 
                let pObj = d[0].phonetics.find(p => p.text); 
                if (pObj) phoneticSymbol = pObj.text; 
            } 
        }
        return { word: word, phonetic: phoneticSymbol, cn: cleanCn || '暂无翻译', en: isOk && d[0].meanings[0] && d[0].meanings[0].definitions[0] ? d[0].meanings[0].definitions[0].definition : '', id: Date.now() + Math.random() }; 
    } catch(e) { 
        return { word: word, cn: '解析失败，请手动修改', en: '', phonetic: '', id: Date.now() }; 
    } 
}

async function processBatchWords(type) { 
    if(!requireAuth()) return;
    const inputId = type === 'nb' ? 'in-nb-batch' : 'in-u-batch'; 
    const rawInput = document.getElementById(inputId).value; 
    let splitArray = rawInput.split(/[\n,，;；]+/); 
    let words = [];
    for(let i=0; i<splitArray.length; i++) { let w = splitArray[i].trim(); if(w) words.push(w); }
    const unitName = type === 'bs' ? (document.getElementById('in-u-name').value.trim() || "默认单元") : ""; 
    if(words.length === 0) return; 
    closeModals(); document.getElementById('api-loading').style.display = 'flex'; 
    for(let i=0; i<words.length; i++) { 
        const info = await fetchInfo(words[i]); 
        if(type === 'nb') { notebook.unshift(info); } else { info.unit = unitName; bookshelf[curBookIdx].words.unshift(info); } 
    } 
    saveUserData(); document.getElementById('api-loading').style.display = 'none'; document.getElementById(inputId).value = ""; 
    if(type === 'nb') renderNB(); else renderBookWords();
}

function editWord(index, type) {
    if(!requireAuth()) return;
    let targetList = type === 'nb' ? notebook : bookshelf[curBookIdx].words; 
    let wordObj = targetList[index];
    let newCn = prompt(`修改 "${wordObj.word}" 的中文释义：`, wordObj.cn);
    if (newCn !== null && newCn.trim() !== "") { wordObj.cn = newCn.trim(); saveUserData(); type === 'nb' ? renderNB() : renderBookWords(); }
}

// =========================================================================
// 2. 生词本与词书管理 
// =========================================================================
function renderNB() { 
    const ui = document.getElementById('ui-nb-list'); 
    if(!notebook || notebook.length === 0) { ui.innerHTML = `<p style="text-align:center; padding:40px; color:var(--text-light);">生词本为空，请点击右上角批量导入。</p>`; return; } 
    let htmlStr = '';
    for(let i=0; i<notebook.length; i++) {
        let w = notebook[i];
        htmlStr += `<div class="word-item"><div style="flex:1"><div style="display:flex; align-items:center; gap:12px;"><span style="font-size:1.6rem; font-weight:900; color:var(--primary);">${w.word}</span><span style="color:var(--text-light); font-size:1.1rem;">${w.phonetic || ''}</span></div><div style="font-weight:700; font-size:1.15rem; margin:8px 0; color:var(--text);">${w.cn}</div>${w.en ? `<div class="word-en-def">${w.en}</div>` : ''}</div><div style="display:flex; gap:8px; align-items:center;"><button class="btn btn-outline" style="padding:10px; border-radius:12px;" onclick="speak('${w.word}')" title="发音">🔊</button><button class="btn btn-outline" style="padding:10px; border-radius:12px; border-color:#3b82f6; color:#3b82f6;" onclick="editWord(${i}, 'nb')" title="自定义修改释义">✏️</button><button class="btn" style="background:var(--accent); padding:10px; border-radius:12px;" onclick="notebook.splice(${i},1);saveUserData();renderNB();" title="删除">🗑️</button></div></div>`;
    }
    ui.innerHTML = htmlStr; 
}

function saveBook() { 
    if(!requireAuth()) return;
    const name = document.getElementById('in-b-name').value.trim(); const vol = document.getElementById('in-b-vol').value.trim(); 
    if(!name) { alert("书名不能为空！"); return; } 
    bookshelf.unshift({ name: name, vol: vol, words: [] }); saveUserData(); closeModals(); renderBS(); 
    document.getElementById('in-b-name').value = ''; document.getElementById('in-b-vol').value = ''; 
}

function renderBS() { 
    const ui = document.getElementById('ui-book-grid'); 
    if(!bookshelf || bookshelf.length === 0) { ui.innerHTML = `<p style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-light);">尚未创建词书，请点击右上角新建。</p>`; return; } 
    let htmlStr = '';
    for(let i=0; i<bookshelf.length; i++) {
        let b = bookshelf[i]; let count = b.words ? b.words.length : 0; let volStr = b.vol ? (b.vol + ' | ') : '';
        htmlStr += `<div class="main-card" onclick="openBook(${i})" style="padding: 40px 20px;"><span class="card-icon">📘</span><h2 style="font-size:1.5rem;">${b.name}</h2><p style="margin-bottom:15px;">${volStr}已收录 ${count} 词</p><button class="btn btn-outline" style="padding:8px 16px; font-size:0.9rem;" onclick="event.stopPropagation(); if(confirm('确定删除此书？')) { bookshelf.splice(${i},1); saveUserData(); renderBS(); }">删除词书</button></div>`;
    }
    ui.innerHTML = htmlStr; 
}

function openBook(index) { curBookIdx = index; showPage('book-detail'); document.getElementById('detail-title').innerText = `${bookshelf[index].name} ${bookshelf[index].vol}`; renderBookWords(); }

function renderBookWords() { 
    const ui = document.getElementById('ui-book-words'); if(curBookIdx === -1 || !bookshelf[curBookIdx]) return;
    const words = bookshelf[curBookIdx].words; 
    if(!words || words.length === 0) { ui.innerHTML = `<p style="text-align:center; padding:40px; color:var(--text-light);">该词书为空，请点击右上角导入单元单词。</p>`; return; } 
    let htmlStr = ''; let currentUnit = ''; 
    for(let i=0; i<words.length; i++) {
        let w = words[i]; let u = w.unit || "未分类单元";
        if(u !== currentUnit) { currentUnit = u; htmlStr += `<div class="group-header">${currentUnit}</div>`; } 
        htmlStr += `<div class="word-item"><div style="flex:1"><div style="display:flex; align-items:center; gap:12px;"><span style="font-size:1.5rem; font-weight:900;">${w.word}</span><span style="color:var(--text-light);">${w.phonetic || ''}</span></div><div style="font-weight:700; margin:5px 0;">${w.cn}</div>${w.en ? `<div class="word-en-def">${w.en}</div>` : ''}</div><div style="display:flex; gap:8px; align-items:center;"><button class="btn btn-outline" style="padding:10px; border-radius:12px;" onclick="speak('${w.word}')" title="发音">🔊</button><button class="btn btn-outline" style="padding:10px; border-radius:12px; border-color:#3b82f6; color:#3b82f6;" onclick="editWord(${i}, 'bs')" title="修改">✏️</button><button class="btn" style="background:var(--accent); padding:10px; border-radius:12px;" onclick="bookshelf[${curBookIdx}].words.splice(${i},1); saveUserData(); renderBookWords();" title="删除">🗑️</button></div></div>`; 
    }
    ui.innerHTML = htmlStr; 
}

// =========================================================================
// 3. 艾宾浩斯智能背单词 (强力落盘 + 1秒后极速复习)
// =========================================================================

// 【核心抗遗忘时间轴】
const LOCAL_SRS_INTERVALS = [ 
    0,                      // step 0: 新词待学
    -1000,                  // step 1: 刚背完的新词，下一次复习时间设为-1秒(立刻复习)
    12 * 3600 * 1000,       // step 2: 12小时后复习
    24 * 3600 * 1000,       // step 3: 1天后复习
    3 * 24 * 3600 * 1000,   // step 4: 3天后复习
    7 * 24 * 3600 * 1000,   // step 5: 7天后复习
    15 * 24 * 3600 * 1000   // step 6: 15天后复习
];
window.currentSRSType = 'new'; 

window.getDailyTarget = function() {
    let pfx = typeof getPrefix === 'function' ? getPrefix() : 'eh_';
    return parseInt(localStorage.getItem(pfx + 'srs_target')) || 30;
}

window.changeDailyTarget = function(selectObj) {
    let num = parseInt(selectObj.value);
    if(num > 0) {
        let pfx = typeof getPrefix === 'function' ? getPrefix() : 'eh_';
        localStorage.setItem(pfx + 'srs_target', num);
        window.renderVocabSRS(); 
    }
}

window.getSRSDailyStats = function() {
    let pfx = typeof getPrefix === 'function' ? getPrefix() : 'eh_';
    let today = new Date().toLocaleDateString();
    let stats = JSON.parse(localStorage.getItem(pfx + 'srs_daily')) || { date: today, newLearned: 0, reviewed: 0 };
    if (stats.date !== today) {
        stats = { date: today, newLearned: 0, reviewed: 0 };
        localStorage.setItem(pfx + 'srs_daily', JSON.stringify(stats));
    }
    return stats;
}

window.addSRSDailyStat = function(type) {
    let pfx = typeof getPrefix === 'function' ? getPrefix() : 'eh_';
    let stats = window.getSRSDailyStats();
    if (type === 'new') stats.newLearned++;
    if (type === 'review') stats.reviewed++;
    localStorage.setItem(pfx + 'srs_daily', JSON.stringify(stats));
}

window.openImportSRS = function() {
    if(!requireAuth()) return; syncDataLive();
    let sel = document.getElementById('sel-srs-source'); 
    let htmlStr = `<option value="nb" style="font-weight:bold;">🧡 导入: 我的生词本</option>`;
    if (bookshelf && Array.isArray(bookshelf)) {
        for(let i=0; i<bookshelf.length; i++) { htmlStr += `<option value="bs-${i}-all" style="font-weight:bold; color:var(--primary);">📘 导入: 单词书：${bookshelf[i].name} ${bookshelf[i].vol}</option>`; }
    }
    sel.innerHTML = htmlStr; openModal('modal-import-srs');
}

window.execImportSRS = function() {
    let sourceVal = document.getElementById('sel-srs-source').value; let selectedWords = [];
    if (sourceVal === 'nb') { selectedWords = selectedWords.concat(notebook); } 
    else if (sourceVal.startsWith('bs-')) { const parts = sourceVal.split('-'); const bIdx = parseInt(parts[1]); if (bookshelf[bIdx] && bookshelf[bIdx].words) { selectedWords = selectedWords.concat(bookshelf[bIdx].words); } }
    
    let addedCount = 0;
    selectedWords.forEach(w => {
        if(!srsPlan.find(s => s.word.toLowerCase() === w.word.toLowerCase())) {
            srsPlan.push({ word: w.word, cn: w.cn, en: w.en, phonetic: w.phonetic, step: 0, nextReviewTime: Date.now() });
            addedCount++;
        }
    });
    saveUserData(); closeModals(); window.renderVocabSRS();
    alert(`成功导入 ${addedCount} 个新单词到学习计划！`);
}

window.renderVocabSRS = function() {
    let container = document.getElementById('p-vocab-srs');
    if(!container) return;
    
    if (typeof srsPlan === 'undefined' || !Array.isArray(srsPlan)) return;

    let now = Date.now();
    let target = window.getDailyTarget();
    let stats = window.getSRSDailyStats();

    let newWordsPending = srsPlan.filter(w => w.step === 0);
    // 复习池：只要等级在 1~98 之间，并且时间到了，就会出现
    let reviewWordsPending = srsPlan.filter(w => w.step > 0 && w.step < 99 && w.nextReviewTime <= now);
    let masteredCount = srsPlan.filter(w => w.step >= 99).length;

    let todayNewLeft = Math.max(0, target - stats.newLearned);
    let actualNewToLearn = Math.min(todayNewLeft, newWordsPending.length);

    let html = `
        <div class="back-link" onclick="showPage('vocab-main')">← 返回词库中心</div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 30px;">
            <h1 class="hero-title" style="margin:0;">🔥 智能背单词 (今日计划)</h1>
            <div style="display:flex; gap:10px;">
                <button class="btn btn-outline" style="border-color:var(--success); color:var(--success);">🏆 熟知词: ${masteredCount} 个</button>
                <button class="btn btn-outline" onclick="window.openImportSRS()">📥 导入新词库</button>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 30px; margin-bottom: 40px;">
            
            <div style="background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%); padding: 40px 30px; border-radius: 30px; border: 2px solid #c7d2fe; position: relative; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(99,102,241,0.1);">
                <div style="position: absolute; top: -20px; right: -20px; font-size: 8rem; opacity: 0.1;">🌱</div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
                    <h2 style="color: var(--primary); margin: 0; font-size: 1.8rem;">今日新词</h2>
                    <div style="position:relative; font-size:1rem; background:white; border-radius:12px; box-shadow:0 2px 6px rgba(99,102,241,0.15); display:flex; align-items:center; border:2px solid #c7d2fe; transition:0.2s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='#c7d2fe'">
                        <div style="padding-left:12px; pointer-events:none;">⚙️</div>
                        <select onchange="window.changeDailyTarget(this)" style="border:none; outline:none; background:transparent; font-weight:900; color:var(--primary); cursor:pointer; font-size:1.05rem; padding:10px 30px 10px 8px; width:100%; appearance:none; -webkit-appearance:none;">
                            <option value="10" ${target === 10 ? 'selected' : ''}>10 词 / 天</option>
                            <option value="20" ${target === 20 ? 'selected' : ''}>20 词 / 天</option>
                            <option value="30" ${target === 30 ? 'selected' : ''}>30 词 / 天</option>
                            <option value="50" ${target === 50 ? 'selected' : ''}>50 词 / 天</option>
                            <option value="80" ${target === 80 ? 'selected' : ''}>80 词 / 天</option>
                            <option value="100" ${target === 100 ? 'selected' : ''}>100 词 / 天</option>
                        </select>
                        <div style="position:absolute; right:12px; pointer-events:none; font-size:0.8rem; color:var(--primary);">▼</div>
                    </div>
                </div>

                <div style="display: flex; align-items: flex-end; gap: 15px; margin: 30px 0;">
                    <span style="font-size: 4.5rem; font-weight: 900; color: var(--primary); line-height: 0.8;">${actualNewToLearn}</span>
                    <span style="color: var(--text-light); font-weight: bold; padding-bottom: 8px; font-size:1.2rem;">待学 (剩余)</span>
                </div>
                <div style="font-size: 1.05rem; color: #4f46e5; font-weight: 700;">今日已学: ${stats.newLearned} / ${target}</div>
                <div style="width: 100%; height: 10px; background: #c7d2fe; border-radius: 5px; margin-top: 15px;">
                    <div style="width: ${Math.min(100, (stats.newLearned/target)*100)}%; height: 100%; background: var(--primary); border-radius: 5px; transition: width 0.5s;"></div>
                </div>
                <button class="btn" style="width: 100%; margin-top: 35px; padding: 20px; font-size: 1.3rem; box-shadow: 0 10px 15px -3px rgba(99,102,241,0.3);" onclick="window.startSRSSession('new', ${actualNewToLearn})">▶️ 开始学习新词</button>
            </div>

            <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); padding: 40px 30px; border-radius: 30px; border: 2px solid #a7f3d0; position: relative; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(16,185,129,0.1);">
                <div style="position: absolute; top: -20px; right: -20px; font-size: 8rem; opacity: 0.1;">🔄</div>
                <h2 style="color: var(--success); margin-top: 0; font-size: 1.8rem;">今日复习</h2>
                <div style="display: flex; align-items: flex-end; gap: 15px; margin: 40px 0 30px 0;">
                    <span style="font-size: 4.5rem; font-weight: 900; color: var(--success); line-height: 0.8;">${reviewWordsPending.length}</span>
                    <span style="color: var(--text-light); font-weight: bold; padding-bottom: 8px; font-size:1.2rem;">待复习 (含刚学完的新词)</span>
                </div>
                <div style="font-size: 1.05rem; color: #059669; font-weight: 700;">今日已完成复习: ${stats.reviewed} 词</div>
                <div style="width: 100%; height: 10px; background: #a7f3d0; border-radius: 5px; margin-top: 15px;">
                    <div style="width: ${stats.reviewed > 0 ? 100 : 0}%; height: 100%; background: var(--success); border-radius: 5px; transition: width 0.5s;"></div>
                </div>
                <button class="btn" style="width: 100%; margin-top: 35px; padding: 20px; font-size: 1.3rem; background: var(--success); box-shadow: 0 10px 15px -3px rgba(16,185,129,0.3);" onclick="window.startSRSSession('review', ${reviewWordsPending.length})">▶️ 开始智能复习</button>
            </div>
        </div>

        <div style="background: #fffbeb; padding: 35px; border-radius: 30px; border: 3px dashed #fbbf24; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px; position:relative; overflow:hidden;">
            <div style="position:absolute; bottom:-30px; left:10%; font-size:10rem; opacity:0.1;">🎮</div>
            <div style="position:relative; z-index:2;">
                <h2 style="margin: 0 0 10px 0; color: #d97706; font-size: 1.8rem;">🎮 边玩边背 (提取今日专属词汇)</h2>
                <p style="margin: 0; color: #92400e; font-size: 1.1rem; max-width:600px; line-height:1.5;">系统将自动打包你【今日待学 + 待复习】的所有单词生成专属任务书，护送你直接空降游戏厅！</p>
            </div>
            <button class="btn" style="background: #f59e0b; padding: 20px 40px; font-size: 1.3rem; font-weight: 900; border-radius:20px; box-shadow:0 10px 20px rgba(245, 158, 11, 0.3); z-index:2;" onclick="window.launchSRSGameMenu()">🚀 提取词汇去闯关</button>
        </div>

        <div id="srs-game-selector" class="hidden" style="margin-top: 30px; padding: 30px; background: white; border-radius: 30px; border: 2px solid var(--border); box-shadow:var(--shadow);">
            <h3 style="margin:0 0 20px 0; color: var(--text); font-size:1.5rem;">👇 已为您打包好词汇，请选择游戏立即开战：</h3>
            <div class="hub-grid" id="srs-game-icons"></div>
        </div>
    `;
    container.innerHTML = html;
}

window.startSRSSession = function(type, limit) {
    if(!requireAuth()) return;
    
    let target = window.getDailyTarget();
    let stats = window.getSRSDailyStats();
    let now = Date.now();
    
    if (type === 'new') {
        let pendingAll = srsPlan.filter(w => w.step === 0);
        if (pendingAll.length === 0) return alert("⚠️ 您的背单词计划中没有新词了哦！\n👉 请点击右上角的【📥 导入新词库】导入。");
        if (stats.newLearned >= target) return alert(`🎯 太棒了！今日设定的目标（${target}词）已达成！\n如果想继续背，请在标题旁的下拉框调大计划数字。`);
    } else {
        let pendingReview = srsPlan.filter(w => w.step > 0 && w.step < 99 && w.nextReviewTime <= now);
        if (pendingReview.length === 0) return alert("🎉 完美！您当前没有任何需要复习的单词！");
    }
    
    window.currentSRSType = type;
    
    if (type === 'new') {
        currentSRSQueue = srsPlan.filter(w => w.step === 0).slice(0, limit);
    } else {
        currentSRSQueue = srsPlan.filter(w => w.step > 0 && w.step < 99 && w.nextReviewTime <= now).slice(0, limit);
    }
    
    currentSRSQueue.sort(() => 0.5 - Math.random());
    currentSRSIndex = 0;
    
    showPage('srs-learn');
    window.renderSRSCard();
}

window.renderSRSCard = function() {
    document.getElementById('srs-progress').innerText = `${currentSRSIndex + 1} / ${currentSRSQueue.length}`;
    let w = currentSRSQueue[currentSRSIndex];
    
    document.getElementById('srs-word-display').innerText = w.word;
    document.getElementById('srs-phonetic-display').innerText = w.phonetic || '';
    document.getElementById('srs-cn-display').innerText = w.cn;
    document.getElementById('srs-en-display').innerText = w.en || '';
    
    document.getElementById('srs-meaning-area').classList.add('hidden');
    document.getElementById('srs-init-btns').classList.remove('hidden');
    document.getElementById('srs-eval-btns').classList.add('hidden');
    document.getElementById('srs-next-btn').classList.add('hidden');
    
    speak(w.word);
}

window.srsReveal = function(action) {
    document.getElementById('srs-meaning-area').classList.remove('hidden');
    document.getElementById('srs-init-btns').classList.add('hidden');
    
    let actStr = String(action).toLowerCase();
    let isForget = (actStr === 'forget' || actStr === 'false' || actStr === '0' || actStr === '不认识');
    
    if (isForget) {
        document.getElementById('srs-next-btn').classList.remove('hidden');
        let w = currentSRSQueue[currentSRSIndex];
        
        // 【关键防御一】：强制同步寻找本体
        let planWord = srsPlan.find(x => x.word === w.word) || w;
        planWord.step = 0; 
        planWord.nextReviewTime = Date.now(); 
        
        currentSRSQueue.push(planWord); 
        if (typeof saveUserData === 'function') saveUserData();
        
        document.getElementById('srs-progress').innerText = `${currentSRSIndex + 1} / ${currentSRSQueue.length}`;
    } else {
        document.getElementById('srs-eval-btns').classList.remove('hidden');
    }
}

// 🔥 【终极杀招】：不管你按钮传什么值，强行定位数据库核心并强制写盘保存！
window.srsAnswer = function(grade) {
    if (!currentSRSQueue || !currentSRSQueue[currentSRSIndex]) return window.srsNext();
    let w = currentSRSQueue[currentSRSIndex];
    
    // 【强制寻根】：去全局的总词库中找到它的“真身”
    let planWord = null;
    if (typeof srsPlan !== 'undefined' && Array.isArray(srsPlan)) {
        planWord = srsPlan.find(x => x.word === w.word);
    }
    if (!planWord) planWord = w; // 兜底

    let g = String(grade).toLowerCase();
    let isEasy = (g === 'easy' || g === '3' || g === '太简单');
    let isWrong = (g === 'wrong' || g === 'hard' || g === 'false' || g === '0' || g === '1' || g === '不认识');
    
    if (isWrong) {
        planWord.step = 0; 
        planWord.nextReviewTime = Date.now(); 
        currentSRSQueue.push(planWord); 
    } else {
        window.addSRSDailyStat(window.currentSRSType);
        if (isEasy) {
            planWord.step = 99; // 一键斩杀，熟知词+1
        } else {
            planWord.step++; // 变为认识状态
            if (planWord.step >= LOCAL_SRS_INTERVALS.length) { 
                planWord.step = 99; 
            } else { 
                planWord.nextReviewTime = Date.now() + LOCAL_SRS_INTERVALS[planWord.step]; 
            }
        }
    }
    
    // 【强制写盘】：修改一个字，立马存硬盘，杜绝刷新丢失！
    if (typeof saveUserData === 'function') saveUserData();
    
    window.srsNext();
}

window.srsNext = function() {
    currentSRSIndex++;
    if (currentSRSIndex >= currentSRSQueue.length) {
        if (typeof saveUserData === 'function') saveUserData();
        alert("🎉 恭喜！当前背诵队列已清空！\n（请注意观察大屏幕：刚背完的新词已经跑到【今日复习】里了，如果是太简单的词则会变成【熟知词】！）");
        showPage('vocab-srs');
    } else {
        window.renderSRSCard();
    }
}

window.exitSRSSession = function() { 
    if (typeof saveUserData === 'function') saveUserData();
    showPage('vocab-srs'); 
}

// =========================================================================
// 4. 专属直连游戏通道
// =========================================================================
window.launchSRSGameMenu = function() {
    let now = Date.now();
    let target = window.getDailyTarget();
    let newWords = srsPlan.filter(w => w.step === 0).slice(0, target);
    let reviewWords = srsPlan.filter(w => w.step > 0 && w.step < 99 && w.nextReviewTime <= now);
    let todayWords = [...newWords, ...reviewWords];
    
    if (todayWords.length < 5) {
        alert("⚠️ 今日待学/待复习单词总数不足 5 个，无法开启游戏模式。"); return;
    }
    
    let uniqueWords = Array.from(new Map(todayWords.map(w => [w.word, w])).values());
    window.GameState.tempSRSGameWords = uniqueWords;

    let selector = document.getElementById('srs-game-selector');
    selector.classList.remove('hidden');
    
    let games = [
        {id: 'match', icon: '🧩', name: '连连看', color: '#6366f1'}, {id: 'memory', icon: '🎴', name: '翻牌记忆', color: '#10b981'},
        {id: 'whack', icon: '🔨', name: '打地鼠', color: '#ef4444'}, {id: 'speed', icon: '⚡', name: '闪读', color: '#f59e0b'},
        {id: 'pk_horse', icon: '🐎', name: '赛马(双人)', color: '#8b5cf6'}, {id: 'quiz', icon: '🎯', name: '经典测验', color: '#3b82f6'}
    ];
    document.getElementById('srs-game-icons').innerHTML = games.map(g => `<div class="main-card" style="padding: 20px; border: 2px solid ${g.color}; display:flex; flex-direction:column; align-items:center; transition: transform 0.2s; cursor:pointer;" onclick="window.startSRSGameDirectly('${g.id}')"><div style="font-size: 3rem; margin-bottom:10px;">${g.icon}</div><h3 style="margin: 0; color: ${g.color}; font-size:1.2rem;">${g.name}</h3></div>`).join('');
    selector.scrollIntoView({ behavior: 'smooth' });
}

window.startSRSGameDirectly = function(gameId) {
    if (typeof initGame === 'function') initGame(gameId, window.GameState.tempSRSGameWords); 
    else alert("⚠️ 游戏引擎未加载！");
}
