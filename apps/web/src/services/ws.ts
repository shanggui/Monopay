import type { WsServerEvent } from '@monopay/shared'

export type SocketStatus = 'connecting' | 'online' | 'offline'

export interface RoomSocket {
  close: () => void
}

export function connectRoomSocket(
  roomCode: string,
  token: string,
  onEvent: (event: WsServerEvent) => void,
  onStatus?: (status: SocketStatus) => void,
): RoomSocket {
  let socket: WebSocket | null = null
  let closed = false
  let retries = 0
  let retryTimer: number | undefined

  const connect = (): void => {
    if (closed) return
    onStatus?.('connecting')

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    socket = new WebSocket(`${protocol}//${window.location.host}/ws`)

    socket.addEventListener('open', () => {
      retries = 0
      onStatus?.('online')
      socket?.send(JSON.stringify({ type: 'auth', roomCode, token }))
    })

    socket.addEventListener('message', (event) => {
      try {
        onEvent(JSON.parse(String(event.data)) as WsServerEvent)
      } catch {
        // Ignore malformed events; the next snapshot is authoritative.
      }
    })

    socket.addEventListener('close', () => {
      if (closed) return
      onStatus?.('offline')
      const wait = Math.min(1_000 * 2 ** retries, 10_000)
      retries += 1
      retryTimer = window.setTimeout(connect, wait)
    })

    socket.addEventListener('error', () => {
      socket?.close()
    })
  }

  connect()

  return {
    close: () => {
      closed = true
      if (retryTimer) window.clearTimeout(retryTimer)
      socket?.close()
    },
  }
}
