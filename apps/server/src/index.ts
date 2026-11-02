import { buildApp } from './app'
import { env } from './env'

const app = await buildApp()

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down')
  await app.close()
  process.exit(0)
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

try {
  await app.listen({ host: env.HOST, port: env.PORT })
  app.log.info(
    { host: env.HOST, port: env.PORT, publicUrl: env.PUBLIC_URL },
    'Monopay server started',
  )
} catch (error) {
  app.log.error(error, 'failed to start server')
  process.exit(1)
}
