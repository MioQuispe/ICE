import type { DisconnectResult, IConnector, IWalletConnector } from "./connectors"
import {
  BalanceError,
  ConnectError,
  CreateActorError,
  DisconnectError,
  InitError,
  Methods,
  PROVIDER_STATUS,
  TransferError,
} from "./connectors"
// @ts-ignore
import plugLogoLight from "../assets/plugLight.svg"
// @ts-ignore
import plugLogoDark from "../assets/plugDark.svg"
import { IDL } from "@dfinity/candid"
import { ActorSubclass, Agent } from "@dfinity/agent"
import { Principal } from "@dfinity/principal"

export { Methods } from "./connectors"

type PlugInjectedProvider = {
  createActor: <T>(args: { canisterId: string, interfaceFactory: IDL.InterfaceFactory }) => Promise<ActorSubclass<T>>
  agent: Agent
  createAgent: (options: { host: string, whitelist: Array<string> }) => Promise<Agent>
  getPrincipal: () => Promise<Principal>
  isConnected: () => Promise<boolean>
  disconnect: () => Promise<void>
  requestConnect: (Config) => Promise<boolean>
  accountId: string
  requestTransfer: (args: {
    to: string,
    amount: number,
    opts?: {
      fee?: number,
      memo?: string,
      from_subaccount?: number,
      created_at_time?: {
        timestamp_nanos: number
      },
    },
  }) => Promise<{
    height: number
  }>
  requestBalance: () => Promise<Array<{
    amount: number
    canisterId: string
    decimals: number
    image?: string
    name: string
    symbol: string
  }>>
  getManagementCanister: () => Promise<ActorSubclass | undefined>
}

class Wallet implements IWalletConnector {
  #injectedProvider: PlugInjectedProvider

  constructor(injectedProvider: PlugInjectedProvider) {
    this.#injectedProvider = injectedProvider
  }

  // TODO: support tokens
  async requestTransfer({
                          amount,
                          to,
                          // TODO: why is type annotation needed??
                        }: { amount: number, to: string }) {
    let result
    try {
      result = await this.#injectedProvider.requestTransfer({
        to,
        amount: amount * 100000000,
      })
    } catch (e) {
      throw new Error({ kind: TransferError.TransferFailed, error: e })
    }

    switch (!!result) {
      case true:
        return { height: result!.height }
      default:
        // TODO: ?
        throw new Error({ kind: TransferError.TransferFailed })
    }
  }

  // TODO:
  // async requestTransferNFT({
  //                            to,
  //                            // TODO: why is type annotation needed??
  //                          }: { amount: number, to: string }) {
  //   try {
  //     const result = await this.#injectedProvider.requestTransfer({
  //       to,
  //       amount: 1,
  //     })
  //
  //     switch (!!result) {
  //       case true:
  //         return ok({
  //           // height: result!.height
  //         })
  //       default:
  //         // TODO: ?
  //         return err({ kind: TransferError.TransferFailed })
  //     }
  //   } catch (e) {
  //     console.error(e)
  //     return err({ kind: TransferError.TransferFailed })
  //   }
  // }

  async queryBalance() {
    if (!this.#injectedProvider) {
      throw new Error({ kind: BalanceError.NotInitialized })
    }
    try {
      const assets = await this.#injectedProvider.requestBalance()
      return assets
    } catch (e) {
      throw new Error({ kind: BalanceError.QueryBalanceFailed, error: e })
    }
  }
}

class PlugWallet implements IConnector {

  public meta = {
    features: ["wallet"],
    icon: {
      light: plugLogoLight,
      dark: plugLogoDark,
    },
    id: "plug",
    name: "Plug Wallet",
    description: "A wallet to store and manage NFTs, Tokens, and connect to dAPPs on the Internet Computer.",
    deepLinks: {
      android: "intent://APP_HOST/#Intent;scheme=APP_NAME;package=APP_PACKAGE;end",
      ios: "astroxme://",
    },
    methods: [Methods.EXTENSION, Methods.APP],
  }

  #config: {
    whitelist: Array<string>
    host: string
    // TODO:?
    onConnectionUpdate: () => void
    dev: boolean
  }
  #identity?: any
  #principal?: string
  #client?: any
  #injectedProvider?: PlugInjectedProvider
  #wallets: Array<IWalletConnector> = []

  get identity() {
    return this.#identity
  }

  get wallets() {
    return this.#wallets
  }

  get principal() {
    return this.#principal
  }

  get client() {
    return this.#client
  }

  get ic() {
    return this.#injectedProvider
  }

  constructor(userConfig = {}) {
    this.#config = {
      whitelist: [],
      host: "https://ic0.app",
      onConnectionUpdate: () => {
        const { agent, principal, accountId } = window.ic.plug.sessionManager.sessionData
      },
      dev: true,
      ...userConfig,
    }
    this.#injectedProvider = window.ic?.plug
  }

  set config(config) {
    this.#config = { ...this.#config, ...config }
  }

  get config() {
    return this.#config
  }

  async init() {
    // TODO: handle account switching
    if (!this.#injectedProvider) {
      throw new Error({ kind: InitError.NotInstalled })
    }
    const status = await this.status()

    if (status === PROVIDER_STATUS.LOCKED) {
      throw new Error({ kind: InitError.Locked })
    }
    try {
      if (status !== PROVIDER_STATUS.IDLE) {
        await this.#injectedProvider.createAgent({
          host: this.#config.host,
          whitelist: this.#config.whitelist,
        })
      }
      if (status === PROVIDER_STATUS.CONNECTED) {
        this.#principal = (await this.#injectedProvider.getPrincipal()).toString() // Never finishes if locked
        this.#wallets = [new Wallet(this.#injectedProvider)]
      }
      return { isConnected: false }
    } catch (e) {
      throw new Error({ kind: InitError.InitFailed, error: e })
    }
  }

  async status() {
    // TODO: enum
    if (!this.#injectedProvider) {
      return PROVIDER_STATUS.IDLE
    }
    try {
      return await Promise.race<PROVIDER_STATUS>([
        this.#injectedProvider.isConnected().then((c) => {
          return c ? PROVIDER_STATUS.CONNECTED : PROVIDER_STATUS.IDLE
        }),
        new Promise((resolve) => setTimeout(() => resolve(PROVIDER_STATUS.LOCKED), 1000)),
      ])
    } catch (e) {
      return PROVIDER_STATUS.IDLE
    }
  }

  async isConnected() {
    try {
      if (!this.#injectedProvider) {
        return false
      }
      return await this.#injectedProvider.isConnected()
    } catch (e) {
      console.error(e)
      return false
    }
  }

  async createActor<Service>(canisterId: string, idlFactory: IDL.InterfaceFactory) {
    if (!this.#injectedProvider) {
      throw new Error({ kind: CreateActorError.NotInitialized })
    }
    try {
      // Fetch root key for certificate validation during development
      if (this.#config.dev) {
        await this.#injectedProvider.agent.fetchRootKey()
      }
    } catch (e) {
      throw new Error({ kind: CreateActorError.FetchRootKeyFailed, error: e })
    }
    try {
      const actor = await this.#injectedProvider.createActor<Service>({ canisterId, interfaceFactory: idlFactory })
      return actor
    } catch (e) {
      throw new Error({ kind: CreateActorError.CreateActorFailed, error: e })
    }
  }

  async connect() {
    if (!this.#injectedProvider) {
      window.open("https://plugwallet.ooo/", "_blank")
      throw new Error({ kind: ConnectError.NotInstalled })
    }
    try {
      await this.#injectedProvider.requestConnect(this.#config)
      this.#principal = (await this.#injectedProvider.getPrincipal()).toString()
      if (this.#principal) {
        this.#wallets = [new Wallet(this.#injectedProvider)]
      }
      return true
    } catch (e) {
      throw new Error({ kind: ConnectError.ConnectFailed, error: e })
    }
  }

  async disconnect(args): Promise<DisconnectResult> {
    if (!this.#injectedProvider) {
      throw new Error({ kind: DisconnectError.NotInitialized })
    }
    try {
      // TODO: should be awaited but never finishes, tell Plug to fix
      this.#injectedProvider.disconnect()
      return true
    } catch (e) {
      throw new Error({ kind: DisconnectError.DisconnectFailed, error: e })
    }
  }

  // TODO:
  // signMessage({ message }) {
  //   return this.#injectedProvider?.signMessage({message})
  // }

  // async getManagementCanister() {
  //   return this.#injectedProvider?.getManagementCanister()
  // }

  // batchTransactions(...args) {
  //   return this.#injectedProvider?.batchTransactions(...args)
  // }
}

export {
  PlugWallet,
}
