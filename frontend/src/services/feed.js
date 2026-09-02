import { request } from './auth';

const unwrap = (payload) => payload?.data ?? payload;

export const feedApi = {
  getFeed: async ({ tab = 'discover', limit = 10, offset = 0 } = {}) => unwrap(await request(
    `/feed?tab=${encodeURIComponent(tab)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`,
    { method: 'GET', auth: true },
  )),
};
