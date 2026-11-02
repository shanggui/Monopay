import { z } from 'zod'

export const serviceName = 'Monopay 桌游账房'

export const healthDataSchema = z.object({
  service: z.string(),
  version: z.string(),
})

export type HealthData = z.infer<typeof healthDataSchema>

export const readyDataSchema = z.object({
  database: z.literal('ok'),
  initializedAt: z.string(),
})

export type ReadyData = z.infer<typeof readyDataSchema>

export interface ApiSuccess<T> {
  ok: true
  data: T
  serverTime: number
}

export interface ApiFailure {
  ok: false
  error: {
    code: string
    message: string
    details?: unknown
  }
  serverTime: number
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure
