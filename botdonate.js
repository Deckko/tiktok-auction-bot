require("dotenv").config();
const admin = require("firebase-admin");
const { WebcastPushConnection } = require("tiktok-live-connector");

// ================== FIREBASE SETUP ==================
let serviceAccount;

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ Không tìm thấy biến FIREBASE_SERVICE_ACCOUNT trong môi trường.");
  process.exit(1);
}

try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (err) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT không phải JSON hợp lệ:", err);
  process.exit(1);
}

if (!process.env.FIREBASE_DB_URL) {
  console.error("❌ Không tìm thấy biến FIREBASE_DB_URL.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DB_URL,
});

const db = admin.database();

// ================== TIKTOK SETUP ==================
const tiktokUsername = process.env.TIKTOK_USERNAME;

if (!tiktokUsername) {
  console.error("❌ Không tìm thấy biến TIKTOK_USERNAME.");
  process.exit(1);
}

const tiktokConnection = new WebcastPushConnection(tiktokUsername);

// ================== MAIN LOGIC ==================
console.log("🚀 Bot đang khởi động...");

tiktokConnection.connect()
  .then(state => {
    console.log(`✅ Đã kết nối TikTok: ${state.roomId}`);
  })
  .catch(err => {
    console.error("❌ Không kết nối được TikTok:", err);
    process.exit(1);
  });

// Khi có donate (gift)
tiktokConnection.on("gift", async data => {
  try {
    const username = data.uniqueId;
    const giftName = data.giftName;
    const giftCount = data.repeatCount;
    const giftValue = data.diamondCount * giftCount;

    console.log(`🎁 ${username} gửi ${giftCount} ${giftName} (${giftValue} xu)`);

    const ref = db.ref("donations").push();
    await ref.set({
      username,
      giftName,
      giftCount,
      giftValue,
      timestamp: Date.now()
    });

    console.log("✅ Đã lưu vào Firebase.");
  } catch (err) {
    console.error("❌ Lỗi khi lưu donation:", err);
  }
});

// Khi có comment
tiktokConnection.on("chat", data => {
  console.log(`💬 ${data.uniqueId}: ${data.comment}`);
});

// Khi có follow
tiktokConnection.on("follow", data => {
  console.log(`➕ ${data.uniqueId} đã follow!`);
});

// Giữ bot sống 24/7 (Railway cần process không thoát)
setInterval(() => {
  console.log("🟢 Bot vẫn đang chạy...");
}, 60 * 1000);
