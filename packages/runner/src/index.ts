import fs from "node:fs"
import {
	Data,
	Layer,
	ManagedRuntime,
	Logger,
	ConfigProvider,
	LogLevel,
} from "effect"
import { NodeContext } from "@effect/platform-node"
import { DfxService } from "./services/dfx.js"
import type { TaskTree, TaskTreeNode } from "./types/types.js"
import { Moc } from "./services/moc.js"
import { TaskRegistry } from "./services/taskRegistry.js"
import { ICEConfigService } from "./services/iceConfig.js"
import { CanisterIdsService } from "./services/canisterIds.js"
import { TaskCtx } from "./tasks/lib.js"
export * from "./builders/index.js"

export const configMap = new Map([
	["APP_DIR", fs.realpathSync(process.cwd())],
	["DFX_CONFIG_FILENAME", "ice.config.ts"],
	["CANISTER_IDS_FILENAME", "canister_ids.json"],
	// TODO: IC_PORT / IC_HOST
	["DFX_PORT", "8080"],
	["DFX_HOST", "http://0.0.0.0"],
	["REPLICA_PORT", "8080"],
])

export const configLayer = Layer.setConfigProvider(
	ConfigProvider.fromMap(configMap),
)

export class DeploymentError extends Data.TaggedError("DeploymentError")<{
	message: string
}> {}

export class ConfigError extends Data.TaggedError("ConfigError")<{
	message: string
}> {}

// TODO: layer memoization should work? do we need this?
const DfxLayer = DfxService.Live.pipe(
	Layer.provide(NodeContext.layer),
	Layer.provide(configLayer),
)
// TODO: construct later? or this is just defaults
export const DefaultsLayer = Layer.mergeAll(
	NodeContext.layer,
	DfxLayer,
	TaskRegistry.Live,
	TaskCtx.Live.pipe(Layer.provide(DfxLayer), Layer.provide(NodeContext.layer)),
	Moc.Live.pipe(Layer.provide(NodeContext.layer)),
	configLayer,
	ICEConfigService.Live.pipe(Layer.provide(NodeContext.layer)),
	CanisterIdsService.Live.pipe(
		Layer.provide(NodeContext.layer),
		Layer.provide(configLayer),
	),
)

export const CLILayer = Layer.mergeAll(
	DefaultsLayer,
	Logger.pretty,
	// TODO: set with logLevel flag
	Logger.minimumLogLevel(LogLevel.Info),
)

export const TUILayer = Layer.mergeAll(
	DefaultsLayer,
	Logger.minimumLogLevel(LogLevel.Debug),
)
export const runtime = ManagedRuntime.make(CLILayer)
export { runCli } from "./cli/index.js"
export { Opt } from "./canister.js"
export type { TaskCtxShape } from "./tasks/lib.js"
