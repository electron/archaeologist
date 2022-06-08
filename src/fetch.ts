export const nodeFetch = async (url: RequestInfo, init?: RequestInit) => {
  const { default: fetchFn } = await import('node-fetch');
  return fetchFn(url as any, init as any);
};
