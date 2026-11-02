import type {
  AssetsRequest,
  BankCollectRequest,
  BankPayRequest,
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  PaymentResult,
  PayRequest,
  RankingEntry,
  RefundRequest,
  ReverseRequest,
  RoomSnapshot,
  SalaryRequest,
  TransactionFilter,
  TransactionPage,
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

export function getTransactions(
  code: string,
  token: string,
  filter: TransactionFilter = 'all',
  beforeSeq?: number,
  limit = 50,
): Promise<TransactionPage> {
  const params = new URLSearchParams({ filter, limit: String(limit) })
  if (beforeSeq) params.set('beforeSeq', String(beforeSeq))
  return request<TransactionPage>(
    `/api/rooms/${encodeURIComponent(code)}/transactions?${params.toString()}`,
    { method: 'GET' },
    token,
  )
}

export function refund(
  code: string,
  payload: RefundRequest,
  token: string,
): Promise<PaymentResult> {
  return request<PaymentResult>(
    `/api/rooms/${encodeURIComponent(code)}/actions/refund`,
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  )
}

export function reverse(
  code: string,
  payload: ReverseRequest,
  token: string,
): Promise<PaymentResult> {
  return request<PaymentResult>(
    `/api/rooms/${encodeURIComponent(code)}/actions/reverse`,
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  )
}

export function endGame(code: string, token: string): Promise<RoomSnapshot> {
  return request<RoomSnapshot>(
    `/api/rooms/${encodeURIComponent(code)}/actions/end`,
    { method: 'POST', body: JSON.stringify({}) },
    token,
  )
}

export function resumeGame(code: string, token: string): Promise<RoomSnapshot> {
  return request<RoomSnapshot>(
    `/api/rooms/${encodeURIComponent(code)}/actions/resume`,
    { method: 'POST', body: JSON.stringify({}) },
    token,
  )
}

export function updateAssets(
  code: string,
  payload: AssetsRequest,
  token: string,
): Promise<RoomSnapshot> {
  return request<RoomSnapshot>(
    `/api/rooms/${encodeURIComponent(code)}/actions/assets`,
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  )
}

export function confirmSettlement(
  code: string,
  token: string,
): Promise<{ rankings: RankingEntry[]; snapshot: RoomSnapshot }> {
  return request<{ rankings: RankingEntry[]; snapshot: RoomSnapshot }>(
    `/api/rooms/${encodeURIComponent(code)}/actions/confirm`,
    { method: 'POST', body: JSON.stringify({}) },
    token,
  )
}

export function setBankrupt(
  code: string,
  playerId: string,
  bankrupt: boolean,
  token: string,
): Promise<RoomSnapshot> {
  return request<RoomSnapshot>(
    `/api/rooms/${encodeURIComponent(code)}/actions/bankrupt`,
    { method: 'POST', body: JSON.stringify({ playerId, bankrupt }) },
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
