import Web3 from 'web3'
import type { HttpProvider } from 'web3-core'
import { PopupRoutes } from '@masknet/shared-base'
import { ChainId, getChainRPC, ProviderType } from '@masknet/web3-shared-evm'
import { currentChainIdSettings } from '../../../../plugins/Wallet/settings'
import { getWallets, selectAccountPrepare } from '../../../../plugins/Wallet/services'
import { openPopupWindow } from '../../HelperService'
import type { Provider, ProviderOptions, Web3Options } from '../types'

export class MaskWalletProvider implements Provider {
    private seed = Math.floor(Math.random() * 4)
    private providerPool = new Map<string, HttpProvider>()
    private instancePool = new Map<string, Web3>()

    private createWeb3Instance(provider: HttpProvider) {
        const instance = this.instancePool.get(provider.host)
        if (instance) return instance

        const newInstance = new Web3(provider)
        this.instancePool.set(provider.host, newInstance)
        return newInstance
    }

    private createProviderInstance(url: string) {
        const instance = this.providerPool.get(url)
        if (instance) return instance

        const newInstance = new Web3.providers.HttpProvider(url, {
            timeout: 30 * 1000, // ms
            // @ts-ignore
            clientConfig: {
                keepalive: true,
                keepaliveInterval: 1, // ms
            },
            reconnect: {
                auto: true,
                delay: 5000, // ms
                maxAttempts: Number.MAX_SAFE_INTEGER,
                onTimeout: true,
            },
        })
        this.providerPool.set(url, newInstance)
        return newInstance
    }

    async createProvider({ chainId, url }: ProviderOptions) {
        url = url ?? getChainRPC(chainId ?? currentChainIdSettings.value, this.seed)
        if (!url) throw new Error('Failed to create provider.')

        const provider = this.createProviderInstance(url)
        return provider
    }

    async createWeb3({ keys = [], options = {} }: Web3Options) {
        const provider = await this.createProvider(options)
        const web3 = this.createWeb3Instance(provider)
        if (keys.length) {
            web3.eth.accounts.wallet.clear()
            keys.forEach((k) => k && k !== '0x' && web3.eth.accounts.wallet.add(k))
        }
        return web3
    }

    async requestAccounts(chainId?: ChainId) {
        return new Promise<{
            chainId: ChainId
            accounts: string[]
        }>(async (resolve, reject) => {
            const wallets = await getWallets(ProviderType.MaskWallet)

            try {
                await selectAccountPrepare((accounts, chainId) => {
                    resolve({
                        chainId,
                        accounts,
                    })
                })
                await openPopupWindow(wallets.length > 0 ? PopupRoutes.SelectWallet : undefined, {
                    chainId,
                })
            } catch {
                reject(new Error('Failed to connect to Mask Network.'))
            }
        })
    }
}
