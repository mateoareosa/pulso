import {
  RegisterInput,
  LoginInput,
  CurrentUserResponse,
  CurrentUserResponseSchema,
} from '@pulso/contracts';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends Error {
  constructor(message = 'Error de conexión con el servidor') {
    super(message);
    this.name = 'NetworkError';
  }
}

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      ...options,
      headers,
      credentials: 'include', // Always send and receive session cookies
    });
  } catch {
    throw new NetworkError('No se pudo establecer conexión con el servidor.');
  }

  if (!response.ok) {
    let errorData: { message?: string } | null = null;
    try {
      errorData = (await response.json()) as { message?: string };
    } catch {
      // Non-JSON response
    }

    const message =
      errorData?.message ||
      (response.status === 401
        ? 'No autenticado'
        : response.status === 403
          ? 'Acceso denegado'
          : response.status === 409
            ? 'Conflicto de datos'
            : 'Error interno del servidor');

    throw new ApiError(response.status, message, errorData);
  }

  return (await response.json()) as T;
}

export const apiClient = {
  async getCurrentSession(): Promise<CurrentUserResponse> {
    const data = await apiRequest<CurrentUserResponse>('/api/auth/me');
    return CurrentUserResponseSchema.parse(data);
  },

  async login(credentials: LoginInput): Promise<CurrentUserResponse> {
    const data = await apiRequest<CurrentUserResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    return CurrentUserResponseSchema.parse(data);
  },

  async register(input: RegisterInput): Promise<CurrentUserResponse> {
    const data = await apiRequest<CurrentUserResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return CurrentUserResponseSchema.parse(data);
  },

  async logout(): Promise<void> {
    await apiRequest<{ success: boolean }>('/api/auth/logout', {
      method: 'POST',
    });
  },
};
