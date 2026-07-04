/*
  ⚠️ 這個檔案只有「房主」需要編輯一次，其他玩家完全不用碰。

  怎麼用：
  1. 照 README.md 的步驟去 Firebase 申請專案、建立 Realtime Database。
  2. 把 Firebase 主控台給你的 firebaseConfig 整段貼到下面（取代 null）。
  3. 存檔後，把整個網站資料夾重新上傳到 GitHub（Commit + Push）。
  4. 之後所有玩家只要打開你的網站網址，就能直接輸入暱稱、建立或加入房間，
     完全不需要自己貼任何設定、也不需要下載這包檔案。

  範例（把 null 換成像這樣的物件）：

  window.FIREBASE_CONFIG = {
    apiKey: "AIzaSy...",
    authDomain: "your-project.firebaseapp.com",
    databaseURL: "https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "your-project"
  };

  如果暫時留著 null，網站會自動退回「每個人自己貼設定」的模式（跟之前一樣），
  方便你自己先測試用。
*/
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBspuH0hLXQBH8FNDA1M20CnJgUxSm1YNk",
  authDomain: "alice-is-missing-7183a.firebaseapp.com",
  databaseURL: "https://alice-is-missing-7183a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "alice-is-missing-7183a",
  storageBucket: "alice-is-missing-7183a.firebasestorage.app",
  messagingSenderId: "1080641088440",
  appId: "1:1080641088440:web:4dac47ac4c5ed7f331bd4d",
  measurementId: "G-TWD726VWTX"
};
