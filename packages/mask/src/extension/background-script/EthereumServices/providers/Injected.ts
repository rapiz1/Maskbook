import Web3 from 'web3'
import type { RequestArguments } from 'web3-core'
import { defer } from '@masknet/shared-base'
import { createExternalProvider, EthereumMethodType } from '@masknet/web3-shared-evm'
import { EVM_Messages } from '../../../../plugins/EVM/messages'
import type { Provider } from '../types'

export class InjectedProvider implements Provider {
    private id = 0
    private web3: Web3 | null = null

    private async request<T>(requestArguments: RequestArguments) {
        this.id += 1
        const requestId = this.id
        const [deferred, resolve, reject] = defer<T, Error | null>()

        function onResponse({ payload, result, error }: EVM_Messages['INJECTED_PROVIDER_RPC_RESPONSE']) {
            if (payload.id !== requestId) return
            if (error) reject(error)
            else resolve(result)
        }

        const timer = setTimeout(
            () => reject(new Error('The request is timeout.')),
            requestArguments.method === EthereumMethodType.ETH_REQUEST_ACCOUNTS ? 3 * 60 * 1000 : 45 * 1000,
        )
        EVM_Messages.events.INJECTED_PROVIDER_RPC_RESPONSE.on(onResponse)
        EVM_Messages.events.INJECTED_PROVIDER_RPC_REQUEST.sendToVisiblePages({
            payload: {
                jsonrpc: '2.0',
                id: requestId,
                params: [],
                ...requestArguments,
            },
        })

        deferred.finally(() => {
            clearTimeout(timer)
            EVM_Messages.events.INJECTED_PROVIDER_RPC_RESPONSE.off(onResponse)
        })

        return deferred
    }

    async createProvider() {
        return createExternalProvider(this.request.bind(this))
    }

    async createWeb3() {
        if (this.web3) return this.web3
        const provider = await this.createProvider()
        this.web3 = new Web3(provider)
        return this.web3
    }

    async ensureConnectedAndUnlocked() {
        const web3 = await this.createWeb3()
        try {
            const accounts = await web3.eth.requestAccounts()
            throw accounts
        } catch (error: string[] | unknown) {
            const accounts = error
            if (Array.isArray(accounts)) {
                if (accounts.length === 0)
                    throw new Error('Injected Web3 is locked or it has not connected any accounts.')
                else if (accounts.length > 0) return // valid
            }
            // Any other error means failed to connect injected web3
            throw new Error('Failed to connect to injected Web3.')
        }
    }
}
