import type { SignIdentity } from "@dfinity/agent"
import { Config, ConfigError, Context, Effect, Layer } from "effect"
import { makeRuntime } from "../index.js"
import { type ReplicaService } from "../services/replica.js"
import { ProgressUpdate, TaskParamsToArgs } from "../tasks/lib.js"
import { runTask } from "../tasks/run.js"
import type { ICEUser, Task } from "../types/types.js"
import { CLIFlags } from "./cliFlags.js"
import { DefaultConfig, InitializedDefaultConfig } from "./defaultConfig.js"
import { ICEConfigService } from "./iceConfig.js"
import { TaskArgsService } from "./taskArgs.js"

// export type TaskParamsToArgs<T extends Task> = {
// 	[K in keyof T["params"] as T["params"][K] extends { isOptional: true }
// 		? never
// 		: K]: T["params"][K] extends TaskParam
// 		? StandardSchemaV1.InferOutput<T["params"][K]["type"]>
// 		: never
// } & {
// 	[K in keyof T["params"] as T["params"][K] extends { isOptional: true }
// 		? K
// 		: never]?: T["params"][K] extends TaskParam
// 		? StandardSchemaV1.InferOutput<T["params"][K]["type"]>
// 		: never
// }

export interface TaskCtxShape<A extends Record<string, unknown> = {}> {
	readonly users: {
		[name: string]: {
			identity: SignIdentity
			// agent: HttpAgent
			principal: string
			accountId: string
			// TODO: neurons?
		}
	}
	readonly roles: {
		deployer: ICEUser
		minter: ICEUser
		controller: ICEUser
		treasury: ICEUser
		[name: string]: {
			identity: SignIdentity
			principal: string
			accountId: string
		}
	}
	readonly replica: ReplicaService

	readonly runTask: {
		<T extends Task>(task: T): Promise<Effect.Effect.Success<T["effect"]>>
		<T extends Task>(
			task: T,
			args: TaskParamsToArgs<T>,
		): Promise<Effect.Effect.Success<T["effect"]>>
	}

	readonly currentNetwork: string
	readonly networks: {
		[key: string]: {
			replica: ReplicaService
			host: string
			port: number
			// subnet: Subnet?
		}
	}
	readonly args: A
	readonly taskPath: string
	readonly appDir: string
	readonly iceDir: string
	readonly depResults: Record<
		string,
		{
			cacheKey: string | undefined
			result: unknown
		}
	>
}

// interface Task {
//     // The public task API
//     start: () => Effect.Effect<void, never, never>;
//   }

//   type MakeTaskFn = (taskId: string) => Effect.Effect<Task, never, never>;

//   class Tasks extends Effect.Service<Tasks>()('tasks', {
//     dependencies: [Agents.Default, DB.Default],
//     effect: Effect.gen(function* () {
//       const db = yield* DB;
//       const agents = yield* Agents;

//       // have to explicitly type it, otherwise end up w any due to the recursive call
//       const make: MakeTaskFn = Effect.fn("Tasks.make")(function* (taskId: string) {
//         const task = yield* db.getTask(taskId);
//         const agent = yield* agents.make(task.agentId);

//         const start = Effect.fn("Tasks.make.start")(function* () {
//           // just an example to demonstrate the recursive call...
//           for (const step of task.steps) {
//             if (step.delegate) {
//               // is this OK?
//               const subtask = yield* make(step.id);
//             }
//           }
//         });

//         return { start };
//       });

//       return { make };
//     }),
//   }) {}

interface TaskCtxServiceShape {
	make: (
		taskPath: string,
		task: Task,
		argsMap: Record<string, unknown>,
		depResults: Record<
			string,
			{ cacheKey: string | undefined; result: unknown }
		>,
		progressCb: (update: ProgressUpdate<unknown>) => void,
	) => Effect.Effect<TaskCtxShape, ConfigError.ConfigError | Error>
}

export class TaskCtxService extends Context.Tag("TaskCtxService")<
	TaskCtxService,
	TaskCtxServiceShape
>() {
	static Live = Layer.effect(this, Effect.gen(function* () {
		const defaultConfig = yield* DefaultConfig
		// const { appDir, iceDir } = yield* Config
		const appDir = yield* Config.string("APP_DIR")
		const iceDir = yield* Config.string("ICE_DIR_NAME")
		const { config } = yield* ICEConfigService
		const { globalArgs, taskArgs: cliTaskArgs } = yield* CLIFlags
		const { taskArgs } = yield* TaskArgsService
		const currentNetwork = globalArgs.network ?? "local"
		const currentNetworkConfig =
			config?.networks?.[currentNetwork] ??
			defaultConfig.networks[currentNetwork]
		const currentReplica = currentNetworkConfig?.replica
		if (!currentReplica) {
			return yield* Effect.fail(
				new Error(`No replica found for network: ${currentNetwork}`),
			)
		}
		const currentUsers = config?.users ?? {}
		const networks = config?.networks ?? defaultConfig.networks
		// TODO: merge with defaultConfig.roles
		const initializedRoles: Record<string, ICEUser> = {}
		for (const [name, user] of Object.entries(config?.roles ?? {})) {
			if (!currentUsers[user]) {
				return yield* Effect.fail(
					new Error(`User ${user} not found in current users`),
				)
			}
			initializedRoles[name] = currentUsers[user]
		}
		const resolvedRoles: {
			[key: string]: ICEUser
		} & InitializedDefaultConfig["roles"] = {
			...defaultConfig.roles,
			...initializedRoles,
		}
		const iceConfigService = yield* ICEConfigService
		// const currentContext =
		// 	yield* Effect.context<
		// 		ManagedRuntime.ManagedRuntime.Context<ReturnType<typeof makeRuntime>>
		// 	>()
		// We have to reuse the service or task references will be different
		// as the task tree gets recreated each time
		// const iceConfigService = Context.get(currentContext, ICEConfigService)
		const iceConfigServiceLayer = Layer.succeed(
			ICEConfigService,
			iceConfigService,
		)
		const make: TaskCtxServiceShape["make"] = Effect.fn("TaskCtx.make")(
			function* (
				taskPath: string,
				task: Task,
				argsMap: Record<string, unknown>,
				depResults: Record<
					string,
					{
						cacheKey: string | undefined
						result: unknown
					}
				>,
				progressCb: (update: ProgressUpdate<unknown>) => void,
			) {
				return {
					...defaultConfig,
					taskPath,
					// TODO: wrap with proxy?
					// runTask: asyncRunTask,
					runTask: async <T extends Task>(
						task: T,
						args: TaskParamsToArgs<T> = {} as TaskParamsToArgs<T>,
					): Promise<Effect.Effect.Success<T["effect"]>> => {
						// TODO: convert to positional and named args
						// const taskArgs = mapToTaskArgs(task, args)
						// const { positional, named } = resolveArgsMap(task, args)
						// const positionalArgs = positional.map((p) => p.name)
						// const namedArgs = Object.fromEntries(
						// 	Object.entries(named).map(([name, param]) => [
						// 		name,
						// 		param.name,
						// 	]),
						// )
						// const taskArgs = args.map((arg) => {
						const runtime = makeRuntime({
							globalArgs,
							// TODO: pass in as strings now
							// strings should be parsed outside of makeRuntime
							taskArgs: args,
							iceConfigServiceLayer,
						})
						const result = runtime
							.runPromise(runTask(task, args, progressCb))
							.then((result) => result.result)
						return result
					},
					replica: currentReplica,
					currentNetwork,
					networks,
					users: {
						...defaultConfig.users,
						...currentUsers,
					},
					roles: resolvedRoles,
					// TODO: taskArgs
					// what format? we need to check the task itself
					args: argsMap,
					depResults,
					appDir,
					iceDir,
				}
			},
		)
		return { make }
		}),
	)
	// static Test = {}
}

// export class TaskCtx extends Context.Tag("TaskCtx")<
// 	TaskCtx,
// 	TaskCtxService
// >() {
// 	static Live = Layer.effect(
// 		this,
// 		Effect.gen(function* () {
// 			const defaultConfig = yield* DefaultConfig
// 			// const { appDir, iceDir } = yield* Config
// 			const appDir = yield* Config.string("APP_DIR")
// 			const iceDir = yield* Config.string("ICE_DIR_NAME")

// 			const { config } = yield* ICEConfigService
// 			const { globalArgs, taskArgs: cliTaskArgs } = yield* CLIFlags
// 			const { taskArgs } = yield* TaskArgsService
// 			const currentNetwork = globalArgs.network ?? "local"
// 			const currentNetworkConfig =
// 				config?.networks?.[currentNetwork] ??
// 				defaultConfig.networks[currentNetwork]
// 			const currentReplica = currentNetworkConfig?.replica
// 			if (!currentReplica) {
// 				return yield* Effect.fail(
// 					new Error(`No replica found for network: ${currentNetwork}`),
// 				)
// 			}
// 			const currentUsers = config?.users ?? {}
// 			const networks = config?.networks ?? defaultConfig.networks
// 			// TODO: merge with defaultConfig.roles

// 			const initializedRoles: Record<string, ICEUser> = {}
// 			for (const [name, user] of Object.entries(config?.roles ?? {})) {
// 				if (!currentUsers[user]) {
// 					return yield* Effect.fail(
// 						new Error(`User ${user} not found in current users`),
// 					)
// 				}
// 				initializedRoles[name] = currentUsers[user]
// 			}

// 			const resolvedRoles: {
// 				[key: string]: ICEUser
// 			} & InitializedDefaultConfig["roles"] = {
// 				...defaultConfig.roles,
// 				...initializedRoles,
// 			}
// 			const currentContext =
// 				yield* Effect.context<
// 					ManagedRuntime.ManagedRuntime.Context<ReturnType<typeof makeRuntime>>
// 				>()
// 			// We have to reuse the service or task references will be different
// 			// as the task tree gets recreated each time
// 			const iceConfigService = Context.get(currentContext, ICEConfigService)
// 			const iceConfigServiceLayer = Layer.succeed(
// 				ICEConfigService,
// 				iceConfigService,
// 			)

// 			const make = Effect.fn("TaskCtx.make")(function* (
// 				taskPath: string,
// 				task: Task,
// 				argsMap: Record<string, unknown>,
// 				depResults: Record<
// 					string,
// 					{
// 						cacheKey: string | undefined
// 						result: unknown
// 					}
// 				>,
// 				progressCb: (update: ProgressUpdate<unknown>) => void,
// 			) {
// 				return {
// 					...defaultConfig,
// 					taskPath,
// 					// TODO: wrap with proxy?
// 					// runTask: asyncRunTask,
// 					runTask: async <T extends Task>(
// 						task: T,
// 						args: TaskParamsToArgs<T> = {} as TaskParamsToArgs<T>,
// 					): Promise<Effect.Effect.Success<T["effect"]>> => {
// 						// TODO: convert to positional and named args
// 						// const taskArgs = mapToTaskArgs(task, args)
// 						// const { positional, named } = resolveArgsMap(task, args)
// 						// const positionalArgs = positional.map((p) => p.name)
// 						// const namedArgs = Object.fromEntries(
// 						// 	Object.entries(named).map(([name, param]) => [
// 						// 		name,
// 						// 		param.name,
// 						// 	]),
// 						// )
// 						// const taskArgs = args.map((arg) => {
// 						// const runtime = makeRuntime({
// 						// 	globalArgs,
// 						// 	// TODO: pass in as strings now
// 						// 	// strings should be parsed outside of makeRuntime
// 						// 	taskArgs: args,
// 						// 	iceConfigServiceLayer,
// 						// })
// 						// const result = runtime
// 						// 	.runPromise(runTask(task, args, progressCb))
// 						// 	.then((result) => result.result)
// 						// return result
//                         return Effect.succeed({}) as Effect.Effect.Success<T["effect"]>
// 					},
// 					replica: currentReplica,
// 					currentNetwork,
// 					networks,
// 					users: {
// 						...defaultConfig.users,
// 						...currentUsers,
// 					},
// 					roles: resolvedRoles,
// 					// TODO: taskArgs
// 					// what format? we need to check the task itself
// 					args: argsMap,
// 					depResults,
// 					appDir,
// 					iceDir,
// 				}
// 			})
// 			return { make }
// 		}),
// 	)
// }

// const taskLayer = Layer.mergeAll(
// 	Layer.succeed(TaskCtx, {
// 		...defaultConfig,
// 		// TODO: wrap with proxy?
// 		// runTask: asyncRunTask,
// 		runTask: async <T extends Task>(
// 			task: T,
// 			args: TaskParamsToArgs<T> = {} as TaskParamsToArgs<T>,
// 		): Promise<Effect.Effect.Success<T["effect"]>> => {
// 			// TODO: convert to positional and named args
// 			// const taskArgs = mapToTaskArgs(task, args)
// 			// const { positional, named } = resolveArgsMap(task, args)
// 			// const positionalArgs = positional.map((p) => p.name)
// 			// const namedArgs = Object.fromEntries(
// 			// 	Object.entries(named).map(([name, param]) => [
// 			// 		name,
// 			// 		param.name,
// 			// 	]),
// 			// )
// 			// const taskArgs = args.map((arg) => {
// 			const runtime = makeRuntime({
// 				globalArgs,
// 				// TODO: pass in as strings now
// 				// strings should be parsed outside of makeRuntime
// 				taskArgs: args,
// 				iceConfigServiceLayer,
// 			})
// 			const result = runtime.runPromise(
// 				runTask(task, args, progressCb),
// 			).then((result) => result.result)
// 			return result
// 		},
// 		replica: currentReplica,
// 		currentNetwork,
// 		networks,
// 		users: {
// 			...defaultConfig.users,
// 			...currentUsers,
// 		},
// 		roles: resolvedRoles,
// 		// TODO: taskArgs
// 		// what format? we need to check the task itself
// 		args: argsMap,
// 	}),
// 	Layer.setConfigProvider(
// 		ConfigProvider.fromMap(
// 			new Map([...Array.from(configMap.entries())]),
// 		),
// 	),
// )
