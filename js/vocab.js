/* =========================================================================
   EnglishHub Pro - 词库与智能记忆模块 (js/vocab.js)
   负责：生词本管理、系统词书管理、批量导入、SRS 艾宾浩斯记忆引擎
   依赖：main.js (需在其之后加载)
   ========================================================================= */

// =========================================================================
// 1. 生词本管理 (Notebook)
// =========================================================================

function renderNB() { 
    const ui = document.getElementById('ui-nb-list'); 
    if(!notebook || notebook.length === 0) { 
        ui.innerHTML = `<p style="text-align:center; padding:40px; color:var(--text-light);">生词本为空，请点击右上角批量导入。</p>`; 
        return; 
    } 
    let htmlStr = '';
    for(let i=0; i<notebook.length; i++) {
        let w = notebook[i];
        htmlStr += `
        <div class="word-item">
            <div style="flex:1">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-size:1.6rem; font-weight:900; color:var(--primary);">${w.word}</span>
                    <span style="color:var(--text-light); font-size:1.1rem;">${w.phonetic || ''}</span>
                </div>
                <div style="font-weight:700; font-size:1.15rem; margin:8px 0; color:var(--text);">${w.cn}</div>
                ${w.en ? `<div class="word-en-def">${w.en}</div>` : ''}
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
                <button class="btn btn-outline" style="padding:10px; border-radius:12px;" onclick="speak('${w.word}')" title="发音">🔊</button>
                <button class="btn btn-outline" style="padding:10px; border-radius:12px; border-color:#3b82f6; color:#3b82f6;" onclick="editWord(${i}, 'nb')" title="自定义修改释义">✏️</button>
                <button class="btn" style="background:var(--accent); padding:10px; border-radius:12px;" onclick="deleteNBWord(${i})" title="删除">🗑️</button>
            </div>
        </div>`;
    }
    ui.innerHTML = htmlStr; 
}

function deleteNBWord(index) {
    notebook.splice(index, 1);
    saveUserData();
    renderNB();
}

function editWord(index, type) {
    if(!requireAuth()) return;
    let targetList = type === 'nb' ? notebook : bookshelf[curBookIdx].words; 
    let wordObj = targetList[index];
    let newCn = prompt(`修改 "${wordObj.word}" 的中文释义 (提供高频词义或记忆口诀)：`, wordObj.cn);
    if (newCn !== null && newCn.trim() !== "") { 
        wordObj.cn = newCn.trim(); 
        saveUserData(); 
        type === 'nb' ? renderNB() : renderBookWords(); 
    }
}

// 批量解析单词 (支持生词本和单词书)
async function processBatchWords(type) { 
    if(!requireAuth()) return;
    const inputId = type === 'nb' ? 'in-nb-batch' : 'in-u-batch'; 
    const rawInput = document.getElementById(inputId).value; 
    let splitArray = rawInput.split(/[\n,，;；]+/); 
    let words = [];
    
    for(let i=0; i<splitArray.length; i++) { 
        let w = splitArray[i].trim(); 
        if(w) words.push(w); 
    }
    
    const unitName = type === 'bs' ? (document.getElementById('in-u-name').value.trim() || "默认单元") : ""; 
    if(words.length === 0) return; 
    
    closeModals(); 
    document.getElementById('api-loading').style.display = 'flex'; 
    
    for(let i=0; i<words.length; i++) { 
        // fetchInfo 定义在 main.js 中
        const info = await fetchInfo(words[i]); 
        if(type === 'nb') { 
            notebook.unshift(info); 
        } else { 
            info.unit = unitName; 
            bookshelf[curBookIdx].words.unshift(info); 
        } 
    } 
    
    saveUserData(); 
    document.getElementById('api-loading').style.display = 'none'; 
    document.getElementById(inputId).value = ""; 
    
    if(type === 'nb') renderNB(); 
    else renderBookWords();
}


// =========================================================================
// 2. 单词本管理 (Bookshelf)
// =========================================================================

function saveBook() { 
    if(!requireAuth()) return;
    const name = document.getElementById('in-b-name').value.trim(); 
    const vol = document.getElementById('in-b-vol').value.trim(); 
    if(!name) { alert("书名不能为空！"); return; } 
    
    bookshelf.unshift({ name: name, vol: vol, words: [] }); 
    saveUserData(); 
    closeModals(); 
    renderBS(); 
    
    document.getElementById('in-b-name').value = ''; 
    document.getElementById('in-b-vol').value = ''; 
}

function renderBS() { 
    const ui = document.getElementById('ui-book-grid'); 
    if(!bookshelf || bookshelf.length === 0) { 
        ui.innerHTML = `<p style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-light);">尚未创建词书，请点击右上角新建。</p>`; 
        return; 
    } 
    let htmlStr = '';
    for(let i=0; i<bookshelf.length; i++) {
        let b = bookshelf[i]; 
        let count = b.words ? b.words.length : 0; 
        let volStr = b.vol ? (b.vol + ' | ') : '';
        htmlStr += `
        <div class="main-card" onclick="openBook(${i})" style="padding: 40px 20px;">
            <span class="card-icon">📘</span>
            <h2 style="font-size:1.5rem;">${b.name}</h2>
            <p style="margin-bottom:15px;">${volStr}已收录 ${count} 词</p>
            <button class="btn btn-outline" style="padding:8px 16px; font-size:0.9rem;" onclick="event.stopPropagation(); deleteBook(${i});">删除词书</button>
        </div>`;
    }
    ui.innerHTML = htmlStr; 
}

function deleteBook(index) {
    if(confirm('确定删除此书及其包含的所有单词吗？')) { 
        bookshelf.splice(index, 1); 
        saveUserData(); 
        renderBS(); 
    }
}

function openBook(index) { 
    curBookIdx = index; 
    showPage('book-detail'); 
    document.getElementById('detail-title').innerText = `${bookshelf[index].name} ${bookshelf[index].vol}`; 
    renderBookWords(); 
}

function renderBookWords() { 
    const ui = document.getElementById('ui-book-words'); 
    if(curBookIdx === -1 || !bookshelf[curBookIdx]) return;
    
    const words = bookshelf[curBookIdx].words; 
    if(!words || words.length === 0) { 
        ui.innerHTML = `<p style="text-align:center; padding:40px; color:var(--text-light);">该词书为空，请点击右上角导入单元单词。</p>`; 
        return; 
    } 
    
    let htmlStr = ''; 
    let currentUnit = ''; 
    for(let i=0; i<words.length; i++) {
        let w = words[i]; 
        let u = w.unit || "未分类单元";
        
        if(u !== currentUnit) { 
            currentUnit = u; 
            htmlStr += `<div class="group-header">${currentUnit}</div>`; 
        } 
        
        htmlStr += `
        <div class="word-item">
            <div style="flex:1">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-size:1.5rem; font-weight:900;">${w.word}</span>
                    <span style="color:var(--text-light);">${w.phonetic || ''}</span>
                </div>
                <div style="font-weight:700; margin:5px 0;">${w.cn}</div>
                ${w.en ? `<div class="word-en-def">${w.en}</div>` : ''}
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
                <button class="btn btn-outline" style="padding:10px; border-radius:12px;" onclick="speak('${w.word}')" title="发音">🔊</button>
                <button class="btn btn-outline" style="padding:10px; border-radius:12px; border-color:#3b82f6; color:#3b82f6;" onclick="editWord(${i}, 'bs')" title="修改">✏️</button>
                <button class="btn" style="background:var(--accent); padding:10px; border-radius:12px;" onclick="deleteBookWord(${i})" title="删除">🗑️</button>
            </div>
        </div>`; 
    }
    ui.innerHTML = htmlStr; 
}

function deleteBookWord(index) {
    bookshelf[curBookIdx].words.splice(index, 1); 
    saveUserData(); 
    renderBookWords();
}


// =========================================================================
// 3. 艾宾浩斯智能背单词 (SRS Engine)
// =========================================================================

function openImportSRS() {
    if(!requireAuth()) return; 
    syncDataLive();
    
    let sel = document.getElementById('sel-srs-source'); 
    let htmlStr = `<option value="nb" style="font-weight:bold;">🧡 导入: 我的生词本</option>`;
    
    if (bookshelf && Array.isArray(bookshelf)) {
        for(let i=0; i<bookshelf.length; i++) {
            let b = bookshelf[i]; 
            htmlStr += `<option value="bs-${i}-all" style="font-weight:bold; color:var(--primary);">📘 导入: 单词书：${b.name} ${b.vol}</option>`;
        }
    }
    sel.innerHTML = htmlStr; 
    openModal('modal-import-srs');
}

function execImportSRS() {
    let sourceVal = document.getElementById('sel-srs-source').value; 
    let selectedWords = [];
    
    if (sourceVal === 'nb') { 
        selectedWords = selectedWords.concat(notebook); 
    } else if (sourceVal.startsWith('bs-')) { 
        const parts = sourceVal.split('-'); 
        const bIdx = parseInt(parts[1]); 
        if (bookshelf[bIdx] && bookshelf[bIdx].words) { 
            selectedWords = selectedWords.concat(bookshelf[bIdx].words); 
        } 
    }
    
    let addedCount = 0;
    selectedWords.forEach(w => {
        // 防止重复导入
        if(!srsPlan.find(s => s.word.toLowerCase() === w.word.toLowerCase())) {
            srsPlan.push({ 
                word: w.word, 
                cn: w.cn, 
                en: w.en, 
                phonetic: w.phonetic, 
                step: 0, 
                nextReviewTime: Date.now() 
            });
            addedCount++;
        }
    });
    
    saveUserData(); 
    closeModals(); 
    renderVocabSRS();
    alert(`成功导入 ${addedCount} 个新单词到学习计划！`);
}

function renderVocabSRS() {
    let now = Date.now();
    let dueCount = srsPlan.filter(w => w.step < 99 && w.nextReviewTime <= now).length;
    let totalCount = srsPlan.length;
    let masteredCount = srsPlan.filter(w => w.step >= 99).length;
    
    let elDue = document.getElementById('srs-due-count');
    let elTotal = document.getElementById('srs-total-count');
    let elMastered = document.getElementById('srs-mastered-count');
    
    if(elDue) elDue.innerText = dueCount;
    if(elTotal) elTotal.innerText = totalCount;
    if(elMastered) elMastered.innerText = masteredCount;
}

function startSRSSession() {
    if(!requireAuth()) return;
    let now = Date.now();
    // 找出所有需要复习的单词
    currentSRSQueue = srsPlan.filter(w => w.step < 99 && w.nextReviewTime <= now);
    // 打乱顺序
    currentSRSQueue.sort(() => 0.5 - Math.random());
    
    if(currentSRSQueue.length === 0) { 
        alert("太棒了！所有到期的复习任务都已完成，请稍后再来。"); 
        return; 
    }
    
    currentSRSIndex = 0;
    showPage('srs-learn');
    renderSRSCard();
}

function renderSRSCard() {
    document.getElementById('srs-progress').innerText = `${currentSRSIndex + 1} / ${currentSRSQueue.length}`;
    let w = currentSRSQueue[currentSRSIndex];
    
    document.getElementById('srs-word-display').innerText = w.word;
    document.getElementById('srs-phonetic-display').innerText = w.phonetic || '';
    document.getElementById('srs-cn-display').innerText = w.cn;
    document.getElementById('srs-en-display').innerText = w.en || '';
    
    // 初始化 UI 状态
    document.getElementById('srs-meaning-area').classList.add('hidden');
    document.getElementById('srs-init-btns').classList.remove('hidden');
    document.getElementById('srs-eval-btns').classList.add('hidden');
    document.getElementById('srs-next-btn').classList.add('hidden');
    
    speak(w.word);
}

function srsReveal(action) {
    document.getElementById('srs-meaning-area').classList.remove('hidden');
    document.getElementById('srs-init-btns').classList.add('hidden');
    
    if (action === 'forget') {
        document.getElementById('srs-next-btn').classList.remove('hidden');
        let w = currentSRSQueue[currentSRSIndex];
        // 忘了就重置 step，并且加入队尾等会儿再考一遍
        w.step = 0; 
        w.nextReviewTime = Date.now() + SRS_INTERVALS[0];
        currentSRSQueue.push(w);
        document.getElementById('srs-progress').innerText = `${currentSRSIndex + 1} / ${currentSRSQueue.length}`;
    } else {
        // 认识，则显示自评按钮 (正确、模糊、简单)
        document.getElementById('srs-eval-btns').classList.remove('hidden');
    }
}

function srsAnswer(grade) {
    let w = currentSRSQueue[currentSRSIndex];
    if (grade === 'wrong') {
        w.step = 0; 
        w.nextReviewTime = Date.now() + SRS_INTERVALS[0];
        currentSRSQueue.push(w); 
    } else if (grade === 'hard') {
        w.nextReviewTime = Date.now() + SRS_INTERVALS[0]; 
    } else if (grade === 'good') {
        w.step++;
        if (w.step >= SRS_INTERVALS.length) w.step = 99; // 99 代表彻底掌握
        else w.nextReviewTime = Date.now() + SRS_INTERVALS[w.step];
    } else if (grade === 'easy') {
        w.step = 99; 
    }
    srsNext();
}

function srsNext() {
    currentSRSIndex++;
    if (currentSRSIndex >= currentSRSQueue.length) {
        saveUserData();
        alert("🎉 恭喜！本次背单词任务已全部完成！");
        showPage('vocab-srs');
    } else {
        renderSRSCard();
    }
}

function exitSRSSession() { 
    saveUserData(); 
    showPage('vocab-srs'); 
}


// =========================================================================
// 挂载到全局 window，供 HTML 中的 onclick 调用
// =========================================================================
window.renderNB = renderNB;
window.deleteNBWord = deleteNBWord;
window.editWord = editWord;
window.processBatchWords = processBatchWords;

window.saveBook = saveBook;
window.renderBS = renderBS;
window.deleteBook = deleteBook;
window.openBook = openBook;
window.renderBookWords = renderBookWords;
window.deleteBookWord = deleteBookWord;

window.openImportSRS = openImportSRS;
window.execImportSRS = execImportSRS;
window.renderVocabSRS = renderVocabSRS;
window.startSRSSession = startSRSSession;
window.renderSRSCard = renderSRSCard;
window.srsReveal = srsReveal;
window.srsAnswer = srsAnswer;
window.srsNext = srsNext;
window.exitSRSSession = exitSRSSession;