![image](https://github.com/user-attachments/assets/90c9aaeb-8421-4595-bd29-89b046636dda)


# ICE

ICE is a powerful task runner and CLI tool for the Internet Computer (similar to hardhat). With ICE, you can create composable workflows, simplify complex setups, and manage canister deployments using TypeScript instead of bash, taking the development experience of the Internet Computer to the next level.

## Features

- **Composable**: Easily build complex workflows.
- **Type-Safe**: Get instant feedback on configuration errors.
- **NPM Canisters**: Install popular canisters (ICRC1, Ledger, NFID, Internet Identity) with zero setup.
- **Smart Context & dependencies**: Automatic setup of actors, users, and other env variables from inside your scripts
- **VSCode Extension**: Run tasks directly in your editor with inline results.

## Quick Start

1. Install the necessary packages:
   ```bash
   npm i -S @ice.ts/runner @ice.ts/canisters
   ```

2. Create an `ice.config.ts` file in your project root:
   ```typescript
   import { motokoCanister } from '@ice.ts/runner';

   export const my_canister = motokoCanister({
     src: 'canisters/my_canister/main.mo',
   })
   ```

3. Now its available under the exported name:
   ```bash
   npx ice run my_canister
   ```

4. Or deploy all canisters:
   ```bash
   npx ice
   ```


   ![Kapture 2025-02-24 at 16 28 03](https://github.com/user-attachments/assets/877aa26e-c8f6-4120-8cd5-df6276f1121d)

# Core concepts

## Tasks

Tasks are the main building block of ICE. They are composable, type-safe and can depend on other tasks.

```typescript
import { task } from "@ice.ts/runner";

export const mint_tokens = task("mint tokens")
  .deps({
    icrc1_ledger,
  })
  .run(async ({ deps: { icrc1_ledger } }) => {
    await icrc1_ledger.actor.icrc1_transfer({
      to: testUser,
      fee: [],
      memo: [],
      from_subaccount: [],
      created_at_time: [],
      amount: 1000000000n,
    })

    const balance = await icrc1_ledger.actor.icrc1_balance_of(testUser)
    const symbol = await icrc1_ledger.actor.icrc1_symbol()

    console.log(`balance: ${balance} ${symbol}`)
  })
```

Run the task:

```bash
npx ice run mint_tokens
```

## Dependencies

Define inter-canister or task dependencies easily.

```typescript
import { motokoCanister } from "@ice.ts/runner";

// Create a canister that depends on another one
export const my_other_canister = motokoCanister({
  src: "canisters/my_other_canister/main.mo",
})
  .deps({ my_canister })
```

You can also declare requirements and provide them later:

```typescript
export const MyCanister = () => motokoCanister({
  src: "canisters/my_canister/main.mo",
})
   .dependsOn({ my_other_canister })
```
Later, we can provide the requirements.

```typescript
import { my_canister } from "./src/my_canister"

export const my_other_canister = motokoCanister({
  src: "canisters/my_other_canister/main.mo",
})

export const my_canister = MyCanister().deps({ my_other_canister })
```
You’ll get type-level warnings if dependencies aren’t met:

<img src="https://github.com/user-attachments/assets/eca864f2-69ce-4d15-b82b-67b1b5f9224f" height="100">


## Install args

Pass fully typed install arguments instead of manual candid strings.

```typescript
import { motokoCanister, task } from "@ice.ts/runner";

// Create a canister that depends on another one
export const my_other_canister = motokoCanister({
  src: "canisters/my_other_canister/main.mo",
})
  .deps({ my_canister })
  .installArgs(async ({ deps }) => {
    // We have access to the actor & 
    const someVal = await deps.my_canister.actor.someMethod();
    // installArgs can do whatever complex setup steps they wish
    const installArgs = [deps.my_canister.canisterId, someVal]
    return installArgs;
  })
```

We get type-level warnings for invalid args

<img src="https://github.com/user-attachments/assets/ce5b11db-810e-4a6b-b1b0-60421445cddf" height="120">


## Context

Every task and canister gets a shared context with env variables, user info, and more.

```typescript

import { task } from "@ice.ts/runner";

export const example_task = task("example task")
  .run(async ({ ctx }) => {
    console.log(ctx.users.default.principal)
    console.log(ctx.users.default.accountId)

    // Run another task dynamically
    const result = await ctx.runTask(my_other_task)
  })
```

## Pre-built canisters

Use popular canisters with a single line of code. ICE provides ready-to-use setups for many common canisters.

```typescript
import {
  InternetIdentity,
  ICRC1Ledger,
  DIP721,
  Ledger,
  DIP20,
  CapRouter,
  NNS,
  CandidUI,
  ICRC7NFT,
  CyclesWallet,
  CyclesLedger,
  NFID,
} from "@ice.ts/canisters"

export const nns = NNS()
export const icrc7_nft = ICRC7NFT()
export const nfid = NFID()
// And more...
```
It's that easy.

## 🔌 VSCode Extension

Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=MioQuispe.vscode-ice-extension).


- **Inline CodeLens:** Quickly execute tasks directly from your source code.
- **Actor Call Results:** results are displayed inline in your code. No more console logs.

![Kapture 2025-02-23 at 22 16 11](https://github.com/user-attachments/assets/66bfbea1-ca18-4b1e-8b91-a16bf37d7aea)


## Community & Support

Feel free to open an issue, PR or join the Discord and message me there.

- [Discord](https://discord.gg/SdeC8PF69M)
- [Twitter](https://twitter.com/antimaximal)
