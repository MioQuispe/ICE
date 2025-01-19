import path from "node:path"
import { Opt } from "../types"
import * as url from "node:url"
import { Actor, HttpAgent, ActorSubclass } from "@dfinity/agent"
import { idlFactory } from "./internet_identity.did"
import { CreateProps } from "../types"
import type { ExtendedCanisterConfiguration } from "../types"
import {Crystal} from "@crystal/runner"
import { Effect } from "effect"

const crystal = Crystal()

const __dirname = url.fileURLToPath(new URL(".", import.meta.url))

type InitArgs = {
  owner: string
}

const InternetIdentityIds = {
  local: "rdmx6-jaaaa-aaaaa-aaadq-cai",
  ic: "rdmx6-jaaaa-aaaaa-aaadq-cai",
}

export const InternetIdentity = (initArgs: InitArgs) => crystal.customCanister({
  canisterId: InternetIdentityIds.local,
  candid: path.resolve(__dirname, "./internet-identity/internet_identity.did"),
  wasm: path.resolve(__dirname, "./internet-identity/internet_identity.wasm"),
}).install(async ({ mode, actor }) => {
  // TODO: types for actor
  // TODO: we need to install the canister here also?
  if (mode === "install" || mode === "reinstall") {
    return [Opt(initArgs.owner ?? null)]
  }
  // if (mode === "reinstall") {
  //   return [Opt(initArgs.owner ?? null)]
  // }
  if (mode === "upgrade") {
    // return [Opt(initArgs.owner ?? null)]
  }
  // -m, --mode <MODE>
  // Specifies the mode of canister installation.
  // If set to 'auto', either 'install' or 'upgrade' will be used, depending on whether the canister is already installed.
  // [possible values: install, reinstall, upgrade, auto]
})
// .upgrade(async (ctx) => {
//   // TODO: actor should be available in ctx
//   // TODO: we need to install the canister here also?
//   // return [Opt(initArgs.owner ?? null)]
// })

// export const InternetIdentity = ({ owner }: InitArgs): ExtendedCanisterConfiguration => {
//   // TODO: init args

//   // TODO: return config
//   // - get paths
//   return {
//     type: "custom",
//     candid: path.resolve(__dirname, "./internet-identity/internet_identity.did"),
//     wasm: path.resolve(__dirname, "./internet-identity/internet_identity.wasm"),
//     build: "",
//     // remote: {
//     //   // TODO: get internet identity principalID
//     //   id: InternetIdentityIds,
//     // },

//     // TODO:
//     dfx_js: {
//       canister_id: InternetIdentityIds,
//       // opt record {assigned_user_number_range:record {nat64; nat64}}
//       args: [Opt(null)],
//       // mode: "reinstall"
//     },
//   }
// }

InternetIdentity.id = InternetIdentityIds

InternetIdentity.idlFactory = idlFactory

export type InternetIdentityActor = ActorSubclass<import("./internet_identity.types")._SERVICE>
