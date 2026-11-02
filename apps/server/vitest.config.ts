import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DB_PATH: ':memory:',
      PUBLIC_URL: 'http://localhost:3000',
      TRUST_PROXY: 'false',
    },
  },
})
