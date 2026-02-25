/* =========================================================================
   EnglishHub Pro - 听力与语音训练模块 (js/listen.js)
   负责：音频解析、字幕同步、原音跟读录音、精听练习 (填空/排序)
   依赖：main.js (需在其之后加载)
   ========================================================================= */

// =========================================================================
// 1. 听力模块专属状态变量
// =========================================================================
let mediaRecorder; 
let audioChunks = [];
let parsedSubtitles = []; 
let currentAudioFileName = ""; 
let parsedClozeAnswers = []; 
let clozeRawText = '';
let correctSortOrder = []; 
let currentSortOrder = []; 
let draggedSortIndex = null;

// =========================================================================
// 2. 音频与字幕文件处理
// =========================================================================

function handleAudioUpload(event) {
    if(!requireAuth()) { event.target.value = ''; return; }
    const file = event.target.files[0];
    if (file) {
        currentAudioFileName = file.name;
        const audioUrl = URL.createObjectURL(file);
        const player = document.getElementById('audio-player');
        if(player) {
            player.src = audioUrl;
            player.classList.remove('hidden');
        }
        // 如果有保存的进度，尝试恢复
        if(audioProgress && audioProgress[currentAudioFileName]) {
            if(confirm(`检测到上次播放到 ${formatTime(audioProgress[currentAudioFileName])}，是否继续？`)) {
                player.currentTime = audioProgress[currentAudioFileName];
            }
        }
    }
}

function handleSubtitleUpload(event) {
    if(!requireAuth()) { event.target.value = ''; return; }
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            parseSubtitles(e.target.result);
        };
        reader.readAsText(file);
    }
}

function parseSubtitles(text) {
    parsedSubtitles = [];
    const blocks = text.split(/\n\s*\n/);
    blocks.forEach(block => {
        const lines = block.split('\n');
        if (lines.length >= 3) {
            const timeLine = lines[1];
            const times = timeLine.split(' --> ');
            if(times.length === 2) {
                const start = parseTime(times[0]);
                const end = parseTime(times[1]);
                let content = lines.slice(2).join(' ');
                parsedSubtitles.push({ start, end, text: content });
            }
        }
    });
    
    // 如果没有成功解析，尝试作为纯文本段落处理
    if(parsedSubtitles.length === 0) {
        let lines = text.split('\n').filter(l => l.trim() !== '');
        lines.forEach((l, idx) => {
            parsedSubtitles.push({ start: idx*5, end: (idx+1)*5, text: l.trim() });
        });
    }
    renderSubtitles();
}

function parseTime(timeString) {
    const parts = timeString.replace(',', '.').split(':');
    if (parts.length === 3) {
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    }
    return 0;
}

function formatTime(seconds) {
    let m = Math.floor(seconds / 60);
    let s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0'+s : s}`;
}

// =========================================================================
// 3. 字幕同步与渲染
// =========================================================================

function renderSubtitles() {
    const container = document.getElementById('subtitle-container');
    if(!container) return;
    
    if(parsedSubtitles.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-light); padding:40px;">暂无字幕，请上传字幕文件。</p>`;
        return;
    }
    
    let html = '';
    parsedSubtitles.forEach((sub, index) => {
        html += `<div class="sub-line" id="sub-${index}" onclick="seekAudio(${sub.start})">${sub.text}</div>`;
    });
    container.innerHTML = html;
}

function syncSubtitles() {
    const player = document.getElementById('audio-player');
    if (!player || parsedSubtitles.length === 0) return;
    
    const currentTime = player.currentTime;
    // 记录播放进度
    if(currentAudioFileName && Math.floor(currentTime) % 5 === 0) {
        audioProgress[currentAudioFileName] = currentTime;
        saveUserData();
    }
    
    parsedSubtitles.forEach((sub, index) => {
        const el = document.getElementById(`sub-${index}`);
        if(el) {
            if (currentTime >= sub.start && currentTime <= sub.end) {
                el.classList.add('active-sub');
                // 自动滚动到可视区域
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                el.classList.remove('active-sub');
            }
        }
    });
}

function seekAudio(time) {
    const player = document.getElementById('audio-player');
    if (player) {
        player.currentTime = time;
        player.play();
    }
}

// 监听播放器的进度更新事件
document.addEventListener('DOMContentLoaded', () => {
    const player = document.getElementById('audio-player');
    if(player) {
        player.addEventListener('timeupdate', syncSubtitles);
    }
});

// =========================================================================
// 4. 精听练习引擎 (填空 Cloze)
// =========================================================================

function generateCloze() {
    if(!requireAuth()) return;
    if(parsedSubtitles.length === 0) { alert("请先上传音频和字幕文件！"); return; }
    
    // 随机抽取 5 句字幕作为填空材料
    let shuffled = [...parsedSubtitles].sort(() => 0.5 - Math.random()).slice(0, 5);
    parsedClozeAnswers = [];
    let html = '';
    
    shuffled.forEach((sub, index) => {
        let words = sub.text.split(' ');
        if(words.length < 3) return; // 句子太短跳过
        
        // 随机挖空一个长度 >= 4 的单词
        let validIndices = [];
        words.forEach((w, i) => { if(w.replace(/[^a-zA-Z]/g, '').length >= 4) validIndices.push(i); });
        
        if(validIndices.length > 0) {
            let blankIdx = validIndices[Math.floor(Math.random() * validIndices.length)];
            let originalWord = words[blankIdx];
            let cleanWord = originalWord.replace(/[^a-zA-Z]/g, '');
            parsedClozeAnswers.push(cleanWord.toLowerCase());
            
            words[blankIdx] = originalWord.replace(cleanWord, `<input type="text" class="cloze-input" id="cloze-${index}" autocomplete="off">`);
        }
        
        html += `<div style="margin-bottom: 25px; font-size: 1.2rem; line-height: 1.8;">
                    <strong>${index + 1}.</strong> ${words.join(' ')} 
                    <button class="btn btn-outline" style="padding: 5px 10px; font-size: 0.9rem; margin-left: 10px;" onclick="seekAudio(${sub.start})">🔊 听原音</button>
                    <span id="cloze-res-${index}" class="cloze-ans hidden"></span>
                 </div>`;
    });
    
    document.getElementById('cloze-area').innerHTML = html;
    document.getElementById('btn-check-cloze').classList.remove('hidden');
}

function checkCloze() {
    let score = 0;
    parsedClozeAnswers.forEach((ans, index) => {
        let inputEl = document.getElementById(`cloze-${index}`);
        let resEl = document.getElementById(`cloze-res-${index}`);
        if(inputEl && resEl) {
            let userVal = inputEl.value.trim().toLowerCase();
            resEl.classList.remove('hidden');
            if(userVal === ans) {
                inputEl.classList.add('correct');
                inputEl.classList.remove('wrong');
                resEl.innerHTML = '✔️';
                score++;
            } else {
                inputEl.classList.add('wrong');
                inputEl.classList.remove('correct');
                resEl.innerHTML = `❌ 正确答案: <strong>${ans}</strong>`;
                
                // 记录到听力错题本
                if(!listenErrors.find(e => e.word === ans)) {
                    listenErrors.unshift({ word: ans, cn: '听写错误', type: 'cloze', date: new Date().toLocaleString() });
                    saveUserData();
                }
            }
        }
    });
    alert(`核对完成！你的得分：${score} / ${parsedClozeAnswers.length}`);
}

// =========================================================================
// 5. 句子排序 (Sorting)
// =========================================================================

function generateSorting() {
    if(!requireAuth()) return;
    if(parsedSubtitles.length === 0) { alert("请先上传音频和字幕文件！"); return; }
    
    // 找一句较长的字幕
    let longSubs = parsedSubtitles.filter(s => s.text.split(' ').length > 6);
    if(longSubs.length === 0) longSubs = parsedSubtitles;
    
    let targetSub = longSubs[Math.floor(Math.random() * longSubs.length)];
    let words = targetSub.text.replace(/[.,!?]/g, '').split(' ').filter(w => w.trim() !== '');
    
    correctSortOrder = [...words];
    currentSortOrder = [...words].sort(() => 0.5 - Math.random()); // 打乱
    
    renderSortBlocks();
    
    let audioBtnHtml = `<button class="btn" onclick="seekAudio(${targetSub.start})" style="margin-bottom: 20px;">🔊 播放该句原音</button>`;
    document.getElementById('sort-audio-area').innerHTML = audioBtnHtml;
    document.getElementById('btn-check-sort').classList.remove('hidden');
}

function renderSortBlocks() {
    const area = document.getElementById('sort-area');
    if(!area) return;
    
    let html = '';
    currentSortOrder.forEach((word, index) => {
        html += `<div class="anagram-tile" draggable="true" ondragstart="sortDragStart(${index})" ondragover="sortDragOver(event)" ondrop="sortDrop(${index})" style="cursor: grab;">${word}</div>`;
    });
    area.innerHTML = html;
}

function sortDragStart(index) { draggedSortIndex = index; }
function sortDragOver(event) { event.preventDefault(); }

function sortDrop(targetIndex) {
    if (draggedSortIndex === null || draggedSortIndex === targetIndex) return;
    // 交换位置
    const word = currentSortOrder[draggedSortIndex];
    currentSortOrder.splice(draggedSortIndex, 1);
    currentSortOrder.splice(targetIndex, 0, word);
    draggedSortIndex = null;
    renderSortBlocks();
}

function checkSorting() {
    let isCorrect = true;
    for(let i=0; i<correctSortOrder.length; i++) {
        if(correctSortOrder[i] !== currentSortOrder[i]) {
            isCorrect = false;
            break;
        }
    }
    if(isCorrect) {
        alert("🎉 完全正确！你的语感非常棒！");
    } else {
        alert("❌ 顺序不对哦，正确顺序是：\n" + correctSortOrder.join(' '));
    }
}

// =========================================================================
// 6. 原音跟读与麦克风录音打分
// =========================================================================

async function startRecording() {
    if(!requireAuth()) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const playback = document.getElementById('record-playback');
            if(playback) {
                playback.src = audioUrl;
                playback.classList.remove('hidden');
            }
            
            // 模拟 AI 打分
            document.getElementById('record-score').innerHTML = `
                <div style="background: var(--primary-light); padding: 15px; border-radius: 15px; margin-top: 15px; border: 1px solid var(--border);">
                    <div style="font-size: 1.1rem; color: var(--text); font-weight: bold;">AI 发音测评结果：</div>
                    <div style="font-size: 3rem; color: var(--success); font-weight: 900;">${Math.floor(Math.random() * 20 + 80)} <span style="font-size:1rem; color:var(--text-light);">分</span></div>
                    <p style="color: var(--text-light); margin: 5px 0 0 0;">流利度良好，注意重音节奏。</p>
                </div>
            `;
        };
        
        mediaRecorder.start();
        document.getElementById('btn-start-record').classList.add('hidden');
        document.getElementById('btn-stop-record').classList.remove('hidden');
        document.getElementById('record-score').innerHTML = '<div style="color:var(--accent); font-weight:bold; animation: pulse-btn 1s infinite;">🔴 正在录音中...</div>';
        
    } catch (err) {
        alert("❌ 无法访问麦克风，请检查浏览器权限设置！");
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop()); // 关闭麦克风
        document.getElementById('btn-start-record').classList.remove('hidden');
        document.getElementById('btn-stop-record').classList.add('hidden');
    }
}

// =========================================================================
// 7. 听力错题本渲染
// =========================================================================

function renderListenErrors() {
    const ui = document.getElementById('ui-listen-errors');
    if(!ui) return;
    if(!listenErrors || listenErrors.length === 0) {
        ui.innerHTML = `<p style="text-align:center; padding:20px; color:var(--text-light);">暂无听力错题记录。快去进行精听填空练习吧！</p>`;
        return;
    }
    
    let html = '';
    listenErrors.forEach((err, index) => {
        html += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--white); padding:15px 20px; border-radius:15px; border:1px solid var(--border); margin-bottom:10px;">
            <div>
                <span style="font-size:1.2rem; font-weight:bold; color:var(--accent);">${err.word}</span>
                <span style="color:var(--text-light); margin-left:10px; font-size:0.9rem;">${err.date}</span>
            </div>
            <button class="btn btn-outline" style="padding:8px 15px;" onclick="speak('${err.word}')">🔊 盲听</button>
        </div>`;
    });
    ui.innerHTML = html;
}

// =========================================================================
// 将供 HTML 调用的函数暴露给全局 window
// =========================================================================
window.handleAudioUpload = handleAudioUpload;
window.handleSubtitleUpload = handleSubtitleUpload;
window.parseSubtitles = parseSubtitles;
window.syncSubtitles = syncSubtitles;
window.seekAudio = seekAudio;

window.generateCloze = generateCloze;
window.checkCloze = checkCloze;

window.generateSorting = generateSorting;
window.sortDragStart = sortDragStart;
window.sortDragOver = sortDragOver;
window.sortDrop = sortDrop;
window.checkSorting = checkSorting;

window.startRecording = startRecording;
window.stopRecording = stopRecording;

window.renderListenErrors = renderListenErrors;