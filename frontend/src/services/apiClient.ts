import axios from 'axios';

import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

export interface RfcApiErrorPayload {
  timestamp: string;
  statusCode: number;
  error: string;
  message: string;
  details: Record<string, unknown>;
}

export class ApiClientError extends Error {
  public readonly statusCode: number;
  public readonly error: string;
  public readonly details: Record<string, unknown>;

  constructor(payload: RfcApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiClientError';
    this.statusCode = payload.statusCode;
    this.error = payload.error;
    this.details = payload.details ?? {};
  }
}

type TokenRefreshListener = () => Promise<void> | void;
const tokenRefreshListeners = new Set<TokenRefreshListener>();

export function onBeforeTokenRefresh(listener: TokenRefreshListener): () => void {
  tokenRefreshListeners.add(listener);
  return () => {
    tokenRefreshListeners.delete(listener);
  };
}

export async function notifyTokenRefreshListeners(): Promise<void> {
  for (const listener of tokenRefreshListeners) {
    try {
      await listener();
    } catch {
      // Ignore individual listener errors during refresh hook
    }
  }
}

const API_BASE_URL = 'http://localhost:8000/api/v1';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

let refreshPromise: Promise<void> | null = null;

export async function triggerSessionRefresh(): Promise<void> {
  await notifyTokenRefreshListeners();
  await axios.post(
    `${API_BASE_URL}/auth/refresh`,
    {},
    {
      withCredentials: true,
    },
  );
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<RfcApiErrorPayload>) => {
    const originalRequest = error.config as RetryableConfig | undefined;
    const status = error.response?.status ?? 500;
    const reqUrl = originalRequest?.url ?? '';

    const isAuthLoginOrRefresh =
      reqUrl.includes('/auth/login') ||
      reqUrl.includes('/auth/refresh') ||
      reqUrl.includes('/auth/logout');

    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthLoginOrRefresh) {
      originalRequest._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = triggerSessionRefresh().finally(() => {
            refreshPromise = null;
          });
        }
        await refreshPromise;
        return await apiClient(originalRequest);
      } catch {
        // Fall through to standardized RFC error
      }
    }

    const rfcData = error.response?.data;
    if (rfcData && typeof rfcData.message === 'string') {
      return Promise.reject(new ApiClientError(rfcData));
    }

    return Promise.reject(
      new ApiClientError({
        timestamp: new Date().toISOString(),
        statusCode: status,
        error: error.code ?? 'NetworkError',
        message: error.message || 'Erro de comunicação com o API Gateway.',
        details: {},
      }),
    );
  },
);
