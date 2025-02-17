import { customCanister, Opt } from "@crystal/runner"
import * as url from "node:url"
import path from "node:path"
import type { TaskCtxShape } from "@crystal/runner"
import type { _SERVICE } from "./nfid_storage.types.js"
import { Principal } from "@dfinity/principal"
import { NFIDIdentityManager } from "../identity_manager/index.js"
const __dirname = url.fileURLToPath(new URL(".", import.meta.url))
const canisterName = "nfid_storage"

// const InitArgs = IDL.Record({ 'im_canister' : IDL.Principal });
// return [IDL.Opt(InitArgs)];
type InitArgs = {
  im_canister: Principal
}
/**
 * Creates an instance of the NfidStorage canister.
 * @param initArgsOrFn Initialization arguments or a function returning them.
 * @returns A canister instance.
 */
export const NFIDStorage = (
  initArgsOrFn?:
    | { canisterId?: string }
    | ((ctx: TaskCtxShape) => { canisterId?: string }),
) =>
  customCanister<[Opt<InitArgs>], _SERVICE>((ctx) => {
    const initArgs =
      typeof initArgsOrFn === "function" ? initArgsOrFn(ctx) : initArgsOrFn
    return {
      canisterId: initArgs?.canisterId,
      wasm: path.resolve(__dirname, `./nfid/${canisterName}/${canisterName}.wasm`),
      candid: path.resolve(__dirname, `./nfid/${canisterName}/${canisterName}.did`),
    }
  })
    .dependsOn({ NFIDIdentityManager })
    .install(async ({ ctx, mode }) => {
      // TODO: Add installation logic if needed.
      const initArgs =
        typeof initArgsOrFn === "function" ? initArgsOrFn(ctx) : initArgsOrFn
      return [
        Opt({
          im_canister: Principal.fromText(
            ctx.dependencies.NFIDIdentityManager.canisterId,
          ),
        }),
      ]
    })
