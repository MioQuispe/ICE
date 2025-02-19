import { Effect, Layer, Console } from "effect"
import { Command, Options, Args, ValidationError } from "@effect/cli"
import { CommandMismatch, isCommandMismatch } from "@effect/cli/ValidationError"
import {
  canistersBindingsTask,
  canistersBuildTask,
  canistersCreateTask,
  canistersDeployTask,
  canistersInstallTask,
  canistersStatusTask,
  DefaultsLayer,
  listCanistersTask,
  listTasksTask,
  runTaskByPath,
  runtime,
} from "../index.js"
import type { CrystalConfig, TaskTree } from "../types/types.js"
import { uiTask } from "./ui/index.js"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { CrystalConfigService } from "../services/crystalConfig.js"
import { commandMismatch } from "@effect/cli/ValidationError"

// TODO: populate subcommands with tasks from crystalConfig
const makeCliApp = ({
  config,
  taskTree,
}: {
  config: CrystalConfig
  taskTree: TaskTree
}) => {
  // TODO: we need to construct this dynamically if we want space delimited task paths
  // Basic run command for executing tasks
  const taskPath = Args.text({ name: "taskPath" }).pipe(
    Args.withDescription("Path to the task (e.g. 'scope:task' or 'task')"),
  )
  const runCommand = Command.make("run", { taskPath }, ({ taskPath }) =>
    runTaskByPath(taskPath),
  ).pipe(Command.withDescription("Run a Crystal task"))

  // TODO: deploy
  const canistersDeployCommand = Command.make("canisters", {}, () =>
    canistersDeployTask(),
  ).pipe(Command.withDescription("Deploy all canisters"))

  const canistersCreateCommand = Command.make("canisters:create", {}, () =>
    canistersCreateTask(),
  ).pipe(Command.withDescription("Create all canisters"))

  const canistersBuildCommand = Command.make("canisters:build", {}, () =>
    canistersBuildTask(),
  ).pipe(Command.withDescription("Build all canisters"))

  const canistersBindingsCommand = Command.make("canisters:bindings", {}, () =>
    canistersBindingsTask(),
  ).pipe(Command.withDescription("Generate bindings for all canisters"))

  const canistersInstallCommand = Command.make("canisters:install", {}, () =>
    canistersInstallTask(),
  ).pipe(Command.withDescription("Install all canisters"))

  const canistersStatusCommand = Command.make("canisters:status", {}, () =>
    canistersStatusTask(),
  ).pipe(Command.withDescription("Get status of all canisters"))

  const canistersRemoveCommand = Command.make("canisters:remove", {}, () =>
    Effect.gen(function* () {
      yield* Console.log("Coming soon...")
      // TODO: remove a canister
    }),
  ).pipe(Command.withDescription("Remove all canisters"))

  const listCommand = Command.make("list", {}, () => listTasksTask()).pipe(
    Command.withDescription("List all tasks"),
  )

  const listCanistersCommand = Command.make("list:canisters", {}, () =>
    listCanistersTask(),
  ).pipe(Command.withDescription("List all canisters"))

  const uiCommand = Command.make("ui", {}, () =>
    // Effect.gen(function* () {
    //   yield* Console.log("Coming soon...")
    //   // TODO: open the UI
    // }),
    uiTask({ config, taskTree }),
  ).pipe(Command.withDescription("Open the Crystal UI"))

  const crystalCommand = Command.make("crystal", {}).pipe(
    Command.withSubcommands([
      runCommand,
      canistersDeployCommand,
      canistersCreateCommand,
      canistersBuildCommand,
      canistersBindingsCommand,
      canistersInstallCommand,
      canistersRemoveCommand,
      canistersStatusCommand,
      listCommand,
      listCanistersCommand,
      uiCommand,
    ]),
  )
  // .pipe(Effect.catchTag(ValidationError, (error) => Effect.logError(error)))

  const cli = Command.run(crystalCommand, {
    name: "Crystal CLI",
    version: "0.0.1",
  })
  return cli
}

// TODO: can we load the crystalConfig before running the cli?
// Prepare and run the CLI application
export const runCli = async () => {
  runtime.runPromise(
    Effect.gen(function* () {
      const { config, taskTree } = yield* CrystalConfigService
      const cli = makeCliApp({ config, taskTree })
      return cli(process.argv).pipe(
        Effect.catchAll((error: unknown) => {
          // @ts-ignore
          if (isCommandMismatch(error)) {
            return Console.error("Invalid command")
          }
          return Console.error("CLI Validation Error:", error)
        }),
      ).pipe(
        // @ts-ignore
        Effect.provide(DefaultsLayer),
        NodeRuntime.runMain,
      )
    }),
  )
}
