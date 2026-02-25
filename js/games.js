/* =========================================================================
   EnglishHub Pro - 终极游戏引擎模块 (js/games.js)
   负责：20款游戏 (4款对战PK + 16款单机) 的生成、交互、计分与结算大屏
   依赖：main.js (需在其之后加载，以便调用 saveUserData, currentUser 等)
   ========================================================================= */

let score = 0;
let gameTimers = [];      
let selectedCards = [];   
let flippedCards = [];

function clearGameTimers() { 
    for(let i=0; i<gameTimers.length; i++) { clearInterval(gameTimers[i]); } 
    gameTimers = []; 
}

function exitGame() { 
    clearGameTimers(); 
    if(score > 0 && currentUser) { 
        let gTitleEl = document.getElementById('g-title'); 
        let gTitle = gTitleEl ? gTitleEl.innerText.split('(')[0].trim() : 'Game'; 
        gameHistory.unshift({ date: new Date().toLocaleString(), game: gTitle, score: score }); 
        if(gameHistory.length > 50) gameHistory.pop(); 
        saveUserData(); 
    }
    showPage('games'); 
}

function updateScore() { 
    let scoreEl = document.getElementById('g-score'); 
    if(scoreEl) scoreEl.innerText = "Score: " + score; 
}

function populateLibSource() {
    syncDataLive(); 
    const sel = document.getElementById('sel-lib-source'); if(!sel) return;
    let htmlStr = `<option value="all" style="font-weight:bold;">📚 混合模式：所有系统词库</option>`; 
    let nbCount = (notebook && notebook.length) ? notebook.length : 0; 
    htmlStr += `<option value="nb" style="font-weight:bold;">🧡 我的生词本 (全 ${nbCount} 词)</option>`;
    if (bookshelf && Array.isArray(bookshelf)) {
        for(let i=0; i<bookshelf.length; i++) {
            let b = bookshelf[i]; let bsCount = (b && b.words) ? b.words.length : 0; 
            htmlStr += `<option value="bs-${i}-all" style="font-weight:bold; color:var(--primary);">📘 单词书：${b.name} ${b.vol} (全 ${bsCount} 词)</option>`;
        }
    }
    sel.innerHTML = htmlStr;
}

function openGameSetup(type, title) {
    if(!requireAuth()) return;
    currentGameType = type; 
    let titleEl = document.getElementById('setup-g-title'); if(titleEl) titleEl.innerText = title;
    populateLibSource(); setGameMode('lib'); openModal('modal-game-setup');
}

function setGameMode(mode) {
    currentGameMode = mode; 
    let btnLib = document.getElementById('btn-mode-lib'); let btnCus = document.getElementById('btn-mode-custom'); 
    let areaLib = document.getElementById('setup-lib-area'); let areaCus = document.getElementById('setup-custom-area');
    if(mode === 'lib') { if(btnLib) btnLib.className = 'btn'; if(btnCus) btnCus.className = 'btn btn-outline'; if(areaCus) areaCus.classList.add('hidden'); if(areaLib) areaLib.classList.remove('hidden'); } 
    else { if(btnLib) btnLib.className = 'btn btn-outline'; if(btnCus) btnCus.className = 'btn'; if(areaCus) areaCus.classList.remove('hidden'); if(areaLib) areaLib.classList.add('hidden'); }
}

async function startGameExec() {
    try {
        if(currentGameMode === 'lib') {
            const selEl = document.getElementById('sel-lib-source'); if(!selEl) return;
            const sourceVal = selEl.value; let selectedWords = [];
            if (sourceVal === 'all') {
                if(notebook) selectedWords = selectedWords.concat(notebook);
                if(bookshelf && Array.isArray(bookshelf)) { for(let i=0; i<bookshelf.length; i++) { if(bookshelf[i] && bookshelf[i].words) selectedWords = selectedWords.concat(bookshelf[i].words); } }
            } else if (sourceVal === 'nb') {
                if(notebook) selectedWords = selectedWords.concat(notebook);
            } else if (sourceVal.startsWith('bs-')) {
                const parts = sourceVal.split('-'); const bIdx = parseInt(parts[1]);
                if (bookshelf[bIdx] && bookshelf[bIdx].words) { selectedWords = selectedWords.concat(bookshelf[bIdx].words); }
            }
            let uniqueMap = new Map();
            for(let i=0; i<selectedWords.length; i++) { let w = selectedWords[i]; if(w && w.word) uniqueMap.set(w.word.toLowerCase(), w); }
            let finalWords = Array.from(uniqueMap.values());
            if(finalWords.length < 5) { finalWords = finalWords.concat(defaultNotebook.slice(0, 5 - finalWords.length)); }
            closeModals(); initGame(currentGameType, finalWords);
        } else {
            const rawInput = document.getElementById('in-custom-words').value; 
            let items = rawInput.split(/[\n,，;；]+/).map(i => i.trim()).filter(i => i);
            if(items.length < 5) { alert("请至少输入 5 个单词！"); return; }
            closeModals(); document.getElementById('api-loading').style.display = 'flex'; 
            let customWords = [];
            for(let i=0; i<items.length; i++) {
                let parts = items[i].split(/=| - |:/); let w = parts[0].trim(); if(!w) continue;
                let cn = parts.length > 1 ? parts.slice(1).join(' ').trim() : '自定义释义';
                customWords.push({ word: w, cn: cn, en: '', id: Date.now() + Math.random() });
            }
            document.getElementById('api-loading').style.display = 'none'; document.getElementById('in-custom-words').value = '';
            initGame(currentGameType, customWords);
        }
    } catch(err) { document.getElementById('api-loading').style.display = 'none'; alert("异常：" + err.message); }
}

function showGameOver() {
    clearGameTimers();
    const stage = document.getElementById('g-content');
    stage.innerHTML = `
        <div style="text-align: center; padding: 40px; animation: pop 0.5s ease-out; background: var(--white); border-radius: 30px; border: 2px solid var(--border); box-shadow: var(--shadow);">
            <div style="font-size: 6rem; margin-bottom: 20px;">🎖️</div>
            <h2 style="font-size: 2.8rem; color: var(--text); margin-bottom: 10px;">练习完成</h2>
            <div style="background: var(--primary-light); display: inline-block; padding: 20px 50px; border-radius: 20px; margin-bottom: 40px; border: 2px solid #c7d2fe;">
                <div style="font-size: 1.2rem; color: var(--text); font-weight:bold; margin-bottom: 5px;">最终得分</div>
                <div style="font-size: 3.5rem; color: var(--primary); font-weight: 900;">${score}</div>
            </div>
            <br>
            <button class="btn btn-outline" style="margin-right: 15px;" onclick="showPage('games')">返回大厅</button>
            <button class="btn" onclick="replayGame()">🔄 再来一局</button>
        </div>
    `;
}

function showPKGameOver(rScore, bScore, msg) {
    clearGameTimers();
    let winnerText = "";
    if(rScore > bScore) winnerText = "🔴 红队获胜！";
    else if(bScore > rScore) winnerText = "🔵 蓝队获胜！";
    else winnerText = "🤝 握手言和！平局！";

    const stage = document.getElementById('g-content');
    stage.innerHTML = `
        <div style="text-align: center; padding: 40px; animation: pop 0.5s ease-out; width: 100%; max-width: 800px; margin: 0 auto;">
            <div style="font-size: 5rem; margin-bottom: 20px;">🏁</div>
            <h2 style="font-size: 3rem; color: var(--text); margin-bottom: 10px;">${winnerText}</h2>
            <p style="color: var(--text-light); font-size: 1.2rem; margin-bottom: 30px;">${msg}</p>
            <div style="display: flex; justify-content: center; gap: 30px; margin-bottom: 40px;">
                <div style="background: #fef2f2; padding: 20px 40px; border-radius: 20px; border: 2px solid #fca5a5; flex: 1;">
                    <div style="font-size: 1.2rem; color: #ef4444; font-weight:bold;">🔴 红队得分</div>
                    <div style="font-size: 4rem; color: #ef4444; font-weight: 900;">${rScore}</div>
                </div>
                <div style="background: #eff6ff; padding: 20px 40px; border-radius: 20px; border: 2px solid #93c5fd; flex: 1;">
                    <div style="font-size: 1.2rem; color: #3b82f6; font-weight:bold;">🔵 蓝队得分</div>
                    <div style="font-size: 4rem; color: #3b82f6; font-weight: 900;">${bScore}</div>
                </div>
            </div>
            <button class="btn btn-outline" style="margin-right: 15px;" onclick="showPage('games')">返回大厅</button>
            <button class="btn" onclick="replayGame()">🔄 再战一局</button>
        </div>
    `;
}

function replayGame() { 
    initGame(currentGameType, window.GameState.originalWords); 
}

// =========================================================================
// 核心路由: initGame
// =========================================================================
function initGame(type, sourceWords) {
    clearGameTimers(); showPage('stage'); score = 0; updateScore();
    const stage = document.getElementById('g-content'); if(!stage) return; stage.innerHTML = ''; 
    let gameWords = [...sourceWords].sort(() => 0.5 - Math.random());
    window.GameState.words = gameWords; window.GameState.originalWords = sourceWords; 

    const renderPKScoreBoard = (rScore, bScore, extraHtml = '') => {
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; max-width:800px; margin-bottom:20px; background:var(--white); padding:15px 30px; border-radius:20px; border: 2px solid var(--border); box-shadow:0 4px 6px rgba(0,0,0,0.05);">
                <div style="font-size:1.8rem; font-weight:900; color:#ef4444;">🔴 红队: <span>${rScore}</span></div>
                ${extraHtml}
                <div style="font-size:1.8rem; font-weight:900; color:#3b82f6;">🔵 蓝队: <span>${bScore}</span></div>
            </div>`;
    };

    // -------------------------------------------------------------
    // 4 款对战 PK 游戏
    // -------------------------------------------------------------
    if(type === 'pk_horse') {
        document.getElementById('g-title').innerText = "🐎 赛马冲刺 (接力)";
        window.GameState.redScore = 0; window.GameState.blueScore = 0; window.GameState.turn = 'red'; window.GameState.timeLeft = 30; window.GameState.horseQueue = [...gameWords, ...gameWords];
        window.renderHorseTurn = () => {
            if(window.GameState.timeLeft <= 0) {
                clearInterval(window.horseTimer); window.horseTimer = null;
                if(window.GameState.turn === 'red') { alert("⏱️ 红队时间到！轮到蓝队！"); window.GameState.turn = 'blue'; window.GameState.timeLeft = 30; window.renderHorseTurn(); return; } 
                else { return showPKGameOver(window.GameState.redScore, window.GameState.blueScore, "比赛结束！"); }
            }
            const target = window.GameState.horseQueue.pop(); if(!target) return showPKGameOver(window.GameState.redScore, window.GameState.blueScore, "词库已耗尽！");
            window.GameState.horseTarget = target; let wrongs = window.GameState.words.filter(w => w.id !== target.id).sort(()=>0.5-Math.random()).slice(0, 3); let options = [target, ...wrongs].sort(()=>0.5-Math.random());
            let curColor = window.GameState.turn === 'red' ? '#ef4444' : '#3b82f6'; let curName = window.GameState.turn === 'red' ? '🔴 红队' : '🔵 蓝队';
            stage.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center;">
                ${renderPKScoreBoard(window.GameState.redScore, window.GameState.blueScore)}
                <div style="width:100%; max-width:800px; text-align:center;">
                    <div style="font-size: 2rem; color: ${curColor}; font-weight: 900; margin-bottom: 10px;">现在是 ${curName} 的回合！</div>
                    <div style="font-size: 3rem; margin-bottom: 20px;">⏱️ <span id="horse-timer" style="color:var(--accent);">${window.GameState.timeLeft}</span> 秒</div>
                    <h2 style="font-size:3.5rem; margin-bottom:30px; color:var(--text);">${target.word}</h2>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">${options.map(o => `<button class="quiz-option" style="padding:20px; font-size:1.3rem;" onclick="horseAnswer('${o.id}')">${o.cn}</button>`).join('')}</div>
                </div></div>`;
            speak(target.word);
            if(!window.horseTimer) {
                window.horseTimer = setInterval(() => { window.GameState.timeLeft--; let tEl = document.getElementById('horse-timer'); if(tEl) tEl.innerText = window.GameState.timeLeft; if(window.GameState.timeLeft <= 0) window.renderHorseTurn(); }, 1000);
                gameTimers.push(window.horseTimer);
            }
        };
        window.horseAnswer = (id) => {
            if(String(id) === String(window.GameState.horseTarget.id)) { window.GameState.turn === 'red' ? window.GameState.redScore += 10 : window.GameState.blueScore += 10; } 
            else { window.GameState.turn === 'red' ? window.GameState.redScore -= 5 : window.GameState.blueScore -= 5; }
            window.renderHorseTurn();
        }; window.renderHorseTurn();
    }
    else if(type === 'pk_tug') {
        document.getElementById('g-title').innerText = "⚔️ 单词拔河";
        window.GameState.pkQueue = [...gameWords]; window.GameState.redScore = 0; window.GameState.blueScore = 0; window.GameState.pkPos = 50; 
        window.nextPKTug = () => {
            if(window.GameState.pkPos <= 10) return showPKGameOver(window.GameState.redScore, window.GameState.blueScore, "力量压制！蓝队获胜！");
            if(window.GameState.pkPos >= 90) return showPKGameOver(window.GameState.redScore, window.GameState.blueScore, "力量压制！红队获胜！");
            if(window.GameState.pkQueue.length === 0) return showPKGameOver(window.GameState.redScore, window.GameState.blueScore, "体力耗尽！");
            const target = window.GameState.pkQueue.pop(); window.GameState.pkTarget = target;
            let wrongs = window.GameState.words.filter(w => w.id !== target.id).sort(()=>0.5-Math.random()).slice(0, 3); window.GameState.pkOptions = [target, ...wrongs].sort(()=>0.5-Math.random());
            stage.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center;">
                ${renderPKScoreBoard(window.GameState.redScore, window.GameState.blueScore)}
                <div style="width:100%; max-width:800px; text-align:center;">
                    <div style="width:100%; height:40px; background:#e2e8f0; border-radius:20px; position:relative; overflow:hidden; margin-bottom:40px; border: 3px solid #cbd5e1;">
                        <div style="position:absolute; left:0; top:0; bottom:0; background:rgba(239, 68, 68, 0.2); width:50%;"></div><div style="position:absolute; right:0; top:0; bottom:0; background:rgba(59, 130, 246, 0.2); width:50%;"></div>
                        <div style="position:absolute; left:${window.GameState.pkPos}%; top:-10px; width:6px; height:60px; background:var(--text); transition: left 0.3s; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>
                    </div>
                    <h2 style="font-size:4rem; margin-bottom: 20px;">${target.word}</h2>
                    <div style="display:flex; justify-content:space-between; gap:20px;">
                        <button class="btn" style="background:#ef4444; flex:1; padding:30px; font-size:1.5rem;" onclick="pkTugBuzz('red')">🔴 红队抢答</button>
                        <button class="btn" style="background:#3b82f6; flex:1; padding:30px; font-size:1.5rem;" onclick="pkTugBuzz('blue')">🔵 蓝队抢答</button>
                    </div>
                    <div id="pk-tug-opts" class="hidden" style="margin-top:30px; display:grid; grid-template-columns:1fr 1fr; gap:15px;"></div>
                </div></div>`; speak(target.word);
        };
        window.pkTugBuzz = (team) => {
            let optsHtml = window.GameState.pkOptions.map(o => `<button class="quiz-option" style="padding: 20px; font-size:1.3rem;" onclick="pkTugAnswer('${team}', '${o.id}')">${o.cn}</button>`).join('');
            const optArea = document.getElementById('pk-tug-opts'); optArea.innerHTML = `<h3 style="grid-column: 1/-1; color: ${team==='red'?'#ef4444':'#3b82f6'};">请 ${team==='red'?'红队':'蓝队'} 选择：</h3>` + optsHtml; optArea.classList.remove('hidden');
        };
        window.pkTugAnswer = (team, id) => {
            if(String(id) === String(window.GameState.pkTarget.id)) { if(team === 'red') { window.GameState.pkPos += 15; window.GameState.redScore += 10; } else { window.GameState.pkPos -= 15; window.GameState.blueScore += 10; } } 
            else { if(team === 'red') { window.GameState.pkPos -= 10; window.GameState.redScore -= 5; } else { window.GameState.pkPos += 10; window.GameState.blueScore -= 5; } }
            window.nextPKTug();
        }; window.nextPKTug();
    }
    else if(type === 'pk_territory') {
        document.getElementById('g-title').innerText = "🗺️ 阵地抢夺";
        window.GameState.terQueue = [...gameWords]; window.GameState.redScore = 0; window.GameState.blueScore = 0; window.GameState.grid = [0,0,0, 0,0,0, 0,0,0]; window.GameState.terTurn = 'red';
        window.checkTerWin = () => { let g = window.GameState.grid; let lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; for(let l of lines) { if(g[l[0]]!==0 && g[l[0]]===g[l[1]] && g[l[1]]===g[l[2]]) return g[l[0]]===1 ? 'red' : 'blue'; } if(!g.includes(0)) return 'draw'; return null; };
        window.renderTer = () => {
            let win = window.checkTerWin();
            if(win === 'red') return showPKGameOver(window.GameState.redScore, window.GameState.blueScore, "🔴 红队连成一线！");
            if(win === 'blue') return showPKGameOver(window.GameState.redScore, window.GameState.blueScore, "🔵 蓝队连成一线！");
            if(win === 'draw') return showPKGameOver(window.GameState.redScore, window.GameState.blueScore, "阵地已满，势均力敌！");
            if(window.GameState.terQueue.length === 0) return showPKGameOver(window.GameState.redScore, window.GameState.blueScore, "单词耗尽！");
            const target = window.GameState.terQueue.pop(); window.GameState.terTarget = target;
            let wrongs = window.GameState.words.filter(w => w.id !== target.id).sort(()=>0.5-Math.random()).slice(0, 3); window.GameState.terOptions = [target, ...wrongs].sort(()=>0.5-Math.random());
            let gridHtml = window.GameState.grid.map((cell, idx) => { let color = cell===1 ? '#ef4444' : cell===2 ? '#3b82f6' : '#e2e8f0'; let cursor = cell===0 ? 'pointer' : 'not-allowed'; return `<div onclick="terPickGrid(${idx})" style="background:${color}; border-radius:10px; height:80px; display:flex; align-items:center; justify-content:center; color:white; font-size:2rem; font-weight:bold; cursor:${cursor};">${cell===1?'🔴':cell===2?'🔵':''}</div>`; }).join('');
            let turnText = window.GameState.terTurn === 'red' ? "<span style='color:#ef4444;'>🔴 红队回合</span>" : "<span style='color:#3b82f6;'>🔵 蓝队回合</span>";
            stage.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center;">
                ${renderPKScoreBoard(window.GameState.redScore, window.GameState.blueScore, `<div style="font-size:1.2rem;">当前: ${turnText}</div>`)}
                <div style="display:flex; gap:40px; width:100%; max-width:800px; align-items:flex-start;">
                    <div style="flex:1; display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; background:var(--white); padding:20px; border-radius:20px; border:2px solid var(--border);">${gridHtml}</div>
                    <div style="flex:1; text-align:center;"><h3 style="color:var(--text-light);">请 ${turnText} 选择要占领的空格：</h3><div id="ter-question-area" class="hidden"><h2 style="font-size:3rem; margin-bottom: 20px;">${target.word}</h2><div id="ter-opts" style="display:flex; flex-direction:column; gap:10px;"></div></div></div>
                </div></div>`; speak(target.word);
        };
        window.terPickGrid = (idx) => {
            if(window.GameState.grid[idx] !== 0) return; window.GameState.terPendingGrid = idx;
            let optsHtml = window.GameState.terOptions.map(o => `<button class="quiz-option" onclick="terAnswer('${o.id}')">${o.cn}</button>`).join('');
            document.getElementById('ter-opts').innerHTML = optsHtml; document.getElementById('ter-question-area').classList.remove('hidden');
        };
        window.terAnswer = (id) => {
            let team = window.GameState.terTurn;
            if(String(id) === String(window.GameState.terTarget.id)) { window.GameState.grid[window.GameState.terPendingGrid] = team === 'red' ? 1 : 2; team === 'red' ? window.GameState.redScore += 10 : window.GameState.blueScore += 10; } 
            else { alert("❌ 答错啦，失去机会！"); team === 'red' ? window.GameState.redScore -= 5 : window.GameState.blueScore -= 5; }
            window.GameState.terTurn = window.GameState.terTurn === 'red' ? 'blue' : 'red'; window.renderTer();
        }; window.renderTer();
    }
    else if(type === 'pk_bomb') {
        document.getElementById('g-title').innerText = "💣 炸弹传花";
        window.GameState.bombQueue = [...gameWords]; window.GameState.bombTime = 15; window.GameState.bombHolder = 'red'; window.GameState.redScore = 100; window.GameState.blueScore = 100;
        window.renderBomb = () => {
            if(window.GameState.bombQueue.length === 0) return showPKGameOver(window.GameState.redScore, window.GameState.blueScore, "平局！炸弹成了哑炮。");
            const target = window.GameState.bombQueue.pop(); window.GameState.bombTarget = target;
            let wrongs = gameWords.filter(w => w.id !== target.id).sort(()=>0.5-Math.random()).slice(0, 3); let options = [target, ...wrongs].sort(()=>0.5-Math.random());
            let holderColor = window.GameState.bombHolder === 'red' ? '#ef4444' : '#3b82f6'; let holderName = window.GameState.bombHolder === 'red' ? '🔴 红队' : '🔵 蓝队';
            stage.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center;">
                ${renderPKScoreBoard("生命:"+window.GameState.redScore, "生命:"+window.GameState.blueScore)}
                <div style="text-align:center; width:100%; max-width:600px;">
                    <div style="font-size: 5rem; animation: pulse-btn ${window.GameState.bombTime/10}s infinite;">💣</div>
                    <h2 style="font-size:3rem; color:var(--text); margin:20px 0;">倒计时: <span id="bomb-timer" style="color:var(--accent);">${window.GameState.bombTime}</span>s</h2>
                    <h3 style="color:${holderColor}; font-size:1.5rem;">炸弹在 ${holderName} 手中！快答对传给对方！</h3>
                    <h2 style="font-size: 2.5rem; margin: 30px 0;">${target.word}</h2>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">${options.map(o => `<button class="quiz-option" onclick="bombAnswer('${o.id}')">${o.cn}</button>`).join('')}</div>
                </div></div>`; speak(target.word);
            if(!window.bombInterval) {
                window.bombInterval = setInterval(() => {
                    window.GameState.bombTime--; let tEl = document.getElementById('bomb-timer'); if(tEl) tEl.innerText = window.GameState.bombTime;
                    if(window.GameState.bombTime <= 0) {
                        clearInterval(window.bombInterval); window.bombInterval = null;
                        if(window.GameState.bombHolder === 'red') { window.GameState.redScore -= 20; } else { window.GameState.blueScore -= 20; }
                        let winner = window.GameState.bombHolder === 'red' ? '🔵 蓝队' : '🔴 红队';
                        showPKGameOver(window.GameState.redScore, window.GameState.blueScore, `💥 炸弹爆炸！${winner} 获胜！`);
                    }
                }, 1000); gameTimers.push(window.bombInterval);
            }
        };
        window.bombAnswer = (id) => {
            if(String(id) === String(window.GameState.bombTarget.id)) { window.GameState.bombHolder = window.GameState.bombHolder === 'red' ? 'blue' : 'red'; window.GameState.bombTime += 3; if(window.GameState.bombTime > 15) window.GameState.bombTime = 15; } 
            else { window.GameState.bombTime -= 3; alert("❌ 答错加速燃烧！"); }
            window.renderBomb();
        }; window.renderBomb();
    }

    // -------------------------------------------------------------
    // 16 款单机闯关游戏
    // -------------------------------------------------------------
    else if(type === 'match') {
        document.getElementById('g-title').innerText = "🧩 连连看"; window.GameState.matchQueue = [...gameWords];
        window.nextMatchBatch = () => {
            if (window.GameState.matchQueue.length === 0) return showGameOver();
            let batch = window.GameState.matchQueue.splice(0, 6); window.GameState.matchBatchTarget = batch.length; window.GameState.matchBatchCurrent = 0;
            let cards = []; batch.forEach(w => { cards.push({id: w.id, val: w.word, type: 'en'}); cards.push({id: w.id, val: w.cn, type: 'cn'}); }); cards.sort(() => 0.5 - Math.random());
            let htmlStr = `<div style="text-align:right; width:100%; margin-bottom:10px; font-weight:bold;">剩余排队: ${window.GameState.matchQueue.length}</div><div class="match-grid">`;
            cards.forEach(c => { htmlStr += `<div class="match-card" data-id="${c.id}" data-type="${c.type}" onclick="handleMatch(this)">${c.val}</div>`; }); htmlStr += '</div>'; stage.innerHTML = htmlStr;
        }; window.nextMatchBatch();
    }
    else if(type === 'memory') {
        document.getElementById('g-title').innerText = "🎴 翻牌记忆"; window.GameState.memoryQueue = [...gameWords];
        window.nextMemoryBatch = () => {
            if(window.GameState.memoryQueue.length === 0) return showGameOver();
            let batch = window.GameState.memoryQueue.splice(0, 4); window.GameState.memoryBatchTarget = batch.length; window.GameState.memoryBatchCurrent = 0;
            let cards = []; batch.forEach(w => { cards.push({id: w.id, val: w.word, type: 'en'}); cards.push({id: w.id, val: w.cn, type: 'cn'}); }); cards.sort(() => 0.5 - Math.random());
            let htmlStr = `<div style="text-align:right; width:100%; margin-bottom:10px; font-weight:bold;">剩余排队: ${window.GameState.memoryQueue.length}</div><div class="match-grid">`;
            cards.forEach(c => { htmlStr += `<div class="memory-card" data-id="${c.id}" onclick="handleMemory(this)"><div class="memory-inner"><div class="memory-front">?</div><div class="memory-back">${c.val}</div></div></div>`; }); htmlStr += '</div>'; stage.innerHTML = htmlStr;
        }; window.nextMemoryBatch();
    }
    else if(type === 'flash') {
        document.getElementById('g-title').innerText = "🃏 闪卡"; window.GameState.curFlash = 0; window.GameState.flashWords = [...gameWords];
        window.drawFlash = () => {
            if(window.GameState.curFlash >= window.GameState.flashWords.length) return showGameOver();
            let cur = window.GameState.curFlash; const w = window.GameState.flashWords[cur];
            stage.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center;"><div class="memory-card" style="width:300px; height:400px;" onclick="this.classList.toggle('flipped'); speak('${w.word}')"><div class="memory-inner"><div class="memory-front" style="font-size:2.5rem; background:white; color:var(--primary); border:2px solid var(--primary);">${w.word}</div><div class="memory-back" style="flex-direction:column; background:var(--primary); color:white;"><h3 style="margin:0; font-size:2rem;">${w.cn}</h3><p style="font-size:1.1rem; opacity:0.8; padding:0 20px;">${w.en}</p></div></div></div><div style="margin-top:30px; display:flex; align-items:center; justify-content:center; gap:20px;"><span style="color:var(--text-light); font-weight:bold;">${cur+1} / ${window.GameState.flashWords.length}</span><button class="btn" onclick="score+=5; updateScore(); window.GameState.curFlash++; window.drawFlash()">下一个 Next</button></div></div>`;
        }; window.drawFlash();
    }
    else if(type === 'speed') {
        document.getElementById('g-title').innerText = "⚡ 极速闪读"; window.GameState.speedQueue = [...gameWords];
        window.nextSpeed = () => {
            if(window.GameState.speedQueue.length === 0) return showGameOver();
            const target = window.GameState.speedQueue.pop(); let wrongs = gameWords.filter(w => w.id !== target.id).sort(()=>0.5-Math.random()).slice(0,3); let options = [target, ...wrongs].sort(()=>0.5-Math.random());
            let optHtml = options.map(o => `<button class="quiz-option" onclick="if('${o.id}'==='${target.id}'){score+=15;updateScore();window.nextSpeed();}else{alert('❌ 错了');}">${o.cn}</button>`).join('');
            stage.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; width:100%;"><div style="text-align:right; width:100%; max-width:500px; color:var(--text-light); font-weight:bold; margin-bottom:10px;">剩余单词: ${window.GameState.speedQueue.length}</div><div id="speed-word" style="font-size:4rem; font-weight:900; color:var(--primary); margin-bottom:50px;">${target.word}</div><div id="speed-opts" class="hidden" style="width:100%; max-width:500px;">${optHtml}</div></div>`;
            speak(target.word); setTimeout(() => { let wEl = document.getElementById('speed-word'); let oEl = document.getElementById('speed-opts'); if(wEl) wEl.classList.add('hidden'); if(oEl) oEl.classList.remove('hidden'); }, 800);
        }; window.nextSpeed();
    }
    else if(type === 'anagram') {
        document.getElementById('g-title').innerText = "🔀 字母重排"; window.GameState.anaQueue = [...gameWords];
        window.nextAnagram = () => {
            if(window.GameState.anaQueue.length === 0) return showGameOver();
            const target = window.GameState.anaQueue.pop(); window.GameState.anagramTarget = target.word; window.GameState.anagramGuess = "";
            let letters = target.word.split('').sort(() => 0.5 - Math.random()); let tilesHtml = '';
            for(let i=0; i<letters.length; i++) { let l = letters[i]; tilesHtml += `<div class="key-btn" onclick="handleAnagramClick(this, '${l}')">${l}</div>`; }
            stage.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center;"><h2 style="font-size: 2rem; color: var(--text-light);">${target.cn}</h2><div id="ana-guess" style="height: 60px; font-size: 2.5rem; font-weight: 900; color: var(--primary); margin: 20px 0; border-bottom: 3px solid var(--border); min-width: 200px; text-align: center;"></div><div class="keyboard" id="ana-tiles">${tilesHtml}</div><div style="margin-top: 30px;"><button class="btn btn-outline" onclick="window.nextAnagram()">跳过 Skip</button></div></div>`;
        };
        window.handleAnagramClick = (el, letter) => {
            window.GameState.anagramGuess += letter; document.getElementById('ana-guess').innerText = window.GameState.anagramGuess; el.style.visibility = 'hidden'; let guess = window.GameState.anagramGuess; let target = window.GameState.anagramTarget;
            if(guess.length === target.length) { if(guess.toLowerCase() === target.toLowerCase()) { score += 15; updateScore(); setTimeout(window.nextAnagram, 500); } else { alert('拼错了，重试！'); window.GameState.anagramGuess = ''; document.getElementById('ana-guess').innerText = ''; let tiles = document.getElementById('ana-tiles').children; for(let i=0; i<tiles.length; i++) { tiles[i].style.visibility = 'visible'; } } }
        }; window.nextAnagram();
    }
    else if(type === 'hangman') {
        document.getElementById('g-title').innerText = "🔤 经典猜词"; const alphabet = "abcdefghijklmnopqrstuvwxyz".split(''); window.GameState.hmQueue = [...gameWords];
        window.nextHangman = () => { if(window.GameState.hmQueue.length === 0) return showGameOver(); const targetObj = window.GameState.hmQueue.pop(); window.GameState.hmTarget = targetObj.word.toLowerCase(); window.GameState.hmGuessed = []; window.GameState.hmMistakes = 0; window.renderHangmanBoard(); };
        window.renderHangmanBoard = () => {
            let target = window.GameState.hmTarget; let guessed = window.GameState.hmGuessed; let mistakes = window.GameState.hmMistakes; let wordParts = []; let isWin = true;
            for(let i=0; i<target.length; i++) { let char = target[i]; if(guessed.includes(char)) { wordParts.push(char); } else { wordParts.push('_'); isWin = false; } }
            if(isWin) { score += 20; updateScore(); setTimeout(window.nextHangman, 800); return; } if(mistakes >= 6) { alert(`Game Over! 单词是: ${target}`); window.nextHangman(); return; }
            let keysHtml = ''; for(let i=0; i<alphabet.length; i++) { let a = alphabet[i]; let dis = guessed.includes(a) ? 'disabled' : ''; keysHtml += `<button class="key-btn ${dis}" onclick="handleHangmanKey('${a}')">${a.toUpperCase()}</button>`; }
            stage.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center;"><h3 style="color: var(--accent); font-size:1.5rem;">剩余生命: ${6 - mistakes} ❤️</h3><div style="font-size: 3rem; font-weight: 900; letter-spacing: 15px; margin: 40px 0;">${wordParts.join('')}</div><div class="keyboard" style="max-width:600px;">${keysHtml}</div></div>`;
        };
        window.handleHangmanKey = (l) => { window.GameState.hmGuessed.push(l); if(!window.GameState.hmTarget.includes(l)) { window.GameState.hmMistakes++; } window.renderHangmanBoard(); }; window.nextHangman();
    }
    else if(type === 'chain') {
        document.getElementById('g-title').innerText = "🔗 单词接龙"; window.GameState.chainLast = gameWords[0].word; window.GameState.chainTarget = gameWords.length; window.GameState.chainCurrent = 0;
        window.renderChain = () => {
            let last = window.GameState.chainLast; let reqChar = last.slice(-1).toUpperCase();
            stage.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; width:100%;"><h3 style="font-size:2.5rem; margin-bottom: 20px;">上个单词: <span style="color:var(--primary)">${last}</span></h3><p style="color: var(--text-light); margin-bottom: 20px;">请输入以 "${reqChar}" 开头的单词</p><input id="chain-in" style="font-size:1.5rem; text-align:center; width:100%; max-width:400px;"><button class="btn" style="display:block; margin:20px auto; width: 100%; max-width:400px;" onclick="checkChain()">提交</button><p>进度: ${window.GameState.chainCurrent} / ${window.GameState.chainTarget}</p></div>`;
        };
        window.checkChain = () => { let el = document.getElementById('chain-in'); if(!el) return; let input = el.value.toLowerCase().trim(); let last = window.GameState.chainLast.toLowerCase(); if(input.startsWith(last.slice(-1)) && input.length > 1) { window.GameState.chainLast = input; score += 5; updateScore(); window.GameState.chainCurrent++; if(window.GameState.chainCurrent >= window.GameState.chainTarget) return showGameOver(); window.renderChain(); } else { alert("❌ 首字母不匹配或太短！"); } }; window.renderChain();
    }
    else if(type === 'typing') {
        document.getElementById('g-title').innerText = "⌨️ 打字防守"; window.GameState.typeQueue = [...gameWords]; window.GameState.activeTypeWords = [];
        stage.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; width:100%;"><div id="type-area" style="position:relative; width:100%; height:400px; border-bottom:2px dashed var(--accent); overflow:hidden;"></div><input id="type-in" placeholder="快速输入落下的单词并回车..." style="font-size:1.5rem; text-align:center; margin-top:20px; width:100%; max-width:400px;" onkeyup="if(event.key==='Enter') window.checkType()"></div>`;
        window.spawnTypeWord = () => { if(window.GameState.typeQueue.length === 0) return; const w = window.GameState.typeQueue.pop(); const el = document.createElement('div'); el.className = 'type-word'; el.innerText = w.word; el.style.left = Math.random() * 80 + '%'; el.style.top = '-50px'; let area = document.getElementById('type-area'); if(area) { area.appendChild(el); window.GameState.activeTypeWords.push({el: el, word: w.word.toLowerCase(), top: -50}); } };
        window.checkType = () => { let inEl = document.getElementById('type-in'); if(!inEl) return; const val = inEl.value.toLowerCase().trim(); const idx = window.GameState.activeTypeWords.findIndex(a => a.word === val); if(idx > -1) { score += 10; updateScore(); window.GameState.activeTypeWords[idx].el.remove(); window.GameState.activeTypeWords.splice(idx,1); inEl.value = ''; } };
        gameTimers.push(setInterval(window.spawnTypeWord, 2500));
        gameTimers.push(setInterval(() => { if(window.GameState.typeQueue.length === 0 && window.GameState.activeTypeWords.length === 0) return showGameOver(); let arr = window.GameState.activeTypeWords; for(let i=0; i<arr.length; i++) { let a = arr[i]; a.top += 1.5; a.el.style.top = a.top + 'px'; if(a.top > 380) { alert('Game Over! 单词落地了: ' + a.word); exitGame(); return; } } }, 50));
    }
    else if(type === 'whack') {
        document.getElementById('g-title').innerText = "🔨 打地鼠"; window.GameState.moleQueue = [...gameWords]; let holesHtml = ''; for(let i=0; i<6; i++) { holesHtml += '<div class="hole"><div class="mole"></div></div>'; }
        stage.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center;"><div style="display:flex; justify-content:space-between; width:100%; max-width:500px; margin-bottom:20px; align-items:center;"><button class="btn" id="play-mole-btn" style="font-size:1.2rem;">🔊 播放发音找地鼠</button></div><div class="mole-grid">${holesHtml}</div></div>`;
        window.GameState.moleTarget = null;
        window.nextMole = () => { if(window.GameState.moleQueue.length === 0) return showGameOver(); let t = window.GameState.moleQueue.pop(); window.GameState.moleTarget = t; let btn = document.getElementById('play-mole-btn'); if(btn) btn.onclick = () => speak(t.word); speak(t.word); }; window.nextMole();
        gameTimers.push(setInterval(() => { if(!window.GameState.moleTarget) return; let moles = document.querySelectorAll('.mole'); if(moles.length === 0) return; const m = moles[Math.floor(Math.random() * 6)]; const isTarget = Math.random() > 0.5; const w = isTarget ? window.GameState.moleTarget : gameWords[Math.floor(Math.random() * gameWords.length)]; m.innerText = w.cn; m.classList.add('up'); m.onclick = () => { if(w.id === window.GameState.moleTarget.id) { score+=10; updateScore(); m.classList.remove('up'); m.onclick=null; window.nextMole(); } else { m.classList.remove('up'); m.onclick=null; } }; setTimeout(() => { m.classList.remove('up'); m.onclick=null; }, 1500); }, 1800));
    }
    else if(type === 'balloon') {
        document.getElementById('g-title').innerText = "🎈 气球爆破"; window.GameState.balloonQueue = [...gameWords];
        stage.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; width:100%;"><h2 id="balloon-target" style="z-index:10; background:rgba(255,255,255,0.9); padding:15px 40px; border-radius:30px; box-shadow:var(--shadow);"></h2><div id="balloon-area" class="balloon-area" style="position:relative; width:100%; height:400px; border-radius:20px; border:1px solid var(--border); overflow:hidden;"></div></div>`;
        window.GameState.balloonTarget = null;
        window.nextBalloonTarget = () => { if(window.GameState.balloonQueue.length === 0) return showGameOver(); let t = window.GameState.balloonQueue.pop(); window.GameState.balloonTarget = t; let el = document.getElementById('balloon-target'); if(el) el.innerText = "击破气球: " + t.cn; }; window.nextBalloonTarget();
        gameTimers.push(setInterval(() => { if(!window.GameState.balloonTarget) return; const isTarget = Math.random() > 0.5; const w = isTarget ? window.GameState.balloonTarget : gameWords[Math.floor(Math.random() * gameWords.length)]; const b = document.createElement('div'); b.className = 'balloon'; b.innerText = w.word; b.style.left = Math.random() * 80 + '%'; b.style.animationDuration = (Math.random() * 3 + 4) + 's'; b.onclick = () => { if(w.id === window.GameState.balloonTarget.id) { score += 15; updateScore(); b.remove(); window.nextBalloonTarget(); } else { b.style.background = 'red'; } }; let area = document.getElementById('balloon-area'); if(area) { area.appendChild(b); setTimeout(() => { if(b.parentNode) b.remove(); }, 7000); } }, 1500));
    }
    else if(type === 'wheel') {
        document.getElementById('g-title').innerText = "🎡 幸运转盘"; window.GameState.wheelQueue = [...gameWords];
        stage.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center;"><div id="wheel" class="wheel-display" style="font-size:3rem; font-weight:900; padding:40px; border-radius:50%; background:var(--primary-light); color:var(--primary); width:250px; height:250px; display:flex; align-items:center; justify-content:center; margin-bottom:30px; transition:transform 0.1s;">?</div><button class="btn" style="font-size:1.5rem; padding:15px 40px;" onclick="spinWheel()">Spin 旋转抽取</button><h2 id="wheel-res" style="margin-top:40px; font-size:2rem;"></h2></div>`;
        window.spinWheel = () => { if(window.GameState.wheelQueue.length === 0) return showGameOver(); const wheel = document.getElementById('wheel'); if(!wheel) return; let count = 0; let interval = setInterval(() => { wheel.innerText = gameWords[Math.floor(Math.random() * gameWords.length)].word; wheel.style.transform = `scale(${1 + Math.random()*0.2})`; if(++count > 20) { clearInterval(interval); wheel.style.transform = 'scale(1)'; wheel.style.background = 'var(--primary)'; wheel.style.color = 'white'; const res = window.GameState.wheelQueue.pop(); wheel.innerText = res.word; let resEl = document.getElementById('wheel-res'); if(resEl && res) { resEl.innerText = res.cn; speak(res.word); score += 5; updateScore(); } if(window.GameState.wheelQueue.length === 0) setTimeout(showGameOver, 2000); } }, 100); };
    }
    else if(type === 'box') {
        document.getElementById('g-title').innerText = "🎁 盲盒挑战"; window.GameState.boxQueue = [...gameWords];
        window.nextBoxBatch = () => {
            if(window.GameState.boxQueue.length === 0) return showGameOver();
            let batch = window.GameState.boxQueue.splice(0, 6); window.GameState.boxBatchTarget = batch.length; window.GameState.boxBatchCurrent = 0; window.GameState.boxBatchWords = batch;
            let boxesHtml = batch.map((w, i) => `<div class="blind-box" data-idx="${i}" onclick="openBox(this)">${i+1}</div>`).join('');
            stage.innerHTML = `<div style="display:flex; justify-content:center;"><div class="box-grid">${boxesHtml}</div></div>`;
        };
        window.openBox = (el) => { if(el.classList.contains('opened')) return; let idx = parseInt(el.dataset.idx); const w = window.GameState.boxBatchWords[idx]; el.classList.add('opened'); el.innerHTML = `<div style="font-size:1.8rem; font-weight:bold;">${w.cn}</div><div style="font-size:1.1rem; margin-top:5px;">${w.word}</div>`; speak(w.word); score += 5; updateScore(); window.GameState.boxBatchCurrent++; if(window.GameState.boxBatchCurrent >= window.GameState.boxBatchTarget) setTimeout(window.nextBoxBatch, 1500); }; window.nextBoxBatch();
    }
    else if(type === 'quiz') {
        document.getElementById('g-title').innerText = "🎯 经典测验"; window.GameState.quizQueue = [...gameWords];
        window.nextQuiz = () => { 
            if(window.GameState.quizQueue.length === 0) return showGameOver();
            const target = window.GameState.quizQueue.pop(); let wrongs = gameWords.filter(w => w.id !== target.id).sort(()=>0.5-Math.random()).slice(0, 3); let options = [target, ...wrongs].sort(()=>0.5-Math.random()); 
            let optsHtml = options.map(o => `<button class="quiz-option" style="padding:20px;" onclick="if('${o.id}'==='${target.id}'){score+=10;updateScore();window.nextQuiz();}else{alert('❌ 错了');}">${o.word}</button>`).join(''); 
            stage.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center;"><h2 style="font-size:3rem; margin-bottom:40px; color:var(--primary);">${target.cn}</h2><div style="width:100%; max-width:500px;">${optsHtml}</div></div>`; speak(target.word); 
        }; window.nextQuiz();
    }
    else if(type === 'truefalse') {
        document.getElementById('g-title').innerText = "⚖️ 判断对错"; window.GameState.tfQueue = [...gameWords];
        window.nextTF = () => { 
            if(window.GameState.tfQueue.length === 0) return showGameOver();
            const w1 = window.GameState.tfQueue.pop(); const w2 = gameWords[Math.floor(Math.random() * gameWords.length)]; const isTrue = Math.random() > 0.5; const displayCn = isTrue ? w1.cn : w2.cn; 
            stage.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center;"><h2 style="font-size:3.5rem; color:var(--primary); margin:0;">${w1.word}</h2><h3 style="font-size:2rem; color:var(--text-light); margin:20px 0 50px 0;">释义: ${displayCn}</h3><div style="display:flex; gap:20px;"><button class="btn" style="background:var(--success); font-size:1.8rem; padding:20px 40px;" onclick="checkTF(${isTrue}, true)">True ✔️</button><button class="btn" style="background:var(--accent); font-size:1.8rem; padding:20px 40px;" onclick="checkTF(${isTrue}, false)">False ✖️</button></div></div>`; speak(w1.word); 
        }; 
        window.checkTF = (actual, guess) => { if(actual === guess) { score += 10; updateScore(); window.nextTF(); } else { alert('❌ 错啦'); } }; window.nextTF();
    }
    else if(type === 'missing') {
        document.getElementById('g-title').innerText = "📝 释义填空"; window.GameState.missingQueue = [...gameWords];
        window.nextMissing = () => { 
            if(window.GameState.missingQueue.length === 0) return showGameOver();
            const target = window.GameState.missingQueue.pop(); const hint = target.en ? target.en : target.cn; let wrongs = gameWords.filter(w => w.id !== target.id).sort(()=>0.5-Math.random()).slice(0, 3); let options = [target, ...wrongs].sort(()=>0.5-Math.random()); 
            let optsHtml = options.map(o => `<button class="quiz-option" style="padding:20px;" onclick="if('${o.id}'==='${target.id}'){score+=10;updateScore();window.nextMissing();}else{alert('❌ 错了');}">${o.word}</button>`).join(''); 
            stage.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center;"><h2 style="font-size:2rem; color:var(--text); line-height:1.5; margin-bottom:40px; text-align:center; max-width:800px;">" ${hint} "</h2><div style="width:100%; max-width:600px; display:grid; grid-template-columns:1fr 1fr; gap:15px;">${optsHtml}</div></div>`; 
        }; window.nextMissing();
    }
    else if(type === 'listen') {
        document.getElementById('g-title').innerText = "🎧 纯正盲听"; window.GameState.listenQueue = [...gameWords];
        window.nextListen = () => { 
            if(window.GameState.listenQueue.length === 0) return showGameOver();
            const target = window.GameState.listenQueue.pop(); let wrongs = gameWords.filter(w => w.id !== target.id).sort(()=>0.5-Math.random()).slice(0, 3); let options = [target, ...wrongs].sort(()=>0.5-Math.random()); 
            let optsHtml = options.map(o => `<button class="quiz-option" style="padding:20px;" onclick="if('${o.id}'==='${target.id}'){score+=15;updateScore();window.nextListen();}else{alert('❌ 错了');}">${o.cn}</button>`).join(''); 
            stage.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center;"><button class="btn" style="font-size:5rem; padding:40px 60px; border-radius:30px; margin-bottom:50px; box-shadow:var(--shadow);" onclick="speak('${target.word}')">🔊</button><div style="width:100%; max-width:600px;">${optsHtml}</div></div>`; speak(target.word); 
        }; window.nextListen();
    }
}

// 辅助连连看与翻牌机制
window.handleMatch = function(el) {
    if(el.style.visibility === 'hidden' || selectedCards.includes(el)) return; el.classList.add('selected'); selectedCards.push(el);
    if(selectedCards.length === 2) { 
        const a = selectedCards[0]; const b = selectedCards[1]; 
        if(a.dataset.id === b.dataset.id && a.dataset.type !== b.dataset.type) { 
            setTimeout(() => { a.style.visibility='hidden'; b.style.visibility='hidden'; score += 15; updateScore(); window.GameState.matchBatchCurrent++; if(window.GameState.matchBatchCurrent >= window.GameState.matchBatchTarget) setTimeout(window.nextMatchBatch, 500); }, 300); 
        } else { setTimeout(() => { a.classList.remove('selected'); b.classList.remove('selected'); }, 500); } selectedCards = []; 
    }
};

window.handleMemory = function(el) {
    if(el.classList.contains('flipped') || el.classList.contains('matched') || flippedCards.length >= 2) return; el.classList.add('flipped'); flippedCards.push(el);
    if(flippedCards.length === 2) { 
        const a = flippedCards[0]; const b = flippedCards[1]; 
        if(a.dataset.id === b.dataset.id) { 
            setTimeout(() => { a.classList.add('matched'); b.classList.add('matched'); score += 20; updateScore(); flippedCards=[]; window.GameState.memoryBatchCurrent++; if(window.GameState.memoryBatchCurrent >= window.GameState.memoryBatchTarget) setTimeout(window.nextMemoryBatch, 800); }, 500); 
        } else { setTimeout(() => { a.classList.remove('flipped'); b.classList.remove('flipped'); flippedCards=[]; }, 800); } 
    }
};

// =========================================================================
// 将供 HTML 调用的函数暴露给全局 window
// =========================================================================
window.openGameSetup = openGameSetup;
window.setGameMode = setGameMode;
window.startGameExec = startGameExec;
window.exitGame = exitGame;
window.replayGame = replayGame;