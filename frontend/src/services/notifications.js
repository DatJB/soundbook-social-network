import { request } from './auth';

const unwrap = (payload) => payload?.data ?? payload;

export const notificationsApi = {
  getNotifications: async (userId, cursor = null, limit = 20) => {
    const params = new URLSearchParams({ userId, limit });
    if (cursor) params.append('cursor', cursor);
    return unwrap(await request(`/notifications?${params.toString()}`, { method: 'GET', auth: true }));
  },

  getUnreadCount: async (userId) =>
    unwrap(await request(`/notifications/unread-count?userId=${encodeURIComponent(userId)}`, { method: 'GET', auth: true })),

  markAsRead: async (notificationId) =>
    unwrap(await request(`/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'PUT',
      auth: true,
      body: JSON.stringify({ isRead: true }),
    })),

  markAllAsRead: async (userId) =>
    unwrap(await request(`/notifications/mark-all-read?userId=${encodeURIComponent(userId)}`, { method: 'POST', auth: true })),

  deleteNotification: async (notificationId) =>
    unwrap(await request(`/notifications/${encodeURIComponent(notificationId)}`, { method: 'DELETE', auth: true })),
};
