import { createServerFn } from '@tanstack/react-start'
import { getSession } from './session'

export const getSessionFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    return await getSession()
  })
