/* =========================================================
   密談室 app.js
   純前端 + Firebase Realtime Database（可部署於 GitHub Pages）
   ========================================================= */

const TIMER_DURATION_SEC = 90 * 60; // 1.5 小時，固定不可調整
const AVATAR_COLORS = ["#D9527A","#7C6A92","#D9A441","#5B7B9C","#8A4F66","#8A7B4F"];
const MAX_MEMBERS = 5;

let db = null;
let state = {
  memberId: null,
  memberName: null,
  roomId: null,
  members: {},
  currentChannel: "group", // 'group' | 'ooc' | <otherMemberId for DM>
  timer: { startedAt: null, running: false, duration: TIMER_DURATION_SEC },
};

let membersRef = null, timerRef = null, activeMsgRef = null, activeMsgHandler = null;
let tickInterval = null;

/* ---------- Utilities ---------- */
function $(id){ return document.getElementById(id); }
function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._tm);
  toast._tm = setTimeout(()=>t.classList.remove("show"), 2200);
}
function fmtTime(totalSec){
  totalSec = Math.max(0, Math.round(totalSec));
  const m = String(Math.floor(totalSec/60)).padStart(2,"0");
  const s = String(totalSec%60).padStart(2,"0");
  return `${m}:${s}`;
}
function fmtClock(ts){
  if(!ts) return "";
  const d = new Date(ts);
  return d.getHours().toString().padStart(2,"0")+":"+d.getMinutes().toString().padStart(2,"0");
}
function randRoomCode(){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 避免易混淆字元
  let out = "";
  for(let i=0;i<6;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}
function randMemberId(){
  return "m_" + Math.random().toString(36).slice(2,10);
}
function colorFor(memberId){
  let hash = 0;
  for(const c of memberId) hash = (hash*31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function escapeHtml(str){
  return str.replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}
function dmKey(a,b){ return [a,b].sort().join("__"); }

/* ---------- Firebase connection ---------- */
function loadSavedFbConfig(){
  const raw = localStorage.getItem("fbConfig");
  if(!raw) return null;
  try{ return JSON.parse(raw); }catch(e){ return null; }
}

function initFirebase(configObj){
  try{
    if(firebase.apps.length){ firebase.app().delete().catch(()=>{}); }
  }catch(e){}
  try{
    firebase.initializeApp(configObj);
    db = firebase.database();
    setFbStatus("wait", "連線中…");
    const connRef = db.ref(".info/connected");
    connRef.on("value", snap=>{
      if(snap.val() === true){
        setFbStatus("ok", "已連線 ✔ 可以建立或加入房間了");
      } else {
        setFbStatus("wait", "連線中…");
      }
    });
    return true;
  }catch(e){
    setFbStatus("err", "設定格式錯誤：" + e.message);
    return false;
  }
}

function setFbStatus(kind, text){
  const el = $("fbStatus");
  el.className = "status-line status-" + kind;
  el.textContent = text;
}

function parseFirebaseConfigInput(raw){
  let text = raw.trim();
  // 去掉 "const firebaseConfig = " / "export default" 之類的前綴
  text = text.replace(/^\s*(export\s+default\s+|const\s+\w+\s*=\s*|let\s+\w+\s*=\s*|var\s+\w+\s*=\s*)/,"");
  // 去掉結尾多餘的分號
  text = text.replace(/;\s*$/,"");
  // 先試著當標準 JSON 解析
  try{ return JSON.parse(text); }catch(e){}
  // 再試著當一般 JS 物件字面量解析（Firebase 主控台複製出來的欄位名稱通常沒加引號）
  try{
    const fn = new Function("return (" + text + ")");
    const obj = fn();
    if(obj && typeof obj === "object") return obj;
  }catch(e){}
  return null;
}

$("btnSaveFb").addEventListener("click", ()=>{
  const raw = $("fbConfigInput").value.trim();
  if(!raw){ setFbStatus("err","請貼上 firebaseConfig"); return; }
  const obj = parseFirebaseConfigInput(raw);
  if(!obj){ setFbStatus("err","格式看不懂，請確認整段從 { 到 } 都有貼到"); return; }
  if(!obj.databaseURL){ setFbStatus("err","這段設定裡沒有 databaseURL，請先在 Firebase 建立 Realtime Database 後再重新複製一次設定"); return; }
  localStorage.setItem("fbConfig", JSON.stringify(obj));
  if(initFirebase(obj)){
    $("fbDetails").removeAttribute("open");
  }
});

/* ---------- Room: create / join / leave ---------- */
$("btnCreateRoom").addEventListener("click", async ()=>{
  if(!requireDb()) return;
  const name = $("nicknameInput").value.trim();
  if(!name){ showRoomStatus("err","請先輸入暱稱"); return; }
  const code = randRoomCode();
  const memberId = randMemberId();
  try{
    // 保險起見，先把這個房號底下所有舊資料清空，確保每次開新房間都是全新的，不會殘留上一次的聊天紀錄
    await db.ref(`rooms/${code}`).remove();
    await db.ref(`rooms/${code}/meta`).set({
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      hostId: memberId
    });
    await db.ref(`rooms/${code}/members/${memberId}`).set({
      name, joinedAt: firebase.database.ServerValue.TIMESTAMP
    });
    await db.ref(`rooms/${code}/timer`).set({ startedAt:null, running:false, duration:TIMER_DURATION_SEC });
    enterRoom(code, memberId, name);
    toast("房間已建立："+code);
  }catch(e){
    showRoomStatus("err","建立失敗："+e.message);
  }
});

$("btnJoinRoom").addEventListener("click", async ()=>{
  if(!requireDb()) return;
  const name = $("nicknameInput").value.trim();
  const code = $("roomCodeInput").value.trim().toUpperCase();
  if(!name){ showRoomStatus("err","請先輸入暱稱"); return; }
  if(!code || code.length < 4){ showRoomStatus("err","請輸入正確的房間代碼"); return; }
  try{
    const metaSnap = await db.ref(`rooms/${code}/meta`).get();
    if(!metaSnap.exists()){ showRoomStatus("err","找不到這個房間，請確認代碼"); return; }
    const membersSnap = await db.ref(`rooms/${code}/members`).get();
    const currentMembers = membersSnap.val() || {};
    if(Object.keys(currentMembers).length >= MAX_MEMBERS){
      showRoomStatus("err","房間已滿（最多 5 人）"); return;
    }
    const memberId = randMemberId();
    await db.ref(`rooms/${code}/members/${memberId}`).set({
      name, joinedAt: firebase.database.ServerValue.TIMESTAMP
    });
    enterRoom(code, memberId, name);
    toast("已加入房間："+code);
  }catch(e){
    showRoomStatus("err","加入失敗："+e.message);
  }
});

$("btnLeaveRoom").addEventListener("click", async ()=>{
  if(state.roomId && state.memberId && db){
    try{ await db.ref(`rooms/${state.roomId}/members/${state.memberId}`).remove(); }catch(e){}
  }
  detachAll();
  localStorage.removeItem("roomSession");
  state.roomId = null; state.memberId = null; state.memberName = null; state.members = {};
  $("roomJoinedBlock").style.display = "none";
  $("roomJoinBlock").style.display = "block";
  $("gamePanel").style.display = "none";
  $("roomPill").textContent = "尚未加入房間";
  $("msgGate").style.display = "flex";
  $("msgContent").style.display = "none";
  if(window.GameModule) window.GameModule.onRoomLeave();
  showRoomStatus("wait","已離開房間");
});

function requireDb(){
  if(!db){
    showRoomStatus("err","請先完成上方「連線設定」");
    $("fbDetails").setAttribute("open","");
    return false;
  }
  return true;
}
function showRoomStatus(kind,text){
  const el = $("roomStatus");
  el.style.display = "flex";
  el.className = "status-line status-"+kind;
  el.textContent = text;
}

function enterRoom(roomId, memberId, name){
  state.roomId = roomId; state.memberId = memberId; state.memberName = name;
  localStorage.setItem("roomSession", JSON.stringify({roomId, memberId, name}));

  $("roomJoinBlock").style.display = "none";
  $("roomJoinedBlock").style.display = "block";
  $("roomCodeDisplay").textContent = roomId;
  $("roomPill").textContent = roomId;
  $("gamePanel").style.display = "block";
  $("msgGate").style.display = "none";
  $("msgContent").style.display = "flex";

  attachMembers();
  attachTimer();
  switchChannel("group");
  startTicker();
  if(window.GameModule) window.GameModule.onRoomEnter();
}

/* ---------- Members ---------- */
function attachMembers(){
  membersRef = db.ref(`rooms/${state.roomId}/members`);
  membersRef.on("value", snap=>{
    state.members = snap.val() || {};
    renderMembers();
    renderChannelStrip();
    if(window.GameModule) window.GameModule.onMembersChanged();
  });
}
function renderMembers(){
  const list = $("memberList");
  list.innerHTML = "";
  const ids = Object.keys(state.members);
  $("memberCount").textContent = ids.length;
  ids.forEach(id=>{
    const m = state.members[id];
    const row = document.createElement("div");
    row.className = "member-row";
    row.innerHTML = `
      <div class="avatar" style="background:${colorFor(id)}">${escapeHtml((m.name||"?")[0])}</div>
      <div class="name">${escapeHtml(m.name||"未命名")}</div>
      ${id===state.memberId ? '<span class="you-tag">你</span>' : ''}
    `;
    list.appendChild(row);
  });
}

/* ---------- Channels (group / dm / ooc) ---------- */
function renderChannelStrip(){
  const list = $("channelDrawerList");
  if(!list) return;
  list.innerHTML = "";
  list.appendChild(makeChannelItem("group", "群組", "#"));
  Object.keys(state.members).forEach(id=>{
    if(id === state.memberId) return;
    const m = state.members[id];
    const displayName = displayNameFor(id, "group"); // DM 也算場內，用角色名稱
    const item = makeChannelItem(id, displayName, "@");
    const avatar = document.createElement("div");
    avatar.className = "dm-avatar";
    avatar.style.background = colorFor(id);
    avatar.textContent = (displayName||"?")[0];
    item.insertBefore(avatar, item.firstChild);
    list.appendChild(item);
  });
  updateCurrentChannelLabel();
}
function makeChannelItem(key, label, prefix){
  const item = document.createElement("div");
  item.className = "channel-item" + (state.currentChannel===key ? " active":"");
  item.innerHTML = `<span class="hash">${prefix}</span> ${escapeHtml(label)}`;
  item.addEventListener("click", ()=>{
    switchChannel(key);
    closeChannelDrawer();
  });
  return item;
}
function updateCurrentChannelLabel(){
  const label = $("currentChannelName");
  if(!label) return;
  if(state.currentChannel === "group") label.textContent = "# 群組";
  else if(state.currentChannel === "ooc") label.textContent = "🗯 場外";
  else label.textContent = "@ " + displayNameFor(state.currentChannel, "group");
}
function openChannelDrawer(){
  $("channelDrawer").classList.add("open");
  $("drawerBackdrop").classList.add("open");
}
function closeChannelDrawer(){
  $("channelDrawer").classList.remove("open");
  $("drawerBackdrop").classList.remove("open");
}
$("btnChannelMenu").addEventListener("click", openChannelDrawer);
$("drawerBackdrop").addEventListener("click", closeChannelDrawer);

function switchChannel(key){
  state.currentChannel = key;
  renderChannelStrip(); // 重建清單以反映目前選取的頻道
  const msgsView = $("view-messages");
  const oocBtn = $("btnOoc");
  if(key === "ooc"){
    msgsView.classList.add("ooc-mode");
    oocBtn.classList.add("ooc-active");
  } else {
    msgsView.classList.remove("ooc-mode");
    oocBtn.classList.remove("ooc-active");
  }
  attachMessages(key);
  updateComposerLock();
}

function channelPath(key){
  if(key === "group") return `rooms/${state.roomId}/messages/group`;
  if(key === "ooc") return `rooms/${state.roomId}/messages/ooc`;
  return `rooms/${state.roomId}/messages/dm/${dmKey(state.memberId, key)}`;
}

function attachMessages(key){
  if(activeMsgRef && activeMsgHandler){ activeMsgRef.off("value", activeMsgHandler); }
  activeMsgRef = db.ref(channelPath(key)).limitToLast(300);
  activeMsgHandler = snap=>{
    renderMessages(snap.val() || {});
  };
  activeMsgRef.on("value", activeMsgHandler);
}

function renderMessages(msgsObj){
  const scroll = $("messagesScroll");
  const list = Object.values(msgsObj).sort((a,b)=>(a.ts||0)-(b.ts||0));
  if(list.length === 0){
    scroll.innerHTML = `<div class="empty-state">還沒有訊息，說點什麼吧！</div>`;
    return;
  }
  let html = "";
  let lastSender = null;
  let lastTs = 0;
  list.forEach(msg=>{
    const isMe = msg.sender === state.memberId;
    // 同一人在 5 分鐘內連續發言，省略重複的頭像／名字（Discord 風格分組）
    const compact = (msg.sender === lastSender) && (msg.ts - lastTs < 5*60*1000);
    if(compact){
      html += `<div class="msg-row compact"><div class="msg-text">${escapeHtml(msg.text||"")}</div></div>`;
    } else {
      html += `
        <div class="msg-row">
          <div class="msg-avatar" style="background:${colorFor(msg.sender)}">${escapeHtml((msg.senderName||"?")[0])}</div>
          <div class="msg-body">
            <div class="msg-headline">
              <span class="sender ${isMe?'me':''}">${escapeHtml(msg.senderName||"")}</span>
              <span class="time">${fmtClock(msg.ts)}</span>
            </div>
            <div class="msg-text">${escapeHtml(msg.text||"")}</div>
          </div>
        </div>`;
    }
    lastSender = msg.sender;
    lastTs = msg.ts;
  });
  scroll.innerHTML = html;
  scroll.scrollTop = scroll.scrollHeight;
}

/* ---------- Sending ---------- */
$("btnSend").addEventListener("click", sendMessage);
$("msgInput").addEventListener("keydown", e=>{
  if(e.key === "Enter" && !e.shiftKey){
    e.preventDefault();
    sendMessage();
  }
});
$("msgInput").addEventListener("input", function(){
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 100) + "px";
});

function isInSceneLocked(){
  // 場外不受限制；場內（群組、私訊）要等計時器開始才能發言
  if(state.currentChannel === "ooc") return false;
  return !(state.timer && state.timer.running);
}

function updateComposerLock(){
  const locked = isInSceneLocked();
  const input = $("msgInput");
  const btn = $("btnSend");
  input.disabled = locked;
  btn.disabled = locked;
  input.placeholder = locked ? "⏳ 計時開始後才能在場內發言…" : "輸入訊息…";
}

function displayNameFor(memberId, channelKey){
  if(channelKey !== "ooc" && window.GameModule){
    const roleName = window.GameModule.getDisplayName(memberId);
    if(roleName) return roleName;
  }
  return (state.members[memberId]||{}).name || memberId;
}

function sendMessage(){
  const input = $("msgInput");
  const text = input.value.trim();
  if(!text || !state.roomId) return;
  if(isInSceneLocked()){ toast("計時開始後才能在場內發言"); return; }
  const path = channelPath(state.currentChannel);
  db.ref(path).push({
    sender: state.memberId,
    senderName: displayNameFor(state.memberId, state.currentChannel),
    text,
    ts: firebase.database.ServerValue.TIMESTAMP
  });
  input.value = "";
  input.style.height = "auto";
}

/* ---------- Timer ---------- */
function attachTimer(){
  timerRef = db.ref(`rooms/${state.roomId}/timer`);
  timerRef.on("value", snap=>{
    const v = snap.val();
    if(v) state.timer = v;
    updateTimerUI();
  });
}
function startGameTimer(){
  if(!state.roomId) return;
  db.ref(`rooms/${state.roomId}/timer`).set({
    startedAt: firebase.database.ServerValue.TIMESTAMP,
    running: true,
    duration: TIMER_DURATION_SEC
  });
}


function remainingSeconds(){
  const t = state.timer;
  if(!t || !t.running || !t.startedAt) return t?.duration ?? TIMER_DURATION_SEC;
  const elapsed = (Date.now() - t.startedAt) / 1000;
  return (t.duration ?? TIMER_DURATION_SEC) - elapsed;
}

function updateTimerUI(){
  if(!state.timer){ return; }
  const remain = remainingSeconds();
  const text = fmtTime(remain);
  const warn = remain <= 300; // 最後5分鐘警示
  $("chatTimerDisplay").textContent = text;
  $("timerBar").classList.toggle("warn", warn);

  const settingsDisplay = $("settingsTimerDisplay");
  if(settingsDisplay){
    settingsDisplay.textContent = text;
    settingsDisplay.classList.toggle("warn", warn);
  }
  const settingsSub = $("settingsTimerSub");
  if(settingsSub){
    if(!state.timer.running) settingsSub.textContent = "尚未開始計時";
    else if(remain <= 0) settingsSub.textContent = "⏰ 時間到！";
    else settingsSub.textContent = "計時中…";
  }

  updateComposerLock();
}

function startTicker(){
  if(tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(updateTimerUI, 1000);
}

/* ---------- OOC & Export ---------- */
$("btnOoc").addEventListener("click", ()=>{
  if(state.currentChannel === "ooc"){
    switchChannel("group"); // 再按一次回到群組聊天
  } else {
    switchChannel("ooc");
  }
});

function exportMsgBlockHtml(m){
  const time = m.ts ? new Date(m.ts).toLocaleString() : "";
  const color = colorFor(m.sender);
  return `<div class="msg">
    <div class="avatar" style="background:${color}">${escapeHtml((m.senderName||"?")[0])}</div>
    <div class="msg-body">
      <div class="meta"><span class="who" style="color:${color}">${escapeHtml(m.senderName||"")}</span><span class="time">${time}</span></div>
      <div class="text">${escapeHtml(m.text||"").replace(/\n/g,"<br>")}</div>
    </div>
  </div>`;
}

function buildExportHtml({title, subtitle, sections}){
  const sectionsHtml = sections.map(sec=>{
    const body = sec.messages.length
      ? sec.messages.map(m=>exportMsgBlockHtml(m)).join("\n")
      : `<div class="empty">（沒有訊息）</div>`;
    return `<section>
      <h2>${escapeHtml(sec.label)}</h2>
      ${body}
    </section>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC",sans-serif; background:#f4f2f0; color:#1c1420; margin:0; padding:20px;}
  .wrap{max-width:680px; margin:0 auto;}
  header{margin-bottom:24px;}
  header h1{font-size:20px; margin:0 0 4px;}
  header .sub{font-size:13px; color:#6b5b68;}
  section{background:#fff; border-radius:14px; padding:16px 18px; margin-bottom:18px; box-shadow:0 1px 3px rgba(0,0,0,.06);}
  section h2{font-size:15px; margin:0 0 12px; padding-bottom:8px; border-bottom:1px solid #ece7e3; color:#1c1420;}
  .msg{display:flex; gap:10px; margin:12px 0;}
  .msg .avatar{width:32px; height:32px; border-radius:50%; flex-shrink:0; color:#fff; font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center;}
  .msg-body{flex:1; min-width:0;}
  .msg .meta{font-size:12px; margin-bottom:2px; display:flex; gap:8px; align-items:baseline;}
  .msg .who{font-weight:700;}
  .msg .time{color:#a89ba0; font-size:11px;}
  .msg .text{font-size:14px; line-height:1.6; white-space:pre-wrap; word-break:break-word;}
  .empty{color:#b4a9ae; font-size:13px; padding:6px 0;}
  footer{text-align:center; font-size:11px; color:#b4a9ae; margin-top:20px;}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="sub">${escapeHtml(subtitle)}</div>
  </header>
  ${sectionsHtml}
  <footer>由密談室聊天網站匯出</footer>
</div>
</body></html>`;
}

window.exportInSceneLog = async function(){
  if(!state.roomId || !db) return;
  const remain = (typeof remainingSeconds === "function") ? remainingSeconds() : 1;
  if(remain > 0){ toast("要等計時歸零（0:00）才能匯出全部紀錄"); return; }
  toast("匯出中…");
  try{
    const allSnap = await db.ref(`rooms/${state.roomId}/messages`).get();
    const all = allSnap.val() || {};
    const sortedMsgs = obj => Object.values(obj||{}).sort((a,b)=>(a.ts||0)-(b.ts||0));

    const sections = [{ label:"群組", messages: sortedMsgs(all.group) }];
    if(all.dm){
      Object.keys(all.dm).forEach(pairKey=>{
        const ids = pairKey.split("__");
        const names = ids.map(id=> (state.members[id]?.name) || id);
        sections.push({ label:`私訊：${names.join(" ↔ ")}`, messages: sortedMsgs(all.dm[pairKey]) });
      });
    }
    const html = buildExportHtml({
      title: "密談室【場內】完整聊天紀錄",
      subtitle: `房間代碼：${state.roomId}　匯出時間：${new Date().toLocaleString()}　（不含場外討論，含全員群組與所有私訊）`,
      sections
    });

    const blob = new Blob([html], {type:"text/html;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `密談室紀錄_場內_${state.roomId}_${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("已匯出全部場內紀錄");
  }catch(e){
    toast("匯出失敗："+e.message);
  }
};

/* ---------- Tab switching ---------- */
document.querySelectorAll(".tabbtn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tabbtn").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
    btn.classList.add("active");
    $("view-"+btn.dataset.tab).classList.add("active");
  });
});

/* ---------- Cleanup ---------- */
function detachAll(){
  if(membersRef) membersRef.off();
  if(timerRef) timerRef.off();
  if(activeMsgRef && activeMsgHandler) activeMsgRef.off("value", activeMsgHandler);
  if(tickInterval) clearInterval(tickInterval);
}

/* ---------- Boot ---------- */
function tryAutoRejoinSession(){
  const savedSession = localStorage.getItem("roomSession");
  if(!savedSession) return;
  try{
    const {roomId, memberId, name} = JSON.parse(savedSession);
    setTimeout(async ()=>{
      try{
        const memberSnap = await db.ref(`rooms/${roomId}/members/${memberId}`).get();
        if(memberSnap.exists()){
          $("nicknameInput").value = name;
          enterRoom(roomId, memberId, name);
          toast("已自動重新連接房間 " + roomId);
        } else {
          localStorage.removeItem("roomSession");
        }
      }catch(e){}
    }, 600);
  }catch(e){}
}

(function boot(){
  // 情況一：房主已經把 Firebase 設定寫進 firebase-config.js，內建好了
  // 這樣一般玩家完全不用管「連線設定」，打開網站就能直接建立/加入房間
  const embedded = window.FIREBASE_CONFIG;
  if(embedded && embedded.databaseURL){
    $("fbCard").style.display = "none"; // 整張卡片隱藏，玩家不需要看到
    const roomNum = document.querySelector("#roomCard .num");
    if(roomNum) roomNum.textContent = "1";
    initFirebase(embedded);
    tryAutoRejoinSession();
    return;
  }

  // 情況二：還沒內建設定 → 退回原本「每個人自己貼一次」的模式（開發/測試用，或房主自行測試時）
  const savedConfig = loadSavedFbConfig();
  if(savedConfig){
    $("fbConfigInput").value = JSON.stringify(savedConfig, null, 2);
    initFirebase(savedConfig);
    tryAutoRejoinSession();
  } else {
    $("fbDetails").setAttribute("open","");
  }
})();
