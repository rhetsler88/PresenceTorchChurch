import AgoraRTC from "agora-rtc-sdk-ng";
import { configureAgoraSdk } from "@/lib/agoraInit";

configureAgoraSdk();

/** @typedef {{ refCount: number, client: import('agora-rtc-sdk-ng').IAgoraRTCClient | null, joinPromise: Promise<import('agora-rtc-sdk-ng').IAgoraRTCClient> | null, opChain: Promise<void> }} SessionState */

/** @type {Map<string, SessionState>} */
const sessions = new Map();

export function sessionKey(channelName, uid) {
  return `${channelName}:${uid}`;
}

async function leaveClient(client) {
  if (!client) return;
  client.removeAllListeners();
  await client.leave().catch(() => {});
}

function getState(key) {
  let state = sessions.get(key);
  if (!state) {
    state = { refCount: 0, client: null, joinPromise: null, opChain: Promise.resolve() };
    sessions.set(key, state);
  }
  return state;
}

function enqueue(key, fn) {
  const state = getState(key);
  const run = state.opChain.then(fn, fn);
  state.opChain = run.then(() => {}, () => {});
  return run;
}

/**
 * Join (or reuse) one Agora client per channel+uid. Serialized per key so unmount
 * during an in-flight join cannot overlap a second join (duplicate WS / WS_ABORT).
 */
export function acquireAgoraClient(key, joinFn) {
  return enqueue(key, async () => {
    const state = getState(key);
    state.refCount += 1;

    if (state.client) {
      return state.client;
    }

    if (!state.joinPromise) {
      state.joinPromise = (async () => {
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        try {
          await joinFn(client);
          state.client = client;
          return client;
        } catch (err) {
          await leaveClient(client);
          throw err;
        } finally {
          state.joinPromise = null;
        }
      })();
    }

    try {
      return await state.joinPromise;
    } catch (err) {
      state.refCount = Math.max(0, state.refCount - 1);
      if (state.refCount === 0 && !state.client) {
        sessions.delete(key);
      }
      throw err;
    }
  });
}

/** Drop a ref; leave the channel when the last holder releases. */
export function releaseAgoraClient(key) {
  return enqueue(key, async () => {
    const state = sessions.get(key);
    if (!state) return;

    state.refCount = Math.max(0, state.refCount - 1);
    if (state.refCount > 0) return;

    if (state.joinPromise) {
      try {
        await state.joinPromise;
      } catch {
        // join failed or was superseded
      }
    }

    const client = state.client;
    state.client = null;
    state.joinPromise = null;
    sessions.delete(key);
    await leaveClient(client);
  });
}
