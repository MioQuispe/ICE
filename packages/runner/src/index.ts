import { spawn as spawnCommand } from "child_process"
import { IDL } from "@dfinity/candid"
import { Principal } from "@dfinity/principal"
import type { DfxJson } from "./schema.js"
import {
  AssetSpecificProperties,
  CanisterConfiguration,
  ConfigDefaults,
  ConfigNetwork,
  DfxVersion,
  MotokoSpecificProperties,
  Profile,
  RustSpecificProperties,
} from "./schema.js"
import fs from "fs"
import { Actor, ActorSubclass, HttpAgent, Identity } from "@dfinity/agent"
import { idlFactory } from "./canisters/management_new/management.did.js"
import open from "open"
import express from "express"
import path from "path"
import Emitter from "event-e3"
import { Ed25519KeyIdentity } from "@dfinity/identity"
import url from "url"
import { Repeater } from "@repeaterjs/repeater"
import * as os from "os"
import find from "find-process"
import { principalToAccountId } from "./utils"

type ManagementActor = import("@dfinity/agent").ActorSubclass<import("./canisters/management_new/management.types.js")._SERVICE>

type Deps<C, S, D> = {
  [K in keyof C]: {
    // actor: ActorSubclass<C[K]["idlFactory"]>
    // canisterId: C[K]["canisterId"]
    canisterId: string
    actor: ActorSubclass<any>
    // setControllers: (controllers: Array<string>) => Promise<void>,
    // addControllers: (controllers: Array<string>) => Promise<void>
  }
}

export type ExtendedCanisterConfiguration =
  (CanisterConfiguration | RustSpecificProperties | MotokoSpecificProperties | AssetSpecificProperties)
  & {
  _metadata?: { standard?: string; }; dfx_js?: {
    args?: any[];
    canister_id?: {
      [network: string]: string
    }
  }
}

// Define a more specific type for canister configurations
export type TaskCanisterConfiguration<T = ExtendedCanisterConfiguration> = ExtendedCanisterConfiguration & T

// export type TaskCanisterConfiguration = ExtendedCanisterConfiguration

export type TaskScriptConfiguration<
  C,
  S,
  D = Array<`canisters:${keyof C}` | `scripts:${keyof S}` | "canisters:*" | "scripts:*">,
> = {
  dependencies?: D
  fn: (deps: Deps<C, S, D>) => any | Promise<void>
}

export type DfxTs<
  C extends Record<string, TaskCanisterConfiguration>,
  S extends Record<string, TaskScriptConfiguration<C, S>>,
> = {
  canisters: C
  scripts: S
  Defaults?: ConfigDefaults | null
  dfx?: DfxVersion
  /**
   * Mapping between network names and their configurations. Networks 'ic' and 'local' are implicitly defined.
   */
  networks?: {
    [k: string]: ConfigNetwork
  } | null
  profile?: Profile | null
  /**
   * Used to keep track of dfx.json versions.
   */
  version?: number | null
}

export const defineConfig = <
  C extends Record<string, TaskCanisterConfiguration>,
  S extends Record<string, TaskScriptConfiguration<C, S>>,
>(config: DfxTs<C, S>) => {
  return config
}

const appDirectory = fs.realpathSync(process.cwd())

export const Opt = <T>(value?): [T] | [] => {
  return (value || value === 0) ? ([value]) : []
}

const spawn = ({
                 command,
                 args,
                 stdout,
               }) => {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args)
    // @ts-ignore
    child.stdin.setEncoding("utf-8")
    child.stdin.write("yes\n")
    child.stdout.on("data", (data) => {
      if (stdout) {
        stdout(`${data}`)
        return
      }
    })
    child.stderr.on("data", (data) => console.error(`${data}`))
    child.on("close", (code) => resolve(code))
    child.on("error", (err) => reject(err))
  })
}

export const getAccountId = async (principal): Promise<string> => {
  return await new Promise((resolve, reject) => {
    spawn({
      command: "dfx",
      args: ["ledger", "account-id", "--of-principal", principal],
      stdout: (data) => {
        resolve(data.slice(0, -1))
      },
    })
  })
}

export const getCurrentIdentity = async (): Promise<string> => {
  return await new Promise((resolve, reject) => {
    spawn({
      command: "dfx",
      args: ["identity", "whoami"],
      stdout: (data) => {
        resolve(data.slice(0, -1))
      },
    })
  })
}

const emitter = new Emitter()

const waitFor = async (taskName) => {
  return await new Promise((resolve, reject) => {
    emitter.once(taskName, resolve)
  })
}

enum InstallMode {
  install,
  reinstall,
  upgrade,
}

export const deployCanister = async (canisterName: string, canisterConfig) => {
  // const installMode = InstallMode.reinstall
  let mode: { install: null } | { reinstall: null } | { upgrade: null } = { install: null }
  mode = { reinstall: null }
  // switch (installMode) {
  //   case InstallMode.install:
  //     mode = { install: null };
  //     break;
  //   case InstallMode.reinstall:
  //     mode = { reinstall: null };
  //     break;
  //   case InstallMode.upgrade:
  //     mode = { upgrade: null };
  //     break;
  //   default:
  //     mode = { install: null };
  //     break;
  // }
  const { agent, identity } = await getEnv()
  const mgmt = Actor.createActor<ManagementActor>(idlFactory, {
    canisterId: "aaaaa-aa",
    agent,
  })
  // TODO: use didc?
  console.log("Deploying canister with config:", canisterConfig)
  const didPath = canisterConfig.candid + ".js"
  const wasmPath = canisterConfig.wasm
  const canisterDID = await import(didPath)
  // TODO: add args to schema
  let encodedArgs
  try {
    encodedArgs = canisterConfig.dfx_js?.args ? IDL.encode(canisterDID.init({ IDL }), canisterConfig.dfx_js.args) : new Uint8Array()
  } catch (e) {
    console.log("Failed to encode args: ", e)
  }
  // TODO: create random principal?
  let canister_id = canisterConfig.dfx_js?.canister_id?.local
  try {
    // const specified_id = canisterConfig.dfx_js?.canister_id?.local
    canister_id = (await mgmt.provisional_create_canister_with_cycles({
      settings: [{
        compute_allocation: Opt<bigint>(),
        // compute_allocation: Opt<bigint>(100n),
        memory_allocation: Opt<bigint>(), // 8gb
        // memory_allocation: Opt<bigint>(8_000_000_000n), // 8gb
        freezing_threshold: Opt<bigint>(), // 30 days in seconds
        // freezing_threshold: Opt<bigint>(3600n * 24n * 30n), // 30 days in seconds
        controllers: Opt<Principal[]>([
          // TODO: add more
          identity.getPrincipal(),
        ]),
      }],
      // amount: Opt<bigint>(1_000_000_000_000n),
      amount: Opt<bigint>(1_000_000_000_000n),
      specified_id: Opt<Principal>(canister_id ? Principal.from(canister_id) : undefined), // TODO: add custom_id
      sender_canister_version: Opt<bigint>(0n), // TODO: ??
      // sender_canister_version: Opt<bigint>(0n), // TODO: ??
      // settings: [] | [canister_settings];   specified_id: [] | [Principal];   amount: [] | [bigint];   sender_canister_version: [] | [bigint];
    })).canister_id.toText()
    console.log(`Created ${canisterName} with canister_id:`, canister_id)
  } catch (e) {
    console.log("Failed to create canister:", e)
    // throw { kind: "CanisterCreationFailed", error: e }
  }
  try {
    const wasm = Array.from(new Uint8Array(fs.readFileSync(wasmPath)))
    await mgmt.install_code({
      arg: encodedArgs,
      canister_id: Principal.from(canister_id),
      sender_canister_version: Opt<bigint>(),
      wasm_module: wasm,
      mode,
    })
    console.log(`Success with wasm bytes length: ${wasm.length}`)
    console.log(`Installed code for ${canisterName} with canister_id:`, canister_id)
    return canister_id
  } catch (e) {
    console.log("Failed to install code:", e)
  }
}

const execTasks = async (taskStream, currentNetwork = "local") => {
  for await (const { taskName: fullName, taskConfig } of taskStream) {
    const [taskType, taskName] = fullName.split(":")
    console.log(`Running ${taskType} ${taskName}`)
    if (taskType === "canisters") {
      try {
        const canisterName = taskName
        const canisterId = await deployCanister(canisterName, taskConfig)
        let canisterIds = {}
        try {
          const mod = await import(`${appDirectory}/canister_ids.json`, { assert: { type: "json" } })
          canisterIds = mod.default
        } catch (e) {

        }
        canisterIds[canisterName] = {
          ...canisterIds[canisterName],
          [currentNetwork]: canisterId,
        }
        fs.writeFile(`${appDirectory}/canister_ids.json`, JSON.stringify(canisterIds), "utf-8", (err) => {
          if (!err) {
            console.log("Wrote canister id to file")
          } else {
            console.log("Failed to write canister id to file:", err)
          }
        })


      } catch (e) {
        // TODO: dont create actors
        console.log("Failed to deploy canister: ", e)
      }
      try {
        const actors = await createActors([taskName], { canisterConfig: taskConfig })
        console.log("Task finished:", fullName)
        emitter.emit(fullName, actors[taskName])
      } catch (e) {
        // TODO: handle
        console.log("Failed to create actors: ", e)
      }
    }
    if (taskType === "scripts") {
      const taskResult = taskConfig instanceof Promise ? await taskConfig : taskConfig
      console.log("Task finished:", fullName)
      emitter.emit(fullName, taskResult)
    }
  }
}

const createTaskStream = (dfxConfig, tasks) => new Repeater<any>(async (push, stop) => {
  const jobs = tasks.map(async (fullName) => {
    const [taskType, taskName] = fullName.split(":")
    let taskConfig = dfxConfig[taskType][taskName]
    let deps = getDeps(dfxConfig, taskConfig?.dependencies ?? [])
    const depsPromises = deps.map(async (fullName) => {
      const [taskType, taskName] = fullName.split(":")
      const taskResult = await waitFor(fullName)
      return {
        [taskName]: taskResult,
      }
    })
    const taskResults = Object.assign({}, ...await Promise.all(depsPromises))
    let finalConfig
    const isJustFn = typeof taskConfig === "function"
    if (taskType === "canisters") {
      if (isJustFn) {
        finalConfig = taskConfig(...taskResults)
      } else {
        finalConfig = taskConfig
      }
    }
    if (taskType === "scripts") {
      if (isJustFn) {
        finalConfig = taskConfig({ ...taskResults })
      } else {
        finalConfig = typeof taskConfig.fn === "function" ? taskConfig.fn({ ...taskResults }) : taskConfig.fn
      }
    }
    const isPromise = dfxConfig instanceof Promise
    if (isPromise) {
      finalConfig = await finalConfig
    }
    push({ taskName: fullName, taskConfig: finalConfig })
  })
  await Promise.all(jobs)
  stop()
})

// TODO: simplify & rename?
const transformWildcards = (dfxConfig, dep) => {
  const [depType, depName] = dep.split(":")
  // TODO: check for every iteration?
  const isWildcard = depName === "*"
  const hasCanisterWildcard = depType === "canisters" && isWildcard
  const hasScriptWildcard = depType === "scripts" && isWildcard
  const allTasks = isWildcard ? [...new Set([
    ...(hasCanisterWildcard ? Object.keys(dfxConfig.canisters).map((canisterName) => `canisters:${canisterName}`) : []),
    ...(hasScriptWildcard ? Object.keys(dfxConfig.scripts).map((scriptName) => `scripts:${scriptName}`) : []),
  ])] : [dep]
  return allTasks
}

// TODO: write tests
const getDeps = (dfxConfig, tasks) => {
  const walkDeps = (dfxConfig, dep) => {
    const allTasks = transformWildcards(dfxConfig, dep)
    return allTasks.map((task) => {
      const [taskType, taskName] = task.split(":")
      const taskConfig = dfxConfig[taskType][taskName]
      let taskDeps = taskConfig?.dependencies ?? []
      const allDeps = [...taskDeps.map(task => transformWildcards(dfxConfig, task)).flat(), ...taskDeps.map((dep) => walkDeps(dfxConfig, dep)).flat()]
      return allDeps.concat(task)
    }).flat()
  }
  let allDeps = [
    ...new Set([
      ...tasks.map(task => walkDeps(dfxConfig, task)).flat(),
    ]),
  ]
  return allDeps
}

export const runTasks = async (config, tasks: Array<string>) => {
  const allDeps = getDeps(config, tasks)
  const allTasks = [...new Set([...allDeps, ...tasks.map(t => transformWildcards(config, t)).flat()])]
  const taskStream = createTaskStream(config, allTasks)
  await execTasks(taskStream)
  // TODO: return OK?
  return getCanisterIds()
}

export const getDfxConfig = async (configPath: string = "hydra.config.ts") => {
  const appDirectory = fs.realpathSync(process.cwd())
  try {
    const { default: dfxConfig } = await import(path.resolve(appDirectory, configPath))
    return dfxConfig
  } catch (e) {
    console.log(e)
    console.error(e)
  }
}

const getEnv = async () => {
  const identity = (await getIdentity()).identity
  const agent = new HttpAgent({
    // TODO: get dfx port
    host: "http://0.0.0.0:8080",
    identity,
  })
  await agent.fetchRootKey().catch(err => {
    console.warn("Unable to fetch root key. Check to ensure that your local replica is running")
    console.error(err)
  })
  return {
    network: "local",
    agent,
    identity,
  }
}

// TODO: take dfx config as param?
export const createActors = async (
  canisterList: Array<string>,
  { canisterConfig, agentIdentity, currentNetwork = "local" }: {
    canisterConfig: CanisterConfiguration,
    agentIdentity?: Identity,
    currentNetwork?: string,
  }) => {
  const {
    agent,
  } = await getEnv()
  let canisters = canisterList
  let actors = {}
  const canisterIds = getCanisterIds()
  console.log("create actors:", canisterIds)
  for (let canisterName of canisters) {
    // TODO: network support?
    const canisterId = canisterIds[canisterName][currentNetwork]
    // TODO: get did
    const didPath = canisterConfig.candid + ".js"
    // const didPath = `${appDirectory}/.dfx/local/canisters/${canisterName}/${canisterName}.did.js`

    const canisterDID = await import(didPath)
    // TODO: better way of checking? call dfx?
    const canisterExists = fs.existsSync(didPath)
    if (!canisterExists) {
      // TODO: was init() before
      await deployCanister(canisterName, canisterConfig)
    }
    actors[canisterName] = {
      actor: Actor.createActor(canisterDID.idlFactory, {
        agent,
        canisterId,
      }),
      canisterId,
      getControllers: async () => {
        // dfx canister --network "${NETWORK}" update-settings --add-controller "${SNS_ROOT_ID}" "${CID}"
        // await spawn({
        //   command: "dfx",
        // })
      },
      addControllers: async (controllers: Array<string>) => {
        // dfx canister --network "${NETWORK}" update-settings --add-controller "${SNS_ROOT_ID}" "${CID}"
        await spawn({
          command: "dfx",
          args: ["canister", "--network", "local", "update-settings",
            ...controllers.map(c => ["--add-controller", c]),
            canisterId],
          stdout: (data) => {
            console.log(data)
          },
        })
      },
      setControllers: async (controllers: Array<string>) => {
        // dfx canister --network "${NETWORK}" update-settings --add-controller "${SNS_ROOT_ID}" "${CID}"
        let cyclesWallet
        await spawn({
          command: "dfx",
          // TODO: network
          args: ["identity", "get-wallet"],
          stdout: (data) => {
            cyclesWallet = data
          },
        })
        // TODO: error handling
        await spawn({
          command: "dfx",
          // TODO: network
          args: ["canister", "--network", "local", "update-settings",
            ...controllers.map(c => ["--set-controller", c]),
            "--set-controller", cyclesWallet,
            canisterId],
          stdout: (data) => {
            console.log(data)
          },
        })
      },
    }
  }
  return actors
}

// TODO: ........ no top level await
// TODO: clone. make immutable?
// const userConfig = await getDfxConfig()
// const userConfig = {}
// let config = JSON.parse(JSON.stringify(userConfig))
// let config
// const getConfig = async () => config ? JSON.parse(JSON.stringify(config)) : await getDfxConfig()
// type ConfigFn = (config: DfxTs, userConfig: DfxTs) => void
// export const extendConfig = (fn: ConfigFn) => {
//   // TODO: let plugins call this function to extend config
//   fn(config, JSON.parse(JSON.stringify(userConfig)))
// }

// TODO: use dfx identity export ?
export const getIdentity = async (selection?: string): Promise<{
  identity: Ed25519KeyIdentity,
  pem: string,
  name: string,
  principal: string,
  accountId: string
}> => {
  // TODO: pem to identity? not sure
  const identityName: string = selection ?? await getCurrentIdentity()
  const identityExists = fs.existsSync(`${os.homedir()}/.config/dfx/identity/${identityName}/identity.pem`)
  let identity
  if (identityExists) {
    let pem = fs.readFileSync(`${os.homedir()}/.config/dfx/identity/${identityName}/identity.pem`, "utf8")
    pem = pem
      .replace("-----BEGIN PRIVATE KEY-----", "")
      .replace("-----END PRIVATE KEY-----", "")
      .replace("\n", "")
      .trim()

    const raw = Buffer.from(pem, "base64")
      .toString("hex")
      .replace("3053020101300506032b657004220420", "")
      .replace("a123032100", "")
    const key = new Uint8Array(Buffer.from(raw, "hex"))
    identity = Ed25519KeyIdentity.fromSecretKey(key)
    const principal: string = (await identity.getPrincipal()).toText()
    const accountId = await getAccountId(principal)
    return { identity, pem, name: identityName, principal, accountId }
  }
}

export const getUserFromBrowser = async (browserUrl) => {
  // TODO: move out?
  // TODO: get port from vite
  const __dirname = url.fileURLToPath(new URL(".", import.meta.url))
  const browser = await new Promise<{ accountId: string, principal: string }>(async (resolve, reject) => {
    const app = express()
    app.use(express.json())
    app.use(express.static(`${__dirname}/public`))
    app.use(express.static(`${__dirname}/public/assets`))
    const server = app.listen(666)
    // TODO: serve overrides this
    app.post("/key", function(req, res) {
      // TODO: ?
      // const key = Ed25519KeyIdentity.fromJSON(req.body.key)
      // const chain = DelegationChain.fromJSON(req.body.chain)
      // const identity = DelegationIdentity.fromDelegation(key, chain)
      const principal = req.body.principal
      const accountId = principalToAccountId(principal)
      resolve({ principal, accountId })
      res.send("")
      server.close()
    })
    await open(browserUrl)
  })
  return browser
}

export const getCanisterIds = () => {
  const ids = JSON.parse(fs.readFileSync(`${appDirectory}/canister_ids.json`, "utf8"))
  const canisterIds = Object.keys(ids).reduce((acc, canisterName) => {
    if (canisterName !== "__Candid_UI") {
      acc[canisterName] = ids[canisterName]
    }
    return acc
  }, {})
  return canisterIds
}

export const dfxDefaults: DfxJson = {
  defaults: {
    build: {
      packtool: "",
      args: "--force-gc",
    },
    replica: {
      subnet_type: "system",
    },
  },
  networks: {
    local: {
      bind: "127.0.0.1:8080",
      type: "ephemeral",
    },
    staging: {
      providers: [
        "https://ic0.app",
      ],
      "type": "persistent",
    },
    ic: {
      providers: [
        "https://ic0.app",
      ],
      "type": "persistent",
    },
  },
  version: 1,
}

const killDfx = async () => {
  const dfxPids = await find("name", "dfx", true)
  const replicaPids = await find("name", "replica", true)
  const icxProxyPids = await find("name", "icx-proxy", true)
  process.kill(dfxPids[0]?.pid)
  process.kill(replicaPids[0]?.pid)
  process.kill(icxProxyPids[0]?.pid)
}

export const startDfx = async () => {
  await spawn({
    command: "dfx",
    args: ["start", "--background", "--clean"],
    stdout: (data) => {
      // console.log(data)
    },
  })
}

