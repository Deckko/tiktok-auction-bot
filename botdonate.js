// =============================
// TikTok Auction Bot - VIP Stable Version
// Author: Deckko
// =============================

require("dotenv").config();
const { WebcastPushConnection } = require("tiktok-live-connector");
const admin = require("firebase-admin");
const path = require("path");

// =============================
// 🔐 FIREBASE INIT (FILE JSON)
// =============================
let serviceAccount;
try {
  const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
  serviceAccount = require(serviceAccountPath);
} catch (err) {
  console.error("❌ Không đọc được file serviceAccountKey.json:", err.message);
  process.exit(1);
}

if (!process.env.FIREBASE_DB_URL) {
  console.error("❌ Thiếu biến FIREBASE_DB_URL trong file .env");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DB_URL,
});

const db = admin.database();

// =============================
// ⚙️ CONFIG
// =============================
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;
const RECONNECT_DELAY = 15000;
const OFFLINE_RETRY_DELAY = 30000;

if (!TIKTOK_USERNAME) {
  console.error("❌ Thiếu biến TIKTOK_USERNAME trong file .env");
  process.exit(1);
}

let connection = null;
let isConnecting = false;

// =============================
// 🧠 HELPER FUNCTIONS
// =============================
async function logEvent(type, data) {
  try {
    const ref = db.ref("logs").push();
    await ref.set({
      type,
      data,
      time: Date.now(),
    });
  } catch (err) {
    console.error("⚠️ Lỗi ghi log Firebase:", err.message);
  }
}

async function saveGift(data) {
  try {
    const ref = db.ref("gifts").push();
    await ref.set({
      user: data.uniqueId || "unknown",
      giftId: data.giftId || null,
      giftName: data.giftName || "unknown",
      repeatCount: data.repeatCount || 1,
      diamondCount: data.diamondCount || 0,
      totalDiamond: (data.diamondCount || 0) * (data.repeatCount || 1),
      time: Date.now(),
    });
  } catch (err) {
    console.error("⚠️ Lỗi lưu gift Firebase:", err.message);
  }
}

async function updateAuction(data) {
  try {
    const auctionRef = db.ref("auction/current");

    const snapshot = await auctionRef.once("value");
    const auction = snapshot.val() || {
      highestBid: 0,
      highestBidder: null,
      lastGift: null,
    };

    const giftValue = (data.diamondCount || 0) * (data.repeatCount || 1);

    if (giftValue > auction.highestBid) {
      const newAuction = {
        highestBid: giftValue,
        highestBidder: data.uniqueId || "unknown",
        lastGift: data.giftName || "unknown",
        updatedAt: Date.now(),
      };
      await auctionRef.set(newAuction);
      console.log("🏆 CÓ GIÁ ĐẤU MỚI:", newAuction);
      await logEvent("NEW_HIGHEST_BID", newAuction);
    }
  } catch (err) {
    console.error("⚠️ Lỗi cập nhật đấu giá:", err.message);
  }
}

// =============================
// 🚀 BOT CORE
// =============================
async function startBot() {
  if (isConnecting) return;
  isConnecting = true;

  console.log("🚀 Bot đang khởi động...");
  await logEvent("BOT_STARTING", { user: TIKTOK_USERNAME });

  connection = new WebcastPushConnection(TIKTOK_USERNAME, {
    enableExtendedGiftInfo: true,
    requestPollingIntervalMs: 2000,
  });

  try {
    const state = await connection.connect();
    console.log(`✅ Đã kết nối TikTok: roomId=${state.roomId}`);
    await logEvent("CONNECTED", state);
    isConnecting = false;
  } catch (err) {
    console.error("❌ Không kết nối được TikTok:", err.message);
    await logEvent("CONNECT_FAILED", { error: err.message });

    console.log(`⏳ Thử lại sau ${OFFLINE_RETRY_DELAY / 1000}s...`);
    isConnecting = false;
    setTimeout(startBot, OFFLINE_RETRY_DELAY);
    return;
  }

  // =============================
  // 🎁 EVENT: GIFT
  // =============================
  connection.on("gift", async (data) => {
    console.log(
      `🎁 ${data.uniqueId} gửi ${data.giftName} x${data.repeatCount} (${data.diamondCount}💎)`
    );

    await saveGift(data);
    await updateAuction(data);
    await logEvent("GIFT_RECEIVED", data);
  });

  // =============================
  // 💬 EVENT: CHAT
  // =============================
  connection.on("chat", async (data) => {
    console.log(`💬 ${data.uniqueId}: ${data.comment}`);
    await logEvent("CHAT", data);
  });

  // =============================
  // 👥 EVENT: MEMBER JOIN
  // =============================
  connection.on("member", async (data) => {
    console.log(`👋 ${data.uniqueId} đã vào phòng`);
    await logEvent("MEMBER_JOIN", data);
  });

  // =============================
  // ⚠️ EVENT: DISCONNECTED
  // =============================
  connection.on("disconnected", async () => {
    console.log("⚠️ Mất kết nối TikTok. Đang reconnect...");
    await logEvent("DISCONNECTED", {});
    setTimeout(startBot, RECONNECT_DELAY);
  });

  // =============================
  // ❌ EVENT: ERROR
  // =============================
  connection.on("error", async (err) => {
    console.error("❌ Lỗi TikTok:", err.message);
    await logEvent("ERROR", { error: err.message });
  });
}

// =============================
// 🧯 GLOBAL ERROR HANDLER
// =============================
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

// =============================
// ▶️ START BOT
// =============================
startBot();
