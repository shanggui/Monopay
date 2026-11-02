import type {
  BankCollectRequest,
  BankPayRequest,
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  PaymentResult,
  PayRequest,
  RoomSnapshot,
  SalaryRequest,
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

  let payload: {
    ok: boolean
    data?: T
    error?: { code: string; message: string }
  }
  try {
    payload = (await response.json()) as typeof payload
  } catch {
    throw new ApiError('INTERNAL', '服务器返回了无法识别的内容')
  }

  if (!response.ok || !payload.ok) {
    throw new ApiError(payload.error?.code ?? 'INTERNAL', payload.error?.message ?? '请求失败')
  }

  return payload.data as T
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

export function startGame(code: string, token: string): Promise<RoomSnapshot> {
  return request<RoomSnapshot>(
    `/api/rooms/${encodeURIComponent(code)}/actions/start`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    token,
  )
}

export function pay(code: string, payload: PayRequest, token: string): Promise<PaymentResult> {
  return request<PaymentResult>(
    `/api/rooms/${encodeURIComponent(code)}/actions/pay`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export function bankPay(
  code: string,
  payload: BankPayRequest,
  token: string,
): Promise<PaymentResult> {
  return request<PaymentResult>(
    `/api/rooms/${encodeURIComponent(code)}/actions/bank-pay`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export function bankCollect(
  code: string,
  payload: BankCollectRequest,
  token: string,
): Promise<PaymentResult> {
  return request<PaymentResult>(
    `/api/rooms/${encodeURIComponent(code)}/actions/bank-collect`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export function salary(
  code: string,
  payload: SalaryRequest,
  token: string,
): Promise<PaymentResult> {
  return request<PaymentResult>(
    `/api/rooms/${encodeURIComponent(code)}/actions/salary`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
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
