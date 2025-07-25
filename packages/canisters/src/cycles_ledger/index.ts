import path from "node:path"
import * as url from "node:url"
import { customCanister, Opt, type TaskCtxShape } from "@ice.ts/runner"
import type { _SERVICE, LedgerArgs, UpgradeArgs } from "./cycles_ledger.types"
import type { Principal } from "@dfinity/principal"

export type {
  _SERVICE as CyclesLedgerService,
  LedgerArgs as CyclesLedgerLedgerArgs,
  UpgradeArgs as CyclesLedgerUpgradeArgs,
  InitArgs as CyclesLedgerInitArgs,
}

const __dirname = url.fileURLToPath(new URL(".", import.meta.url))

type InitArgs = []
type WrapperInitArgs = {
  canisterId?: string
}

const CyclesLedgerIds = {
  local: "ul4oc-4iaaa-aaaaq-qaabq-cai",
  ic: "ul4oc-4iaaa-aaaaq-qaabq-cai",
}

export const CyclesLedger = (
  initArgsOrFn?: WrapperInitArgs | ((args: { ctx: TaskCtxShape }) => WrapperInitArgs),
) => {
  // TODO: init args
  return customCanister<_SERVICE, [LedgerArgs]>(({ ctx }) => {
    const initArgs =
      typeof initArgsOrFn === "function" ? initArgsOrFn({ ctx }) : initArgsOrFn
    return {
      canisterId: initArgs?.canisterId ?? CyclesLedgerIds.ic,
      type: "custom",
      candid: path.resolve(__dirname, "./cycles_ledger/cycles_ledger.did"),
      wasm: path.resolve(__dirname, "./cycles_ledger/cycles_ledger.wasm.gz"),
    }
  }).installArgs(async ({ mode }) => {
    if (mode === "upgrade") {
      return [
        {
          Upgrade: []
        }
      ]
    }
    return [
      {
        Init: {
          index_id: Opt<Principal>(),
          max_blocks_per_request: 1000n,
        },
      },
    ]
  })
}