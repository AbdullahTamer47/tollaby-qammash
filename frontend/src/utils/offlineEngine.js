// Tollaby Offline-First Engine & Synchronization Manager

const CACHE_PREFIX = 'tollaby_cache_';
const QUEUE_KEY = 'tollaby_offline_mutations';

// --- Local Storage Cache Helpers ---
export const setCachedData = (key, data) => {
  try {
    const record = {
      timestamp: Date.now(),
      data
    };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(record));
  } catch (e) {
    console.warn('Offline cache storage error:', e);
  }
};

export const getCachedData = (key, maxAgeMs = 1000 * 60 * 60 * 24 * 7) => { // 7 days default
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (Date.now() - record.timestamp > maxAgeMs) {
      return null;
    }
    return record.data;
  } catch {
    return null;
  }
};

// --- Offline Mutation Queue ---
export const getOfflineQueue = () => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
};

const saveOfflineQueue = (queue) => {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new CustomEvent('offline-queue-changed', { detail: { count: queue.length } }));
  } catch (e) {
    console.error('Failed to save offline queue:', e);
  }
};

export const enqueueMutation = (type, payload) => {
  const queue = getOfflineQueue();
  const mutation = {
    id: Date.now() + '_' + Math.random().toString(36).substring(2, 9),
    type,
    payload,
    timestamp: new Date().toISOString()
  };
  queue.push(mutation);
  saveOfflineQueue(queue);

  // Play a gentle offline saved chime if audio context is available
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) {}

  return mutation;
};

export const removeMutation = (id) => {
  const queue = getOfflineQueue().filter(m => m.id !== id);
  saveOfflineQueue(queue);
};

export const clearOfflineQueue = () => {
  saveOfflineQueue([]);
};

// --- Synchronization Logic ---
let isSyncing = false;

export const syncOfflineQueue = async (apiClient) => {
  if (isSyncing) return { syncing: true };
  const queue = getOfflineQueue();
  if (queue.length === 0) return { synced: 0 };

  isSyncing = true;
  window.dispatchEvent(new CustomEvent('offline-sync-started', { detail: { count: queue.length } }));

  try {
    // Attempt batch sync endpoint first
    const res = await apiClient.post('/sync/batch', { mutations: queue }, { skipGlobalError: true });
    
    if (res.data?.success) {
      const processedCount = res.data.processed || queue.length;
      clearOfflineQueue();
      window.dispatchEvent(new CustomEvent('offline-synced', { detail: { count: processedCount } }));
      return { success: true, count: processedCount };
    }
  } catch (err) {
    // If batch sync failed, try individual replay as fallback
    let syncedCount = 0;
    const remaining = [];

    for (const item of queue) {
      try {
        if (item.type === 'SCAN_ATTENDANCE') {
          await apiClient.post(`/sessions/${item.payload.sessionId}/attendance/scan`, {
            student_id: item.payload.studentId,
            autoPay: item.payload.autoPay
          }, { skipGlobalError: true });
          syncedCount++;
        } else if (item.type === 'ADD_PAYMENT') {
          await apiClient.post(`/payments/${item.payload.studentId}/add`, {
            amount: item.payload.amount,
            type: item.payload.paymentType,
            targetName: item.payload.targetName
          }, { skipGlobalError: true });
          syncedCount++;
        } else if (item.type === 'DELIVER_BOOK') {
          await apiClient.post('/books/bookings/deliver', {
            studentId: item.payload.studentId,
            bookId: item.payload.bookId
          }, { skipGlobalError: true });
          syncedCount++;
        } else {
          remaining.push(item);
        }
      } catch (itemErr) {
        remaining.push(item);
      }
    }

    saveOfflineQueue(remaining);
    if (syncedCount > 0) {
      window.dispatchEvent(new CustomEvent('offline-synced', { detail: { count: syncedCount } }));
      return { success: true, count: syncedCount };
    }
    return { success: false, error: 'Network still unavailable' };
  } finally {
    isSyncing = false;
  }
};

// --- Online / Offline State Manager ---
export const isDeviceOnline = () => {
  return typeof window !== 'undefined' ? window.navigator.onLine : true;
};

// Auto-register heartbeat and sync on network reconnection
export const initOfflineSyncWatcher = (apiClient) => {
  if (typeof window === 'undefined') return;

  const triggerAutoSync = () => {
    if (isDeviceOnline() && getOfflineQueue().length > 0) {
      syncOfflineQueue(apiClient).catch(() => {});
    }
  };

  window.addEventListener('online', () => {
    console.log('📶 Internet reconnected! Checking offline queue...');
    triggerAutoSync();
  });

  // Periodic check every 30 seconds
  setInterval(triggerAutoSync, 30 * 1000);
};
