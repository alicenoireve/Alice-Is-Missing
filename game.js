/* =========================================================
   game.js — Alice Is Missing 遊戲面板邏輯
   依附在 app.js 之後載入，共用其 state / db / $ / toast 等全域函式
   ========================================================= */

(function(){

/* ---------- 卡牌編號工具 ---------- */
function codeIndex(code){
  const [s,n] = code.slice(1).split("-");
  return (parseInt(s,10)-1)*6 + parseInt(n,10);
}
function indexCode(i){
  const sheet = Math.floor((i-1)/6)+1;
  const slot = ((i-1)%6)+1;
  return `S${String(sheet).padStart(2,"0")}-${slot}`;
}
function expandRange(a,b){
  const ia=codeIndex(a), ib=codeIndex(b);
  const out=[];
  for(let i=ia;i<=ib;i++) out.push(indexCode(i));
  return out;
}
function cardImg(code, side){ return `assets/cards/${code}_${side}.jpg`; }

/* ---------- 遊戲資料表 ---------- */
const ROLE_CODES = ["S07-1","S07-2","S07-3","S07-4","S07-5"];
const ROLE_NAMES = {
  "S07-1": "查理",
  "S07-2": "達珂塔",
  "S07-3": "傑克",
  "S07-4": "茱莉安",
  "S07-5": "埃文"
};
const ROLE_COLORS = {
  "S07-1": "#c0392b", // 查理．巴恩斯
  "S07-2": "#1e7a52", // 達珂塔．特拉維斯
  "S07-3": "#2f6db3", // 傑克．布萊爾伍德
  "S07-4": "#8e44ad", // 朱莉亞．諾斯
  "S07-5": "#b8860b", // 埃文．霍威爾
};
const MOTIVE_POOL = ["S06-2","S06-3","S06-4","S06-5","S06-6"];

// 動機對應的兩句「關係語句」模板，"你"="對象"、"我"="自己"，會依據誰選了誰再轉換成雙方視角
const MOTIVE_RELATIONSHIP_TEMPLATES = {
  "S06-2": ["我知道你對愛麗絲的真實看法。", "我們一直處不來。"],
  "S06-3": ["我們曾經是最好的朋友。", "你知道某個我不希望被分享出去的秘密。"],
  "S06-4": ["你總是在身邊支持我。", "愛麗絲已經因為某件事原諒了你，但我還沒。"],
  "S06-5": ["我覺得你不喜歡我。", "我一直很想和你做朋友"],
  "S06-6": ["我對你很有保護欲。", "我知道你並不像我一樣在乎愛麗絲"],
};

// 地點／嫌犯卡片：玩家各自認領、填寫細節
const LOCATION_CARDS = ["S03-2","S03-4","S03-6","S04-2","S04-6"];
const SUSPECT_CARDS = ["S01-4","S01-6","S02-2","S02-4","S02-6"];

function transformRelationshipText(template, viewerIsSpeaker, speakerName, targetName){
  if(viewerIsSpeaker){
    // 說話者自己的視角：「你」換成對象名字，「我」保持不變
    return template.split("你").join(targetName);
  } else {
    // 被指定對象的視角：「我」換成說話者名字，「你」換成「我」
    return template.split("我").join(speakerName).split("你").join("我");
  }
}

const TIMER_GROUPS = [
  { key:"S07-6",   label:"90", cards:["S07-6"] },
  { key:"S08-1~3", label:"80", cards:["S08-1","S08-2","S08-3"] },
  { key:"S08-4~6", label:"70", cards:["S08-4","S08-5","S08-6"] },
  { key:"S09-1~3", label:"60", cards:["S09-1","S09-2","S09-3"] },
  { key:"S09-4~6", label:"50", cards:["S09-4","S09-5","S09-6"] },
  { key:"S10-1~3", label:"45", cards:["S10-1","S10-2","S10-3"] },
  { key:"S10-4~6", label:"40", cards:["S10-4","S10-5","S10-6"] },
  { key:"S11-1~3", label:"35", cards:["S11-1","S11-2","S11-3"] },
  { key:"S11-4~6", label:"30", cards:["S11-4","S11-5","S11-6"] },
  { key:"S12-1~3", label:"20", cards:["S12-1","S12-2","S12-3"] },
];

const SHARED_POOLS = {
  location: [ "S04-4", ...expandRange("S05-1","S06-1") ],
  suspect:  [ ...expandRange("S03-2","S04-3"), ...expandRange("S04-5","S04-6") ],
  clue:     [ "S04-4", ...expandRange("S05-1","S06-1") ],
};

const FINAL_POOL = ["S12-4","S12-5","S12-6"];

const POSTER_STATS = {
  1: {height:'165.1',weight:'50.8',hair:'黑色',eye:'淡褐色'},
  2: {height:'167.6',weight:'54.4',hair:'黑色',eye:'棕色'},
  3: {height:'160.0',weight:'83.9',hair:'棕色',eye:'綠色'},
  4: {height:'162.6',weight:'53.1',hair:'銅色',eye:'藍色'},
  5: {height:'170.2',weight:'54.4',hair:'黑色',eye:'淡褐色'},
  6: {height:'157.5',weight:'59.0',hair:'黑色/粉色',eye:'綠色'},
  7: {height:'162.6',weight:'49.0',hair:'黑色',eye:'棕色'},
  8: {height:'165.1',weight:'49.9',hair:'黑色',eye:'淡褐色'},
  9: {height:'172.7',weight:'58.1',hair:'棕色',eye:'淡褐色'},
  10:{height:'160.0',weight:'52.2',hair:'金色',eye:'藍色'},
};

function renderPosterCard(idx){
  const s = POSTER_STATS[idx];
  if(!s) return "";
  return `
    <div class="poster-card">
      <div class="poster-title">Missing Person</div>
      <div class="poster-photo-frame"><img src="assets/posters/photo${idx}.jpg" alt="海報 ${idx}"></div>
      <div class="poster-name">愛麗絲．布萊爾伍德（16 歲）</div>
      <div class="poster-missing-since">自 12 月 19 日起失蹤</div>
      <div class="poster-divider"></div>
      <div class="poster-info-row">
        <div class="poster-info-col">
          身高：${s.height}<br>
          體重：${s.weight}<br>
          頭髮：${s.hair}<br>
          瞳色：${s.eye}
        </div>
        <div class="poster-info-col right">
          若有任何線索<br>請撥打<br><b>(530) 207-0361</b>
        </div>
      </div>
    </div>`;
}
const COIN_TEXT = {
  "S12-5": { heads:"你成功逃脫", tails:"你沒能逃脫，停止傳送簡訊" },
  "S12-6": { heads:"你們兩人找到逃生的方法", tails:"愛麗絲逃脫，但你前來救他的角色沒有" }
};

const PHASES = ["intro","poster","roles","locations","suspects","assign","record","ready","live","playback","end"];
const PHASE_LABELS = {
  intro:"開場", poster:"選擇失蹤海報", roles:"選擇角色與動機", locations:"設置地點細節", suspects:"設置嫌犯細節",
  assign:"分配劇情卡時間", record:"錄音準備",
  ready:"準備開始", live:"遊戲進行中", playback:"播放錄音", end:"結局"
};

const CHAR_LIST = [
  {name:"查理·巴恩斯", tag:"搬走的人"},
  {name:"達科塔·特拉維斯", tag:"最好的朋友"},
  {name:"傑克·布萊爾伍德", tag:"哥哥"},
  {name:"朱莉亞·諾斯", tag:"秘密女友"},
  {name:"埃文·霍威爾", tag:"暗戀她的人"},
];
const LOCATION_LIST = ["靜瀑鎮火車站","嘯海崖上的燈塔","卡利斯托河州立公園","血刃俱樂部","劍橋街上的舊穀倉"];
const PEOPLE_LIST = [
  "萊恩·格羅金斯 – 前男友","哈維特先生 – 歷史老師","大衛·尼爾森 – 風雲人物",
  "布莉亞·布朗 – 霸凌者","CJ·華萊士 – 怪胎"
];

/* ---------- 狀態 ---------- */
let gameRef = null;
let game = null; // 目前 room 的 game 節點快照
let locallyRevealed = { suspect:false, location:false }; // 本機「已點擊查看」狀態，不同步
let mediaRecorder = null;
let recordedChunks = [];
let recordingStream = null;
let recordingActive = false;
let lastPlaybackTriggerTs = null;

function $$(sel, root){ return (root||document).querySelector(sel); }

/* ---------- Firebase 綁定 ---------- */
function onRoomEnter(){
  gameRef = db.ref(`rooms/${state.roomId}/game`);
  gameRef.get().then(snap=>{
    if(!snap.exists()){
      gameRef.set({
        phase:"intro",
        roleAssign:{}, motiveAssign:{}, timerSlotAssign:{}, timerSlotDraw:{},
        sharedPools:{ location:{revealed:{}, finalCode:null, finalSetBy:null}, suspect:{revealed:{}, finalCode:null, finalSetBy:null}, clue:{revealed:{}} },
        finalDraw:{ code:null, coin:null, text:null },
        recordingConfirmed:{}, recordings:{}, playbackIndex:0, playbackTrigger:null, phaseConfirm:{}, posterPickerId:null, posterIndex:0, posterSelected:null, relationshipAssign:{}, locationClaims:{}, suspectClaims:{},
        usedCards:{}, finaleRevealed:false
      });
    }
  });
  gameRef.on("value", snap=>{
    game = snap.val() || emptyGame();
    render();
  });
  loadCharLog();
  startDueChecker();
}
function onRoomLeave(){
  if(gameRef) gameRef.off();
  gameRef = null; game = null;
  stopDueChecker();
  renderCharLogTab();
}
function onMembersChanged(){ render(); }

function emptyGame(){
  return {
    phase:"intro", roleAssign:{}, motiveAssign:{}, timerSlotAssign:{}, timerSlotDraw:{},
    sharedPools:{ location:{revealed:{},finalCode:null,finalSetBy:null}, suspect:{revealed:{},finalCode:null,finalSetBy:null}, clue:{revealed:{}} },
    finalDraw:{ code:null, coin:null, text:null },
    recordingConfirmed:{}, recordings:{}, playbackIndex:0, playbackTrigger:null, phaseConfirm:{}, posterPickerId:null, posterIndex:0, posterSelected:null, relationshipAssign:{}, locationClaims:{}, suspectClaims:{},
    usedCards:{}, finaleRevealed:false
  };
}

function update(patch){ if(gameRef) gameRef.update(patch); }

/* ---------- 播放順序：固定依查理→達珂塔→傑克→茱莉安→埃文，只算有人選的角色 ---------- */
function getPlaybackOrder(){
  return ROLE_CODES
    .map(code => (game.roleAssign||{})[code])
    .filter(mid => !!mid);
}

/* ---------- 錄音（MediaRecorder，僅存最後一次結果） ---------- */
function startRecording(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    toast("這個瀏覽器不支援錄音功能");
    return;
  }
  navigator.mediaDevices.getUserMedia({ audio:true }).then(stream=>{
    recordingStream = stream;
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e=>{ if(e.data.size>0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = ()=>{
      const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      const reader = new FileReader();
      reader.onloadend = ()=>{
        const patch = {};
        patch[`recordings/${state.memberId}`] = reader.result;
        patch[`recordingConfirmed/${state.memberId}`] = true;
        update(patch);
        toast("錄音已儲存（只保留這一次的結果）");
        renderPhaseAction();
      };
      reader.readAsDataURL(blob);
      recordingStream.getTracks().forEach(t=>t.stop());
      recordingStream = null;
    };
    mediaRecorder.start();
    recordingActive = true;
    renderPhaseAction();
    setTimeout(()=>{
      if(mediaRecorder && mediaRecorder.state !== "inactive"){
        toast("已達錄音時間上限（3分鐘），自動停止");
        stopRecording();
      }
    }, 3*60*1000);
  }).catch(err=>{
    toast("無法取得麥克風權限："+err.message);
  });
}
function stopRecording(){
  if(mediaRecorder && mediaRecorder.state !== "inactive"){
    mediaRecorder.stop();
  }
  recordingActive = false;
}

/* ---------- 播放同步：任何人點播放，所有連線中的裝置都會各自播放同一段錄音 ---------- */
function ensurePlaybackAudioEl(){
  let el = document.getElementById("playbackAudioEl");
  if(!el){
    el = document.createElement("audio");
    el.id = "playbackAudioEl";
    el.style.display = "none";
    document.body.appendChild(el);
  }
  return el;
}
function checkPlaybackTrigger(){
  const trig = game.playbackTrigger;
  if(!trig || trig.ts === lastPlaybackTriggerTs) return;
  lastPlaybackTriggerTs = trig.ts;
  const order = getPlaybackOrder();
  const mid = order[trig.index];
  const audioData = (game.recordings||{})[mid];
  const el = ensurePlaybackAudioEl();
  if(audioData){
    el.src = audioData;
    el.play().catch(()=>{ toast("自動播放被瀏覽器擋下，請手動點一下畫面再試"); });
  }
}

/* ---------- 隨機抽卡（排除已使用過的卡） ---------- */
function drawRandom(pool){
  const used = (game && game.usedCards) || {};
  const avail = pool.filter(c=>!used[c]);
  if(avail.length===0) return null;
  return avail[Math.floor(Math.random()*avail.length)];
}

/* ============================================================
   渲染
   ============================================================ */
function renderPhaseAction(){
  const area = $("phaseActionArea");
  if(!area) return;
  const memberIds = Object.keys(state.members||{});

  if(game.phase === "poster"){
    // 進入此階段時，隨機指定一位玩家代表選擇海報（此時角色尚未分配，無法排除查理）
    if(!game.posterPickerId && memberIds.length>0){
      const pick = memberIds[Math.floor(Math.random()*memberIds.length)];
      update({ posterPickerId: pick, posterIndex: 0 });
      return;
    }
    const pickerId = game.posterPickerId;
    const isPicker = pickerId === state.memberId;
    const idx = (game.posterIndex||0) + 1; // 海報檔名 1~10
    const pickerName = escapeHtml((state.members[pickerId]||{}).name || "");

    let html = `
      <p class="help-text" style="margin-top:10px; font-size:15px; font-weight:700; color:var(--ink);">請選擇愛麗絲的失蹤海報：</p>
      <p class="help-text" style="margin-top:0;">${isPicker? "輪到你選擇，用左右按鈕瀏覽，選好後按下方「下一步」即可鎖定。" : `由 <b>${pickerName}</b> 負責選擇，你只需要等待並按「下一步」。`}</p>
      <div style="padding:6px 0;">
        ${renderPosterCard(idx)}
        <div class="cap" style="text-align:center; margin-top:8px;">海報 ${idx} / 10</div>
      </div>`;
    if(isPicker){
      html += `<div class="btn-row" style="margin-top:10px;">
        <button class="btn btn-ghost" data-action="poster-prev">◀ 上一張</button>
        <button class="btn btn-ghost" data-action="poster-next">下一張 ▶</button>
      </div>`;
    }
    area.innerHTML = html;
    return;
  }

  if(game.phase === "roles"){
    const myRole = Object.keys(game.roleAssign||{}).find(c=>game.roleAssign[c]===state.memberId);
    const roleCount = Object.keys(game.roleAssign||{}).length;
    const allRolesAssigned = roleCount === memberIds.length;
    const myMotive = (game.motiveAssign||{})[state.memberId];

    let html = "";

    // ① 角色
    html += `<div class="block-section-label" style="margin-top:12px;">① 選擇角色</div>`;
    if(myRole){
      html += `<div class="slot-row"><div class="card-slot large"><img src="${cardImg(myRole,'face')}"><div class="cap" style="color:${ROLE_COLORS[myRole]};font-weight:700;">${ROLE_NAMES[myRole]}</div></div></div>`;
    } else {
      const taken = new Set(Object.keys(game.roleAssign||{}));
      html += `<div class="pick-row">`;
      ROLE_CODES.forEach(code=>{
        html += `<button class="pick-btn" ${taken.has(code)?"disabled":""} data-action="pick-role" data-code="${code}">${ROLE_NAMES[code]}</button>`;
      });
      html += `</div>`;
    }

    // ② 動機
    html += `<div class="block-section-label">② 抽取動機</div>`;
    if(myMotive){
      html += `<div class="slot-row"><div class="card-slot large"><img src="${cardImg(myMotive,'face')}"><div class="cap">${myMotive}</div></div></div>`;
    } else if(!myRole){
      html += `<div class="charlog-lock">🔒 請先選擇角色</div>`;
    } else if(!allRolesAssigned){
      html += `<div class="charlog-lock">🔒 等待所有玩家（${roleCount}/${memberIds.length}）選完角色</div>`;
    } else {
      html += `<div class="pick-row"><button class="small-btn" data-action="draw-motive">🎴 抽取動機</button></div>`;
    }

    // ③ 秘密 + ④ 分配關係（角色+動機都好了才出現）
    if(myRole && myMotive){
      const savedData = loadCharLogData();
      const tmpls = MOTIVE_RELATIONSHIP_TEMPLATES[myMotive] || ["",""];
      const savedRel = (game.relationshipAssign||{})[state.memberId] || {};
      const others = memberIds.filter(m=>m!==state.memberId);

      html += `<div class="block-section-label">③ 我的秘密</div>
        <textarea id="rolesSecretInput" placeholder="寫下你的秘密…" style="margin:4px 2px;">${escapeHtml(savedData.secret||"")}</textarea>`;

      html += `<div class="block-section-label">④ 分配關係（選一位角色套用這句話，兩句都要選）</div>`;
      [0,1].forEach(i=>{
        html += `<div class="charlog-item" style="margin:8px 2px;">
          <div class="iname">「${escapeHtml(tmpls[i])}」</div>
          <select id="relSelect${i}" style="width:100%;padding:8px;border-radius:8px;border:1.5px solid var(--line);margin-top:4px;">`;
        others.forEach(mid=>{
          const rc = Object.keys(game.roleAssign||{}).find(c=>game.roleAssign[c]===mid);
          const sel = savedRel[`f${i+1}`]===mid ? "selected":"";
          html += `<option value="${mid}" ${sel}>${rc?ROLE_NAMES[rc]:(state.members[mid]||{}).name}</option>`;
        });
        html += `</select></div>`;
      });
      html += `<p class="help-text">填好後按最上方「下一步」會鎖定並存進你的「紀錄」頁籤。</p>`;
    }

    area.innerHTML = html;
    return;
  }

  if(game.phase === "locations" || game.phase === "suspects"){
    const isLoc = game.phase === "locations";
    const pool = isLoc ? LOCATION_CARDS : SUSPECT_CARDS;
    const claims = (isLoc ? game.locationClaims : game.suspectClaims) || {};
    const label = isLoc ? "地點" : "嫌犯";
    const claimedCount = Object.keys(claims).length;

    let html = `<p class="help-text" style="margin-top:10px;">每位玩家可以認領一個或多個${label}卡，並填寫細節。全部 ${pool.length} 張都要有人認領，且同一張不能被兩個人認領（已認領：${claimedCount}/${pool.length}）。</p>`;

    html += `<div class="draw-queue">`;
    pool.forEach(code=>{
      const ownerId = claims[code];
      const mine = ownerId === state.memberId;
      html += `<div class="draw-row ${ownerId?'done':'active'}">
        <div class="draw-row-head">
          <span class="draw-label">${code}</span>
          <span class="draw-owner">${ownerId ? ((state.members[ownerId]||{}).name||"") : "尚未認領"}</span>
        </div>
        <div class="draw-result"><div class="card-slot large"><img src="${cardImg(code,'face')}"></div></div>`;
      if(!ownerId){
        html += `<textarea id="claimNote_${code}" placeholder="寫下這個${label}的細節…" style="margin-top:6px;"></textarea>
          <button class="small-btn" style="margin-top:6px;" data-action="claim-card" data-pool="${isLoc?'location':'suspect'}" data-code="${code}">認領並儲存</button>`;
      } else if(mine){
        html += `<div class="help-text" style="margin-top:6px; color:var(--accent-dark);">✅ 已認領，細節已存入你的「紀錄」頁籤</div>`;
      }
      html += `</div>`;
    });
    html += `</div>`;
    area.innerHTML = html;
    return;
  }

  if(game.phase === "assign"){
    const groupKeys = TIMER_GROUPS.filter(g=>g.key!=="S07-6").map(g=>g.key);
    const charlieId = (game.roleAssign||{})["S07-1"] || null;
    let html = `
      <button class="btn btn-outline" data-action="auto-assign" style="margin-top:10px;">🎲 自動平均分配劇情卡（80~20，共9張）</button>
      <p class="help-text">
        「90」（S07-6）固定屬於查理，「10」（最終抉擇）不計入。分配其餘 9 張時，系統會把查理已經固定拿到的那 1 張算進總數裡，盡量讓每個人最終拿到的「總張數」一樣多，並確保 45/40、40/35、35/30 這幾組不會落在同一人身上。按一次即可，若想重新洗牌可以再按一次。
      </p>
      <div class="assign-table">`;
    TIMER_GROUPS.forEach(g=>{
      const isCharlieSlot = g.key === "S07-6";
      const assignedTo = isCharlieSlot ? charlieId : (game.timerSlotAssign||{})[g.key];
      const assignedName = assignedTo ? escapeHtml((state.members[assignedTo]||{}).name || assignedTo) : "尚未分配";
      html += `<div class="assign-row">
        <div class="assign-label">${g.label}</div>
        <div class="assign-value">${isCharlieSlot ? (charlieId? "固定："+assignedName : "固定給查理（尚未選角色）") : assignedName}</div>
      </div>`;
    });
    html += `</div>`;
    area.innerHTML = html;
    return;
  }

  if(["live","playback","end"].includes(game.phase)){
    const remainMin = (typeof remainingSeconds === "function") ? remainingSeconds()/60 : 999;
    const charlieId = (game.roleAssign||{})["S07-1"] || null;
    let html = `<div class="draw-queue">`;
    TIMER_GROUPS.forEach(g=>{
      const ownerId = g.key==="S07-6" ? charlieId : (game.timerSlotAssign||{})[g.key];
      const ownerName = ownerId ? ((state.members[ownerId]||{}).name || ownerId) : "（尚未指派）";
      const drawState = (game.timerSlotDraw||{})[g.key];
      const drawn = drawState && drawState.drawn;
      const due = remainMin <= parseInt(g.label,10);

      html += `<div class="draw-row ${drawn?'done':(due?'active':'upcoming')}">
        <div class="draw-row-head"><span class="draw-label">${g.label}</span><span class="draw-owner">${escapeHtml(ownerName)}</span></div>`;

      if(drawn){
        const canSee = ownerId === state.memberId;
        html += canSee
          ? `<div class="draw-result"><div class="card-slot large"><img src="${cardImg(drawState.code,'face')}"><div class="cap">${drawState.code}</div></div></div>`
          : `<div class="draw-result"><div class="card-slot large placeholder">🔒</div><span class="cap">已抽取（僅 ${escapeHtml(ownerName)} 本人看得到）</span></div>`;
      } else if(due && ownerId === state.memberId){
        if(g.cards.length === 1){
          html += `<button class="small-btn" data-action="draw-timer" data-group="${g.key}">抽取</button>`;
        } else {
          html += `<div class="choice-row">`;
          g.cards.forEach((code,i)=>{
            html += `<button class="choice-card" data-action="draw-timer-choice" data-group="${g.key}" data-code="${code}">
              <img src="${cardImg(g.cards[0],'back')}"><span class="cap">選項 ${i+1}</span>
            </button>`;
          });
          html += `</div>`;
        }
      } else if(due){
        html += `<div class="charlog-lock">🔒 等待 ${escapeHtml(ownerName)} 抽取</div>`;
      } else {
        html += `<div class="charlog-lock">⏳ 尚未到時間</div>`;
      }
      html += `</div>`;
    });
    html += `</div>`;
    area.innerHTML = html;
    return;
  }

  if(game.phase === "record"){
    const recordings = game.recordings || {};
    let html = `<p class="help-text" style="margin-top:10px;">每位玩家請對著自己的裝置錄音（其他人聽不到你錄的內容，只會看到你「已完成」）。可以重新錄製，只會保留最後一次的結果。全員都錄好後才能繼續。</p>`;
    html += `<div class="assign-table">`;
    memberIds.forEach(mid=>{
      const name = escapeHtml((state.members[mid]||{}).name || mid);
      const hasRecording = !!recordings[mid];
      const isYou = mid === state.memberId;
      html += `<div class="assign-row">
        <div class="assign-value" style="text-align:left; flex:1;">${name}</div>`;
      if(!isYou){
        html += hasRecording
          ? `<span style="color:var(--accent-dark); font-weight:700;">✅ 已完成</span>`
          : `<span class="charlog-lock" style="padding:0;">尚未錄音</span>`;
      } else if(recordingActive){
        html += `<button class="small-btn" data-action="stop-recording" style="background:var(--danger);">⏹ 停止錄音</button>`;
      } else if(hasRecording){
        html += `<span style="color:var(--accent-dark); font-weight:700; margin-right:6px;">✅ 已完成</span>
                  <button class="small-btn ghost" data-action="start-recording">🔁 重新錄製</button>`;
      } else {
        html += `<button class="small-btn" data-action="start-recording">🎙 開始錄音</button>`;
      }
      html += `</div>`;
    });
    html += `</div>`;
    area.innerHTML = html;
    return;
  }

  if(game.phase === "playback"){
    const order = getPlaybackOrder();
    const idx = game.playbackIndex||0;
    let html = `<p class="help-text" style="margin-top:10px;">計時結束，依照查理→達珂塔→傑克→茱莉安→埃文的順序播放每個人的錄音，全員都聽得到。輪到的玩家按「播放」，聽完後按「下一位」換下一個人。</p>`;
    html += `<div class="assign-table">`;
    order.forEach((mid,i)=>{
      const name = escapeHtml((state.members[mid]||{}).name || mid);
      let status;
      if(i < idx) status = `<span style="color:var(--accent-dark); font-weight:700;">✅ 已播放</span>`;
      else if(i === idx){
        if(mid===state.memberId){
          status = `<button class="small-btn" data-action="play-recording" style="margin-right:6px;">▶ 播放</button><button class="small-btn ghost" data-action="playback-next">下一位</button>`;
        } else {
          status = `<span class="charlog-lock" style="padding:0;">🔊 輪到 ${name} 播放中…</span>`;
        }
      }
      else status = `<span class="charlog-lock" style="padding:0;">等待中</span>`;
      html += `<div class="assign-row">
        <div class="assign-value" style="text-align:left; flex:1;">${i+1}. ${name}</div>
        ${status}
      </div>`;
    });
    html += `</div>`;
    area.innerHTML = html;
    return;
  }

  if(game.phase === "ready"){
    const hasCharlie = !!(game.roleAssign||{})["S07-1"];
    area.innerHTML = hasCharlie
      ? `<p class="help-text" style="margin-top:10px;">一切就緒，按右上角「下一步」開始計時，正式進入遊戲！</p>`
      : `<p class="help-text" style="margin-top:10px; color:var(--danger);">⚠️ 目前還沒有玩家選擇「查理」角色，需要有人選查理才能開始遊戲。請回到下方玩家紀錄選擇角色。</p>`;
    return;
  }

  area.innerHTML = "";
}

/* ============================================================
   渲染
   ============================================================ */
function render(){
  if(!game) return;
  document.body.classList.toggle("theme-dark", game.theme === "dark");
  const phaseIdx = PHASES.indexOf(game.phase);
  $("phaseLabel").textContent = "階段：" + PHASE_LABELS[game.phase];
  const memberIds = Object.keys(state.members||{});

  // 下一步按鈕：改成「我準備好了」的全員確認機制，不再有上一步
  const nextBtn = $("btnPhaseNext");
  const confirmNote = $("phaseConfirmNote");
  const hasCharlie = !!(game.roleAssign||{})["S07-1"];
  const allRecorded = memberIds.length>0 && memberIds.every(mid=>(game.recordingConfirmed||{})[mid]);
  const playbackOrder = getPlaybackOrder();
  const allPlayed = (game.playbackIndex||0) >= playbackOrder.length;

  if(game.phase === "playback") checkPlaybackTrigger();

  let gateOk = true, gateMsg = "";
  if(game.phase === "intro" && memberIds.length < 2){ gateOk=false; gateMsg="至少需要 2 位玩家才能開始"; }
  else if(game.phase === "record" && !allRecorded){ gateOk=false; gateMsg="要等所有人都錄好音"; }
  else if(game.phase === "ready" && !hasCharlie){ gateOk=false; gateMsg="需要有玩家選擇查理"; }
  else if(game.phase === "playback" && !allPlayed){ gateOk=false; gateMsg="要等所有人都播放完錄音"; }

  const confirm = game.phaseConfirm || {};
  const confirmedCount = memberIds.filter(m=>confirm[m]).length;
  const iConfirmed = !!confirm[state.memberId];
  const nextLabel = (game.phase==="ready") ? `下一步<span class="sub">開始計時</span>` : `下一步`;

  if(game.phase === "end"){
    nextBtn.style.display = "none";
    confirmNote.style.display = "none";
  } else {
    nextBtn.style.display = "";
    confirmNote.style.display = "block";
    if(!gateOk){
      nextBtn.disabled = true;
      nextBtn.innerHTML = nextLabel;
      confirmNote.textContent = "⚠️ " + gateMsg;
    } else if(iConfirmed){
      nextBtn.disabled = true;
      nextBtn.innerHTML = `已確認<span class="sub">等待其他人</span>`;
      confirmNote.textContent = `${confirmedCount} / ${memberIds.length} 人已準備`;
    } else {
      nextBtn.disabled = false;
      nextBtn.innerHTML = nextLabel;
      confirmNote.textContent = `${confirmedCount} / ${memberIds.length} 人已準備`;
    }
  }

  tryAdvancePhase();

  // 開場卡
  $("introCardWrap").style.display = (game.phase==="intro") ? "block" : "none";
  renderPhaseAction();

  // 玩家區塊：選完角色開始就顯示
  const showBoard = ["roles","locations","suspects","assign","record","ready","live","playback","end"].includes(game.phase);
  $("playerBlocks").style.display = showBoard ? "block" : "none";
  // 共用區（地點/嫌犯/線索）：進入遊戲後才顯示
  $("sharedArea").style.display = (["live","playback","end"].includes(game.phase)) ? "block" : "none";

  renderPlayerBlocks();
  renderSharedArea();
  renderCharLogTab();

  // 結局卡與匯出按鈕：只有播放完錄音進入 end 階段才會出現
  $("finaleWrap").style.display = game.finaleRevealed ? "block" : "none";
  $("btnExportFinal").style.display = game.finaleRevealed ? "inline-flex" : "none";
}

function renderPlayerBlocks(){
  const container = $("playerBlocks");
  container.innerHTML = "";
  const memberIds = Object.keys(state.members||{});
  if(memberIds.length===0){
    container.innerHTML = `<div class="stub-section">等待玩家加入房間…</div>`;
    return;
  }

  memberIds.forEach(mid=>{
    const m = state.members[mid];
    const isYou = mid === state.memberId;
    const block = document.createElement("div");
    block.className = "player-block" + (isYou ? " you" : "");

    // 這位玩家的角色 code（如果已選）
    const roleCode = Object.keys(game.roleAssign||{}).find(c=>game.roleAssign[c]===mid);
    const roleName = roleCode ? ROLE_NAMES[roleCode] : null;

    // 動機 code
    const motiveCode = (game.motiveAssign||{})[mid];

    let html = `
      <div class="player-block-head">
        <div class="avatar" style="background:${colorFor(mid)}">${escapeHtml((m.name||"?")[0])}</div>
        <div class="pname">${escapeHtml(m.name||"未命名")}${roleName? ` · <span style="color:${ROLE_COLORS[roleCode]};">${roleName}</span>` : ""}</div>
        ${isYou? '<span class="you-tag">你</span>' : ''}
      </div>
    `;

    // 角色／動機已搬到「紀錄」分頁自己查看，這裡不再顯示

    // ===== 劇情卡時間分配（assign 階段：主持人指派）=====
    const myGroups = TIMER_GROUPS.filter(g=>{
      if(g.key==="S07-6") return roleCode === "S07-1"; // 90 固定給查理
      return (game.timerSlotAssign||{})[g.key] === mid;
    });

    if(game.phase === "assign"){
      const myCount = TIMER_GROUPS.filter(g=>g.key!=="S07-6" && (game.timerSlotAssign||{})[g.key]===mid).length
                      + (roleCode === "S07-1" ? 1 : 0);
      html += `<div class="block-section-label">劇情卡分配　目前：${myCount} 張${roleCode==="S07-1"?"（含固定的 90）":""}</div>`;
      html += `<div class="charlog-sub">到上方「現在階段」區塊指派每組劇情卡的負責人。</div>`;
    }

    block.innerHTML = html;
    container.appendChild(block);
  });
}

function renderConclusionSlot(code, setBy, remainMin, poolName){
  if(!code) return `<div class="empty-mark">尚未選定</div>`;
  const isSetter = setBy === state.memberId;
  const canAccess = isSetter || remainMin <= 10;
  if(!canAccess) return `<div class="empty-mark">🔒 10:00 後解鎖</div>`;
  if(locallyRevealed[poolName]) return `<img src="${cardImg(code,'face')}">`;
  return `<button class="small-btn" data-action="reveal-final" data-pool="${poolName}">👁 點擊查看</button>`;
}

function renderSharedArea(){
  ["location","suspect","clue"].forEach(poolName=>{
    const revealedObj = (game.sharedPools && game.sharedPools[poolName] && game.sharedPools[poolName].revealed) || {};
    const codes = Object.keys(revealedObj);
    const row = $(`revealed-${poolName}`);
    if(!row) return;
    if(codes.length===0){
      row.innerHTML = `<div class="revealed-empty">尚未抽取</div>`;
      return;
    }
    const finalCode = game.sharedPools[poolName].finalCode;
    row.innerHTML = codes.map(code=>{
      let btn = "";
      if(poolName==="suspect"){
        const active = finalCode===code;
        btn = `<button class="set-final-btn ${active?'active':''}" data-action="set-final" data-pool="suspect" data-code="${code}">${active?'✓ 真兇':'設為真兇'}</button>`;
      } else if(poolName==="location"){
        const active = finalCode===code;
        btn = `<button class="set-final-btn ${active?'active':''}" data-action="set-final" data-pool="location" data-code="${code}">${active?'✓ 位置':'設為位置'}</button>`;
      }
      return `<div class="revealed-card"><img src="${cardImg(code,'face')}">${btn}</div>`;
    }).join("");
  });

  // 結論欄：10:00 前只有設定者能查看，之後所有人都能點擊查看
  const remainMinForFinal = (typeof remainingSeconds === "function") ? remainingSeconds()/60 : 999;
  const susFinal = game.sharedPools?.suspect?.finalCode;
  const susSetBy = game.sharedPools?.suspect?.finalSetBy;
  const locFinal = game.sharedPools?.location?.finalCode;
  const locSetBy = game.sharedPools?.location?.finalSetBy;

  $("finalSuspectSlot").innerHTML = renderConclusionSlot(susFinal, susSetBy, remainMinForFinal, "suspect");
  $("finalLocationSlot").innerHTML = renderConclusionSlot(locFinal, locSetBy, remainMinForFinal, "location");

  // 最終抉擇卡
  const fd = game.finalDraw || {};
  const resultBox = $("finalDrawResult");
  const pileImg = $("btnDrawFinal") ? $("btnDrawFinal").querySelector("img") : null;
  if(fd.code){
    if(pileImg) pileImg.src = cardImg(fd.code,"back"); // 牌堆按鈕本身固定顯示牌背
    let html = `<div class="revealed-card" style="display:inline-block;"><img src="${cardImg(fd.code,'face')}"><div class="cap" style="margin-top:2px;">${fd.code}</div></div>`;
    if(fd.text){
      html += `<div class="coin-quote"><span class="coin-tag">🪙 ${fd.coin==='heads'?'人頭':'數字'}</span>「${escapeHtml(fd.text)}」</div>`;
    }
    resultBox.innerHTML = html;
    if($("btnDrawFinal")) $("btnDrawFinal").disabled = false; // 保留可視但邏輯已擋重複抽取
  } else {
    resultBox.innerHTML = `<div class="revealed-empty">尚未抽取</div>`;
  }
}

/* ============================================================
   互動事件（事件委派）
   ============================================================ */
document.addEventListener("click", e=>{
  const btn = e.target.closest("[data-action]");
  if(!btn || !game) return;
  const action = btn.dataset.action;

  if(action === "pick-role"){
    const code = btn.dataset.code;
    if((game.roleAssign||{})[code]) return; // 已被選走
    const patch = {}; patch[`roleAssign/${code}`] = state.memberId;
    update(patch);
    toast(`已選擇角色：${ROLE_NAMES[code]}，記得把暱稱改成「${ROLE_NAMES[code]}」`);
  }

  if(action === "draw-motive"){
    const totalMembers = Object.keys(state.members||{}).length;
    const rolesAssignedCount = Object.keys(game.roleAssign||{}).length;
    if(rolesAssignedCount < totalMembers){ toast("要等所有玩家選完角色才能抽動機"); return; }
    const code = drawRandom(MOTIVE_POOL);
    if(!code){ toast("動機卡已抽完"); return; }
    const patch = {};
    patch[`motiveAssign/${state.memberId}`] = code;
    patch[`usedCards/${code}`] = true;
    update(patch);
  }

  if(action === "claim-card"){
    const pool = btn.dataset.pool; // 'location' | 'suspect'
    const code = btn.dataset.code;
    const claims = (pool==="location" ? game.locationClaims : game.suspectClaims) || {};
    if(claims[code]){ toast("這張已經被認領了"); return; }
    const noteEl = document.getElementById(`claimNote_${code}`);
    const note = noteEl ? noteEl.value.trim() : "";
    if(!note){ toast("請先寫下細節再認領"); return; }
    const patch = {};
    patch[`${pool==="location"?"locationClaims":"suspectClaims"}/${code}`] = state.memberId;
    update(patch);
    const d = loadCharLogData();
    if(pool==="location"){ d.locationCardNotes = d.locationCardNotes||{}; d.locationCardNotes[code] = note; }
    else { d.suspectCardNotes = d.suspectCardNotes||{}; d.suspectCardNotes[code] = note; }
    saveCharLogData(d);
    toast("已認領並儲存");
  }

  if(action === "assign-timer"){
    const group = btn.dataset.group, member = btn.dataset.member;
    const patch = {}; patch[`timerSlotAssign/${group}`] = member;
    update(patch);
  }

  if(action === "draw-timer"){
    const groupKey = btn.dataset.group;
    const g = TIMER_GROUPS.find(x=>x.key===groupKey);
    const code = drawRandom(g.cards);
    if(!code){ toast("這組卡已經抽完"); return; }
    const patch = {};
    patch[`timerSlotDraw/${groupKey}`] = { drawn:true, code };
    patch[`usedCards/${code}`] = true;
    if(code === "S10-2"){ patch.theme = "dark"; }
    update(patch);
  }

  if(action === "draw-timer-choice"){
    const groupKey = btn.dataset.group;
    const code = btn.dataset.code;
    const used = (game.usedCards||{});
    if(used[code]){ toast("這張卡已經被用過了"); return; }
    const patch = {};
    patch[`timerSlotDraw/${groupKey}`] = { drawn:true, code };
    patch[`usedCards/${code}`] = true;
    if(code === "S10-2"){ patch.theme = "dark"; }
    update(patch);
  }

  if(action === "draw-shared"){
    const poolName = btn.dataset.pool;
    const code = drawRandom(SHARED_POOLS[poolName]);
    if(!code){ toast("這個牌堆已經抽完"); return; }
    const patch = {};
    patch[`sharedPools/${poolName}/revealed/${code}`] = true;
    patch[`usedCards/${code}`] = true;
    update(patch);
  }

  if(action === "start-recording"){
    startRecording();
  }
  if(action === "stop-recording"){
    stopRecording();
  }

  if(action === "play-recording"){
    const order = getPlaybackOrder();
    const idx = game.playbackIndex||0;
    if(order[idx] !== state.memberId) return;
    update({ playbackTrigger: { index: idx, ts: Date.now() } });
  }

  if(action === "playback-next"){
    const order = getPlaybackOrder();
    const idx = game.playbackIndex||0;
    if(order[idx] !== state.memberId) return;
    update({ playbackIndex: idx+1 });
  }

  if(action === "reveal-final"){
    const pool = btn.dataset.pool;
    locallyRevealed[pool] = true;
    renderSharedArea();
  }

  if(action === "set-final"){
    const pool = btn.dataset.pool, code = btn.dataset.code;
    const patch = {};
    patch[`sharedPools/${pool}/finalCode`] = code;
    patch[`sharedPools/${pool}/finalSetBy`] = state.memberId;
    update(patch);
  }

  if(action === "poster-prev" || action === "poster-next"){
    if(game.posterPickerId !== state.memberId) return;
    let idx = game.posterIndex||0;
    idx = action==="poster-next" ? (idx+1)%10 : (idx-1+10)%10;
    update({ posterIndex: idx });
  }

  if(action === "auto-assign"){
    autoDistributeTimerSlots();
  }

  if(action === "draw-final"){
    if(game.finalDraw && game.finalDraw.code) return; // 已抽過
    const code = drawRandom(FINAL_POOL);
    if(!code){ toast("已經抽完"); return; }
    const patch = {};
    patch[`finalDraw/code`] = code;
    patch[`usedCards/${code}`] = true;
    if(COIN_TEXT[code]){
      const coin = Math.random() < 0.5 ? "heads" : "tails";
      patch[`finalDraw/coin`] = coin;
      patch[`finalDraw/text`] = COIN_TEXT[code][coin];
    }
    update(patch);
  }
});

function tryAdvancePhase(){
  if(!game || game.phase === "end") return;
  const memberIds = Object.keys(state.members||{});
  if(memberIds.length===0) return;
  const confirm = game.phaseConfirm || {};
  const allConfirmed = memberIds.every(m=>confirm[m]);
  if(!allConfirmed) return;

  const hasCharlie = !!(game.roleAssign||{})["S07-1"];
  const allRecorded = memberIds.every(mid=>(game.recordingConfirmed||{})[mid]);
  const playbackOrder = getPlaybackOrder();
  const allPlayed = (game.playbackIndex||0) >= playbackOrder.length;

  if(game.phase==="intro" && memberIds.length<2) return;
  if(game.phase==="record" && !allRecorded) return;
  if(game.phase==="ready" && !hasCharlie) return;
  if(game.phase==="playback" && !allPlayed) return;
  if(game.phase==="locations" && Object.keys(game.locationClaims||{}).length < LOCATION_CARDS.length) return;
  if(game.phase==="suspects" && Object.keys(game.suspectClaims||{}).length < SUSPECT_CARDS.length) return;

  const idx = PHASES.indexOf(game.phase);
  const next = PHASES[idx+1];
  if(!next) return;

  const patch = { phase: next, phaseConfirm: {} };
  if(next === "end" && game.phase === "playback"){
    patch.finaleRevealed = true;
    patch.recordings = null;
    patch.playbackTrigger = null;
  }
  update(patch);
  if(next === "live"){ startGameTimer(); }
}

$("btnPhaseNext").addEventListener("click", ()=>{
  if(!game) return;
  const memberIds = Object.keys(state.members||{});
  const hasCharlie = !!(game.roleAssign||{})["S07-1"];
  const allRecorded = memberIds.length>0 && memberIds.every(mid=>(game.recordingConfirmed||{})[mid]);
  const playbackOrder = getPlaybackOrder();
  const allPlayed = (game.playbackIndex||0) >= playbackOrder.length;

  if(game.phase === "intro" && memberIds.length < 2){
    toast("⚠️ 至少需要 2 位玩家才能開始遊戲"); return;
  }
  if(game.phase === "record" && !allRecorded){
    toast("⚠️ 要等所有人都錄好音才能繼續"); return;
  }
  if(game.phase === "ready" && !hasCharlie){
    toast("⚠️ 需要有玩家選擇查理才能開始遊戲"); return;
  }
  if(game.phase === "playback" && !allPlayed){
    toast("⚠️ 要等所有人都播放完錄音才能繼續"); return;
  }
  if(game.phase === "roles"){
    const myRole = Object.keys(game.roleAssign||{}).find(c=>game.roleAssign[c]===state.memberId);
    const myMotive = (game.motiveAssign||{})[state.memberId];
    if(!myRole || !myMotive){ toast("⚠️ 請先選擇角色並抽取動機"); return; }
  }
  if((game.phase === "locations" && Object.keys(game.locationClaims||{}).length < LOCATION_CARDS.length)){
    toast("⚠️ 所有地點都要有人認領才能繼續"); return;
  }
  if((game.phase === "suspects" && Object.keys(game.suspectClaims||{}).length < SUSPECT_CARDS.length)){
    toast("⚠️ 所有嫌犯都要有人認領才能繼續"); return;
  }

  const patch = {}; patch[`phaseConfirm/${state.memberId}`] = true;
  if(game.phase === "poster" && game.posterPickerId === state.memberId){
    patch.posterSelected = (game.posterIndex||0) + 1; // 存海報檔名編號(1~10)
  }
  if(game.phase === "roles"){
    const sel0 = document.getElementById("relSelect0");
    const sel1 = document.getElementById("relSelect1");
    if(sel0 && sel1){
      patch[`relationshipAssign/${state.memberId}/f1`] = sel0.value;
      patch[`relationshipAssign/${state.memberId}/f2`] = sel1.value;
    }
    const secretEl = document.getElementById("rolesSecretInput");
    if(secretEl){
      const d = loadCharLogData();
      d.secret = secretEl.value;
      saveCharLogData(d);
    }
  }
  update(patch);
});
$("btnExportFinal").addEventListener("click", ()=>{
  if(window.exportInSceneLog) window.exportInSceneLog();
});

function autoDistributeTimerSlots(){
  const groupKeys = TIMER_GROUPS.filter(g=>g.key!=="S07-6").map(g=>g.key); // 9 組：80~20（90 固定給查理，不在這裡分配）
  let members = Object.keys(state.members||{});
  if(members.length === 0){ toast("房間裡還沒有玩家"); return; }

  const charlieId = (game.roleAssign||{})["S07-1"] || null;

  // 起始張數：查理已經固定拿到「90」算 1 張，其他人 0
  const counts = {};
  members.forEach(mid => { counts[mid] = (mid === charlieId) ? 1 : 0; });

  // 打亂 9 組的分配順序，讓每局遊戲配置都不一樣
  const shuffledGroups = groupKeys.slice().sort(()=>Math.random()-0.5);

  const assign = {};
  shuffledGroups.forEach(key=>{
    const minCount = Math.min(...members.map(m=>counts[m]));
    const candidates = members.filter(m=>counts[m]===minCount);
    const pick = candidates[Math.floor(Math.random()*candidates.length)];
    assign[key] = pick;
    counts[pick]++;
  });

  // 45/40、40/35、35/30 這幾組相鄰劇情卡不能落在同一人身上（鏈式限制）
  const chainPairs = [["S10-1~3","S10-4~6"], ["S10-4~6","S11-1~3"], ["S11-1~3","S11-4~6"]];
  if(members.length > 1){
    for(let pass=0; pass<6; pass++){
      let fixedAny = false;
      chainPairs.forEach(([a,b])=>{
        if(assign[a] === assign[b]){
          const swapKey = groupKeys.find(k =>
            !chainPairs.some(p=>p.includes(k)) && // 優先跟不在鏈上的組交換，減少連鎖影響
            assign[k] !== assign[b]
          ) || groupKeys.find(k => k!==a && k!==b && assign[k] !== assign[b] && assign[k] !== assign[a]);
          if(swapKey){
            const tmp = assign[b]; assign[b] = assign[swapKey]; assign[swapKey] = tmp;
            fixedAny = true;
          }
        }
      });
      if(!fixedAny) break;
    }
  }

  const patch = {};
  groupKeys.forEach(key=>{ patch[`timerSlotAssign/${key}`] = assign[key]; });
  update(patch);

  // 顯示每人「總」張數（含查理固定的90），方便主持人確認平均
  const totalCounts = {};
  members.forEach(m=>{ totalCounts[m] = (m===charlieId) ? 1 : 0; });
  groupKeys.forEach(key=>{ totalCounts[assign[key]] = (totalCounts[assign[key]]||0)+1; });
  const summary = members.map(mid => `${(state.members[mid]||{}).name||mid}：${totalCounts[mid]}張`).join("　");
  toast("已自動分配（90 固定給查理）　" + summary);
}

document.addEventListener("change", e=>{
  const sel = e.target.closest('[data-action="assign-timer-select"]');
  if(!sel || !game) return;
  const group = sel.dataset.group;
  const memberId = sel.value;
  const patch = {};
  patch[`timerSlotAssign/${group}`] = memberId || null;
  update(patch);
});

/* ============================================================
   角色紀錄（本機儲存，不同步）
   ============================================================ */
function charlogKey(){ return `charlog_${state.roomId}_${state.memberId}`; }
function loadCharLogData(){
  try{ return JSON.parse(localStorage.getItem(charlogKey())) || {}; }catch(e){ return {}; }
}
function saveCharLogData(data){
  localStorage.setItem(charlogKey(), JSON.stringify(data));
}
function renderCharLogTab(){
  const gate = $("charlogGate");
  const content = $("charlogContent");
  if(!gate || !content) return;
  if(!state.roomId){
    gate.style.display = "flex";
    content.style.display = "none";
    return;
  }
  gate.style.display = "none";
  content.style.display = "block";
  const roleCode = game ? Object.keys(game.roleAssign||{}).find(c=>game.roleAssign[c]===state.memberId) : null;
  mountCharLog($("charlogMount"), roleCode);
}

function loadCharLog(){ /* 資料在 mountCharLog 時讀取，這裡預留擴充 */ }

async function exportCharLogHtml(roleCode){
  const data = loadCharLogData();
  const roleName = roleCode ? ROLE_NAMES[roleCode] : "（尚未選擇角色）";
  const motiveCode = game ? (game.motiveAssign||{})[state.memberId] : null;
  const myName = escapeHtml((state.members[state.memberId]||{}).name || "");
  const memberIds = Object.keys(state.members||{});
  const posterIdx = game ? game.posterSelected : null;
  const posterPhotoB64 = posterIdx ? await imgToBase64(`assets/posters/photo${posterIdx}.jpg`) : null;
  const posterStats = posterIdx ? POSTER_STATS[posterIdx] : null;

  // 關係語句（跟紀錄頁同一套邏輯）
  const relAssign = (game && game.relationshipAssign) || {};
  const relLines = [];
  if(motiveCode && relAssign[state.memberId]){
    const tmpls = MOTIVE_RELATIONSHIP_TEMPLATES[motiveCode] || [];
    const mine = relAssign[state.memberId];
    [["f1",0],["f2",1]].forEach(([key,i])=>{
      const targetId = mine[key];
      if(targetId && tmpls[i]){
        const targetRole = Object.keys(game.roleAssign||{}).find(c=>game.roleAssign[c]===targetId);
        const targetName = targetRole ? ROLE_NAMES[targetRole] : ((state.members[targetId]||{}).name||"");
        relLines.push(transformRelationshipText(tmpls[i], true, "", targetName));
      }
    });
  }
  if(game) memberIds.forEach(mid=>{
    if(mid===state.memberId) return;
    const theirMotive = (game.motiveAssign||{})[mid];
    const theirAssign = relAssign[mid];
    if(!theirMotive || !theirAssign) return;
    const tmpls = MOTIVE_RELATIONSHIP_TEMPLATES[theirMotive] || [];
    const speakerRole = Object.keys(game.roleAssign||{}).find(c=>game.roleAssign[c]===mid);
    const speakerName = speakerRole ? ROLE_NAMES[speakerRole] : ((state.members[mid]||{}).name||"");
    [["f1",0],["f2",1]].forEach(([key,i])=>{
      if(theirAssign[key]===state.memberId && tmpls[i]){
        relLines.push(transformRelationshipText(tmpls[i], false, speakerName, ""));
      }
    });
  });
  const relRows = relLines.length
    ? relLines.map(t=>`<div class="item"><div class="inote">${escapeHtml(t)}</div></div>`).join("")
    : `<div class="item"><div class="inote">（無）</div></div>`;

  // 認領的地點/嫌犯卡（含圖片）
  async function claimRows(claimsObj, notesKey){
    const mine = game ? Object.keys(claimsObj||{}).filter(c=>claimsObj[c]===state.memberId) : [];
    if(!mine.length) return `<div class="item"><div class="inote">（無）</div></div>`;
    const parts = [];
    for(const code of mine){
      const b64 = await imgToBase64(`assets/cards/${code}_face.jpg`);
      parts.push(`<div class="item" style="display:flex;gap:10px;align-items:flex-start;">
        ${b64?`<img src="${b64}" style="width:70px;border-radius:6px;flex-shrink:0;">`:""}
        <div><div class="iname">${code}</div><div class="inote">${escapeHtml((data[notesKey]||{})[code]||"")}</div></div>
      </div>`);
    }
    return parts.join("");
  }
  const locRows = await claimRows(game?game.locationClaims:{}, "locationCardNotes");
  const susRows = await claimRows(game?game.suspectClaims:{}, "suspectCardNotes");

  const posterSection = (posterPhotoB64 && posterStats) ? `
  <section>
    <h2>愛麗絲的失蹤海報</h2>
    <div class="poster-card" style="background:#e9e8e6;border:2px solid #2a2a2a;padding:14px 12px 16px;max-width:280px;margin:0 auto;">
      <div style="font-family:'Anton',sans-serif;font-size:26px;text-align:center;letter-spacing:1px;color:#2a2a2a;margin:2px 0 10px;text-transform:uppercase;">Missing Person</div>
      <div style="border:3px solid #2a2a2a;overflow:hidden;margin-bottom:10px;"><img src="${posterPhotoB64}" style="width:100%;display:block;"></div>
      <div style="font-family:'Anton',sans-serif;font-size:14px;text-align:center;color:#2a2a2a;margin-top:6px;">愛麗絲．布萊爾伍德（16 歲）</div>
      <div style="font-family:'Anton',sans-serif;font-size:10px;text-align:center;color:#2a2a2a;margin-bottom:8px;">自 12 月 19 日起失蹤</div>
      <div style="height:2px;background:#2a2a2a;margin:8px 0 10px;"></div>
      <div style="display:flex;gap:8px;font-family:'Anton',sans-serif;font-size:12px;line-height:1.7;color:#2a2a2a;">
        <div style="flex:1;">身高：${posterStats.height}<br>體重：${posterStats.weight}<br>頭髮：${posterStats.hair}<br>瞳色：${posterStats.eye}</div>
        <div style="flex:1;text-align:center;">若有任何線索<br>請撥打<br>(530) 207-0361</div>
      </div>
    </div>
  </section>` : "";

  return `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>角色紀錄</title>
<link href="https://fonts.googleapis.com/css2?family=Anton&display=swap" rel="stylesheet">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC",sans-serif; background:#f4f2f0; color:#1c1420; margin:0; padding:20px;}
  .wrap{max-width:680px; margin:0 auto;}
  header{margin-bottom:24px;}
  header h1{font-size:20px; margin:0 0 4px;}
  header .sub{font-size:13px; color:#6b5b68;}
  section{background:#fff; border-radius:14px; padding:16px 18px; margin-bottom:18px; box-shadow:0 1px 3px rgba(0,0,0,.06);}
  section h2{font-size:15px; margin:0 0 12px; padding-bottom:8px; border-bottom:1px solid #ece7e3; color:#1c1420;}
  .secret{font-size:14px; line-height:1.6; white-space:pre-wrap;}
  .item{margin:10px 0;}
  .item .iname{font-weight:700; font-size:13px; margin-bottom:2px;}
  .item .inote{font-size:13.5px; line-height:1.5; color:#3a2f36; white-space:pre-wrap;}
  footer{text-align:center; font-size:11px; color:#b4a9ae; margin-top:20px;}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>📝 角色紀錄</h1>
    <div class="sub">玩家：${myName}　角色：${escapeHtml(roleName)}　動機：${motiveCode||"（尚未抽取）"}　匯出時間：${new Date().toLocaleString()}</div>
  </header>
  ${posterSection}
  <section>
    <h2>我的秘密</h2>
    <div class="secret">${escapeHtml(data.secret||"（尚未填寫）")}</div>
  </section>
  <section>
    <h2>關係</h2>
    ${relRows}
  </section>
  <section>
    <h2>我認領的地點</h2>
    ${locRows}
  </section>
  <section>
    <h2>我認領的嫌犯</h2>
    ${susRows}
  </section>
  <footer>由密談室聊天網站匯出（此紀錄僅存在你自己的裝置上）</footer>
</div>
</body></html>`;
}

async function imgToBase64(url){
  try{
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise(resolve=>{
      const reader = new FileReader();
      reader.onloadend = ()=>resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }catch(e){ return null; }
}

$("btnExportCharlog").addEventListener("click", async ()=>{
  const roleCode = game ? Object.keys(game.roleAssign||{}).find(c=>game.roleAssign[c]===state.memberId) : null;
  toast("匯出中…");
  const html = await exportCharLogHtml(roleCode);
  const blob = new Blob([html], {type:"text/html;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `角色紀錄_${(state.members[state.memberId]||{}).name||"我"}_${Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("已匯出角色紀錄");
});

function mountCharLog(mount, roleCode){
  if(!mount) return;
  const data = loadCharLogData();

  const memberIds = Object.keys(state.members||{});
  const motiveCode = game ? (game.motiveAssign||{})[state.memberId] : null;
  const posterIdx = game ? game.posterSelected : null;
  // 「按下一步的同時，角色紀錄中才會顯示」：還在 roles 階段、且自己還沒按確認時，先不顯示角色/動機/秘密/關係
  const rolesRevealed = !game || game.phase !== "roles" || !!(game.phaseConfirm||{})[state.memberId] || PHASES.indexOf(game.phase) > PHASES.indexOf("roles");

  let html = `<div class="charlog-box">`;

  if(posterIdx){
    html += `<div class="charlog-sub" style="margin-top:0;">愛麗絲的失蹤海報</div>
      <div style="padding:4px 0 10px;">${renderPosterCard(posterIdx)}</div>`;
  }

  if(!rolesRevealed){
    html += `<div class="charlog-lock" style="padding:20px 10px;">🔒 請到「遊戲」頁籤完成角色、動機、秘密與關係分配，按下一步後這裡才會顯示。</div></div>`;
    mount.innerHTML = html;
    return;
  }

  html += `<div class="charlog-sub" style="margin-top:0;">你的角色</div>`;
  if(roleCode){
    html += `<div class="slot-row"><div class="card-slot large"><img src="${cardImg(roleCode,'face')}"><div class="cap" style="color:${ROLE_COLORS[roleCode]}; font-weight:700;">${ROLE_NAMES[roleCode]}</div></div></div>`;
  } else {
    html += `<div class="charlog-lock">尚未選擇角色</div>`;
  }

  html += `<div class="charlog-sub">你的動機</div>`;
  if(motiveCode){
    html += `<div class="slot-row"><div class="card-slot large"><img src="${cardImg(motiveCode,'face')}"><div class="cap">${motiveCode}</div></div></div>`;
  } else {
    html += `<div class="charlog-lock">尚未抽取動機</div>`;
  }

  html += `<div class="charlog-sub">我的秘密</div>
    <textarea data-clfield="secret" placeholder="寫下你的秘密…">${escapeHtml(data.secret||"")}</textarea>`;

  // 關係語句：我對別人說的 + 別人對我說的
  const relAssign = (game && game.relationshipAssign) || {};
  const outgoing = [];
  const incoming = [];
  if(motiveCode && relAssign[state.memberId]){
    const tmpls = MOTIVE_RELATIONSHIP_TEMPLATES[motiveCode] || [];
    const mine = relAssign[state.memberId];
    [["f1",0],["f2",1]].forEach(([key,i])=>{
      const targetId = mine[key];
      if(targetId && tmpls[i]){
        const targetRole = Object.keys(game.roleAssign||{}).find(c=>game.roleAssign[c]===targetId);
        const targetName = targetRole ? ROLE_NAMES[targetRole] : ((state.members[targetId]||{}).name||"");
        outgoing.push(transformRelationshipText(tmpls[i], true, "", targetName));
      }
    });
  }
  memberIds.forEach(mid=>{
    if(mid===state.memberId) return;
    const theirMotive = (game.motiveAssign||{})[mid];
    const theirAssign = relAssign[mid];
    if(!theirMotive || !theirAssign) return;
    const tmpls = MOTIVE_RELATIONSHIP_TEMPLATES[theirMotive] || [];
    const speakerRole = Object.keys(game.roleAssign||{}).find(c=>game.roleAssign[c]===mid);
    const speakerName = speakerRole ? ROLE_NAMES[speakerRole] : ((state.members[mid]||{}).name||"");
    [["f1",0],["f2",1]].forEach(([key,i])=>{
      if(theirAssign[key]===state.memberId && tmpls[i]){
        incoming.push(transformRelationshipText(tmpls[i], false, speakerName, ""));
      }
    });
  });

  if(outgoing.length || incoming.length){
    html += `<div class="charlog-sub">關係</div>`;
    outgoing.forEach(t=> html += `<div class="charlog-item"><div class="inote">${escapeHtml(t)}</div></div>`);
    incoming.forEach(t=> html += `<div class="charlog-item"><div class="inote">${escapeHtml(t)}</div></div>`);
  }

  // 認領的地點卡
  const myLocs = Object.keys(game.locationClaims||{}).filter(c=>game.locationClaims[c]===state.memberId);
  if(myLocs.length){
    html += `<div class="charlog-sub">我認領的地點</div>`;
    myLocs.forEach(code=>{
      html += `<div class="charlog-item">
        <div class="slot-row"><div class="card-slot"><img src="${cardImg(code,'face')}"><div class="cap">${code}</div></div></div>
        <div class="inote">${escapeHtml((data.locationCardNotes||{})[code]||"")}</div></div>`;
    });
  }
  // 認領的嫌犯卡
  const mySus = Object.keys(game.suspectClaims||{}).filter(c=>game.suspectClaims[c]===state.memberId);
  if(mySus.length){
    html += `<div class="charlog-sub">我認領的嫌犯</div>`;
    mySus.forEach(code=>{
      html += `<div class="charlog-item">
        <div class="slot-row"><div class="card-slot"><img src="${cardImg(code,'face')}"><div class="cap">${code}</div></div></div>
        <div class="inote">${escapeHtml((data.suspectCardNotes||{})[code]||"")}</div></div>`;
    });
  }

  html += `</div>`;
  mount.innerHTML = html;

  mount.querySelector('[data-clfield="secret"]').addEventListener("input", e=>{
    const d = loadCharLogData(); d.secret = e.target.value; saveCharLogData(d);
  });
  mount.querySelectorAll("[data-clloc]").forEach(el=>{
    el.addEventListener("input", ()=>{
      const d = loadCharLogData(); d.locNotes = d.locNotes||{};
      d.locNotes[el.dataset.clloc] = el.value; saveCharLogData(d);
    });
  });
  mount.querySelectorAll("[data-clppl]").forEach(el=>{
    el.addEventListener("input", ()=>{
      const d = loadCharLogData(); d.peopleNotes = d.peopleNotes||{};
      d.peopleNotes[el.dataset.clppl] = el.value; saveCharLogData(d);
    });
  });
}

let dueInterval = null;
function startDueChecker(){
  stopDueChecker();
  dueInterval = setInterval(checkDue, 1000);
  checkDue();
}
function stopDueChecker(){
  if(dueInterval){ clearInterval(dueInterval); dueInterval = null; }
  document.querySelectorAll(".timer-display, .timer-bar").forEach(el=>el.classList.remove("due"));
}
function checkDue(){
  if(!game || typeof remainingSeconds !== "function") return;
  const remainMin = remainingSeconds() / 60;
  let due = false;
  TIMER_GROUPS.forEach(g=>{
    const drawn = (game.timerSlotDraw||{})[g.key] && (game.timerSlotDraw||{})[g.key].drawn;
    if(!drawn && remainMin <= parseInt(g.label,10)) due = true;
  });
  if(!(game.finalDraw && game.finalDraw.code) && remainMin <= 10) due = true;
  document.querySelectorAll(".timer-display, .timer-bar").forEach(el=>el.classList.toggle("due", due));
}

function getDisplayName(memberId){
  if(!game) return null;
  const code = Object.keys(game.roleAssign||{}).find(c=>game.roleAssign[c]===memberId);
  return code ? ROLE_NAMES[code] : null;
}

window.GameModule = { onRoomEnter, onRoomLeave, onMembersChanged, getDisplayName };

})();
