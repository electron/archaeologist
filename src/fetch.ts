import type { RequestInfo, RequestInit, Response } from 'node-fetch';

export const nodeFetch = async (url: RequestInfo, init?: RequestInit) => {
  const { default: fetchFn } = await import('node-fetch');
  return fetchFn(url, init);
};
