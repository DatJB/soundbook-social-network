import { request, getToken, API_BASE_URL } from './auth';

const unwrap = (payload) => payload?.data ?? payload;

export const profileApi = {
  getProfile: async (userId = 'me') => unwrap(await request(`/profiles/${encodeURIComponent(userId)}`, {
    method: 'GET',
    auth: true,
  })),

  getProfilePosts: async (userId, page = 0, size = 10) => unwrap(await request(
    `/profiles/${encodeURIComponent(userId)}/posts?page=${page}&size=${size}`,
    { method: 'GET', auth: true },
  )),

  getFollowers: async (userId) => unwrap(await request(`/profiles/${encodeURIComponent(userId)}/followers`, {
    method: 'GET',
    auth: true,
  })),

  searchFollowers: async (userId, query) => unwrap(await request(`/profiles/${encodeURIComponent(userId)}/followers/search?query=${encodeURIComponent(query)}`, {
    method: 'GET',
    auth: true,
  })),

  getFriends: async (userId) => unwrap(await request(`/profiles/${encodeURIComponent(userId)}/friends`, {
    method: 'GET',
    auth: true,
  })),

  updateProfile: async (payload) => unwrap(await request('/profiles/me', {
    method: 'PUT',
    auth: true,
    body: JSON.stringify(payload),
  })),

  followProfile: async (userId) => unwrap(await request(`/profiles/${encodeURIComponent(userId)}/follow`, {
    method: 'POST',
    auth: true,
  })),

  unfollowProfile: async (userId) => unwrap(await request(`/profiles/${encodeURIComponent(userId)}/follow`, {
    method: 'DELETE',
    auth: true,
  })),

  addMusic: async (payload) => unwrap(await request('/profiles/me/music', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(payload),
  })),

  updateMusic: async (itemId, payload) => unwrap(await request(`/profiles/me/music/${encodeURIComponent(itemId)}`, {
    method: 'PUT',
    auth: true,
    body: JSON.stringify(payload),
  })),

  deleteMusic: async (itemId) => unwrap(await request(`/profiles/me/music/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    auth: true,
  })),

  addBook: async (payload) => unwrap(await request('/profiles/me/books', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(payload),
  })),

  updateBook: async (itemId, payload) => unwrap(await request(`/profiles/me/books/${encodeURIComponent(itemId)}`, {
    method: 'PUT',
    auth: true,
    body: JSON.stringify(payload),
  })),

  deleteBook: async (itemId) => unwrap(await request(`/profiles/me/books/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    auth: true,
  })),

  updateAvatar: async (formData) => {
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}/profiles/avatar`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || 'Không thể cập nhật ảnh đại diện');
    }
    return unwrap(payload);
  },

  updateCover: async (formData) => {
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}/profiles/cover`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || 'Không thể cập nhật ảnh bìa');
    }
    return unwrap(payload);
  },
};
