import { first, uniqBy } from 'lodash-unified'
import {
    ChainId,
    EthereumMethodType,
    getExplorerConstants,
    getPayloadFrom,
    isSameAddress,
} from '@masknet/web3-shared-evm'
import { TransactionReceipt } from 'web3-core'
import { JsonRpcPayload } from 'web3-core-helpers'
import { Explorer } from '@masknet/web3-providers'
import type { Context, Middleware } from '../types'
import { getTransactionByHash, getTransactionReceipt } from '../network'
import { WalletRPC } from '../../../../plugins/Wallet/messages'

interface StorageItem {
    at: number
    limits: number
    payload: JsonRpcPayload
    receipt: Promise<TransactionReceipt | null> | null
}

class Storage {
    static MAX_ITEM_SIZE = 40

    private map = new Map<ChainId, Map<string, StorageItem>>()

    private getStorage(chainId: ChainId) {
        if (!this.map.has(chainId)) this.map.set(chainId, new Map())
        return this.map.get(chainId)!
    }

    public hasItem(chainId: ChainId, hash: string) {
        return this.getStorage(chainId).has(hash)
    }

    public getItem(chainId: ChainId, hash: string) {
        return this.getStorage(chainId).get(hash)
    }

    public setItem(chainId: ChainId, hash: string, transaction: StorageItem) {
        this.getStorage(chainId).set(hash, transaction)
    }

    public removeItem(chainId: ChainId, hash: string) {
        this.getStorage(chainId).delete(hash)
    }

    public getItems(chainId: ChainId) {
        const map = this.getStorage(chainId)
        return map ? [...map.entries()].sort(([, a], [, z]) => z.at - a.at) : []
    }

    public getWatched(chainId: ChainId) {
        return this.getItems(chainId).slice(0, Storage.MAX_ITEM_SIZE)
    }

    public getUnwatched(chainId: ChainId) {
        return this.getItems(chainId).slice(Storage.MAX_ITEM_SIZE)
    }

    public getWatchedAccounts(chainId: ChainId) {
        return uniqBy(
            this.getWatched(chainId)
                .map(([_, transaction]) => getPayloadFrom(transaction.payload))
                .filter(Boolean) as string[],
            (x) => x.toLowerCase(),
        )
    }

    public getUnwatchedAccounts(chainId: ChainId) {
        return uniqBy(
            this.getUnwatched(chainId)
                .map(([_, transaction]) => getPayloadFrom(transaction.payload))
                .filter(Boolean) as string[],
            (x) => x.toLowerCase(),
        )
    }
}

export class TransactionWatcher implements Middleware<Context> {
    static CHECK_TIMES = 30
    static CHECK_DELAY = 30 * 1000 // seconds
    static CHECK_LATEST_SIZE = 5

    private timer: NodeJS.Timeout | null = null
    private storage = new Storage()

    private async getTransactionReceipt(chainId: ChainId, hash: string) {
        try {
            const transaction = await getTransactionByHash(hash, {
                chainId,
            })
            if (!transaction) return null

            const receipt = await getTransactionReceipt(hash, {
                chainId,
            })
            if (!receipt) return null

            return receipt
        } catch {
            return null
        }
    }

    private async checkReceipt(chainId: ChainId) {
        await Promise.allSettled(
            this.storage.getWatched(chainId).map(async ([hash, transaction]) => {
                const receipt = await this.storage.getItem(chainId, hash)?.receipt
                if (receipt) return
                this.storage.setItem(chainId, hash, {
                    ...transaction,
                    receipt: this.getTransactionReceipt(chainId, hash),
                })
            }),
        )
    }

    private async checkAccount(chainId: ChainId, account: string) {
        const { API_KEYS = [], EXPLORER_API = '' } = getExplorerConstants(chainId)

        const watchedTransactions = this.storage.getWatched(chainId)
        const latestTransactions = await Explorer.getLatestTransactions(account, EXPLORER_API, {
            offset: TransactionWatcher.CHECK_LATEST_SIZE,
            apikey: first(API_KEYS),
        })

        for (const latestTransaction of latestTransactions) {
            const [watchedHash, watchedTransaction] =
                watchedTransactions.find(([hash, transaction]) => {
                    // the transaction hash exact matched
                    if (latestTransaction.hash === hash) return true

                    // the transaction signature id exact matched
                    if (!transaction.payload) return false
                    if (helpers.getTransactionId(latestTransaction) === helpers.getPayloadId(transaction.payload))
                        return true

                    // the transaction nonce exact matched
                    const config = getPayloadConfig(transaction.payload)
                    if (!config) return false
                    return (
                        isSameAddress(latestTransaction.from, config.from as string) &&
                        latestTransaction.nonce === config.nonce
                    )
                }) ?? []

            if (!watchedHash || !watchedTransaction?.payload || watchedHash === latestTransaction.hash) continue

            // replace the original transaction in DB
            await WalletRPC.replaceRecentTransaction(
                chainId,
                account,
                watchedHash,
                latestTransaction.hash,
                watchedTransaction.payload,
            )

            // update receipt in cache
            this.storage.removeItem(chainId, watchedHash)
            this.storage.setItem(chainId, latestTransaction.hash, {
                ...watchedTransaction,
                payload: helpers.toPayload(latestTransaction),
                receipt: this.getTransactionReceipt(chainId, latestTransaction.hash),
            })
        }
    }

    private async check() {
        // stop any pending task
        this.stopCheck()

        const chainId = currentChainIdSettings.value

        // unwatch legacy transactions
        this.storage.getUnwatched(chainId).forEach(([hash]) => this.unwatchTransaction(chainId, hash))

        // update limits
        this.storage.getWatched(chainId).forEach(([hash, transaction]) => {
            this.storage.setItem(chainId, hash, {
                ...transaction,
                limits: Math.max(0, transaction.limits - 1),
            })
        })

        try {
            await this.checkReceipt(chainId)
            for (const account of this.storage.getWatchedAccounts(chainId)) await this.checkAccount(chainId, account)
        } catch (error) {
            // do nothing
        }

        // check if all transaction receipts were found
        const allSettled = await Promise.allSettled(
            this.storage.getWatched(chainId).map(([, transaction]) => transaction.receipt),
        )
        if (allSettled.every((x) => x.status === 'fulfilled' && x.value)) return

        // kick to the next round
        this.startCheck(true)
    }

    private startCheck(force: boolean) {
        if (force) this.stopCheck()
        if (this.timer === null) {
            this.timer = setTimeout(this.check, TransactionWatcher.CHECK_DELAY)
        }
    }

    private stopCheck() {
        if (this.timer !== null) clearTimeout(this.timer)
        this.timer = null
    }

    private async getReceipt(chainId: ChainId, hash: string) {
        return this.storage.getItem(chainId, hash)?.receipt ?? null
    }

    private async watchTransaction(chainId: ChainId, hash: string, payload: JsonRpcPayload) {
        if (!this.storage.hasItem(chainId, hash)) {
            this.storage.setItem(chainId, hash, {
                at: Date.now(),
                payload,
                limits: TransactionWatcher.CHECK_TIMES,
                receipt: Promise.resolve(null),
            })
        }
        this.startCheck(false)
    }

    private unwatchTransaction(chainId: ChainId, hash: string) {
        this.storage.removeItem(chainId, hash)
    }

    async fn(context: Context, next: () => Promise<void>) {
        switch (context.method) {
            // the original method will read receipt from storage
            case EthereumMethodType.ETH_GET_TRANSACTION_RECEIPT:
                try {
                    const [hash] = context.request.params as [string]
                    const transaction = await WalletRPC.getRecentTransaction(context.chainId, context.account, hash)
                    await this.watchTransaction(context.chainId, hash, transaction.payload)
                    context.end(await this.getReceipt(context.chainId, hash))
                } catch {
                    context.write(null)
                }
                break

            // the mask modified method will read receipt from chain
            case EthereumMethodType.MASK_GET_TRANSACTION_RECEIPT:
                context.requestArguments = {
                    ...context.requestArguments,
                    method: EthereumMethodType.ETH_GET_TRANSACTION_RECEIPT,
                }
                await next()
                break
            default:
                await next()
                break
        }
    }
}
