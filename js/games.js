// js/games.js
// =========================================================================
// 🎮 趣英文 (quyingwen.top) 20款全能游戏引擎
// =========================================================================

window.GameState = window.GameState || {};
window.globalGameTimer = null;

// =========================================================================
// 1. 核心调度与 UI 框架
// =========================================================================
window.initGame = function(gameId, incomingWords) {
    // 词库抓取逻辑
    let words = incomingWords || (window.notebook && window.notebook.length >= 4 ? window.notebook : [
        {word:'Perspective', cn:'观点', id:'d1'}, {word:'Efficient', cn:'高效', id:'d2'},
        {word:'Dynamic', cn:'动态', id:'d3'}, {word:'Magnificent', cn:'壮丽', id:'d4'},
        {word:'Challenge', cn:'挑战', id:'d5'}, {word:'Victory', cn:'胜利', id:'d6'}
    ]);

    let gameRoom = document.getElementById('p-game-room');
    if(!gameRoom) {
        gameRoom = document.createElement('div');
        gameRoom.id = 'p-game-room';
        gameRoom.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:#f8fafc; z-index:99999; overflow-y:auto; padding:20px; box-sizing:border-box;';
        document.body.appendChild(gameRoom);
    }
    gameRoom.style.display = 'block';

    gameRoom.innerHTML = `
        <div style="max-width: 600px; margin: 50px auto; background: white; padding: 40px; border-radius: 30px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); border: 2px solid #e2e8f0; text-align:center;">
            <div style="font-size: 5rem; margin-bottom: 20px;">🕹️</div>
            <h1 style="color: #4f46e5; margin:0; font-size:2rem;">${window.getGameTitle(gameId)}</h1>
            <p style="color: #64748b; margin: 15px 0 30px 0;">准备好战斗了吗？本次动用 <span style="font-weight:bold; color:#f43f5e;">${words.length}</span> 枚单词弹药</p>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px;">
                <button class="timer-btn" onclick="window.setT(this, 30)" style="padding:15px; border-radius:12px; border:2px solid #e2e8f0; background:white; cursor:pointer;">🔥 30秒</button>
                <button class="timer-btn" onclick="window.setT(this, 60)" style="padding:15px; border-radius:12px; border:2px solid #e2e8f0; background:white; cursor:pointer;">⏱️ 60秒</button>
                <button class="timer-btn" onclick="window.setT(this, 120)" style="padding:15px; border-radius:12px; border:2px solid #e2e8f0; background:white; cursor:pointer;">⏳ 120秒</button>
                <button class="timer-btn" onclick="window.setT(this, 0)" style="padding:15px; border-radius:12px; border:2px solid #e2e8f0; background:white; cursor:pointer;">♾️ 无限制</button>
            </div>
            <button class="btn" style="width:100%; padding:20px; font-size:1.5rem; background:#4f46e5; color:white; border:none; border-radius:15px; cursor:pointer;" onclick="window.launch('${gameId}')">进入战场</button>
        </div>
    `;
    window.GameState.pendingWords = words;
    window.GameState.selectedTime = 30; 
};

window.setT = function(btn, s) {
    document.querySelectorAll('.timer-btn').forEach(b => b.style.borderColor = '#e2e8f0');
    btn.style.borderColor = '#4f46e5';
    window.GameState.selectedTime = s;
};

window.getGameTitle = (id) => {
    const titles = {
        'match':'连连看', 'speed':'极速闪读', 'whack':'打地鼠', 'memory':'翻牌记忆',
        'snake':'贪吃蛇', 'jump':'单词跳一跳', 'shoot':'单词射击', 'balloon':'气球派对',
        'falling':'下落挑战', 'tetris':'俄罗斯单词', 'fishing':'疯狂钓鱼', 'racing':'赛马冲刺',
        'bridge':'造句搭桥', 'box':'单词推箱子', 'flight':'王牌飞行员', 'climb':'单词攀爬',
        'cards':'卡片对战', 'mines':'词汇扫雷', 'basket':'单词投篮', 'cross':'十字路口'
    };
    return titles[id] || '单词大挑战';
};

// =========================================================================
// 2. 运行时控制 (计时器/计分)
// =========================================================================
window.launch = function(gameId) {
    let words = window.GameState.pendingWords;
    let timeLimit = window.GameState.selectedTime;
    window.GameState.score = 0;
    
    document.getElementById('p-game-room').innerHTML = `
        <div style="max-width: 1000px; margin: 0 auto; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <button onclick="window.exitGameRoom()" style="padding:10px 20px; border-radius:10px; border:none; background:#fee2e2; color:#ef4444; font-weight:bold; cursor:pointer;">⏹ 退出</button>
                <div id="game-clock" style="font-size:1.8rem; font-weight:900; color:#4f46e5; font-family:monospace;">${timeLimit > 0 ? timeLimit + 's' : 'LIVE'}</div>
                <div style="font-size:1.5rem; font-weight:bold;">SCORE: <span id="game-score" style="color:#f59e0b;">0</span></div>
            </div>
            <div id="game-canvas" style="position:relative; width:100%; min-height:600px; background:white; border-radius:25px; border:2px solid #e2e8f0; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.05);"></div>
        </div>
    `;

    // 运行特定游戏逻辑
    window.runLogic(gameId, words);

    if (timeLimit > 0) {
        window.GameState.timeLeft = timeLimit;
        clearInterval(window.globalGameTimer);
        window.globalGameTimer = setInterval(() => {
            window.GameState.timeLeft--;
            document.getElementById('game-clock').innerText = window.GameState.timeLeft + 's';
            if (window.GameState.timeLeft <= 0) window.over("时间到！");
        }, 1000);
    }
};

window.upScore = function(p) {
    window.GameState.score += p;
    document.getElementById('game-score').innerText = window.GameState.score;
};

window.over = function(msg) {
    clearInterval(window.globalGameTimer);
    const canvas = document.getElementById('game-canvas');
    canvas.innerHTML = `
        <div style="text-align:center; padding-top:100px; animation: popup 0.5s;">
            <h1 style="font-size:3rem; color:#10b981;">FINISH!</h1>
            <p style="color:#64748b; font-size:1.2rem;">${msg}</p>
            <div style="font-size:6rem; font-weight:900; color:#4f46e5; margin:30px 0;">${window.GameState.score}</div>
            <button class="btn" style="padding:15px 50px; font-size:1.5rem; background:#4f46e5; color:white; border:none; border-radius:15px; cursor:pointer;" onclick="window.exitGameRoom()">返回大厅</button>
        </div>
    `;
};

window.exitGameRoom = function() {
    clearInterval(window.globalGameTimer);
    location.reload(); 
};

// =========================================================================
// 3. 20款核心游戏逻辑路由
// =========================================================================
window.runLogic = function(gameId, words) {
    const stage = document.getElementById('game-canvas');
    let pool = [...words].sort(() => 0.5 - Math.random());

    // --- 逻辑分类器 ---

    // 1. 消除类 (match, memory, mines)
    if(['match', 'memory', 'mines'].includes(gameId)) {
        let isMem = gameId === 'memory';
        let items = [];
        pool.slice(0, 8).forEach(w => {
            items.push({ t: w.word, id: w.id });
            items.push({ t: w.cn, id: w.id });
        });
        items.sort(() => 0.5 - Math.random());
        stage.innerHTML = `<div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:15px; padding:25px;">
            ${items.map((it, i) => `<div class="g-card" id="c-${i}" onclick="window.handleMatch(${i}, '${it.id}', ${isMem})" style="height:100px; background:#f1f5f9; border-radius:15px; display:flex; align-items:center; justify-content:center; font-weight:bold; cursor:pointer; font-size:${isMem?0:'1.1rem'};">${it.t}</div>`).join('')}
        </div>`;
        window.GameState.first = null;
        window.handleMatch = (idx, id, mem) => {
            let el = document.getElementById(`c-${idx}`);
            if(el.style.opacity === '0') return;
            el.style.background = '#e0e7ff';
            if(mem) el.style.fontSize = '1.1rem';
            if(!window.GameState.first) {
                window.GameState.first = { idx, id };
            } else {
                let f = window.GameState.first;
                if(f.idx === idx) return;
                if(f.id === id) {
                    window.upScore(20);
                    setTimeout(() => { 
                        el.style.opacity = '0'; 
                        document.getElementById(`c-${f.idx}`).style.opacity = '0'; 
                        if(document.querySelectorAll('.g-card[style*="opacity: 0"]').length === 16) window.runLogic(gameId, words);
                    }, 300);
                } else {
                    setTimeout(() => { 
                        el.style.background = '#f1f5f9'; if(mem) el.style.fontSize = '0';
                        document.getElementById(`c-${f.idx}`).style.background = '#f1f5f9'; if(mem) document.getElementById(`c-${f.idx}`).style.fontSize = '0';
                    }, 500);
                }
                window.GameState.first = null;
            }
        };
    }

    // 2. 选择类 (speed, quiz, balloon, fishing, basket)
    else if(['speed', 'quiz', 'balloon', 'fishing', 'basket'].includes(gameId)) {
        let qIdx = 0;
        window.nextQ = () => {
            let target = pool[qIdx % pool.length];
            let opts = [target, ...words.filter(w=>w.id!==target.id).sort(()=>0.5-Math.random()).slice(0, 3)].sort(()=>0.5-Math.random());
            if(gameId==='speed' && typeof speak==='function') speak(target.word);
            stage.innerHTML = `
                <div style="text-align:center; padding-top:60px;">
                    <div style="font-size:1.2rem; color:#94a3b8; margin-bottom:10px;">TARGET</div>
                    <div style="font-size:4rem; font-weight:900; color:#1e1b4b; margin-bottom:50px;">${target.word}</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; padding:0 40px;">
                        ${opts.map(o => `<button class="btn" style="padding:25px; font-size:1.3rem; background:white; border:2px solid #e2e8f0; color:#1e1b4b;" onclick="window.ans(${o.id===target.id})">${o.cn}</button>`).join('')}
                    </div>
                </div>`;
        };
        window.ans = (correct) => {
            if(correct) { window.upScore(10); stage.style.background = '#f0fdf4'; }
            else { stage.style.background = '#fef2f2'; }
            setTimeout(() => { stage.style.background = 'white'; qIdx++; window.nextQ(); }, 300);
        };
        window.nextQ();
    }

    // 3. 动作点击类 (whack, falling, jump, shoot, box)
    else if(['whack', 'falling', 'jump', 'shoot', 'box'].includes(gameId)) {
        stage.innerHTML = `<div id="act-area" style="height:100%; position:relative; background:#f8fafc; cursor:crosshair;"></div>`;
        const area = document.getElementById('act-area');
        window.actTimer = setInterval(() => {
            let w = pool[Math.floor(Math.random()*pool.length)];
            let div = document.createElement('div');
            div.innerHTML = w.word;
            div.style.cssText = `position:absolute; left:${Math.random()*80+5}%; top:-50px; padding:15px 25px; background:white; border:2px solid #4f46e5; border-radius:50px; font-weight:bold; color:#4f46e5; cursor:pointer; transition: top 4s linear; box-shadow:0 4px 12px rgba(79,70,229,0.2);`;
            area.appendChild(div);
            setTimeout(() => div.style.top = '650px', 50);
            div.onclick = () => { window.upScore(15); div.innerHTML = '💥 '+w.cn; div.style.background = '#4f46e5'; div.style.color='white'; setTimeout(()=>div.remove(), 200); };
            setTimeout(() => div.remove(), 4100);
        }, 1200);
    }

    // 4. 其它 10 款正在“装修”中的趣味模式 (保持架构统一)
    else {
        stage.innerHTML = `
            <div style="text-align:center; padding-top:150px;">
                <div style="font-size:4rem; margin-bottom:20px;">🏗️</div>
                <h2 style="color:#1e1b4b;">${window.getGameTitle(gameId)} 施工中</h2>
                <p style="color:#64748b;">该模式已接入计时计分引擎，正在绘制专属皮肤...</p>
                <button class="btn" style="margin-top:20px; padding:10px 30px; background:#4f46e5; color:white; border:none; border-radius:10px;" onclick="window.upScore(50)">假装闯关成功 (+50分)</button>
            </div>`;
    }
};

// 注入动画样式
const style = document.createElement('style');
style.innerHTML = `
    @keyframes popup { from { transform:scale(0.8); opacity:0; } to { transform:scale(1); opacity:1; } }
    .btn:active { transform:scale(0.95); }
    .g-card:hover { border-color:#4f46e5; transform:translateY(-2px); }
`;
document.head.appendChild(style);
