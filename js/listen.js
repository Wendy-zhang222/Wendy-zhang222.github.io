// js/listen.js
// =========================================================================
// 🎧 听力全矩阵训练模块 (每日英语听力 增强版)
// 包含：IndexedDB音频网盘、文件夹管理、多功能标签页选项卡
// =========================================================================

// =========================================================================
// 1. IndexedDB 本地音频数据库 (用于持久化存储音频文件)
// =========================================================================
const AUDIO_DB_NAME = "EHAudioDB";
const AUDIO_STORE = "audioFiles";
let audioDBInstance = null;

function getAudioDB() {
    return new Promise((resolve, reject) => {
        if(audioDBInstance) return resolve(audioDBInstance);
        let req = window.indexedDB.open(AUDIO_DB_NAME, 1);
        req.onupgradeneeded = e => { e.target.result.createObjectStore(AUDIO_STORE); };
        req.onsuccess = e => { audioDBInstance = e.target.result; resolve(audioDBInstance); };
        req.onerror = e => reject(e);
    });
}

async function saveAudioBlob(id, blob) {
    let db = await getAudioDB();
    return new Promise(resolve => {
        let tx = db.transaction(AUDIO_STORE, "readwrite");
        tx.objectStore(AUDIO_STORE).put(blob, id);
        tx.oncomplete = () => resolve();
    });
}

async function getAudioBlob(id) {
    let db = await getAudioDB();
    return new Promise(resolve => {
        let tx = db.transaction(AUDIO_STORE, "readonly");
        let req = tx.objectStore(AUDIO_STORE).get(id);
        req.onsuccess = () => resolve(req.result);
    });
}

async function deleteAudioBlob(id) {
    let db = await getAudioDB();
    return new Promise(resolve => {
        let tx = db.transaction(AUDIO_STORE, "readwrite");
        tx.objectStore(AUDIO_STORE).delete(id);
        tx.oncomplete = () => resolve();
    });
}

// =========================================================================
// 2. 核心变量与全局状态
// =========================================================================
let currentAudioId = null;
let parsedSubtitles = [];
let mediaRecorder; 
let audioChunks = [];
let correctSortOrder = []; 
let currentSortOrder = []; 
let draggedSortIndex = null;
let clozeRawText = '';
let parsedClozeAnswers = [];
let parsedListeningQuiz = [];

function formatTime(secs) {
    if (isNaN(secs)) return "00:00";
    let m = Math.floor(secs / 60); let s = Math.floor(secs % 60);
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
}

// =========================================================================
// 3. 动态构建 UI (左侧资源树 + 右侧多标签播放器)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const view = document.getElementById('p-listen-main');
    if(!view) return;

    // 注入选项卡所需的基础样式
    const style = document.createElement('style');
    style.innerHTML = `
        .l-tab { padding: 15px 25px; font-weight: 800; color: var(--text-light); cursor: pointer; border-bottom: 3px solid transparent; white-space: nowrap; transition: 0.2s; font-size: 1.05rem; }
        .l-tab:hover { color: var(--primary); background: var(--primary-light); }
        .l-tab.active { color: var(--primary); border-bottom-color: var(--primary); background: white; }
        .audio-item { padding: 12px 15px; border-radius: 12px; cursor: pointer; transition: 0.2s; margin-bottom: 5px; display:flex; justify-content:space-between; align-items:center; border: 1px solid transparent; }
        .audio-item:hover { background: var(--primary-light); border-color: #c7d2fe; }
        .audio-item.active { background: var(--primary); color: white; box-shadow: 0 4px 10px rgba(99,102,241,0.3); }
        .audio-item.active .text-muted { color: #e0e7ff !important; }
        .audio-folder-head { padding: 12px 10px; font-weight: 900; color: var(--text); display:flex; justify-content:space-between; cursor:pointer; align-items:center; }
        .audio-folder-head:hover { color: var(--primary); }
        .l-tab-pane { display: none; height: 100%; animation: fadein 0.3s; }
        @keyframes fadein { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
    `;
    document.head.appendChild(style);

    view.innerHTML = `
        <div class="back-link" onclick="showPage('home')" style="margin-bottom:15px; font-size:1.1rem;">← 返回首页</div>
        <div style="display:flex; height: calc(100vh - 120px); min-height: 600px; gap: 20px; align-items: stretch;">

            <div style="width: 320px; background: var(--white); border-radius: 20px; border: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--shadow); flex-shrink: 0;">
                <div style="padding: 20px; background: var(--primary-light); border-bottom: 1px solid #c7d2fe;">
                    <h2 style="margin: 0 0 15px 0; color: var(--primary); font-size: 1.4rem; display:flex; align-items:center; gap:8px;">🎧 听力资源库</h2>
                    <div style="display:flex; gap:10px;">
                        <button class="btn btn-outline" style="flex:1; padding:10px; font-size:0.9rem; border-width:2px;" onclick="addAudioFolder()">+ 新建分类</button>
                        <button class="btn" style="flex:1; padding:10px; font-size:0.9rem;" onclick="document.getElementById('audio-batch-upload').click()">📥 导入音频</button>
                        <input type="file" id="audio-batch-upload" multiple accept="audio/*" style="display:none;" onchange="handleAudioBatchUpload(this)">
                    </div>
                    <select id="audio-upload-folder" style="margin-top:15px; width:100%; padding:10px; border-radius:10px; border:2px solid var(--border); font-size:0.95rem; font-weight:bold; color:var(--text);">
                        </select>
                </div>
                <div id="audio-sidebar-list" style="flex: 1; overflow-y: auto; padding: 15px; background: var(--bg);">
                    </div>
            </div>

            <div style="flex: 1; display: flex; flex-direction: column; gap: 20px; min-width: 0;">

                <div style="background: var(--white); border-radius: 20px; border: 1px solid var(--border); padding: 25px 35px; box-shadow: var(--shadow); display:flex; flex-direction:column; gap:15px;">
                    <audio id="audio-element" hidden></audio>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h2 id="current-audio-title" style="margin:0; color:var(--text); font-size:1.6rem; font-weight:900;">尚未选择音频</h2>
                        <button class="btn btn-outline" id="btn-del-audio" style="display:none; padding:6px 15px; font-size:0.85rem; border-color:var(--accent); color:var(--accent);" onclick="deleteCurrentAudio()">🗑️ 删除当前</button>
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 15px; margin-top:5px;">
                        <span id="audio-current" style="font-weight: 600; color: var(--text-light); min-width: 50px;">00:00</span>
                        <input type="range" id="audio-progress" value="0" min="0" max="100" step="0.1" style="flex: 1; height: 8px; border-radius:4px; background: var(--border); accent-color: var(--primary); cursor:pointer;">
                        <span id="audio-total" style="font-weight: 600; color: var(--text-light); min-width: 50px;">00:00</span>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top:10px;">
                        <div style="display:flex; gap:15px; align-items:center;">
                            <button class="btn" id="btn-play-pause" onclick="toggleAudioPlay()" style="width: 130px; font-size:1.15rem; box-shadow:0 4px 10px rgba(99,102,241,0.2);">▶ 播放</button>
                            <button class="btn btn-outline" style="padding:10px 15px; border-radius:12px;" onclick="seekAudioRelative(-5)">⏪ -5s</button>
                            <button class="btn btn-outline" style="padding:10px 15px; border-radius:12px;" onclick="seekAudioRelative(5)">+5s ⏩</button>
                        </div>
                        <div style="display: flex; align-items: center; gap: 25px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-weight: 800; color: var(--text-light);">倍速</span>
                                <select id="audio-speed" onchange="changeAudioSpeed()" style="padding: 6px 10px; border-radius:10px; border:2px solid var(--border); font-weight:bold; outline:none;">
                                    <option value="0.75">0.75x</option><option value="1.0" selected>1.0x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option>
                                </select>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-weight: 800; color: var(--text-light);">音量</span>
                                <input type="range" id="audio-volume" min="0" max="1" step="0.05" value="1" style="width: 80px; accent-color: var(--primary);">
                            </div>
                        </div>
                    </div>
                </div>

                <div style="background: var(--white); border-radius: 20px; border: 1px solid var(--border); box-shadow: var(--shadow); flex:1; display:flex; flex-direction:column; overflow:hidden;">
                    <div style="display:flex; background:var(--bg); border-bottom:2px solid var(--border); overflow-x:auto;">
                        <div class="l-tab" data-tab="sub" onclick="switchListenTab('sub')">📝 互动字幕</div>
                        <div class="l-tab" data-tab="shadow" onclick="switchListenTab('shadow')">🎙️ 录音跟读</div>
                        <div class="l-tab" data-tab="dict" onclick="switchListenTab('dict')">✍️ 听写比对</div>
                        <div class="l-tab" data-tab="cloze" onclick="switchListenTab('cloze')">🧩 精听挖词</div>
                        <div class="l-tab" data-tab="sort" onclick="switchListenTab('sort')">🔄 听音排序</div>
                        <div class="l-tab" data-tab="quiz" onclick="switchListenTab('quiz')">🎯 测验&错题</div>
                    </div>
                    
                    <div style="flex:1; padding:30px; overflow-y:auto; background:var(--white);">
                        
                        <div id="tab-sub" class="l-tab-pane">
                            <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                                <h3 style="margin:0; color:var(--text);">导入 LRC / SRT 字幕</h3>
                                <button class="btn btn-outline" style="padding:5px 15px;" onclick="document.getElementById('sub-setup').classList.toggle('hidden')">配置字幕</button>
                            </div>
                            <div id="sub-setup" class="hidden" style="margin-bottom:20px;">
                                <textarea id="subtitles-input" placeholder="请粘贴带时间戳的 LRC/SRT 格式字幕..." style="height:120px; font-family:monospace; background:var(--primary-light);"></textarea>
                                <button class="btn" style="width:100%; margin-top:10px;" onclick="parseSubtitles()">生成智能高亮字幕</button>
                            </div>
                            <div id="subtitle-display" style="max-height: 350px; overflow-y: auto; padding: 20px; border-radius: 15px; border: 2px dashed var(--border); scroll-behavior: smooth; font-size:1.2rem; line-height:2;">
                                <p style="text-align:center; color:var(--text-light);">暂无字幕，请点击右上角配置导入。</p>
                            </div>
                        </div>

                        <div id="tab-shadow" class="l-tab-pane">
                            <h3 style="margin-top:0;">影子训练 (Shadowing)</h3>
                            <p style="color:var(--text-light); margin-bottom:30px;">播放原音后，点击开始录音，对比发音差距。</p>
                            <div style="text-align:center; padding:40px; border:2px dashed var(--border); border-radius:20px; background:var(--bg);">
                                <div style="display:flex; justify-content:center; gap:20px; margin-bottom:25px;">
                                    <button class="btn" id="btn-record-start" onclick="startRecording()" style="background:var(--accent); font-size:1.2rem; padding:15px 30px;">⏺ 开始录音</button>
                                    <button class="btn btn-outline" id="btn-record-stop" onclick="stopRecording()" disabled style="opacity:0.5; font-size:1.2rem; padding:15px 30px;">⏹ 停止</button>
                                </div>
                                <div id="recording-status" style="color:var(--accent); font-weight:bold; margin-bottom:20px; height:20px;"></div>
                                <audio id="audio-playback" controls style="width:100%; max-width:400px; outline:none;"></audio>
                            </div>
                        </div>

                        <div id="tab-dict" class="l-tab-pane">
                            <h3 style="margin-top:0;">盲听与听写 (Dictation)</h3>
                            <textarea id="dict-ref" placeholder="[可选] 粘贴标准参考原文，不填则默认比对您已导入的字幕..." style="height:80px; background:var(--primary-light); border-color:#c7d2fe; margin-bottom:20px;"></textarea>
                            <textarea id="dict-usr" placeholder="在这里拼写你听到的句子（系统会自动忽略标点和大小写比对）..." style="height:150px; font-size:1.2rem; line-height:1.6;"></textarea>
                            <button class="btn" onclick="compareDictation()" style="width:100%; margin-bottom:20px; font-size:1.1rem; padding:15px;">比对验证</button>
                            <div id="dict-result-container" class="hidden" style="background:var(--bg); padding:25px; border-radius:15px; border:2px solid var(--border); font-size:1.2rem; line-height:1.8;">
                                <div id="dict-result"></div>
                            </div>
                        </div>

                        <div id="tab-cloze" class="l-tab-pane">
                            <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                                <h3 style="margin:0; color:var(--text);">精听填空练习</h3>
                                <button class="btn btn-outline" style="padding:5px 15px;" onclick="document.getElementById('cloze-setup').classList.toggle('hidden')">配置挖空</button>
                            </div>
                            <div id="cloze-setup" class="hidden" style="margin-bottom:20px;">
                                <textarea id="cloze-input-text" placeholder="粘贴原文，用方括号标记挖空单词。例如：It was a [beautiful] day." style="height:120px; font-family:monospace; background:var(--primary-light);"></textarea>
                                <button class="btn" style="width:100%; margin-top:10px;" onclick="parseClozeTest()">生成填空卡片</button>
                            </div>
                            <div id="cloze-display" style="padding: 30px; border-radius: 15px; border: 2px dashed var(--border); font-size: 1.3rem; line-height: 2.4;">
                                <p style="text-align:center; color:var(--text-light);">暂无题目，请配置导入。</p>
                            </div>
                            <button class="btn hidden" id="btn-submit-cloze" onclick="submitClozeTest()" style="width:100%; margin-top:20px; padding:15px; font-size:1.1rem;">提交验证</button>
                            <div id="cloze-result" class="hidden" style="margin-top:20px; padding:20px; font-weight:900; font-size:1.5rem; text-align:center; border-radius:15px;"></div>
                        </div>

                        <div id="tab-sort" class="l-tab-pane">
                            <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                                <h3 style="margin:0; color:var(--text);">段落/句子排序</h3>
                                <button class="btn btn-outline" style="padding:5px 15px;" onclick="document.getElementById('sort-setup').classList.toggle('hidden')">配置排序</button>
                            </div>
                            <div id="sort-setup" class="hidden" style="margin-bottom:20px;">
                                <textarea id="sort-input-text" placeholder="按正确顺序粘贴段落（每行一段），系统会自动打乱供您排序..." style="height:120px; background:var(--primary-light);"></textarea>
                                <button class="btn" style="width:100%; margin-top:10px;" onclick="generateSorting()">打乱并生成</button>
                            </div>
                            <div id="sort-display" style="padding: 20px; border-radius: 15px; border: 2px dashed var(--border);">
                                <p style="text-align:center; color:var(--text-light);">暂无题目，请配置导入。</p>
                            </div>
                            <button class="btn hidden" id="btn-submit-sort" onclick="submitSorting()" style="width:100%; margin-top:20px; padding:15px; font-size:1.1rem;">提交验证</button>
                            <div id="sort-result" class="hidden" style="margin-top:20px; padding:20px; font-weight:900; font-size:1.5rem; text-align:center; border-radius:15px;"></div>
                        </div>

                        <div id="tab-quiz" class="l-tab-pane">
                            <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                                <h3 style="margin:0; color:var(--text);">听力理解测验与错题本</h3>
                                <div style="display:flex; gap:10px;">
                                    <button class="btn btn-outline" style="padding:5px 15px; border-color:var(--accent); color:var(--accent);" onclick="clearListenErrors()">清空错题</button>
                                    <button class="btn btn-outline" style="padding:5px 15px;" onclick="document.getElementById('quiz-setup').classList.toggle('hidden')">配置题库</button>
                                </div>
                            </div>
                            <div id="quiz-setup" class="hidden" style="margin-bottom:20px;">
                                <textarea id="quiz-input" placeholder="格式:\nQ: 问题?\nA. 选项1\nB. 选项2\n答案: A\n解析: 这里写解析..." style="height:150px; font-family:monospace; background:var(--primary-light);"></textarea>
                                <button class="btn" style="width:100%; margin-top:10px;" onclick="parseListeningQuiz()">生成考卷</button>
                            </div>
                            <div id="listen-quiz-display" style="padding: 30px; border-radius: 15px; border: 2px dashed var(--border); margin-bottom:20px;">
                                <p style="text-align:center; color:var(--text-light);">暂无考卷，请配置导入。</p>
                            </div>
                            <button class="btn hidden" id="btn-submit-quiz" onclick="submitListeningQuiz()" style="width:100%; margin-bottom:30px; padding:15px; font-size:1.1rem;">提交答卷</button>
                            <div id="listen-quiz-result" class="hidden" style="margin-bottom:30px; padding:20px; font-weight:900; font-size:1.5rem; text-align:center; border-radius:15px;"></div>
                            
                            <h3 style="border-top:2px dashed var(--border); padding-top:20px;">📓 自动错题本</h3>
                            <div id="l-errors-display" style="display: flex; flex-direction: column; gap: 15px;"></div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    `;
    
    bindAudioEvents();
    renderAudioSidebar();
    switchListenTab('sub'); // 默认显示字幕选项卡
});

// =========================================================================
// 4. 音频网盘管理与播放逻辑
// =========================================================================
function getAudioPrefix() { return currentUser ? `eh_a_${currentUser.id}_` : `eh_aguest_`; }

function renderAudioSidebar() {
    let pfx = getAudioPrefix();
    let folders = JSON.parse(localStorage.getItem(pfx+'folders')) || ['默认分类'];
    let lib = JSON.parse(localStorage.getItem(pfx+'lib')) || [];
    
    // 渲染下拉框
    let sel = document.getElementById('audio-upload-folder');
    if(sel) sel.innerHTML = folders.map(f => `<option value="${f}">${f}</option>`).join('');

    // 渲染树状列表
    let listUI = document.getElementById('audio-sidebar-list');
    if(!listUI) return;
    
    if(lib.length === 0) {
        listUI.innerHTML = `<p style="text-align:center; color:var(--text-light); margin-top:40px;">暂无音频<br><br>请点击上方导入按钮</p>`;
        return;
    }

    let html = '';
    folders.forEach(f => {
        let items = lib.filter(x => x.folder === f);
        html += `
            <div style="margin-bottom:15px;">
                <div class="audio-folder-head">📁 ${f} <span style="color:var(--text-light); font-size:0.85rem;">${items.length} 个</span></div>
                <div style="padding-left:10px; border-left:2px solid var(--border); margin-left:10px;">
                    ${items.length === 0 ? `<div style="padding:10px; color:var(--text-light); font-size:0.85rem;">空文件夹</div>` : items.map(a => `
                        <div class="audio-item ${currentAudioId === a.id ? 'active' : ''}" onclick="playAudioTrack('${a.id}')">
                            <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:700; max-width:180px;" title="${a.title}">🎵 ${a.title}</div>
                            <div class="text-muted" style="font-size:0.8rem; color:var(--text-light);">${a.date}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    });
    listUI.innerHTML = html;
}

function addAudioFolder() {
    let name = prompt("请输入新音频分类的名称：");
    if(name && name.trim()) {
        name = name.trim();
        let pfx = getAudioPrefix();
        let folders = JSON.parse(localStorage.getItem(pfx+'folders')) || ['默认分类'];
        if(folders.includes(name)) return alert("该分类已存在！");
        folders.push(name);
        localStorage.setItem(pfx+'folders', JSON.stringify(folders));
        renderAudioSidebar();
    }
}

async function handleAudioBatchUpload(input) {
    if(!requireAuth()) return;
    if(!input.files || input.files.length === 0) return;
    let folder = document.getElementById('audio-upload-folder').value;
    let files = Array.from(input.files);
    let pfx = getAudioPrefix();
    let lib = JSON.parse(localStorage.getItem(pfx+'lib')) || [];

    document.getElementById('api-loading').style.display = 'flex';
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        let title = file.name.replace(/\.[^/.]+$/, ""); 
        let id = "a_" + Date.now() + "_" + i;
        
        try {
            await saveAudioBlob(id, file); // 存入 IndexedDB
            lib.unshift({ id: id, title: title, folder: folder, date: new Date().toLocaleDateString() });
            successCount++;
        } catch (e) {
            console.error("保存音频失败:", e);
        }
    }

    localStorage.setItem(pfx+'lib', JSON.stringify(lib));
    document.getElementById('api-loading').style.display = 'none';
    renderAudioSidebar();
    input.value = ''; 
    alert(`✅ 成功导入 ${successCount} 个音频到 [${folder}]！`);
}

async function playAudioTrack(id) {
    let pfx = getAudioPrefix();
    let lib = JSON.parse(localStorage.getItem(pfx+'lib')) || [];
    let audioData = lib.find(x => x.id === id);
    if(!audioData) return;

    currentAudioId = id;
    renderAudioSidebar(); // 更新高亮状态
    document.getElementById('current-audio-title').innerText = audioData.title;
    document.getElementById('btn-del-audio').style.display = 'block';

    try {
        let blob = await getAudioBlob(id);
        if(!blob) return alert("❌ 无法在本地数据库找到该音频文件，可能已被清理。请重新导入。");
        
        let url = URL.createObjectURL(blob);
        let player = document.getElementById('audio-element');
        player.src = url;
        player.play();
        document.getElementById('btn-play-pause').innerHTML = '⏸ 暂停';
        
        // 重置所有工具状态
        document.querySelectorAll('.sub-line').forEach(s => s.classList.remove('active-sub'));
    } catch(e) {
        alert("播放失败: " + e.message);
    }
}

async function deleteCurrentAudio() {
    if(!currentAudioId) return;
    if(confirm("确定要彻底删除当前播放的音频吗？")) {
        let pfx = getAudioPrefix();
        let lib = JSON.parse(localStorage.getItem(pfx+'lib')) || [];
        lib = lib.filter(x => x.id !== currentAudioId);
        localStorage.setItem(pfx+'lib', JSON.stringify(lib));
        
        await deleteAudioBlob(currentAudioId); // 清理数据库
        
        currentAudioId = null;
        document.getElementById('audio-element').src = '';
        document.getElementById('current-audio-title').innerText = "尚未选择音频";
        document.getElementById('btn-del-audio').style.display = 'none';
        document.getElementById('btn-play-pause').innerHTML = '▶ 播放';
        renderAudioSidebar();
    }
}

function bindAudioEvents() {
    let audioElement = document.getElementById('audio-element');
    let progress = document.getElementById('audio-progress');
    let vol = document.getElementById('audio-volume');

    if (audioElement && progress) {
        audioElement.addEventListener('timeupdate', () => {
            let cur = audioElement.currentTime;
            let dur = audioElement.duration || 0;
            document.getElementById('audio-current').innerText = formatTime(cur);
            document.getElementById('audio-total').innerText = formatTime(dur);
            if (dur > 0) progress.value = (cur / dur) * 100;

            // 同步字幕高亮与滚动
            if (parsedSubtitles && parsedSubtitles.length > 0) {
                let activeIdx = -1;
                for (let i = 0; i < parsedSubtitles.length; i++) {
                    if (cur >= parsedSubtitles[i].time) activeIdx = i; else break;
                }
                if (activeIdx !== -1) {
                    document.querySelectorAll('.sub-line').forEach(s => s.classList.remove('active-sub'));
                    let activeEl = document.getElementById(`sub-${activeIdx}`);
                    if (activeEl) {
                        activeEl.classList.add('active-sub');
                        let container = document.getElementById('subtitle-display');
                        if (container && activeEl.offsetTop) {
                            container.scrollTop = activeEl.offsetTop - container.offsetTop - (container.clientHeight / 2) + 20;
                        }
                    }
                }
            }
        });

        progress.addEventListener('input', (e) => {
            let dur = audioElement.duration || 0;
            audioElement.currentTime = (e.target.value / 100) * dur;
        });

        if(vol) {
            vol.addEventListener('input', (e) => { audioElement.volume = e.target.value; });
        }
    }
}

function toggleAudioPlay() {
    let audioElement = document.getElementById('audio-element');
    if (!audioElement || !audioElement.src || audioElement.src === window.location.href) return alert("请先在左侧选择要播放的音频！");
    if (audioElement.paused) { audioElement.play(); document.getElementById('btn-play-pause').innerText = '⏸ 暂停'; } 
    else { audioElement.pause(); document.getElementById('btn-play-pause').innerText = '▶ 播放'; }
}

function changeAudioSpeed() { 
    let audioElement = document.getElementById('audio-element');
    if (audioElement) audioElement.playbackRate = parseFloat(document.getElementById('audio-speed').value); 
}

function seekAudioRelative(seconds) {
    let audioElement = document.getElementById('audio-element');
    if(audioElement && audioElement.src) audioElement.currentTime += seconds;
}

function seekAudio(time) { 
    let audioElement = document.getElementById('audio-element');
    if (audioElement && audioElement.src) { audioElement.currentTime = time; audioElement.play(); document.getElementById('btn-play-pause').innerText = '⏸ 暂停'; } 
}

// =========================================================================
// 5. 多功能选项卡切换与功能引擎
// =========================================================================
function switchListenTab(tabId) {
    document.querySelectorAll('.l-tab').forEach(el => el.classList.remove('active'));
    document.querySelector(`.l-tab[data-tab="${tabId}"]`).classList.add('active');
    document.querySelectorAll('.l-tab-pane').forEach(el => el.style.display = 'none');
    let target = document.getElementById(`tab-${tabId}`);
    if(target) target.style.display = 'block';
    
    // 切换到错题本时自动渲染
    if(tabId === 'quiz') renderListenErrors();
}

// ---- 功能 1: 互动字幕 ----
function parseSubtitles() {
    let text = document.getElementById('subtitles-input').value;
    let lines = text.split('\n');
    parsedSubtitles = [];
    let html = '';
    
    lines.forEach((line, idx) => {
        let match = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
        if (match) {
            let time = parseInt(match[1]) * 60 + parseFloat(match[2]);
            let content = match[3].trim();
            parsedSubtitles.push({ time, content, idx });
            html += `<div class="sub-line" id="sub-${idx}" onclick="seekAudio(${time})" style="cursor:pointer; padding:8px 15px; border-radius:12px; transition:all 0.2s;">${content}</div>`;
        }
    });
    
    let display = document.getElementById('subtitle-display');
    display.innerHTML = parsedSubtitles.length === 0 ? '<p style="text-align:center; color: var(--accent);">未能解析出有效字幕，请检查格式。</p>' : html;
    document.getElementById('sub-setup').classList.add('hidden');
}

// ---- 功能 2: 录音跟读 ----
async function startRecording() {
    try {
        let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            let blob = new Blob(audioChunks, { type: 'audio/webm' });
            document.getElementById('audio-playback').src = URL.createObjectURL(blob);
            stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
        document.getElementById('recording-status').innerText = '🔴 录音中... 请大声朗读';
        document.getElementById('btn-record-start').disabled = true; document.getElementById('btn-record-start').style.opacity = 0.5;
        document.getElementById('btn-record-stop').disabled = false; document.getElementById('btn-record-stop').style.opacity = 1;
    } catch(e) { alert('无法访问麦克风: ' + e.message); }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        document.getElementById('recording-status').innerText = '✅ 录音完成，可播放比对';
        document.getElementById('btn-record-start').disabled = false; document.getElementById('btn-record-start').style.opacity = 1;
        document.getElementById('btn-record-stop').disabled = true; document.getElementById('btn-record-stop').style.opacity = 0.5;
    }
}

// ---- 功能 3: 听写训练 ----
function compareDictation() {
    if (!requireAuth()) return;
    let ref = document.getElementById('dict-ref').value.trim();
    if (!ref) {
        if (parsedSubtitles && parsedSubtitles.length > 0) ref = parsedSubtitles.map(s => s.content).join(' ');
        else return alert("请填写参考答案或先生成智能字幕。");
    }
    let usr = document.getElementById('dict-usr').value.trim();
    if (!usr) return alert("请输入听写内容！");
    
    let cleanRef = ref.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w);
    let cleanUsr = usr.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w);
    
    let resultHtml = '';
    let maxLen = Math.max(cleanRef.length, cleanUsr.length);
    for (let i = 0; i < maxLen; i++) {
        let rw = cleanRef[i] || ''; let uw = cleanUsr[i] || '';
        if (rw === uw && rw !== '') { resultHtml += `<span style="color:var(--success); font-weight:bold;">${uw} </span>`; } 
        else if (uw && rw && (rw.includes(uw) || uw.includes(rw))) { resultHtml += `<span style="color:var(--warning); font-weight:bold;">${uw}(应为:${rw}) </span>`; } 
        else if (uw && !rw) { resultHtml += `<span style="color:#f97316; border-bottom: 2px dashed #f97316;">${uw} </span>`; } 
        else if (!uw && rw) { resultHtml += `<span style="color:var(--accent); text-decoration:line-through;">${rw} </span>`; } 
        else { resultHtml += `<span style="color:var(--accent); text-decoration:line-through;">${rw}</span><span style="color:#f97316; border-bottom: 2px dashed #f97316; margin-left: 2px;">${uw} </span>`; }
    }
    document.getElementById('dict-result-container').classList.remove('hidden');
    document.getElementById('dict-result').innerHTML = resultHtml;
}

// ---- 功能 4: 精听挖词 ----
function parseClozeTest() {
    let text = document.getElementById('cloze-input-text').value;
    if (!text) return alert("请输入包含 [答案] 的挖空文本！");
    clozeRawText = text; parsedClozeAnswers = [];
    
    let html = text.replace(/\[(.*?)\]/g, (match, p1) => {
        let idx = parsedClozeAnswers.length;
        let answers = p1.split('|').map(a => a.trim().toLowerCase());
        parsedClozeAnswers.push(answers);
        let width = Math.max(answers[0].length * 15, 60); 
        return `<input type="text" id="cloze-input-${idx}" style="width:${width}px; border:none; border-bottom:2px solid var(--primary); font-size:1.2rem; text-align:center; font-weight:bold; color:var(--primary); background:var(--bg); margin:0 5px; outline:none;">`;
    });
    
    document.getElementById('cloze-display').innerHTML = html.replace(/\n/g, '<br>');
    document.getElementById('cloze-setup').classList.add('hidden');
    document.getElementById('btn-submit-cloze').classList.remove('hidden');
    document.getElementById('cloze-result').classList.add('hidden');
}

function submitClozeTest() {
    let correct = 0;
    for (let i = 0; i < parsedClozeAnswers.length; i++) {
        let el = document.getElementById(`cloze-input-${i}`);
        let val = el.value.trim().toLowerCase();
        if (parsedClozeAnswers[i].includes(val)) { 
            el.style.borderBottomColor = 'var(--success)'; el.style.color = 'var(--success)'; correct++; 
        } else { 
            el.style.borderBottomColor = 'var(--accent)'; el.style.color = 'var(--accent)'; el.style.textDecoration = 'line-through';
            if (!el.nextSibling || el.nextSibling.className !== 'cloze-ans') {
                let ansSpan = document.createElement('span');
                ansSpan.className = 'cloze-ans'; ansSpan.innerText = parsedClozeAnswers[i][0]; ansSpan.style.color = 'var(--success)'; ansSpan.style.fontWeight = 'bold'; ansSpan.style.marginLeft = '5px';
                el.parentNode.insertBefore(ansSpan, el.nextSibling);
            }
        }
    }
    let res = document.getElementById('cloze-result');
    res.classList.remove('hidden'); res.innerHTML = `得分: ${correct} / ${parsedClozeAnswers.length}`;
    res.style.color = correct === parsedClozeAnswers.length ? 'var(--success)' : 'var(--accent)';
    res.style.background = correct === parsedClozeAnswers.length ? '#ecfdf5' : '#fff1f2';
}

// ---- 功能 5: 听音排序 ----
function generateSorting() {
    let text = document.getElementById('sort-input-text').value;
    let paras = text.split('\n').map(p => p.trim()).filter(p => p);
    if (paras.length < 2) return alert('请至少输入两段文本');
    correctSortOrder = [...paras]; currentSortOrder = [...paras].sort(() => 0.5 - Math.random());
    renderSorting();
    document.getElementById('sort-setup').classList.add('hidden');
    document.getElementById('btn-submit-sort').classList.remove('hidden');
    document.getElementById('sort-result').classList.add('hidden');
}

function renderSorting() {
    let html = currentSortOrder.map((p, i) => `
        <div draggable="true" ondragstart="dragStart(event, ${i})" ondragover="dragOver(event)" ondrop="drop(event, ${i})" style="padding:15px; margin-bottom:10px; background:var(--white); border:2px solid var(--border); border-radius:12px; cursor:grab; font-size:1.1rem; display:flex; align-items:center;">
            <span style="color:var(--text-light); margin-right:15px; font-size:1.5rem;">☰</span>${p}
        </div>`).join('');
    document.getElementById('sort-display').innerHTML = html;
}

function dragStart(e, idx) { draggedSortIndex = idx; e.dataTransfer.effectAllowed = 'move'; }
function dragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function drop(e, idx) {
    e.preventDefault(); if (draggedSortIndex === null || draggedSortIndex === idx) return;
    let draggedItem = currentSortOrder.splice(draggedSortIndex, 1)[0];
    currentSortOrder.splice(idx, 0, draggedItem); draggedSortIndex = null; renderSorting();
}

function submitSorting() {
    let isCorrect = true;
    for (let i = 0; i < correctSortOrder.length; i++) { if (correctSortOrder[i] !== currentSortOrder[i]) { isCorrect = false; break; } }
    let res = document.getElementById('sort-result'); res.classList.remove('hidden');
    res.innerHTML = isCorrect ? '🎉 顺序完全正确！' : '❌ 排序有误，请重新调整！';
    res.style.color = isCorrect ? 'var(--success)' : 'var(--accent)';
    res.style.background = isCorrect ? '#ecfdf5' : '#fff1f2';
}

// ---- 功能 6: 测验与错题 ----
function parseListeningQuiz() {
    let text = document.getElementById('quiz-input').value;
    let blocks = text.split('Q:').filter(b => b.trim());
    if (blocks.length === 0) return alert("未解析出题目，请检查是否包含 'Q:'");
    parsedListeningQuiz = []; let html = '';
    
    blocks.forEach((b, idx) => {
        let lines = b.split('\n').map(l => l.trim()).filter(l => l);
        let qText = lines[0]; let opts = [], ans = '', exp = '';
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].startsWith('答案:')) ans = lines[i].replace('答案:', '').trim();
            else if (lines[i].startsWith('解析:')) exp = lines[i].replace('解析:', '').trim();
            else opts.push(lines[i]);
        }
        parsedListeningQuiz.push({ qText, opts, ans, exp });
        
        let optsHtml = opts.map(o => `<label style="display:flex; align-items:center; padding:12px; margin-bottom:8px; border:2px solid var(--border); border-radius:10px; cursor:pointer; background:var(--bg);"><input type="radio" name="l-quiz-${idx}" value="${o.charAt(0).toUpperCase()}" style="margin-right:10px; transform:scale(1.2);"> ${o}</label>`).join('');
        html += `<div style="margin-bottom:30px;"><div style="font-weight:800; font-size:1.2rem; margin-bottom:15px;">${idx + 1}. ${qText}</div>${optsHtml}<div id="l-quiz-exp-${idx}" style="display:none; margin-top:10px; padding:15px; background:var(--primary-light); border-left:5px solid var(--primary); border-radius:8px;">解析: ${exp || '无'}</div></div>`;
    });
    
    document.getElementById('listen-quiz-display').innerHTML = html;
    document.getElementById('quiz-setup').classList.add('hidden');
    document.getElementById('btn-submit-quiz').classList.remove('hidden');
    document.getElementById('listen-quiz-result').classList.add('hidden');
}

function submitListeningQuiz() {
    let correct = 0;
    parsedListeningQuiz.forEach((q, idx) => {
        let selected = document.querySelector(`input[name="l-quiz-${idx}"]:checked`);
        let expEl = document.getElementById(`l-quiz-exp-${idx}`);
        expEl.style.display = 'block';
        if (selected && selected.value === q.ans) { correct++; expEl.style.borderLeftColor = 'var(--success)'; } 
        else {
            expEl.style.borderLeftColor = 'var(--accent)';
            if (listenErrors && !listenErrors.find(e => e.q === q.qText)) {
                listenErrors.unshift({ q: q.qText, ans: q.ans, exp: q.exp, date: new Date().toLocaleDateString() });
                saveUserData();
            }
        }
    });
    let res = document.getElementById('listen-quiz-result'); res.classList.remove('hidden');
    res.innerHTML = `答对: ${correct} / ${parsedListeningQuiz.length}`;
    res.style.color = correct === parsedListeningQuiz.length ? 'var(--success)' : 'var(--accent)';
    res.style.background = correct === parsedListeningQuiz.length ? '#ecfdf5' : '#fff1f2';
    renderListenErrors();
}

function renderListenErrors() {
    let container = document.getElementById('l-errors-display');
    if (!container) return;
    if (!listenErrors || listenErrors.length === 0) { container.innerHTML = '<p style="text-align:center; color:var(--text-light);">暂无错题记录</p>'; return; }
    container.innerHTML = listenErrors.map((e, idx) => `
        <div style="background:var(--white); padding:20px; border-radius:15px; border:1px solid var(--accent);">
            <div style="font-weight:bold; font-size:1.1rem; margin-bottom:10px;">${e.q}</div>
            <div style="color:var(--success); font-weight:bold; margin-bottom:8px;">正确答案: ${e.ans}</div>
            <div style="font-size:0.95rem; color:var(--text-light); line-height:1.5;">${e.exp}</div>
        </div>`).join('');
}

function clearListenErrors() {
    if (confirm('确定清空所有听力错题记录吗？')) { listenErrors = []; saveUserData(); renderListenErrors(); }
}