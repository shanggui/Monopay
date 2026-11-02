import type { WsClientMessage, WsServerEvent } from '@monopay/shared'
import websocket from '@fastify/websocket'
import type { FastifyInstance } from 'fastify'
import { WebSocket } from 'ws'
import { AppError } from '../lib/errors'
import { authenticateRoom } from '../rooms/service'
import { addConnection, removeConnection } from './hub'

function send(socket: WebSocket, event: WsServerEvent): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(event))
  }
}

function sendError(socket: WebSocket, code: string, message: string): void {
  send(socket, { type: 'error', data: { code, message } })
}

function parseMessage(raw: WebSocket.RawData): WsClientMessage | null {
  try {
    const value = JSON.parse(raw.toString()) as unknown
    if (typeof value !== 'object' || value === null || !('type' in value)) {
      return null
    }

    const message = value as Record<string, unknown>

    if (message.type === 'ping') {
      return { type: 'ping' }
    }

    if (
      message.type === 'auth' &&
      typeof message.roomCode === 'string' &&
      typeof message.token === 'string'
    ) {
      return { type: 'auth', roomCode: message.roomCode, token: message.token }
    }

    return null
  } catch {
    return null
  }
}

export async function registerWebSocket(app: FastifyInstance): Promise<void> {
  await app.register(websocket)

  app.get('/ws', { websocket: true }, (socket) => {
    let roomCode: string | null = null
    let playerId: string | null = null

    const authTimeout = setTimeout(() => {
      if (!roomCode) {
        sendError(socket, 'UNAUTHORIZED', 'WebSocket 鉴权超时')
        socket.close(4001, 'auth timeout')
      }
    }, 5_000)

    authTimeout.unref()

    socket.on('message', (raw) => {
      const message = parseMessage(raw)

      if (!message) {
        sendError(socket, 'INVALID_ARGUMENT', '无法识别的消息')
        return
      }

      if (!roomCode) {
        if (message.type !== 'auth') {
          sendError(socket, 'UNAUTHORIZED', '请先发送 auth 消息')
          return
        }

        try {
          const auth = authenticateRoom(message.roomCode, message.token)
          roomCode = auth.room.code
          playerId = auth.player.id
          clearTimeout(authTimeout)
          addConnection(roomCode, socket)
          send(socket, {
            type: 'ready',
            data: { roomCode, playerId, isHost: auth.isHost },
          })
        } catch (error) {
          const appError =
            error instanceof AppError ? error : new AppError('UNAUTHORIZED', '房间凭证无效', 401)
          sendError(socket, appError.code, appError.message)
          socket.close(4003, 'unauthorized')
        }
        return
      }

      if (message.type === 'ping') {
        send(socket, { type: 'pong' })
      }
    })

    socket.on('close', () => {
      clearTimeout(authTimeout)
      if (roomCode) {
        removeConnection(roomCode, socket)
      }
    })

    socket.on('error', () => {
      clearTimeout(authTimeout)
      if (roomCode) {
        removeConnection(roomCode, socket)
      }
    })
  })
}
