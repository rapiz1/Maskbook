import type { Context, Middleware } from '../types'

export class Logger implements Middleware<Context> {
    async fn(context: Context, next: () => Promise<void>) {
        console.log('START!')
        console.log(`${context.payload.method}_${JSON.stringify(context.payload.params)}`)
        await next()
        console.log('END!')
        console.log(`${context.payload.method}_${JSON.stringify(context.payload.params)}`)
    }
}
