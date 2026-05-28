import { request } from './auth';

export const getDmThreads = async (userId, cursor = null, limit = 20) => {
  const params = new URLSearchParams({
    userId: String(userId),
    limit: String(limit),
  });

  if (cursor) {
    params.set('cursor', cursor);
  }

  return request(`/dm/threads?${params.toString()}`, {
    method: 'GET',
    auth: true,
  });
};

export const getDmMessages = async (threadId, userId, cursor = null, limit = 30) => {
  const params = new URLSearchParams({
    userId: String(userId),
    limit: String(limit),
  });

  if (cursor) {
    params.set('cursor', cursor);
  }

  return request(`/dm/threads/${threadId}/messages?${params.toString()}`, {
    method: 'GET',
    auth: true,
  });
};

export const getAllDmMessages = async (threadId, userId, limit = 30) => {
  const items = [];
  let cursor = null;

  while (true) {
    const response = await getDmMessages(threadId, userId, cursor, limit);
    const pageItems = response?.data?.items || [];
    items.push(...pageItems);

    if (!response?.data?.nextCursor || pageItems.length === 0) {
      break;
    }

    cursor = response.data.nextCursor;
  }

  return items.reverse();
};

export const sendDmMessage = async (threadId, payload) => {
  return request(`/dm/threads/${threadId}/messages`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify(payload),
  });
};

export const upsertDmThread = async (userId, peerUserId) => {
  return request('/dm/threads', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ userId, peerUserId }),
  });
};

export const deleteDmMessage = async (messageId, mode, userId) => {
  const params = new URLSearchParams({
    mode,
    userId: String(userId),
  });
  return request(`/dm/messages/${messageId}?${params.toString()}`, {
    method: 'DELETE',
    auth: true,
  });
};
