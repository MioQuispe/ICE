import * as fs from "node:fs"
import * as path from "node:path"
import { promisify } from "node:util"

const appendFile = promisify(fs.appendFile)

// A function to append logs to instrumentation.json
export async function writeLogEntry(entry: any): Promise<void> {
  // Make sure .ice/logs directory is present
  const logsDir: string = path.join(process.cwd(), ".ice", "logs")
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }

  // The final log file
  const logFile: string = path.join(logsDir, "instrumentation.json")

  // Use a JSON replacer to convert BigInt values to strings
  const line: string = `${JSON.stringify(
    entry,
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
  )}\n`
  await appendFile(logFile, line, "utf8")
}

type ActorMethod = (...args: any[]) => Promise<any>

export const formatResult = (arg: unknown): string => {
  if (typeof arg === "bigint") {
    return arg.toString()
  }
  // Try to stringify the argument, handling BigInts gracefully.
  try {
    return typeof arg === "string"
      ? arg
      : JSON.stringify(arg, (_, value) =>
          typeof value === "bigint" ? value.toString() : value,
        )
  } catch (err) {
    return String(arg)
  }
}

// A simple helper to parse out file/line from an Error stack
export function parseCallSite(errStack: string): { file?: string; line?: number } {
  // Use .split("\n") to handle real newlines in typical Node stacks
  const lines = errStack.split("\n")
  for (const l of lines) {
    // If your user code is in "ice.config.ts" or some other file,
    // check that the line references it. Also note some stacks might say "file://..."
    if (l.includes("ice.config.ts")) {
      // Typically looks like:
      //   at Object.<anonymous> (/Users/.../ice.config.ts:30:11)
      const match = l.match(/\(([^:]+):(\d+):(\d+)\)/)
      // or if there's a file:// scheme, you might do:
      // const match = l.match(/\((?:file:\/\/)?([^:]+):(\d+):(\d+)\)/)
      if (match) {
        const file = match[1]
        const line = Number.parseInt(match[2])
        return { file, line }
      }
    }
  }
  return {}
}

/**
 * Wraps a canister actor so each method call logs:
 * - methodName
 * - file & line from the caller
 * - args & result
 * - timestamps
 */
export function proxyActor<T extends Record<string, any>>(
  actorName: string,
  actor: T,
): T {
  return new Proxy(actor, {
    get(target, propKey, receiver) {
      const original = Reflect.get(target, propKey, receiver)
      if (typeof original === "function") {
        return async (...args: any[]) => {
          const start = Date.now()
          let result: any
          let success = true

          // capture call site:
          const e = new Error()
          // see the actual stack if needed to debug:
          // console.log("Stack = ", e.stack)
          const trace = parseCallSite(e.stack || "")

          try {
            // @ts-ignore
            result = await original.apply(target, args)
          } catch (err: any) {
            success = false
            result = { error: String(err) }
          }
          const end = Date.now()

          const logEntry = {
            timestamp: start,
            duration: end - start,
            actorName,
            methodName: String(propKey),
            file: trace.file, // e.g. /Users/you/project/ice.config.ts
            line: trace.line, // e.g. 30
            args,
            result: formatResult(result),
            success,
          }

          await writeLogEntry(logEntry)

          if (!success) {
            throw new Error(`Actor method ${String(propKey)} failed: ${result.error}`)
          }
          return result
        }
      }
      return original
    },
  })
}

const createLogEntry = async (e: Error, result: unknown): Promise<void> => {
	const start = Date.now()
	let success = true
	const trace = parseCallSite(e.stack || "")

	const end = Date.now()

	const logEntry = {
		timestamp: start,
		duration: end - start,
		file: trace.file, 
		line: trace.line,
		result: formatResult(result),
		success,
	}
	await writeLogEntry(logEntry)
}

export async function patchGlobals<T>(fn: () => Promise<T>): Promise<T> {
  const originalConsoleLog = console.log
  console.log = (...args: unknown[]): void => {
    const error = new Error()
    createLogEntry(error, args)
    originalConsoleLog(...args)
  }
  try {
    return await fn()
  } finally {
    console.log = originalConsoleLog
  }
}

// export async function patchFn<T>(fn: T): T {
//   return (...args: any[]) => {
//     // TODO: log etc.
//     const error = new Error()
//     createLogEntry(error, args)
//     return fn(...args)
//   }
// }
