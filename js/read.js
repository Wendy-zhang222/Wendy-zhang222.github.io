/* =========================================================================
   EnglishHub Pro - 智能阅读模块 (js/read.js)
   负责：文章智能分词、点击查词查音标、一键加入生词本、阅读历史(图书馆)管理
   依赖：main.js (需在其之后加载)
   ========================================================================= */

// =========================================================================
// 1. 文章解析与沉浸式渲染
// =========================================================================

async function processRead() {
    if(!requireAuth()) return;
    const text = document.getElementById('in-read-text').value.trim();
    if(!text) { alert("请输入需要阅读的英文文章！"); return; }
    
    // 隐藏输入框，显示加载状态
    document.getElementById('api-loading').style.display = 'flex';
    
    // 简单的分段和分词处理
    const paragraphs = text.split('\n').filter(p => p.trim() !== '');
    let html = '';
    
    paragraphs.forEach(p => {
        // 利用正则将单词提取出来并用 span 包裹，保留标点符号
        let words = p.split(/([a-zA-Z]+-?[a-zA-Z]*)/g);
        let phtml = '<p style="margin-bottom: 20px; text-indent: 2em;">';
        
        words.forEach(w => {
            if (/^[a-zA-Z]+-?[a-zA-Z]*$/.test(w)) {
                // 如果是纯英文单词，加上可点击的样式和事件
                phtml += `<span class="read-word" onclick="handleWordClick('${w}')">${w}</span>`;
            } else {
                // 如果是标点或空格，直接渲染
                phtml += w;
            }
        });
        phtml += '</p>';
        html += phtml;
    });
    
    // 渲染到展示区
    document.getElementById('read-display').innerHTML = html;
    document.getElementById('api-loading').style.display = 'none';
    
    // 切换页面视图
    document.getElementById('in-read-text').classList.add('hidden');
    document.getElementById('btn-process-read').classList.add('hidden');
    document.getElementById('read-display').classList.remove('hidden');
    document.getElementById('btn-save-read').classList.remove('hidden');
    
    // 滚动到顶部
    window.scrollTo(0, 0);
}

// =========================================================================
// 2. 点击查词与加入生词本
// =========================================================================

async function handleWordClick(word) {
    if(!requireAuth()) return;
    document.getElementById('api-loading').style.display = 'flex';
    
    try {
        // fetchInfo 函数已经在 main.js 中定义过了
        const info = await fetchInfo(word);
        
        // 渲染查词弹窗内容
        document.getElementById('modal-word-title').innerText = info.word;
        document.getElementById('modal-word-phonetic').innerText = info.phonetic || '暂无音标';
        document.getElementById('modal-word-cn').innerText = info.cn;
        document.getElementById('modal-word-en').innerText = info.en || '';
        
        // 绑定发音和添加生词本事件
        document.getElementById('btn-modal-speak').onclick = () => speak(info.word);
        document.getElementById('btn-modal-add').onclick = () => addToNotebook(info);
        
        document.getElementById('api-loading').style.display = 'none';
        openModal('modal-word-info');
        
    } catch(err) {
        document.getElementById('api-loading').style.display = 'none';
        alert("查词失败，请检查网络或稍后重试。");
    }
}

function addToNotebook(info) {
    // 检查是否已经存在于生词本中
    const exists = notebook.find(w => w.word.toLowerCase() === info.word.toLowerCase());
    if(exists) {
        alert(`单词 "${info.word}" 已经在你的生词本中了！`);
    } else {
        notebook.unshift(info);
        saveUserData(); // saveUserData 在 main.js 中
        alert(`成功将 "${info.word}" 加入生词本！`);
    }
    closeModals();
}

// =========================================================================
// 3. 阅读历史 (图书馆) 管理
// =========================================================================

function saveReadRecord() {
    if(!requireAuth()) return;
    
    let title = prompt("给这篇阅读材料起个标题保存吧：");
    if (!title) return;
    
    // 获取当前阅读区的纯文本内容
    let content = document.getElementById('in-read-text').value; 
    if(!content) {
        // 如果是从显示区提取（比如是从历史记录打开的）
        content = document.getElementById('read-display').innerText;
    }
    
    // 去重，如果同名就不重复保存
    if(!readHistory.find(r => r.title === title)) {
        readHistory.unshift({ 
            title: title, 
            content: content, 
            date: new Date().toLocaleString() 
        });
        saveUserData();
        alert("保存成功！可以在【我的图书馆】中随时复习。");
    } else {
        alert("已存在同名文章，无需重复保存！");
    }
}

function renderLibrary() {
    const ui = document.getElementById('ui-library-grid');
    if(!ui) return;
    
    if(!readHistory || readHistory.length === 0) {
        ui.innerHTML = `<p style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-light);">你的图书馆空空如也。快去阅读中心读篇文章并保存吧！</p>`;
        return;
    }
    
    let html = '';
    readHistory.forEach((record, index) => {
        // 截取前 100 个字符作为摘要
        let snippet = record.content.length > 100 ? record.content.substring(0, 100) + '...' : record.content;
        
        html += `
        <div class="main-card" style="text-align: left; position: relative;">
            <div style="margin-bottom: 10px; font-size: 2rem;">📰</div>
            <h2 style="font-size: 1.3rem; margin-bottom: 5px;">${record.title}</h2>
            <p style="font-size: 0.8rem; color: var(--primary); margin-bottom: 15px;">保存时间: ${record.date}</p>
            <p style="font-size: 0.95rem; color: var(--text-light); line-height: 1.5; margin-bottom: 20px;">${snippet}</p>
            
            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 15px;">
                <button class="btn" style="padding: 8px 20px; font-size: 0.9rem;" onclick="openReadRecord(${index})">继续阅读</button>
                <button class="btn btn-outline" style="padding: 8px 15px; border-color: var(--accent); color: var(--accent);" onclick="deleteReadRecord(${index})">删除</button>
            </div>
        </div>`;
    });
    
    ui.innerHTML = html;
}

function openReadRecord(index) {
    if(!requireAuth()) return;
    let record = readHistory[index];
    
    // 跳转到阅读页面
    showPage('read-main');
    
    // 将内容放回输入框并自动触发处理
    document.getElementById('in-read-text').value = record.content;
    processRead();
}

function deleteReadRecord(index) {
    if(!requireAuth()) return;
    if(confirm('确定要从图书馆删除这篇文章吗？')) {
        readHistory.splice(index, 1);
        saveUserData();
        renderLibrary();
    }
}

function resetReadArea() {
    document.getElementById('in-read-text').value = '';
    document.getElementById('read-display').innerHTML = '';
    
    document.getElementById('in-read-text').classList.remove('hidden');
    document.getElementById('btn-process-read').classList.remove('hidden');
    document.getElementById('read-display').classList.add('hidden');
    document.getElementById('btn-save-read').classList.add('hidden');
}

// =========================================================================
// 将供 HTML 调用的函数暴露给全局 window
// =========================================================================
window.processRead = processRead;
window.handleWordClick = handleWordClick;
window.addToNotebook = addToNotebook;
window.saveReadRecord = saveReadRecord;
window.renderLibrary = renderLibrary;
window.openReadRecord = openReadRecord;
window.deleteReadRecord = deleteReadRecord;
window.resetReadArea = resetReadArea;