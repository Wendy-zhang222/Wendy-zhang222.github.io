// js/read.js
// =========================================================================
// 📖 阅读中心模块逻辑 (文件夹网盘版 + 批量上传 + 智能沉浸阅读器)
// =========================================================================

// 用于暂存当前阅读文章中解析出的生词
let tempReadVocab = [];

// =========================================================================
// 1. 个人图书馆 - 文件夹与网盘式 UI 渲染
// =========================================================================

/**
 * 渲染个人图书馆（文件夹分类、按标题排序）
 */
function renderLibrary() { 
    // 获取当前用户的专属文件夹数据
    let prefix = currentUser ? `eh_u_${currentUser.id}_` : `eh_guest_`;
    let readFolders = JSON.parse(localStorage.getItem(prefix+'read_folders')) || ['默认分类'];

    // 兼容旧数据：确保所有文章都有归属文件夹
    if(library && library.length > 0) {
        library.forEach(art => { if(!art.folder) art.folder = '默认分类'; });
    }

    const view = document.getElementById('p-read-library');
    
    // 动态重写整个图书馆界面的 DOM，注入文件夹管理 UI
    view.innerHTML = `
        <div class="vocab-header" style="align-items: flex-end; margin-bottom: 30px;">
            <div><div class="back-link" onclick="showPage('read-main')">← 返回阅读中心</div><h1 style="margin:0; font-size:2.5rem;">个人图书馆 🏛️</h1></div>
            <div style="display:flex; gap:15px;">
                <button class="btn btn-outline" onclick="addLibraryFolder()" style="font-size:1.05rem;">+ 新建分类文件夹</button>
                <button class="btn" onclick="openLibraryUploadModal()" style="font-size:1.05rem;">📥 批量导入文档 / 新建</button>
            </div>
        </div>
        <div id="library-folders-container" style="display:flex; flex-direction:column; gap:40px;"></div>
    `;

    const container = document.getElementById('library-folders-container');
    
    if (!library || library.length === 0) { 
        container.innerHTML = `
            <div style="text-align:center; padding: 80px 20px; background:var(--white); border-radius:30px; border:2px dashed var(--border);">
                <div style="font-size:5rem; margin-bottom:20px; opacity:0.5;">📚</div>
                <h2 style="color:var(--text); margin-bottom:10px;">图书馆空空如也</h2>
                <p style="color:var(--text-light); font-size:1.1rem;">点击右上角【批量导入文档】，一键上传您的英文原著和学习材料！</p>
            </div>`; 
        return; 
    }

    let htmlStr = '';

    readFolders.forEach(folder => {
        // 筛选该文件夹下的文章，并按照标题按字母/拼音进行排序
        let folderArts = library.filter(a => a.folder === folder).sort((a,b) => a.title.localeCompare(b.title, 'zh-CN'));

        htmlStr += `
        <div style="background:var(--bg); border:1px solid var(--border); border-radius:25px; padding:30px; box-shadow:0 4px 6px rgba(0,0,0,0.02);">
            <div style="display:flex; justify-content:space-between; border-bottom:2px dashed var(--border); padding-bottom:15px; margin-bottom:25px;">
                <h2 style="margin:0; color:var(--primary); display:flex; align-items:center; gap:12px; font-size:1.6rem;">
                    📁 ${folder} 
                    <span style="font-size:1rem; color:var(--primary); background:var(--primary-light); padding:4px 12px; border-radius:12px; font-weight:bold;">${folderArts.length} 篇</span>
                </h2>
                ${folder !== '默认分类' ? `<button class="btn-outline" style="border:none; color:var(--accent); cursor:pointer; font-weight:bold; font-size:1rem;" onclick="deleteLibraryFolder('${folder}')">删除分类</button>` : ''}
            </div>
            ${folderArts.length === 0 ? `<p style="color:var(--text-light); text-align:center; padding:20px 0;">此分类下暂无文档</p>` : `
            <div class="hub-grid" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:25px;">
                ${folderArts.map(art => {
                    // 找到在全局 library 里的真实索引用于删除和阅读
                    let idx = library.findIndex(a => a.id === art.id);
                    return `
                    <div class="main-card" style="padding: 25px; text-align: left; display: flex; flex-direction: column; justify-content: space-between; border: 2px solid #e2e8f0; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--primary)'; this.style.transform='translateY(-5px)';" onmouseout="this.style.borderColor='#e2e8f0'; this.style.transform='none';">
                        <div style="cursor:pointer;" onclick="readLibraryArticle(${idx})">
                            <h3 style="margin: 0 0 12px 0; font-size: 1.3rem; color: var(--text); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;" title="${art.title}">📄 ${art.title}</h3>
                            <p style="color: var(--text-light); font-size: 0.95rem; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; line-height:1.5;">${art.content.replace(/<[^>]+>/g, '')}</p>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; padding-top:20px; border-top:1px solid var(--border);">
                            <span style="font-size: 0.85rem; color: #94a3b8; font-weight:600;">${art.date}</span>
                            <div style="display:flex; gap:10px;">
                                <button class="btn" style="padding: 8px 15px; font-size: 0.9rem;" onclick="readLibraryArticle(${idx})">📖 阅读</button>
                                <button class="btn btn-outline" style="padding: 8px 15px; font-size: 0.9rem; border-color:var(--accent); color:var(--accent);" onclick="deleteArticle(${idx})">删除</button>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>`}
        </div>`;
    });
    container.innerHTML = htmlStr;
}

// =========================================================================
// 2. 文件夹管理与批量文档导入
// =========================================================================

function addLibraryFolder() {
    let name = prompt("请输入新分类文件夹的名称：");
    if(name && name.trim()) {
        name = name.trim();
        let prefix = currentUser ? `eh_u_${currentUser.id}_` : `eh_guest_`;
        let readFolders = JSON.parse(localStorage.getItem(prefix+'read_folders')) || ['默认分类'];
        if(readFolders.includes(name)) return alert("该分类已存在！");
        
        readFolders.push(name);
        localStorage.setItem(prefix+'read_folders', JSON.stringify(readFolders));
        renderLibrary();
    }
}

function deleteLibraryFolder(folder) {
    if(confirm(`警告：确定要删除分类 [${folder}] 吗？\n删除后，该分类下的所有文档将被移入 "默认分类"，不会丢失。`)) {
        let prefix = currentUser ? `eh_u_${currentUser.id}_` : `eh_guest_`;
        let readFolders = JSON.parse(localStorage.getItem(prefix+'read_folders')) || ['默认分类'];
        
        readFolders = readFolders.filter(f => f !== folder);
        localStorage.setItem(prefix+'read_folders', JSON.stringify(readFolders));
        
        library.forEach(art => { if(art.folder === folder) art.folder = '默认分类'; });
        saveUserData();
        renderLibrary();
    }
}

/**
 * 动态重构弹窗，接入批量读取 TXT 文件的输入框
 */
function openLibraryUploadModal() {
    if(!requireAuth()) return;
    let prefix = currentUser ? `eh_u_${currentUser.id}_` : `eh_guest_`;
    let readFolders = JSON.parse(localStorage.getItem(prefix+'read_folders')) || ['默认分类'];

    let modal = document.getElementById('modal-add-article');
    modal.innerHTML = `
    <div class="modal">
        <div class="modal-close-btn" onclick="closeModals()">×</div>
        <h2 style="margin-top:0; color:var(--primary); font-size:1.8rem;">📥 导入 / 新建文档</h2>

        <label style="font-weight:800; color:var(--text); margin-bottom:10px; display:block;">存入目标分类：</label>
        <select id="lib-upload-folder" style="margin-bottom:25px; width:100%; padding:15px; border-radius:15px; border:2px solid var(--border); font-size:1.1rem; background:var(--bg); cursor:pointer;">
            ${readFolders.map(f => `<option value="${f}">${f}</option>`).join('')}
        </select>

        <div style="border: 3px dashed var(--primary); padding: 40px 20px; border-radius: 20px; text-align: center; background: var(--primary-light); margin-bottom: 30px; cursor:pointer; position:relative; transition:0.2s;" onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='var(--primary-light)'">
            <div style="font-size:3.5rem; margin-bottom:15px;">📁</div>
            <h3 style="margin:0 0 8px 0; color:var(--primary); font-size:1.3rem;">点击此处 批量选择本地 TXT 文档</h3>
            <p style="margin:0; font-size:0.95rem; color:var(--text-light); font-weight:bold;">系统会自动使用文件名作为文章标题</p>
            <input type="file" id="lib-file-upload" multiple accept=".txt" style="position:absolute; top:0; left:0; width:100%; height:100%; opacity:0; cursor:pointer;" onchange="handleLibraryBatchUpload(this)">
        </div>

        <div style="text-align:center; color:var(--text-light); margin-bottom:25px; position:relative;">
            <div style="border-bottom:2px solid var(--border); position:absolute; top:50%; width:100%; z-index:1;"></div>
            <span style="background:white; padding:0 20px; position:relative; z-index:2; font-weight:bold;">或者手动粘贴</span>
        </div>

        <input type="text" id="in-art-title" placeholder="手动输入: 文章标题">
        <textarea id="in-art-content" placeholder="手动输入: 粘贴正文内容..." style="height:120px;"></textarea>
        
        <div style="display:flex; gap:15px; margin-top:20px;">
            <button class="btn btn-outline" style="flex:1; padding:15px; font-size:1.1rem;" onclick="closeModals()">取消</button>
            <button class="btn" style="flex:1; padding:15px; font-size:1.1rem;" onclick="saveManualArticle()">保存手动内容</button>
        </div>
    </div>`;
    modal.style.display = 'flex';
}

/**
 * HTML5 API 读取本地文件内容，直接批量装载
 */
async function handleLibraryBatchUpload(input) {
    if(!input.files || input.files.length === 0) return;
    let folder = document.getElementById('lib-upload-folder').value;
    let files = Array.from(input.files);
    let successCount = 0;

    let loading = document.getElementById('api-loading');
    loading.innerText = `🤖 正在批量导入并解析 ${files.length} 篇文档...`;
    loading.style.display = 'flex';

    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        // 自动去掉 .txt 后缀作为标题
        let title = file.name.replace(/\.[^/.]+$/, ""); 
        
        try {
            let text = await file.text();
            if(text.trim()) {
                library.unshift({
                    id: Date.now() + Math.random(),
                    title: title,
                    content: text.trim(),
                    date: new Date().toLocaleDateString(),
                    folder: folder
                });
                successCount++;
            }
        } catch (e) {
            console.error("读取文件失败:", file.name, e);
        }
    }

    saveUserData();
    loading.style.display = 'none';
    closeModals();
    renderLibrary();
    alert(`✅ 成功批量导入 ${successCount} 篇文档到 [${folder}] 分类！`);
}

function saveManualArticle() {
    let title = document.getElementById('in-art-title').value.trim();
    let content = document.getElementById('in-art-content').value.trim();
    let folder = document.getElementById('lib-upload-folder').value;

    if(!title || !content) return alert("文章标题和内容不能为空！"); 

    library.unshift({ 
        id: Date.now() + Math.random(), 
        title: title, 
        content: content, 
        date: new Date().toLocaleDateString(),
        folder: folder 
    }); 
    saveUserData(); closeModals(); renderLibrary(); 
}

function deleteArticle(index) { 
    if(confirm('确定要彻底删除这篇文档吗？')) { library.splice(index, 1); saveUserData(); renderLibrary(); } 
}

// 从图书馆点击文档，直接拉起智能阅读器
function readLibraryArticle(index) { 
    document.getElementById('read-in').value = library[index].content; 
    showPage('read-smart'); processRead(); 
}

// =========================================================================
// 3. 智能沉浸式阅读器与双栏布局控制
// =========================================================================

function processRead() { 
    if(!requireAuth()) return;
    const text = document.getElementById('read-in').value; 
    if(!text) return; 
    
    document.getElementById('read-input-view').classList.add('hidden'); 
    const display = document.getElementById('read-display'); 
    display.classList.remove('hidden'); 
    
    // --- 动态构建左右分栏布局 ---
    let container = display.parentElement;
    container.style.display = 'flex';
    container.style.gap = '20px';
    container.style.alignItems = 'flex-start';
    
    // 左侧阅读区设置
    display.style.flex = '2'; 
    display.style.background = 'var(--bg)';
    display.style.borderRadius = '15px';
    display.style.padding = '30px';
    display.style.border = '1px solid var(--border)';
    
    // 右侧生词暂存面板动态注入
    let sidebar = document.getElementById('read-sidebar');
    if (!sidebar) {
        sidebar = document.createElement('div');
        sidebar.id = 'read-sidebar';
        sidebar.style.flex = '1';
        sidebar.style.minWidth = '320px';
        sidebar.style.background = 'var(--white)';
        sidebar.style.border = '2px solid var(--border)';
        sidebar.style.borderRadius = '15px';
        sidebar.style.padding = '20px';
        sidebar.style.position = 'sticky';
        sidebar.style.top = '100px'; 
        sidebar.style.maxHeight = 'calc(100vh - 120px)';
        sidebar.style.overflowY = 'auto';
        sidebar.style.boxShadow = 'var(--shadow)';
        container.appendChild(sidebar);
    }
    sidebar.style.display = 'block';
    
    tempReadVocab = [];
    renderReadSidebar();

    // 渲染阅读文本
    let wordsArray = text.split(/(\s+)/); 
    let htmlStr = '';
    for(let i = 0; i < wordsArray.length; i++) {
        let w = wordsArray[i]; 
        let clean = w.replace(/[^a-zA-Z]/g, ''); 
        if(clean.length > 0) {
            htmlStr += `<span class="read-word" onclick="quickLook('${clean}', this)">${w}</span>`;
        } else {
            htmlStr += w;
        }
    }
    display.innerHTML = htmlStr;
    
    readHistory.unshift({ date: new Date().toLocaleString(), content: `阅读文档: ${text.substring(0, 20)}...` });
    if(readHistory.length > 50) readHistory.pop(); 
    saveUserData();
}

function resetReader() { 
    document.getElementById('read-input-view').classList.remove('hidden'); 
    const display = document.getElementById('read-display');
    display.classList.add('hidden'); 
    document.getElementById('read-in').value = ''; 
    
    // 恢复原有布局
    let container = display.parentElement;
    container.style.display = 'block';
    display.style.flex = 'none';
    display.style.border = 'none';
    
    let sidebar = document.getElementById('read-sidebar');
    if (sidebar) sidebar.style.display = 'none';
    tempReadVocab = [];
}

// =========================================================================
// 4. 快捷取词、AI 解析与导出打印系统
// =========================================================================

async function quickLook(word, el) { 
    if(!requireAuth()) return;
    speak(word); 
    
    // 点击高亮视觉反馈
    if(el) {
        el.style.background = 'var(--primary-light)';
        el.style.color = 'var(--primary)';
        el.style.fontWeight = 'bold';
        el.style.borderBottom = '2px solid var(--primary)';
        el.style.borderRadius = '4px';
    }

    if(tempReadVocab.find(w => w.word.toLowerCase() === word.toLowerCase())) return; 

    // 加载动画
    let sidebar = document.getElementById('read-sidebar');
    let loadingHtml = `<div id="read-loading" style="text-align:center; padding:15px; color:white; background:var(--primary); border-radius:10px; margin-bottom:15px; font-weight:bold; animation: pulse-btn 1.5s infinite;">🤖 正在解析 "${word}"...</div>`;
    sidebar.innerHTML = loadingHtml + sidebar.innerHTML;

    let info = await fetchInfo(word); 
    
    tempReadVocab.unshift({
        id: Date.now() + Math.random().toString(),
        word: info.word,
        phonetic: info.phonetic,
        cn: info.cn,
        en: info.en,
        selected: true 
    });
    
    renderReadSidebar();
}

function renderReadSidebar() {
    let sidebar = document.getElementById('read-sidebar');
    if(!sidebar) return;

    if (tempReadVocab.length === 0) {
        sidebar.innerHTML = `
            <h3 style="margin-top:0; color:var(--primary); border-bottom:2px dashed var(--border); padding-bottom:10px;">📝 生词暂存区</h3>
            <div style="text-align:center; padding: 40px 10px;">
                <div style="font-size:3rem; margin-bottom:15px; opacity:0.5;">👈</div>
                <p style="color:var(--text-light); font-size:0.95rem; line-height:1.6;">点击左侧文章中的生词，<br>AI 会自动在此处解析并排版。</p>
            </div>
        `;
        return;
    }

    let selectedCount = tempReadVocab.filter(w => w.selected).length;

    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px dashed var(--border); padding-bottom:10px; margin-bottom:15px;">
            <h3 style="margin:0; color:var(--primary);">📝 生词暂存区 (${tempReadVocab.length})</h3>
            <label style="font-size:0.85rem; cursor:pointer; color:var(--text-light); font-weight:bold;">
                <input type="checkbox" style="transform:scale(1.2); margin-right:5px;" onchange="toggleAllReadWords(this.checked)" ${selectedCount === tempReadVocab.length ? 'checked' : ''}> 全选
            </label>
        </div>
        
        <div style="display:flex; gap:10px; margin-bottom:20px;">
            <button class="btn" style="flex:1; padding:10px; font-size:0.95rem;" onclick="batchAddReadVocab()">📥 入库 (${selectedCount})</button>
            <button class="btn btn-outline" style="flex:1; padding:10px; font-size:0.95rem;" onclick="exportReadVocab()">🖨️ 导出打印</button>
        </div>
        
        <div style="display:flex; flex-direction:column; gap:12px;">
    `;

    tempReadVocab.forEach(w => {
        html += `
        <div style="background:var(--bg); border:2px solid ${w.selected ? 'var(--primary)' : 'transparent'}; border-radius:12px; padding:12px; display:flex; gap:12px; align-items:flex-start; transition:all 0.2s; box-shadow:0 2px 5px rgba(0,0,0,0.02);">
            <input type="checkbox" style="margin-top:6px; cursor:pointer; transform:scale(1.3);" ${w.selected ? 'checked' : ''} onchange="toggleReadWord('${w.id}')">
            <div style="flex:1; min-width:0;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-weight:900; font-size:1.1rem; color:var(--text);">${w.word}</span>
                    <span style="font-size:0.85rem; color:var(--text-light);">${w.phonetic || ''}</span>
                </div>
                <input type="text" value="${w.cn}" onchange="updateReadWordCn('${w.id}', this.value)" style="width:100%; padding:6px 8px; font-size:0.95rem; border:1px dashed var(--border); border-radius:6px; background:white; margin:0; outline:none; color:var(--text); transition:0.2s;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'" placeholder="点击直接修改释义">
            </div>
            <div style="cursor:pointer; color:var(--accent); font-size:1.4rem; line-height:1; padding:0 5px; opacity:0.6;" onclick="removeReadWord('${w.id}')" title="移除该词">×</div>
        </div>`;
    });

    html += `</div>`;
    sidebar.innerHTML = html;
}

function toggleReadWord(id) { let w = tempReadVocab.find(x => x.id == id); if(w) w.selected = !w.selected; renderReadSidebar(); }
function toggleAllReadWords(checked) { tempReadVocab.forEach(w => w.selected = checked); renderReadSidebar(); }
function updateReadWordCn(id, newCn) { let w = tempReadVocab.find(x => x.id == id); if(w) w.cn = newCn.trim(); }
function removeReadWord(id) { tempReadVocab = tempReadVocab.filter(x => x.id != id); renderReadSidebar(); }

function batchAddReadVocab() {
    let toAdd = tempReadVocab.filter(w => w.selected);
    if (toAdd.length === 0) return alert("请先勾选需要加入生词本的单词！");
    
    let addCount = 0;
    toAdd.forEach(w => {
        if (!notebook.find(n => n.word.toLowerCase() === w.word.toLowerCase())) {
            notebook.unshift({ id: Date.now() + Math.random(), word: w.word, phonetic: w.phonetic, cn: w.cn, en: w.en || '' });
            addCount++;
        }
    });

    if (addCount > 0) {
        saveUserData();
        alert(`✅ 成功将 ${addCount} 个生词同步到系统生词本！`);
    } else {
        alert("⚠️ 所选单词已存在于您的生词本中。");
    }
    
    toAdd.forEach(w => w.selected = false);
    renderReadSidebar();
}

function exportReadVocab() {
    let toPrint = tempReadVocab.filter(w => w.selected);
    if (toPrint.length === 0) return alert("请先勾选需要导出的单词！");

    let printHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>阅读生词导出 - EnglishHub Pro</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; }
                .header-title { text-align: center; color: #4f46e5; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 30px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
                th, td { border: 1px solid #cbd5e1; padding: 15px; text-align: left; }
                th { background-color: #f8fafc; font-weight: 800; font-size: 1.1rem; color: #334155; }
                td.word { font-weight: 900; font-size: 1.25rem; color: #0f172a; }
                td.phonetic { color: #64748b; font-family: monospace; font-size: 1.1rem; }
                td.meaning { font-weight: 600; color: #334155; }
                .footer { text-align: center; margin-top: 40px; font-size: 0.9rem; color: #94a3b8; }
                @media print { body { padding: 0; } table { box-shadow: none; } th { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; } }
            </style>
        </head>
        <body>
            <h1 class="header-title">📖 智能阅读重点生词表</h1>
            <table>
                <thead>
                    <tr><th width="8%">序号</th><th width="25%">英文单词</th><th width="25%">音标</th><th width="42%">中文释义</th></tr>
                </thead>
                <tbody>
                    ${toPrint.map((w, i) => `<tr><td style="text-align: center; color: #64748b;">${i + 1}</td><td class="word">${w.word}</td><td class="phonetic">${w.phonetic || '-'}</td><td class="meaning">${w.cn}</td></tr>`).join('')}
                </tbody>
            </table>
            <div class="footer">导出时间：${new Date().toLocaleString()} | 系统支持：EnglishHub Pro</div>
            <script>window.onload = function() { setTimeout(function(){ window.print(); }, 500); }</script>
        </body>
        </html>
    `;

    let printWin = window.open('', '_blank', 'width=900,height=800');
    printWin.document.write(printHtml);
    printWin.document.close();
}