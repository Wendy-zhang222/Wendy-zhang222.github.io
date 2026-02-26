// js/listen.js
// =========================================================================
// 🎧 听力全矩阵训练模块 (卡片导航式架构 + 内存秒播 + A-B复读全功能)
// =========================================================================

// =========================================================================
// 1. 本地存储双擎机制 (Session Memory + IndexedDB)
// =========================================================================
const AUDIO_DB_NAME = "EHAudioDB_v3";
const AUDIO_STORE = "audioFiles";
let audioDBInstance = null;
window.sessionAudioFiles = window.sessionAudioFiles || {}; 

function getAudioDB() {
    return new Promise((resolve) => {
        if(audioDBInstance) return resolve(audioDBInstance);
        let req = window.indexedDB.open(AUDIO_DB_NAME, 1);
        req.onupgradeneeded = e => { e.target.result.createObjectStore(AUDIO_STORE); };
        req.onsuccess = e => { audioDBInstance = e.target.result; resolve(audioDBInstance); };
        req.onerror = e => { console.warn("IndexedDB 受限，降级使用内存模式。"); resolve(null); };
    });
}

async function saveAudioBlob(id, file) {
    window.sessionAudioFiles[id] = file; 
    try {
        let db = await getAudioDB();
        if(db) db.transaction(AUDIO_STORE, "readwrite").objectStore(AUDIO_STORE).put(file, id);
    } catch(e) {}
}

async function getAudioBlob(id) {
    if(window.sessionAudioFiles[id]) return window.sessionAudioFiles[id]; 
    try {
        let db = await getAudioDB();
        if(!db) return null;
        return new Promise(resolve => {
            let req = db.transaction(AUDIO_STORE, "readonly").objectStore(AUDIO_STORE).get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    } catch(e) { return null; }
}

async function deleteAudioBlob(id) {
    delete window.sessionAudioFiles[id];
    try {
        let db = await getAudioDB();
        if(db) db.transaction(AUDIO_STORE, "readwrite").objectStore(AUDIO_STORE).delete(id);
    } catch(e) {}
}

// 核心状态绑定到 window 避免 let 冲突
window.ehAudioMemDB = []; 
window.currentAudioId = null;
window.repeatA = null;
window.repeatB = null;
window.currentSubIndex = -1;
window.parsedSubtitles = [];

window.parsedClozeAnswers = [];
window.clozeRawText = '';
window.correctSortOrder = [];
window.currentSortOrder = [];
window.draggedSortIndex = null;
window.parsedListeningQuiz = [];

function formatTime(secs) {
    if (isNaN(secs) || secs < 0) return "00:00";
    let m = Math.floor(secs / 60); let s = Math.floor(secs % 60);
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
}

function getAudioPrefix() { return currentUser ? `eh_a_${currentUser.id}_` : `eh_aguest_`; }

// =========================================================================
// 2. 模块化路由与 UI 渲染
// =========================================================================
window.mountListenUI = function() {
    try {
        const view = document.getElementById('p-listen-main');
        if(!view) return;

        if (!document.getElementById('listen-tab-style')) {
            const style = document.createElement('style');
            style.id = 'listen-tab-style';
            style.innerHTML = `
                .l-tab { padding: 15px 25px; font-weight: 800; color: var(--text-light); cursor: pointer; border-bottom: 3px solid transparent; white-space: nowrap; transition: 0.2s; font-size: 1.05rem; }
                .l-tab:hover { color: var(--primary); background: var(--primary-light); }
                .l-tab.active { color: var(--primary); border-bottom-color: var(--primary); background: white; }
                .audio-item { padding: 12px 15px; border-radius: 12px; cursor: pointer; transition: 0.2s; margin-bottom: 5px; display:flex; justify-content:space-between; align-items:center; border: 1px solid transparent; }
                .audio-item:hover { background: var(--primary-light); border-color: #c7d2fe; }
                .audio-item.active { background: var(--primary); color: white; box-shadow: 0 4px 10px rgba(99,102,241,0.3); }
                .l-tab-pane { display: none; height: 100%; animation: fadein 0.3s; }
                @keyframes fadein { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
                .cloze-input { border: none; border-bottom: 2px solid var(--primary); background: var(--bg); font-family: inherit; font-size: 1.2rem; color: var(--primary); font-weight:bold; text-align: center; padding: 4px; margin: 0 5px; outline: none; transition: all 0.3s; border-radius: 4px 4px 0 0; }
                .cloze-input:focus { background: var(--primary-light); }
            `;
            document.head.appendChild(style);
        }

        view.innerHTML = `
            <div id="listen-hub-view">
                <div class="back-link" onclick="showPage('home')">← 返回首页</div>
                <h1 class="hero-title" style="text-align: left; margin-bottom: 40px;">听力全矩阵训练中心</h1>
                <div class="hub-grid-3">
                    <div class="main-card" onclick="window.enterListenWorkspace('step1')" style="border: 2px solid #10b981; background: #f0fdf4; padding: 40px 20px;">
                        <span class="card-icon" style="font-size:4rem; margin-bottom:20px;">🌱</span>
                        <h2 style="color:#059669; font-size:1.6rem; margin-bottom:15px;">1. 泛听模仿 (输入)</h2>
                        <p style="color:#047857; font-weight:600; line-height:1.6;">培养语感，纠正发音<br>包含: 互动字幕 / 录音跟读</p>
                    </div>
                    <div class="main-card" onclick="window.enterListenWorkspace('step2')" style="border: 2px solid #f59e0b; background: #fffbeb; padding: 40px 20px;">
                        <span class="card-icon" style="font-size:4rem; margin-bottom:20px;">🔥</span>
                        <h2 style="color:#d97706; font-size:1.6rem; margin-bottom:15px;">2. 精听解码 (内化)</h2>
                        <p style="color:#b45309; font-weight:600; line-height:1.6;">逐句死磕，定点爆破<br>包含: 听写比对 / 精听挖词</p>
                    </div>
                    <div class="main-card" onclick="window.enterListenWorkspace('step3')" style="border: 2px solid #8b5cf6; background: #f5f3ff; padding: 40px 20px;">
                        <span class="card-icon" style="font-size:4rem; margin-bottom:20px;">🏆</span>
                        <h2 style="color:#7c3aed; font-size:1.6rem; margin-bottom:15px;">3. 逻辑检验 (输出)</h2>
                        <p style="color:#6d28d9; font-weight:600; line-height:1.6;">语境重组，成果验收<br>包含: 听音排序 / 测验与错题</p>
                    </div>
                </div>
            </div>

            <div id="listen-workspace-view" style="display:none; height: calc(100vh - 120px); min-height: 650px; gap: 20px; align-items: stretch;">
                
                <div style="width: 320px; background: var(--white); border-radius: 20px; border: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--shadow); flex-shrink: 0;">
                    <div style="padding: 20px; background: var(--primary-light); border-bottom: 1px solid #c7d2fe;">
                        <h2 style="margin: 0 0 15px 0; color: var(--primary); font-size: 1.4rem; display:flex; align-items:center; gap:8px;">🎧 听力资源库</h2>
                        <button class="btn" style="width:100%; padding:15px; font-size:1.05rem;" onclick="document.getElementById('audio-batch-upload').click()">📥 导入本地音频</button>
                        <input type="file" id="audio-batch-upload" multiple accept="audio/*" style="display:none;" onchange="window.handleAudioBatchUpload(this)">
                    </div>
                    <div id="audio-sidebar-list" style="flex: 1; overflow-y: auto; padding: 15px; background: var(--bg);"></div>
                </div>

                <div style="flex: 1; display: flex; flex-direction: column; gap: 20px; min-width: 0;">
                    
                    <div style="background: var(--white); border-radius: 20px; border: 1px solid var(--border); padding: 20px 30px; box-shadow: var(--shadow);">
                        <audio id="audio-element" hidden></audio>
                        
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; padding-bottom:15px; border-bottom:2px dashed var(--border);">
                            <div style="display:flex; align-items:center; gap:15px;">
                                <div class="back-link" onclick="window.exitListenWorkspace()" style="margin:0; font-size:1.05rem; cursor:pointer;">← 返回模块选择</div>
                                <div style="width:2px; height:20px; background:var(--border);"></div>
                                <h3 id="workspace-module-title" style="margin:0; font-size:1.2rem;">模块名称</h3>
                            </div>
                            <button class="btn btn-outline" id="btn-del-audio" style="display:none; padding:4px 12px; font-size:0.8rem; border-color:var(--accent); color:var(--accent);" onclick="window.deleteCurrentAudio()">🗑️ 移除当前音频</button>
                        </div>
                        
                        <h2 id="current-audio-title" style="margin:0 0 15px 0; color:var(--text); font-size:1.5rem; font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">尚未选择音频</h2>
                        
                        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px;">
                            <span id="audio-current" style="font-weight: 600; color: var(--text-light); min-width: 45px; font-size:0.9rem;">00:00</span>
                            <input type="range" id="audio-progress" value="0" min="0" max="100" step="0.1" style="flex: 1; height: 6px; border-radius:3px; background: var(--border); cursor:pointer;">
                            <span id="audio-total" style="font-weight: 600; color: var(--text-light); min-width: 45px; font-size:0.9rem;">00:00</span>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="display:flex; gap:10px; align-items:center;">
                                <button class="btn" id="btn-play-pause" onclick="window.toggleAudioPlay()" style="width: 100px; padding:10px; font-size:1rem;">▶ 播放</button>
                                <button class="btn btn-outline" style="padding:8px 12px; border-radius:10px; font-size:0.9rem;" onclick="window.seekAudioRelative(-5)">⏪ -5s</button>
                                <button class="btn btn-outline" style="padding:8px 12px; border-radius:10px; font-size:0.9rem;" onclick="window.seekAudioRelative(5)">+5s ⏩</button>
                                
                                <div style="height:30px; width:2px; background:var(--border); margin:0 5px;"></div>
                                <button class="btn btn-outline" id="btn-ab-repeat" onclick="window.toggleABRepeat()" style="padding:8px 15px; border-radius:10px; font-size:0.9rem; font-weight:bold; border-width:2px; color:#8b5cf6; border-color:#8b5cf6;">🔄 A-B 复读</button>
                                <button class="btn btn-outline" id="btn-single-loop" onclick="window.toggleSingleLoop()" style="padding:8px 15px; border-radius:10px; font-size:0.9rem; font-weight:bold; border-width:2px; display:none; color:#f59e0b; border-color:#f59e0b;" title="自动抓取当前字幕无限循环">🔂 单句循环</button>
                            </div>
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <select id="audio-speed" onchange="window.changeAudioSpeed()" style="padding: 6px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:0.9rem;">
                                    <option value="0.75">0.75x 慢速</option><option value="1.0" selected>1.0x 正常</option><option value="1.25">1.25x 快速</option><option value="1.5">1.5x 极速</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div style="background: var(--white); border-radius: 20px; border: 1px solid var(--border); box-shadow: var(--shadow); flex:1; display:flex; flex-direction:column; overflow:hidden;">
                        
                        <div style="background:var(--bg); border-bottom:2px solid var(--border); padding: 0 15px; display:flex;">
                            <div id="tabs-step1" style="display:none; gap:5px; padding-top:10px;">
                                <div class="l-tab" data-tab="sub" onclick="window.switchListenTab('sub')">📝 互动字幕</div>
                                <div class="l-tab" data-tab="shadow" onclick="window.switchListenTab('shadow')">🎙️ 录音跟读</div>
                            </div>
                            <div id="tabs-step2" style="display:none; gap:5px; padding-top:10px;">
                                <div class="l-tab" data-tab="dict" onclick="window.switchListenTab('dict')">✍️ 听写比对</div>
                                <div class="l-tab" data-tab="cloze" onclick="window.switchListenTab('cloze')">🧩 精听挖词</div>
                            </div>
                            <div id="tabs-step3" style="display:none; gap:5px; padding-top:10px;">
                                <div class="l-tab" data-tab="sort" onclick="window.switchListenTab('sort')">🔄 听音排序</div>
                                <div class="l-tab" data-tab="quiz" onclick="window.switchListenTab('quiz')">🎯 测验&错题</div>
                            </div>
                        </div>
                        
                        <div style="flex:1; padding:30px; overflow-y:auto; background:var(--white);">
                            
                            <div id="tab-sub" class="l-tab-pane">
                                <div style="display:flex; justify-content:space-between; margin-bottom:15px; align-items:center;">
                                    <p style="color:var(--text-light); margin:0; font-weight:bold;">💡 导入字幕后，将自动激活控制台的【🔂 单句循环】功能。</p>
                                    <button class="btn btn-outline" style="padding:5px 15px;" onclick="document.getElementById('sub-setup').classList.toggle('hidden')">配置字幕</button>
                                </div>
                                <div id="sub-setup" class="hidden" style="margin-bottom:20px;">
                                    <textarea id="subtitles-input" placeholder="粘贴 LRC/SRT 格式字幕 (例如: [00:01.50] Hello world)..." style="height:120px; font-family:monospace; background:var(--primary-light); width:100%; border-radius:10px; padding:15px; border:1px solid var(--border); outline:none;"></textarea>
                                    <button class="btn" style="width:100%; margin-top:10px;" onclick="window.parseSubtitles()">生成智能高亮字幕</button>
                                </div>
                                <div id="subtitle-display" style="max-height: 380px; overflow-y: auto; padding: 20px; border-radius: 15px; border: 2px dashed var(--border); scroll-behavior: smooth; font-size:1.25rem; line-height:2.2;">
                                    <p style="text-align:center; color:var(--text-light);">暂无字幕，请点击右上角配置导入。</p>
                                </div>
                            </div>

                            <div id="tab-shadow" class="l-tab-pane">
                                <h3 style="margin-top:0;">影子训练 (Shadowing)</h3>
                                <p style="color:var(--text-light); margin-bottom:30px;">播放原音后，点击开始录音，对比发音差距。</p>
                                <div style="text-align:center; padding:40px; border:2px dashed var(--border); border-radius:20px; background:var(--bg);">
                                    <div style="display:flex; justify-content:center; gap:20px; margin-bottom:25px;">
                                        <button class="btn" id="btn-record-start" onclick="window.startRecording()" style="background:var(--accent); font-size:1.2rem; padding:15px 30px;">⏺ 开始录音</button>
                                        <button class="btn btn-outline" id="btn-record-stop" onclick="window.stopRecording()" disabled style="opacity:0.5; font-size:1.2rem; padding:15px 30px;">⏹ 停止并回放</button>
                                    </div>
                                    <div id="recording-status" style="color:var(--accent); font-weight:bold; margin-bottom:20px; height:20px;"></div>
                                    <audio id="audio-playback" controls style="width:100%; max-width:400px; outline:none; border-radius:10px;"></audio>
                                </div>
                            </div>

                            <div id="tab-dict" class="l-tab-pane">
                                <h3 style="margin-top:0;">盲听与听写</h3>
                                <textarea id="dict-ref" placeholder="粘贴标准参考原文 (选填，若为空则自动提取您导入的字幕进行比对)..." style="height:80px; background:var(--primary-light); margin-bottom:20px; border-color:#c7d2fe; width:100%; border-radius:10px; padding:15px; outline:none;"></textarea>
                                <textarea id="dict-usr" placeholder="在这里拼写你听到的句子（系统会自动忽略标点和大小写比对）..." style="height:150px; font-size:1.2rem; line-height:1.6; width:100%; border-radius:10px; padding:15px; border:2px solid var(--border); outline:none;"></textarea>
                                <button class="btn" onclick="window.compareDictation()" style="width:100%; margin-bottom:20px; padding:15px; font-size:1.1rem;">比对验证</button>
                                <div id="dict-result-container" class="hidden" style="background:var(--bg); padding:25px; border-radius:15px; border:2px solid var(--border); font-size:1.2rem; line-height:1.8;">
                                    <div id="dict-result"></div>
                                </div>
                            </div>
                            
                            <div id="tab-cloze" class="l-tab-pane">
                                <div style="display:flex; justify-content:space-between; margin-bottom:15px; align-items:center;">
                                    <h3 style="margin:0;">精听填空练习</h3>
                                    <button class="btn btn-outline" style="padding:5px 15px;" onclick="document.getElementById('cloze-setup').classList.toggle('hidden')">配置挖空</button>
                                </div>
                                <div id="cloze-setup" class="hidden" style="margin-bottom:20px;">
                                    <textarea id="cloze-input-text" placeholder="粘贴原文，用方括号标记要挖去的单词。\n支持同义词/多答案，例如：It was a [beautiful|gorgeous] day." style="height:120px; font-family:monospace; background:var(--primary-light); width:100%; border-radius:10px; padding:15px; border:1px solid var(--border); outline:none;"></textarea>
                                    <button class="btn" style="width:100%; margin-top:10px;" onclick="window.parseClozeTest()">生成填空卡片</button>
                                </div>
                                <div id="cloze-display" style="padding: 30px; border-radius: 15px; border: 2px dashed var(--border); font-size: 1.3rem; line-height: 2.4;">
                                    <p style="text-align:center; color:var(--text-light);">暂无题目，请点击右上角配置导入原文。</p>
                                </div>
                                <button class="btn hidden" id="btn-submit-cloze" onclick="window.submitClozeTest()" style="width:100%; margin-top:20px; padding:15px; font-size:1.1rem;">提交答案验证</button>
                                <div id="cloze-result" class="hidden" style="margin-top:20px; padding:20px; font-weight:900; font-size:1.5rem; text-align:center; border-radius:15px;"></div>
                            </div>

                            <div id="tab-sort" class="l-tab-pane">
                                <div style="display:flex; justify-content:space-between; margin-bottom:15px; align-items:center;">
                                    <h3 style="margin:0;">段落/句子排序</h3>
                                    <button class="btn btn-outline" style="padding:5px 15px;" onclick="document.getElementById('sort-setup').classList.toggle('hidden')">配置排序</button>
                                </div>
                                <div id="sort-setup" class="hidden" style="margin-bottom:20px;">
                                    <textarea id="sort-input-text" placeholder="按正确的顺序粘贴段落（每行一段）。\n生成后，系统会自动打乱它们供您拖拽排序。" style="height:120px; background:var(--primary-light); width:100%; border-radius:10px; padding:15px; border:1px solid var(--border); outline:none;"></textarea>
                                    <button class="btn" style="width:100%; margin-top:10px;" onclick="window.generateSorting()">打乱并生成题目</button>
                                </div>
                                <div id="sort-display" style="padding: 20px; border-radius: 15px; border: 2px dashed var(--border);">
                                    <p style="text-align:center; color:var(--text-light);">暂无题目，请点击右上角配置导入。</p>
                                </div>
                                <button class="btn hidden" id="btn-submit-sort" onclick="window.submitSorting()" style="width:100%; margin-top:20px; padding:15px; font-size:1.1rem;">验证排序结果</button>
                                <div id="sort-result" class="hidden" style="margin-top:20px; padding:20px; font-weight:900; font-size:1.5rem; text-align:center; border-radius:15px;"></div>
                            </div>

                            <div id="tab-quiz" class="l-tab-pane">
                                <div style="display:flex; justify-content:space-between; margin-bottom:15px; align-items:center;">
                                    <h3 style="margin:0;">听力理解测验</h3>
                                    <div style="display:flex; gap:10px;">
                                        <button class="btn btn-outline" style="padding:5px 15px; border-color:var(--accent); color:var(--accent);" onclick="window.clearListenErrors()">清空错题</button>
                                        <button class="btn btn-outline" style="padding:5px 15px;" onclick="document.getElementById('quiz-setup').classList.toggle('hidden')">配置考卷</button>
                                    </div>
                                </div>
                                <div id="quiz-setup" class="hidden" style="margin-bottom:20px;">
                                    <textarea id="quiz-input" placeholder="请按以下格式粘贴题目：\nQ: What is the main idea?\nA. Apple\nB. Banana\n答案: A\n解析: 因为文中提到了苹果。" style="height:180px; font-family:monospace; background:var(--primary-light); width:100%; border-radius:10px; padding:15px; border:1px solid var(--border); outline:none;"></textarea>
                                    <button class="btn" style="width:100%; margin-top:10px;" onclick="window.parseListeningQuiz()">智能解析并生成考卷</button>
                                </div>
                                <div id="listen-quiz-display" style="padding: 30px; border-radius: 15px; border: 2px dashed var(--border); margin-bottom:20px;">
                                    <p style="text-align:center; color:var(--text-light);">暂无考卷，请点击右上角配置导入题库。</p>
                                </div>
                                <button class="btn hidden" id="btn-submit-quiz" onclick="window.submitListeningQuiz()" style="width:100%; margin-bottom:30px; padding:15px; font-size:1.1rem;">提交答卷</button>
                                <div id="listen-quiz-result" class="hidden" style="margin-bottom:30px; padding:20px; font-weight:900; font-size:1.5rem; text-align:center; border-radius:15px;"></div>
                                
                                <h3 style="border-top:2px dashed var(--border); padding-top:20px;">📓 自动听力错题本</h3>
                                <div id="l-errors-display" style="display: flex; flex-direction: column; gap: 15px;"></div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        `;
        
        window.bindAudioEvents();
        window.renderAudioSidebar();
    } catch(err) {
        console.error("UI加载失败:", err);
    }
}

// 确保挂载
setTimeout(window.mountListenUI, 200);

// =========================================================================
// 3. 视图切换逻辑 (卡片大厅 <-> 工作区)
// =========================================================================
window.enterListenWorkspace = function(step) {
    document.getElementById('listen-hub-view').style.display = 'none';
    document.getElementById('listen-workspace-view').style.display = 'flex';
    
    // 隐藏所有选项卡组
    document.getElementById('tabs-step1').style.display = 'none';
    document.getElementById('tabs-step2').style.display = 'none';
    document.getElementById('tabs-step3').style.display = 'none';
    
    // 根据模块展示对应选项卡并自动点击第一个
    let titleEl = document.getElementById('workspace-module-title');
    if (step === 'step1') {
        titleEl.innerText = '🌱 1. 泛听模仿'; titleEl.style.color = '#059669';
        document.getElementById('tabs-step1').style.display = 'flex';
        window.switchListenTab('sub');
    } else if (step === 'step2') {
        titleEl.innerText = '🔥 2. 精听解码'; titleEl.style.color = '#d97706';
        document.getElementById('tabs-step2').style.display = 'flex';
        window.switchListenTab('dict');
    } else if (step === 'step3') {
        titleEl.innerText = '🏆 3. 逻辑检验'; titleEl.style.color = '#7c3aed';
        document.getElementById('tabs-step3').style.display = 'flex';
        window.switchListenTab('sort');
    }
}

window.exitListenWorkspace = function() {
    document.getElementById('listen-workspace-view').style.display = 'none';
    document.getElementById('listen-hub-view').style.display = 'block';
}

// =========================================================================
// 4. 网盘与播放控制 (保持不变)
// =========================================================================
window.renderAudioSidebar = function() {
    let listUI = document.getElementById('audio-sidebar-list');
    if(!listUI) return;
    if(window.ehAudioMemDB.length === 0) {
        listUI.innerHTML = `<p style="text-align:center; color:var(--text-light); margin-top:40px;">暂无资源<br><br>点击上方按钮导入</p>`;
        return;
    }
    listUI.innerHTML = window.ehAudioMemDB.map(a => `
        <div class="audio-item ${window.currentAudioId === a.id ? 'active' : ''}" onclick="window.playAudioTrack('${a.id}')">
            <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:700;" title="${a.title}">🎵 ${a.title}</div>
        </div>
    `).join('');
}

window.handleAudioBatchUpload = function(input) {
    if(!input.files || input.files.length === 0) return;
    let count = 0;
    for (let i = 0; i < input.files.length; i++) {
        let f = input.files[i];
        window.ehAudioMemDB.unshift({ id: 'audio_' + Date.now() + '_' + i, title: f.name.replace(/\.[^/.]+$/, ""), fileObj: f });
        count++;
    }
    input.value = ''; window.renderAudioSidebar(); alert(`✅ 成功装载 ${count} 个音频！`);
}

window.playAudioTrack = function(id) {
    let track = window.ehAudioMemDB.find(x => x.id === id);
    if(!track) return;
    window.currentAudioId = id; window.renderAudioSidebar();
    document.getElementById('current-audio-title').innerText = track.title;
    document.getElementById('btn-del-audio').style.display = 'block';

    let url = URL.createObjectURL(track.fileObj);
    let player = document.getElementById('audio-element');
    player.src = url;
    
    window.clearABRepeat();
    document.querySelectorAll('.sub-line').forEach(s => s.classList.remove('active-sub'));
    player.play().then(() => { document.getElementById('btn-play-pause').innerHTML = '⏸ 暂停'; }).catch(e => console.log("等待点击"));
}

window.deleteCurrentAudio = function() {
    if(!window.currentAudioId) return;
    window.ehAudioMemDB = window.ehAudioMemDB.filter(x => x.id !== window.currentAudioId);
    window.currentAudioId = null;
    document.getElementById('audio-element').src = '';
    document.getElementById('current-audio-title').innerText = "尚未选择音频";
    document.getElementById('btn-del-audio').style.display = 'none';
    document.getElementById('btn-play-pause').innerHTML = '▶ 播放';
    window.clearABRepeat(); window.renderAudioSidebar();
}

window.toggleAudioPlay = function() {
    let audio = document.getElementById('audio-element');
    if (!audio || !audio.src || audio.src === window.location.href) return alert("👉 请先在左侧选择音频！");
    if (audio.paused) { audio.play(); document.getElementById('btn-play-pause').innerText = '⏸ 暂停'; } 
    else { audio.pause(); document.getElementById('btn-play-pause').innerText = '▶ 播放'; }
}

window.seekAudioRelative = function(seconds) {
    let audio = document.getElementById('audio-element');
    if(audio && audio.src) audio.currentTime += seconds;
}

window.changeAudioSpeed = function() { 
    let audio = document.getElementById('audio-element');
    if (audio) audio.playbackRate = parseFloat(document.getElementById('audio-speed').value); 
}

// =========================================================================
// 5. A-B复读 与 单句循环
// =========================================================================
window.bindAudioEvents = function() {
    let audio = document.getElementById('audio-element');
    let progress = document.getElementById('audio-progress');

    if (audio && progress) {
        audio.addEventListener('timeupdate', () => {
            let cur = audio.currentTime; let dur = audio.duration || 0;
            document.getElementById('audio-current').innerText = formatTime(cur);
            document.getElementById('audio-total').innerText = formatTime(dur);
            if (dur > 0) progress.value = (cur / dur) * 100;

            if (window.repeatA !== null && window.repeatB !== null) {
                if (cur >= window.repeatB || cur < window.repeatA) {
                    audio.currentTime = window.repeatA;
                    if(audio.paused) audio.play();
                }
            }

            if (window.parsedSubtitles && window.parsedSubtitles.length > 0) {
                let newSubIndex = -1;
                for (let i = 0; i < window.parsedSubtitles.length; i++) {
                    if (cur >= window.parsedSubtitles[i].time) newSubIndex = i; else break;
                }
                
                if (newSubIndex !== window.currentSubIndex && newSubIndex !== -1) {
                    window.currentSubIndex = newSubIndex;
                    document.querySelectorAll('.sub-line').forEach(s => s.classList.remove('active-sub'));
                    let activeEl = document.getElementById(`sub-${window.currentSubIndex}`);
                    if (activeEl) {
                        activeEl.classList.add('active-sub');
                        activeEl.style.color = 'var(--primary)'; activeEl.style.fontWeight = 'bold';
                        let container = document.getElementById('subtitle-display');
                        if (container && activeEl.offsetTop) {
                            container.scrollTop = activeEl.offsetTop - container.offsetTop - (container.clientHeight / 2) + 20;
                        }
                    }
                }
            }
        });

        progress.addEventListener('input', (e) => {
            let dur = audio.duration || 0; audio.currentTime = (e.target.value / 100) * dur;
        });
    }
}

window.toggleABRepeat = function() {
    let audio = document.getElementById('audio-element');
    if (!audio || !audio.src) return alert("请先播放音频！");
    let btn = document.getElementById('btn-ab-repeat');

    if (window.repeatA === null) {
        window.repeatA = audio.currentTime;
        btn.innerText = `设定B点 (A:${formatTime(window.repeatA)})`;
        btn.style.background = 'var(--warning)'; btn.style.color = 'white';
    } else if (window.repeatB === null) {
        window.repeatB = audio.currentTime;
        if (window.repeatB <= window.repeatA + 0.5) { alert('时间过短已取消。'); window.clearABRepeat(); return; }
        btn.innerText = `🔄 A-B循环中`;
        btn.style.background = 'var(--success)'; btn.style.color = 'white';
        audio.currentTime = window.repeatA; 
    } else { window.clearABRepeat(); }
}

window.toggleSingleLoop = function() {
    let audio = document.getElementById('audio-element');
    let btn = document.getElementById('btn-single-loop');
    
    if (window.repeatA !== null && window.repeatB !== null) { window.clearABRepeat(); return; }
    if (window.currentSubIndex === -1 || window.parsedSubtitles.length === 0) return;
    
    window.repeatA = window.parsedSubtitles[window.currentSubIndex].time;
    window.repeatB = (window.currentSubIndex + 1 < window.parsedSubtitles.length) ? window.parsedSubtitles[window.currentSubIndex + 1].time : window.repeatA + 3;
    
    audio.currentTime = window.repeatA; if(audio.paused) audio.play();
    btn.innerText = '🔂 单句洗脑中'; btn.style.background = 'var(--primary)'; btn.style.color = 'white';
    
    let btnAB = document.getElementById('btn-ab-repeat');
    btnAB.innerText = `🔄 A-B 复读`; btnAB.style.background = 'transparent'; btnAB.style.color = '#8b5cf6';
}

window.clearABRepeat = function() {
    window.repeatA = null; window.repeatB = null;
    let btnAB = document.getElementById('btn-ab-repeat');
    if(btnAB) { btnAB.innerText = `🔄 A-B 复读`; btnAB.style.background = 'transparent'; btnAB.style.color = '#8b5cf6';}
    let btnSingle = document.getElementById('btn-single-loop');
    if(btnSingle) { btnSingle.innerText = '🔂 单句循环'; btnSingle.style.background = 'transparent'; btnSingle.style.color = '#f59e0b';}
}

// =========================================================================
// 6. 专项训练业务逻辑 (听写/挖词/排序/测验)
// =========================================================================
window.switchListenTab = function(tabId) {
    document.querySelectorAll('.l-tab').forEach(el => el.classList.remove('active'));
    document.querySelector(`.l-tab[data-tab="${tabId}"]`).classList.add('active');
    document.querySelectorAll('.l-tab-pane').forEach(el => el.style.display = 'none');
    document.getElementById(`tab-${tabId}`).style.display = 'block';
    if(tabId === 'quiz' && typeof window.renderListenErrors === 'function') window.renderListenErrors();
}

window.startRecording = async function() {
    try {
        let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream); let chunks = [];
        mediaRecorder.addEventListener("dataavailable", e => { if(e.data.size > 0) chunks.push(e.data); });
        mediaRecorder.addEventListener("stop", () => {
            document.getElementById('audio-playback').src = URL.createObjectURL(new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/mp4' }));
            document.getElementById('audio-playback').load();
            stream.getTracks().forEach(t => t.stop());
        });
        mediaRecorder.start();
        document.getElementById('recording-status').innerText = '🔴 录音中...';
        document.getElementById('btn-record-start').disabled = true; document.getElementById('btn-record-start').style.opacity = 0.5;
        document.getElementById('btn-record-stop').disabled = false; document.getElementById('btn-record-stop').style.opacity = 1;
    } catch(e) { alert('无法访问麦克风'); }
}

window.stopRecording = function() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        document.getElementById('recording-status').innerText = '✅ 录音完成';
        document.getElementById('btn-record-start').disabled = false; document.getElementById('btn-record-start').style.opacity = 1;
        document.getElementById('btn-record-stop').disabled = true; document.getElementById('btn-record-stop').style.opacity = 0.5;
    }
}

window.parseSubtitles = function() {
    let text = document.getElementById('subtitles-input').value;
    window.parsedSubtitles = []; let html = '';
    text.split('\n').forEach((line, idx) => {
        let match = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
        if (match) {
            let time = parseInt(match[1]) * 60 + parseFloat(match[2]);
            window.parsedSubtitles.push({ time, content: match[3].trim(), idx });
            html += `<div class="sub-line" id="sub-${idx}" onclick="window.seekAudio(${time})" style="cursor:pointer; padding:8px 15px; border-radius:12px; transition:all 0.2s;">${match[3].trim()}</div>`;
        }
    });
    document.getElementById('subtitle-display').innerHTML = window.parsedSubtitles.length === 0 ? '<p style="text-align:center; color: var(--accent);">未能解析出有效时间戳。</p>' : html;
    document.getElementById('sub-setup').classList.add('hidden');
    if(window.parsedSubtitles.length > 0) document.getElementById('btn-single-loop').style.display = 'inline-block';
}

window.seekAudio = function(time) { 
    let audio = document.getElementById('audio-element');
    if (audio && audio.src) { audio.currentTime = time; audio.play(); document.getElementById('btn-play-pause').innerText = '⏸ 暂停'; } 
}

window.compareDictation = function() {
    let ref = document.getElementById('dict-ref').value.trim() || (window.parsedSubtitles.length > 0 ? window.parsedSubtitles.map(s => s.content).join(' ') : "");
    let usr = document.getElementById('dict-usr').value.trim();
    if (!usr || !ref) return alert("请输入内容或参考答案");
    
    let cleanRef = ref.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w);
    let cleanUsr = usr.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w);
    
    let resultHtml = '';
    for (let i = 0; i < Math.max(cleanRef.length, cleanUsr.length); i++) {
        let rw = cleanRef[i] || '', uw = cleanUsr[i] || '';
        if (rw === uw && rw !== '') resultHtml += `<span style="color:var(--success); font-weight:bold;">${uw} </span>`;
        else if (uw && rw && (rw.includes(uw) || uw.includes(rw))) resultHtml += `<span style="color:var(--warning); font-weight:bold;">${uw}(应为:${rw}) </span>`;
        else if (uw && !rw) resultHtml += `<span style="color:#f97316; border-bottom: 2px dashed #f97316;">${uw} </span>`;
        else if (!uw && rw) resultHtml += `<span style="color:var(--accent); text-decoration:line-through;">${rw} </span>`;
        else resultHtml += `<span style="color:var(--accent); text-decoration:line-through;">${rw}</span><span style="color:#f97316; border-bottom: 2px dashed #f97316; margin-left: 2px;">${uw} </span>`;
    }
    document.getElementById('dict-result-container').classList.remove('hidden');
    document.getElementById('dict-result').innerHTML = resultHtml;
}

window.parseClozeTest = function() {
    let text = document.getElementById('cloze-input-text').value;
    if (!text) return alert("请输入挖空文本！");
    window.parsedClozeAnswers = [];
    let html = text.replace(/\[(.*?)\]/g, (match, p1) => {
        let idx = window.parsedClozeAnswers.length;
        window.parsedClozeAnswers.push(p1.split('|').map(a => a.trim().toLowerCase()));
        return `<input type="text" class="cloze-input" id="cloze-input-${idx}" style="width:${Math.max(p1.length * 15, 60)}px">`;
    });
    document.getElementById('cloze-display').innerHTML = html.replace(/\n/g, '<br>');
    document.getElementById('cloze-setup').classList.add('hidden');
    document.getElementById('btn-submit-cloze').classList.remove('hidden');
    document.getElementById('cloze-result').classList.add('hidden');
}

window.submitClozeTest = function() {
    let correct = 0;
    for (let i = 0; i < window.parsedClozeAnswers.length; i++) {
        let el = document.getElementById(`cloze-input-${i}`);
        let val = el.value.trim().toLowerCase();
        if (window.parsedClozeAnswers[i].includes(val)) { 
            el.style.borderBottomColor = 'var(--success)'; el.style.color = 'var(--success)'; correct++; 
        } else { 
            el.style.borderBottomColor = 'var(--accent)'; el.style.color = 'var(--accent)'; el.style.textDecoration = 'line-through';
            if (!el.nextSibling || el.nextSibling.className !== 'cloze-ans') {
                let ansSpan = document.createElement('span'); ansSpan.className = 'cloze-ans'; ansSpan.innerText = window.parsedClozeAnswers[i][0]; 
                ansSpan.style.color = 'var(--success)'; ansSpan.style.fontWeight = 'bold'; ansSpan.style.marginLeft = '5px';
                el.parentNode.insertBefore(ansSpan, el.nextSibling);
            }
        }
    }
    let res = document.getElementById('cloze-result'); res.classList.remove('hidden'); 
    res.innerHTML = `得分: ${correct} / ${window.parsedClozeAnswers.length}`;
    res.style.color = correct === window.parsedClozeAnswers.length ? 'var(--success)' : 'var(--accent)';
    res.style.background = correct === window.parsedClozeAnswers.length ? '#ecfdf5' : '#fff1f2';
}

window.generateSorting = function() {
    let paras = document.getElementById('sort-input-text').value.split('\n').map(p => p.trim()).filter(p => p);
    if (paras.length < 2) return alert('请输入至少两段');
    window.correctSortOrder = [...paras]; window.currentSortOrder = [...paras].sort(() => 0.5 - Math.random());
    window.renderSorting();
    document.getElementById('sort-setup').classList.add('hidden');
    document.getElementById('btn-submit-sort').classList.remove('hidden');
    document.getElementById('sort-result').classList.add('hidden');
}

window.renderSorting = function() {
    document.getElementById('sort-display').innerHTML = window.currentSortOrder.map((p, i) => `
        <div draggable="true" ondragstart="window.dragStart(event, ${i})" ondragover="window.dragOver(event)" ondrop="window.drop(event, ${i})" style="padding:15px; margin-bottom:12px; background:var(--white); border:2px solid var(--border); border-radius:12px; cursor:grab; font-size:1.1rem; display:flex; align-items:center;">
            <span style="color:var(--text-light); margin-right:15px; font-size:1.5rem;">☰</span>${p}
        </div>`).join('');
}

window.dragStart = function(e, idx) { window.draggedSortIndex = idx; }
window.dragOver = function(e) { e.preventDefault(); }
window.drop = function(e, idx) {
    e.preventDefault(); if (window.draggedSortIndex === null || window.draggedSortIndex === idx) return;
    let item = window.currentSortOrder.splice(window.draggedSortIndex, 1)[0];
    window.currentSortOrder.splice(idx, 0, item); window.draggedSortIndex = null; window.renderSorting();
}

window.submitSorting = function() {
    let isCorrect = window.correctSortOrder.every((val, i) => val === window.currentSortOrder[i]);
    let res = document.getElementById('sort-result'); res.classList.remove('hidden');
    res.innerHTML = isCorrect ? '🎉 顺序正确！' : '❌ 顺序有误';
    res.style.color = isCorrect ? 'var(--success)' : 'var(--accent)';
    res.style.background = isCorrect ? '#ecfdf5' : '#fff1f2';
}

window.parseListeningQuiz = function() {
    let blocks = document.getElementById('quiz-input').value.split('Q:').filter(b => b.trim());
    if (blocks.length === 0) return alert("未解析出题目");
    window.parsedListeningQuiz = []; let html = '';
    blocks.forEach((b, idx) => {
        let lines = b.split('\n').map(l => l.trim()).filter(l => l);
        let qText = lines[0], opts = [], ans = '', exp = '';
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].startsWith('答案:')) ans = lines[i].replace('答案:', '').trim();
            else if (lines[i].startsWith('解析:')) exp = lines[i].replace('解析:', '').trim();
            else opts.push(lines[i]);
        }
        window.parsedListeningQuiz.push({ qText, opts, ans, exp });
        let optsHtml = opts.map(o => `<label style="display:flex; align-items:center; padding:12px 15px; margin-bottom:8px; border:2px solid var(--border); border-radius:10px; cursor:pointer; background:var(--bg);"><input type="radio" name="l-quiz-${idx}" value="${o.substring(0, 1).toUpperCase()}" style="margin-right:12px; transform:scale(1.2);"> <span style="font-size:1.1rem;">${o}</span></label>`).join('');
        html += `<div style="margin-bottom:35px;"><div style="font-weight:800; font-size:1.2rem; margin-bottom:15px; color:var(--text);">${idx + 1}. ${qText}</div>${optsHtml}<div id="l-quiz-exp-${idx}" style="display:none; margin-top:15px; padding:15px; background:var(--primary-light); border-left:5px solid var(--primary); border-radius:8px;">解析: ${exp || '无'}</div></div>`;
    });
    document.getElementById('listen-quiz-display').innerHTML = html;
    document.getElementById('quiz-setup').classList.add('hidden');
    document.getElementById('btn-submit-quiz').classList.remove('hidden');
    document.getElementById('listen-quiz-result').classList.add('hidden');
}

window.submitListeningQuiz = function() {
    let correct = 0;
    window.parsedListeningQuiz.forEach((q, idx) => {
        let selected = document.querySelector(`input[name="l-quiz-${idx}"]:checked`);
        let expEl = document.getElementById(`l-quiz-exp-${idx}`);
        expEl.style.display = 'block';
        if (selected && selected.value === q.ans) { correct++; expEl.style.borderLeftColor = 'var(--success)'; } 
        else {
            expEl.style.borderLeftColor = 'var(--accent)';
            if (typeof listenErrors !== 'undefined' && !listenErrors.find(e => e.q === q.qText)) {
                listenErrors.unshift({ q: q.qText, ans: q.ans, exp: q.exp, date: new Date().toLocaleDateString() });
                if(typeof saveUserData === 'function') saveUserData();
            }
        }
    });
    let res = document.getElementById('listen-quiz-result'); res.classList.remove('hidden');
    res.innerHTML = `答对: ${correct} / ${window.parsedListeningQuiz.length}`;
    res.style.color = correct === window.parsedListeningQuiz.length ? 'var(--success)' : 'var(--accent)';
    res.style.background = correct === window.parsedListeningQuiz.length ? '#ecfdf5' : '#fff1f2';
    window.renderListenErrors();
}

window.renderListenErrors = function() {
    let container = document.getElementById('l-errors-display');
    if (!container) return;
    if (typeof listenErrors === 'undefined' || listenErrors.length === 0) { container.innerHTML = '<p style="text-align:center; color:var(--text-light);">暂无错题记录</p>'; return; }
    container.innerHTML = listenErrors.map((e) => `<div style="background:var(--white); padding:20px; border-radius:15px; border:1px solid var(--accent); margin-bottom:10px;"><div style="font-weight:bold; font-size:1.1rem; margin-bottom:10px;">${e.q}</div><div style="color:var(--success); font-weight:bold; margin-bottom:8px;">正确答案: ${e.ans}</div><div style="font-size:0.95rem; color:var(--text-light);">解析：${e.exp}</div></div>`).join('');
}

window.clearListenErrors = function() {
    if (confirm('确定清空错题记录吗？')) { if(typeof listenErrors !== 'undefined') { listenErrors.length = 0; if(typeof saveUserData === 'function') saveUserData(); window.renderListenErrors(); } }
}
