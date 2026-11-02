import type {
  ApiResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  RoomSnapshot,
} from '@monopay/shared'

export class ApiError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('accept', 'application/json')
  if (options.body) {
    headers.set('content-type', 'application/json')
  }
  if (token) {
    headers.set('authorization', `Bearer ${token}`)
  }

  const response = await fetch(path, {
    ...options,
    headers,
    cache: 'no-store',
  })

  let payload: ApiResponse<T>
  try {
    payload = (await response.json()) as ApiResponse<T>
  } catch {
    throw new ApiError('INTERNAL', '服务器返回了无法识别的内容')
  }

  if (!response.ok || !payload.ok) {
    const error = 'error' in payload ? payload.error : undefined
    throw new ApiError(error?.code ?? 'INTERNAL', error?.message ?? '请求失败')
  }

  return payload.data
}

export function createRoom(payload: CreateRoomRequest): Promise<CreateRoomResponse> {
  return request<CreateRoomResponse>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function joinRoom(
  code: string,
  payload: JoinRoomRequest,
  token?: string,
): Promise<JoinRoomResponse> {
  return request<JoinRoomResponse>(
    `/api/rooms/${encodeURIComponent(code)}/join`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export function getSnapshot(code: string, token: string): Promise<RoomSnapshot> {
  return request<RoomSnapshot>(
    `/api/rooms/${encodeURIComponent(code)}/snapshot`,
    { method: 'GET' },
    token,
  )
}

export function dissolveRoom(code: string, token: string): Promise<{ code: string; seq: number }> {
  return request<{ code: string; seq: number }>(
    `/api/rooms/${encodeURIComponent(code)}/actions/dissolve`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    token,
  )
}
