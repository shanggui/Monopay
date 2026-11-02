import type { WsServerEvent } from '@monopay/shared'
import { WebSocket } from 'ws'

const roomSockets = new Map<string, Set<WebSocket>>()

export function addConnection(roomCode: string, socket: WebSocket): void {
  let sockets = roomSockets.get(roomCode)
  if (!sockets) {
    sockets = new Set()
    roomSockets.set(roomCode, sockets)
  }
  sockets.add(socket)
}

export function removeConnection(roomCode: string, socket: WebSocket): void {
  const sockets = roomSockets.get(roomCode)
  if (!sockets) return
  sockets.delete(socket)
  if (sockets.size === 0) {
    roomSockets.delete(roomCode)
  }
}

export function broadcastToRoom(roomCode: string, event: WsServerEvent): void {
  const sockets = roomSockets.get(roomCode)
  if (!sockets) return

  const payload = JSON.stringify(event)
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(payload)
    }
  }
}
