import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const initial = {
      global: { replyMode: "text" },
      users: {}
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), "utf8");
  }
}

function readStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return { global: { replyMode: "text" }, users: {} };
  }
}

function writeStore(data) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

function ensureUser(store, userId) {
  if (!store.users[userId]) {
    store.users[userId] = {
      replyMode: null,
      history: []
    };
  }
  return store.users[userId];
}

export function getUserState(userId) {
  const store = readStore();
  const user = ensureUser(store, userId);
  return {
    replyMode: user.replyMode,
    history: Array.isArray(user.history) ? user.history : []
  };
}

export function getEffectiveReplyMode(userId, fallback = "text") {
  const store = readStore();
  const user = ensureUser(store, userId);
  return user.replyMode || store.global?.replyMode || fallback;
}

export function getGlobalReplyMode(fallback = "text") {
  const store = readStore();
  return store.global?.replyMode || fallback;
}

export function setUserReplyMode(userId, mode) {
  const store = readStore();
  const user = ensureUser(store, userId);
  user.replyMode = mode;
  writeStore(store);
}

export function setGlobalReplyMode(mode) {
  const store = readStore();
  store.global = store.global || {};
  store.global.replyMode = mode;
  writeStore(store);
}

export function appendConversationTurn(userId, role, content, maxTurns = 8) {
  const store = readStore();
  const user = ensureUser(store, userId);
  user.history.push({ role, content, ts: Date.now() });
  const maxItems = Math.max(2, maxTurns * 2);
  user.history = user.history.slice(-maxItems);
  writeStore(store);
}

export function getConversationHistory(userId, maxTurns = 8) {
  const store = readStore();
  const user = ensureUser(store, userId);
  const maxItems = Math.max(2, maxTurns * 2);
  return user.history.slice(-maxItems);
}

export function clearConversationHistory(userId) {
  const store = readStore();
  const user = ensureUser(store, userId);
  user.history = [];
  writeStore(store);
}

export function countUsers() {
  const store = readStore();
  return Object.keys(store.users || {}).length;
}
