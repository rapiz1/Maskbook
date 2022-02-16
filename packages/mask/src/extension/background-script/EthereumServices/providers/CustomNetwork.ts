import type Web3 from 'web3'
import { ChainId } from '@masknet/web3-shared-evm'
import type { ExternalProvider, Provider } from '../types'

export class CustomNetworkProvider implements Provider {
    createProvider(): Promise<ExternalProvider> {
        throw new Error('Method not implemented.')
    }
    createWeb3(): Promise<Web3> {
        throw new Error('Method not implemented.')
    }
    requestAccounts(): Promise<{ chainId: ChainId; accounts: string[] }> {
        return Promise.resolve({
            accounts: [],
            chainId: ChainId.Mainnet,
        })
    }
}
