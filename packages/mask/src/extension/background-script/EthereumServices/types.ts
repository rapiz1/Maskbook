import type Web3 from 'web3'
import type { RequestArguments } from 'web3-core'
import type { JsonRpcPayload, JsonRpcResponse } from 'web3-core-helpers'
import type { ChainId, SendOverrides, RequestOptions } from '@masknet/web3-shared-evm'

export interface ProviderOptions {
    chainId?: ChainId
    url?: string
}

export interface Web3Options {
    keys?: string[]
    options?: ProviderOptions
}

export interface Provider {
    createProvider(options?: ProviderOptions): Promise<ExternalProvider>
    createWeb3(options?: Web3Options): Promise<Web3>

    requestAccounts?(chainId?: ChainId): Promise<{
        chainId: ChainId
        accounts: string[]
    }>
    dismissAccounts?(chainId?: ChainId): Promise<void>

    onAccountsChanged?(accounts: string[]): Promise<void>
    onChainIdChanged?(id: string): Promise<void>
}

export interface Context {
    readonly payload: JsonRpcPayload
    readonly response: JsonRpcResponse | void
    result: unknown
    error: Error | null
    readonly sendOverrides: SendOverrides | void
    readonly requestOptions: RequestOptions | void

    getResponse: (callback: (error: Error | null, response?: JsonRpcResponse) => void) => void
    setResponse: (error: Error | null, response?: JsonRpcResponse) => void
}

export interface Middleware<T> {
    fn: (context: T, next: () => Promise<void>) => Promise<void>
}

export interface Interceptor {
    encode?(payload: JsonRpcPayload): JsonRpcPayload
    decode?(error: Error | null, response?: JsonRpcResponse): [Error | null, JsonRpcResponse]
}

export interface ExternalProvider {
    request?: <T>(requestArguments: RequestArguments) => Promise<T>
    send?: (
        payload: JsonRpcPayload,
        callback: (error: Error | null, response?: JsonRpcResponse | undefined) => void,
    ) => void
    sendAsync?: (
        payload: JsonRpcPayload,
        callback: (error: Error | null, response?: JsonRpcResponse | undefined) => void,
    ) => void
}
