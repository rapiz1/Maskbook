import type Web3 from 'web3'
import type { HttpProvider, RequestArguments } from 'web3-core'
import type { JsonRpcPayload, JsonRpcResponse } from 'web3-core-helpers'
import type { ChainId, SendOverrides, RequestOptions, ExternalProvider } from '@masknet/web3-shared-evm'

export interface ProviderOptions {
    chainId?: ChainId
    url?: string
}

export interface Web3Options {
    keys?: string[]
    options?: ProviderOptions
}

export interface Provider {
    request<T extends unknown>(requestArguments: RequestArguments): Promise<T>

    createWeb3(options?: Web3Options): Promise<Web3>
    createProvider?(options?: ProviderOptions): Promise<HttpProvider>
    createExternalProvider(options?: ProviderOptions): Promise<ExternalProvider>

    requestAccounts?(chainId?: ChainId): Promise<{
        chainId: ChainId
        accounts: string[]
    }>
    dismissAccounts?(chainId?: ChainId): Promise<void>

    onAccountsChanged?(accounts: string[]): Promise<void>
    onChainIdChanged?(id: string): Promise<void>
}

export interface Context {
    readonly sendOverrides: SendOverrides | undefined
    readonly requestOptions: RequestOptions | undefined
    readonly requestArguments: RequestArguments

    /**
     * JSON RPC rquest payload
     */
    readonly request: JsonRpcPayload

    /**
     * JSON RPC response object
     */
    readonly response: JsonRpcResponse | undefined

    result: unknown
    error: Error | null

    /**
     * Write RPC response into the context but only allow to call once.
     */
    write: (error: Error | null, response?: JsonRpcResponse) => void

    /**
     * Register a callback which will be called once the context is written with a response.
     */
    onResponse: (callback: (error: Error | null, response?: JsonRpcResponse) => void) => void
}

export interface Middleware<T> {
    fn: (context: T, next: () => Promise<void>) => Promise<void>
}

export interface Interceptor {
    encode?(payload: JsonRpcPayload): JsonRpcPayload
    decode?(error: Error | null, response?: JsonRpcResponse): [Error | null, JsonRpcResponse]
}
