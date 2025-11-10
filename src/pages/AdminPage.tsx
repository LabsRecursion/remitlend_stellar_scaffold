import React, { useState } from "react";
import { useWallet } from "../hooks/useWallet";
import {
  buildContractTransaction,
  submitTransaction,
  toScVal,
} from "../contracts/contractHelpers.ts";

const CONTRACTS = {
  REMITTANCE_NFT: "CBYVSIBDGYZMNS5VFZ3AVOEGCYEXPPVTBAKQHQ25JM5S7CT4EZNNOU4I",
  LOAN_MANAGER: "CA64F56FWA7OGCONPCHJMEMW4OOKLJG7GKECWTK4ORIZTXGEF4O53V5G",
  LENDING_POOL: "CC5B4P4JJQMCTOYHR6LD6MYKPGAEHCOMIMJ6V65KM5X5XVUA6VQZ6RQG",
  ORACLE_VERIFIER: "CDY3MOHJ2HIOFPIW7QKLG2QWS7GPYJ4TQJ6UIVWYGTPBVAPJXG6ADWNC",
};

const USDC_TOKEN = "CBDCY7FEWZ6P7ETHLD7OMMVTU5UMJ4JEFYGYVO22ZYJGIL7JAC5BESPT";

type InitializationArgs = Parameters<
  typeof buildContractTransaction
>[0]["args"];

export const AdminPage: React.FC = () => {
  const { connected, publicKey, signTransaction } = useWallet();
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loanIdInput, setLoanIdInput] = useState("");
  const [baseRateInput, setBaseRateInput] = useState("800");

  const extractSignedXdr = (payload: unknown): string => {
    if (typeof payload === "string") {
      return payload;
    }
    if (payload && typeof payload === "object" && "signedTxXdr" in payload) {
      const candidate = (payload as { signedTxXdr?: unknown }).signedTxXdr;
      if (typeof candidate === "string") {
        return candidate;
      }
    }
    throw new Error("Wallet did not return a signed transaction XDR.");
  };

  const runInitialization = async ({
    label,
    contractId,
    method,
    buildArgs,
    manageLoading = true,
  }: {
    label: string;
    contractId: string;
    method: string;
    buildArgs: (adminAddress: string) => InitializationArgs;
    manageLoading?: boolean;
  }) => {
    if (!connected || !publicKey || !signTransaction) {
      alert("Please connect your wallet first.");
      throw new Error("Wallet not connected");
    }

    const adminAddress = publicKey;

    if (manageLoading) {
      setLoading(true);
    }
    setStatus(`Initializing ${label}...`);

    try {
      const args = buildArgs(adminAddress);
      const { transaction } = await buildContractTransaction({
        contractId,
        method,
        args,
        publicKey: adminAddress,
      });

      const rawXdr = transaction.toXDR();
      const txXdr = typeof rawXdr === "string" ? rawXdr : String(rawXdr);
      const signature = await signTransaction(txXdr);
      const signedXdr = extractSignedXdr(signature);
      const result = await submitTransaction(signedXdr);

      setStatus(`✅ ${label} initialized successfully!`);
      console.log(`${label} init result:`, result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setStatus(`❌ ${label} initialization failed: ${errorMessage}`);
      console.error(`${label} initialization error:`, err);
      throw err;
    } finally {
      if (manageLoading) {
        setLoading(false);
      }
    }
  };

  const initializeRemittanceNFT = async ({
    manageLoading = true,
  }: { manageLoading?: boolean } = {}) => {
    await runInitialization({
      label: "RemittanceNFT",
      contractId: CONTRACTS.REMITTANCE_NFT,
      method: "initialize",
      buildArgs: (adminAddress) => [
        toScVal.address(adminAddress), // admin
        toScVal.address(CONTRACTS.ORACLE_VERIFIER), // oracle
        toScVal.address(CONTRACTS.LOAN_MANAGER), // loan manager
      ],
      manageLoading,
    });
  };

  const initializeLoanManager = async ({
    manageLoading = true,
  }: { manageLoading?: boolean } = {}) => {
    await runInitialization({
      label: "LoanManager",
      contractId: CONTRACTS.LOAN_MANAGER,
      method: "initialize",
      buildArgs: (adminAddress) => [
        toScVal.address(adminAddress), // admin
        toScVal.address(CONTRACTS.REMITTANCE_NFT), // nft contract
        toScVal.address(CONTRACTS.LENDING_POOL), // lending pool
        toScVal.address(CONTRACTS.ORACLE_VERIFIER), // oracle
        toScVal.address(USDC_TOKEN), // usdc token
      ],
      manageLoading,
    });
  };

  const approvePendingLoan = async () => {
    if (!connected || !publicKey || !signTransaction) {
      alert("Please connect your wallet first");
      return;
    }

    const adminAddress: string = publicKey;

    if (!loanIdInput) {
      alert("Enter a loan ID to approve.");
      return;
    }

    let loanIdBigInt: bigint;
    try {
      loanIdBigInt = BigInt(loanIdInput);
    } catch {
      alert("Loan ID must be a valid number.");
      return;
    }

    setLoading(true);
    setStatus(`Approving loan #${loanIdInput}...`);

    try {
      const { transaction } = await buildContractTransaction({
        contractId: CONTRACTS.LOAN_MANAGER,
        method: "approve_loan",
        args: [toScVal.u64(loanIdBigInt)],
        publicKey: adminAddress,
      });

      const rawXdr = transaction.toXDR();
      const txXdr = typeof rawXdr === "string" ? rawXdr : String(rawXdr);
      const signature = await signTransaction(txXdr);
      const signedXdr = extractSignedXdr(signature);
      const result = await submitTransaction(signedXdr);

      setStatus(`✅ Loan #${loanIdInput} approved successfully!`);
      console.log("Loan approval result:", result);
      setLoanIdInput("");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setStatus(`❌ Error approving loan: ${errorMessage}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const initializeAllContracts = async () => {
    if (!connected || !publicKey || !signTransaction) {
      alert("Please connect your wallet first.");
      return;
    }

    setLoading(true);
    setStatus(
      "Initializing RemittanceNFT → LendingPool → LoanManager... Please approve each wallet prompt.",
    );

    try {
      await initializeRemittanceNFT({ manageLoading: false });
      await initializeLendingPool({ manageLoading: false });
      await initializeLoanManager({ manageLoading: false });
      setStatus("✅ All contracts initialized successfully!");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setStatus(
        `❌ Batch initialization halted: ${errorMessage}. You can retry from the step that failed.`,
      );
    } finally {
      setLoading(false);
    }
  };

  const initializeLendingPool = async ({
    manageLoading = true,
  }: { manageLoading?: boolean } = {}) => {
    const parsedRate = Number(baseRateInput);
    if (!Number.isFinite(parsedRate) || parsedRate < 0) {
      alert("Enter a valid base rate in basis points (e.g. 800 for 8%).");
      throw new Error("Invalid base rate");
    }

    await runInitialization({
      label: "LendingPool",
      contractId: CONTRACTS.LENDING_POOL,
      method: "initialize",
      buildArgs: (adminAddress) => [
        toScVal.address(adminAddress),
        toScVal.address(CONTRACTS.LOAN_MANAGER),
        toScVal.address(USDC_TOKEN),
        toScVal.u32(parsedRate),
      ],
      manageLoading,
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">
        Admin - Contract Initialization
      </h1>

      {!connected && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
          Please connect your wallet to initialize contracts
        </div>
      )}

      <div className="space-y-4">
        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-3">
            Quick Setup (runs all initializations)
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Executes the Remittance NFT, Lending Pool, and Loan Manager
            initialization steps in sequence using the connected admin wallet.
          </p>
          <button
            type="button"
            onClick={() => void initializeAllContracts()}
            disabled={!connected || loading}
            className="btn btn-secondary"
          >
            Initialize All Contracts
          </button>
        </div>

        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-4">
            1. Initialize RemittanceNFT
          </h2>
          <button
            type="button"
            onClick={() => void initializeRemittanceNFT()}
            disabled={!connected || loading}
            className="btn btn-primary"
          >
            Initialize RemittanceNFT
          </button>
        </div>

        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-4">
            2. Initialize LendingPool
          </h2>
          <div className="space-y-3 mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Base Interest Rate (basis points)
            </label>
            <input
              type="number"
              min="0"
              value={baseRateInput}
              onChange={(event) => setBaseRateInput(event.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. 800 for 8% APR"
            />
          </div>
          <button
            type="button"
            onClick={() => void initializeLendingPool()}
            disabled={!connected || loading}
            className="btn btn-primary"
          >
            Initialize LendingPool
          </button>
        </div>

        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-4">
            3. Initialize LoanManager
          </h2>
          <button
            type="button"
            onClick={() => void initializeLoanManager()}
            disabled={!connected || loading}
            className="btn btn-primary"
          >
            Initialize LoanManager
          </button>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="text-xl font-semibold">4. Approve Loans</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            After borrowers submit loan requests, approve them here to stake the
            NFT collateral and disburse funds from the lending pool.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Loan ID
            </label>
            <input
              type="number"
              min="1"
              value={loanIdInput}
              onChange={(event) => setLoanIdInput(event.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter pending loan ID (e.g. 1)"
            />
          </div>
          <button
            type="button"
            onClick={() => void approvePendingLoan()}
            disabled={!connected || loading || !loanIdInput}
            className="btn btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Approve Loan
          </button>
        </div>

        {status && (
          <div className="card p-6 bg-gray-100">
            <h3 className="font-semibold mb-2">Status:</h3>
            <p>{status}</p>
          </div>
        )}
      </div>

      <div className="mt-8 text-sm text-gray-600">
        <h3 className="font-semibold mb-2">Contract Addresses:</h3>
        <ul className="space-y-1">
          <li>RemittanceNFT: {CONTRACTS.REMITTANCE_NFT}</li>
          <li>LoanManager: {CONTRACTS.LOAN_MANAGER}</li>
          <li>LendingPool: {CONTRACTS.LENDING_POOL}</li>
        </ul>
      </div>
    </div>
  );
};
