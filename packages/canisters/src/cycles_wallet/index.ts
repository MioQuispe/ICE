import path from "node:path"
import * as url from "node:url"
import { customCanister, type TaskCtxShape } from "@ice/runner"
import type { _SERVICE } from "./cycles_wallet.types"

const __dirname = url.fileURLToPath(new URL(".", import.meta.url))

type InitArgs = []
type WrapperInitArgs = {
  canisterId?: string
}

const CyclesWalletIds = {
  // local: "rdmx6-jaaaa-aaaaa-aaadq-cai",
  ic: "rdmx6-jaaaa-aaaaa-aaadq-cai",
}

export const CyclesWallet = (
  initArgsOrFn: WrapperInitArgs | ((args: { ctx: TaskCtxShape }) => WrapperInitArgs),
) => {
  // TODO: init args
  return customCanister<InitArgs, _SERVICE>(({ ctx }) => {
    const initArgs =
      typeof initArgsOrFn === "function" ? initArgsOrFn({ ctx }) : initArgsOrFn
    return {
      canisterId: initArgs?.canisterId,
      type: "custom",
      candid: path.resolve(__dirname, "./cycles_wallet/cycles_wallet.did"),
      wasm: path.resolve(__dirname, "./cycles_wallet/cycles_wallet.wasm"),
    }
  }).installArgs(async ({ ctx, mode }) => {
    return []
  })
}
