import type { Context, Middleware } from '../types'

export class MaskWallet implements Middleware<Context> {
    fn: (context: Context, next: () => Promise<void>) => Promise<void>;
}
