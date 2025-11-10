import {
  Address,
  BASE_FEE,
  Contract,
  nativeToScVal,
  scValToNative,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import {
  TransactionBuilder as BaseTransactionBuilder,
  Transaction as BaseTransaction,
} from "@stellar/stellar-base";
import { networkPassphrase, rpcUrl } from "./util";

const ALLOW_HTTP = rpcUrl.startsWith("http://");

type SorobanRpcNamespace = any;
type SorobanRpcServer = any;

let sorobanRpc: SorobanRpcNamespace | null = null;
let sorobanRpcPromise: Promise<SorobanRpcNamespace> | null = null;
let serverInstance: SorobanRpcServer | null = null;

const loadSorobanRpc = async (): Promise<SorobanRpcNamespace> => {
  if (sorobanRpc) {
    return sorobanRpc;
  }
  if (!sorobanRpcPromise) {
    sorobanRpcPromise = import("@stellar/stellar-sdk/rpc")
      .catch(() => import("@stellar/stellar-sdk"))
      .then((resolved) => {
        const rpcModule =
          (resolved as Record<string, unknown>).Server !== undefined
            ? (resolved as SorobanRpcNamespace)
            : ((resolved as Record<string, unknown>).SorobanRpc as
                | SorobanRpcNamespace
                | undefined);

        if (!rpcModule || !rpcModule.Server) {
          throw new Error(
            "Soroban RPC client is unavailable. Ensure @stellar/stellar-sdk version >= 12 and that bundler polyfills are configured.",
          );
        }

        sorobanRpc = rpcModule;
        return rpcModule;
      });
  }
  return sorobanRpcPromise;
};

const getServer = async (): Promise<SorobanRpcServer> => {
  if (serverInstance) {
    return serverInstance;
  }
  const SorobanRpc = await loadSorobanRpc();
  serverInstance = new SorobanRpc.Server(rpcUrl, { allowHttp: ALLOW_HTTP });
  return serverInstance;
};

export const getLatestLedgerSequence = async (): Promise<number> => {
  const server = await getServer();
  const latest = await server.getLatestLedger();
  if (typeof latest === "number") {
    return latest;
  }
  if (latest && typeof latest === "object" && "sequence" in latest) {
    return Number((latest as { sequence: string | number }).sequence);
  }
  throw new Error("Unable to fetch latest ledger sequence");
};

export const CONTRACTS = {
  ORACLE_VERIFIER: "CDY3MOHJ2HIOFPIW7QKLG2QWS7GPYJ4TQJ6UIVWYGTPBVAPJXG6ADWNC",
  LOAN_MANAGER: "CA64F56FWA7OGCONPCHJMEMW4OOKLJG7GKECWTK4ORIZTXGEF4O53V5G",
  LENDING_POOL: "CC5B4P4JJQMCTOYHR6LD6MYKPGAEHCOMIMJ6V65KM5X5XVUA6VQZ6RQG",
  REMITTANCE_NFT: "CBYVSIBDGYZMNS5VFZ3AVOEGCYEXPPVTBAKQHQ25JM5S7CT4EZNNOU4I",
  TEST_TOKEN: "CBDCY7FEWZ6P7ETHLD7OMMVTU5UMJ4JEFYGYVO22ZYJGIL7JAC5BESPT",
} as const;

export const toScVal = {
  address(value: string | Address) {
    const addr = typeof value === "string" ? Address.fromString(value) : value;
    return addr.toScVal();
  },
  symbol(value: string) {
    return nativeToScVal(value, { type: "symbol" });
  },
  string(value: string) {
    return nativeToScVal(value, { type: "string" });
  },
  u32(value: number) {
    return nativeToScVal(value, { type: "u32" });
  },
  u64(value: bigint | number | string) {
    const val =
      typeof value === "bigint" ? value : BigInt(value as number | string);
    return nativeToScVal(val.toString(), { type: "u64" });
  },
  i128(value: bigint | number | string) {
    const val =
      typeof value === "bigint" ? value : BigInt(value as number | string);
    return nativeToScVal(val.toString(), { type: "i128" });
  },
  bool(value: boolean) {
    return nativeToScVal(value, { type: "bool" });
  },
  vec(values: xdr.ScVal[]) {
    return xdr.ScVal.scvVec(values);
  },
};

type BuildContractTransactionArgs = {
  contractId: string;
  method: string;
  args: xdr.ScVal[];
  publicKey: string;
  fee?: number | string;
};

export const buildContractTransaction = async ({
  contractId,
  method,
  args,
  publicKey,
  fee = BASE_FEE,
}: BuildContractTransactionArgs) => {
  const rpcServer = await getServer();
  const sourceAccount = await rpcServer.getAccount(publicKey);

  const contract = new Contract(contractId);
  const unsignedTx = new TransactionBuilder(sourceAccount, {
    fee: fee.toString(),
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const transaction = BaseTransactionBuilder.fromXDR(
    unsignedTx.toXDR(),
    networkPassphrase,
  ) as BaseTransaction;

  const simulation = await rpcServer.simulateTransaction(transaction);

  if ("error" in simulation && simulation.error) {
    throw new Error(
      `Simulation failed: ${
        typeof simulation.error === "string"
          ? simulation.error
          : JSON.stringify(simulation.error)
      }`,
    );
  }

  const prepared = await rpcServer.prepareTransaction(transaction);

  return { transaction: prepared, simulation };
};

type SimulateContractCallArgs = {
  contractId: string;
  method: string;
  args: xdr.ScVal[];
  publicKey: string;
};

export const simulateContractCall = async ({
  contractId,
  method,
  args,
  publicKey,
}: SimulateContractCallArgs) => {
  await loadSorobanRpc();
  const rpcServer = await getServer();
  const sourceAccount = await rpcServer.getAccount(publicKey);

  const contract = new Contract(contractId);
  const unsignedTx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE.toString(),
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const transaction = BaseTransactionBuilder.fromXDR(
    unsignedTx.toXDR(),
    networkPassphrase,
  ) as BaseTransaction;

  const simulation = await rpcServer.simulateTransaction(transaction);

  if (simulation?.error) {
    throw new Error(
      `Simulation failed: ${
        typeof simulation.error === "string"
          ? simulation.error
          : JSON.stringify(simulation.error)
      }`,
    );
  }

  const retval = simulation?.result?.retval ?? simulation?.returnValue;

  if (!retval) {
    return null;
  }

  try {
    return scValToNative(retval);
  } catch (err) {
    console.warn("Failed to convert SCVal to native value", err);
    return retval;
  }
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type SubmitResponse = {
  hash: string;
  status: string;
  result?: unknown;
  raw: unknown;
};

export const submitTransaction = async (
  signedXdr: string | Transaction,
): Promise<SubmitResponse> => {
  await loadSorobanRpc();
  const rpcServer = await getServer();
  const tx =
    typeof signedXdr === "string"
      ? (BaseTransactionBuilder.fromXDR(
          signedXdr,
          networkPassphrase,
        ) as BaseTransaction)
      : (signedXdr as Transaction);

  const sendResponse = await rpcServer.sendTransaction(tx);

  if (sendResponse.status === "ERROR") {
    const errorMessage =
      sendResponse.errorResultXdr ?? sendResponse.diagnosticEvents ?? "Unknown";
    throw new Error(`Transaction submission failed: ${errorMessage}`);
  }

  if (!sendResponse.hash) {
    throw new Error("Transaction submission failed: missing transaction hash");
  }

  if (sendResponse.status === "DUPLICATE") {
    const existing = await rpcServer.getTransaction(sendResponse.hash);
    const resultVal = existing.result?.retval;
    return {
      hash: sendResponse.hash,
      status: String(existing.status),
      result: resultVal ? scValToNative(resultVal) : undefined,
      raw: existing,
    };
  }

  if (sendResponse.status === "PENDING") {
    for (let i = 0; i < 20; i += 1) {
      await delay(1000);
      const txResult = await rpcServer.getTransaction(sendResponse.hash);

      if (txResult.status === "NOT_FOUND" || txResult.status === "PENDING") {
        continue;
      }

      if (txResult.status === "FAILED") {
        const diagnostic =
          txResult.diagnosticEvents
            ?.map((evt: any) => evt.value())
            .join("\n") ?? "Unknown failure";
        throw new Error(`Transaction failed: ${diagnostic}`);
      }

      const resultVal = txResult.result?.retval;
      return {
        hash: sendResponse.hash,
        status: String(txResult.status),
        result: resultVal ? scValToNative(resultVal) : undefined,
        raw: txResult,
      };
    }
  }

  const finalResponse = await rpcServer.getTransaction(sendResponse.hash);
  const resultVal = finalResponse.result?.retval;

  return {
    hash: sendResponse.hash,
    status: String(finalResponse.status),
    result: resultVal ? scValToNative(resultVal) : undefined,
    raw: finalResponse,
  };
};
