import type { RequestArguments } from 'web3-core'
import type { RequestOptions, SendOverrides } from '@masknet/web3-shared-evm'
import { currentChainIdSettings, currentProviderSettings } from '../../../plugins/Wallet/settings'
import { createExternalProvider } from './provider'
import { createContext, dispatch, use } from './composer'
import { Logger } from './middlewares/Logger'
import { Squash } from './middlewares/Squash'

use(new Logger())
use(new Squash())

export async function sendRequest<T extends unknown>(
    requestArguments: RequestArguments,
    overrides?: SendOverrides,
    options?: RequestOptions,
) {
    const { providerType = currentProviderSettings.value, chainId = currentChainIdSettings.value } = overrides ?? {}

    return new Promise<T>(async (resolve, reject) => {
        const context = createContext(requestArguments, overrides, options)

        await dispatch(context, async () => {
            try {
                // create request provider
                const externalProvider = await createExternalProvider(chainId, providerType)
                if (!externalProvider?.request) throw new Error('Failed to create provider.')

                // send request and set result in the context
                const result = (await externalProvider?.request?.(requestArguments)) as T
                context.write(null, result)
            } catch (error) {
                context.write(error instanceof Error ? error : new Error('Failed to send request.'))
            }
        })

        if (context.error) reject(context.error)
        else resolve(context.result as T)
    })
}
