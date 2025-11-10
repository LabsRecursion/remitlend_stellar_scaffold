import {
  buildContractTransaction,
  CONTRACTS,
  getLatestLedgerSequence,
  simulateContractCall,
  submitTransaction,
  toScVal,
} from "./contractHelpers";
import { scValToNative } from "@stellar/stellar-sdk";

type SignTransactionFn = (transactionXdr: string) => Promise<string>;

type MintRemittanceNFTParams = {
  publicKey: string;
  signTransaction: SignTransactionFn;
  monthlyAmount: bigint;
  reliabilityScore: number;
  historyMonths: number;
  totalSent: bigint;
};

export const mintRemittanceNFT = async ({
  publicKey,
  signTransaction,
  monthlyAmount,
  reliabilityScore,
  historyMonths,
  totalSent,
}: MintRemittanceNFTParams) => {
  const args = [
    toScVal.address(publicKey),
    toScVal.i128(monthlyAmount),
    toScVal.u32(reliabilityScore),
    toScVal.u32(historyMonths),
    toScVal.i128(totalSent),
    toScVal.vec([]),
  ];

  const { transaction } = await buildContractTransaction({
    contractId: CONTRACTS.REMITTANCE_NFT,
    method: "mint",
    args,
    publicKey,
  });

  const signedTxXdr = await signTransaction(transaction.toXDR());
  return submitTransaction(signedTxXdr);
};

type DepositToLendingPoolParams = {
  publicKey: string;
  signTransaction: SignTransactionFn;
  amount: bigint;
};

const ALLOWANCE_LEDGER_BUFFER = 10_000;
const DEFAULT_ALLOWANCE_AMOUNT = 10_000_000_000n; // 1,000 USDC

const toBigInt = (value: unknown): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string") return BigInt(value);
  if (value && typeof value === "object") {
    try {
      const converted = scValToNative(value as never);
      return toBigInt(converted);
    } catch {
      // fallthrough
    }
  }
  return 0n;
};

export const fetchCurrentAllowance = async (
  publicKey: string,
): Promise<bigint> => {
  try {
    const allowance = await simulateContractCall({
      contractId: CONTRACTS.TEST_TOKEN,
      method: "allowance",
      args: [
        toScVal.address(publicKey),
        toScVal.address(CONTRACTS.LENDING_POOL),
      ],
      publicKey,
    });

    if (!allowance) {
      return 0n;
    }

    return toBigInt(allowance);
  } catch (err) {
    console.warn("Unable to fetch current allowance", err);
    return 0n;
  }
};

const submitAllowanceApproval = async ({
  publicKey,
  signTransaction,
  amount,
  liveUntilLedger,
}: DepositToLendingPoolParams & { liveUntilLedger: number }) => {
  const { transaction } = await buildContractTransaction({
    contractId: CONTRACTS.TEST_TOKEN,
    method: "approve",
    args: [
      toScVal.address(publicKey),
      toScVal.address(CONTRACTS.LENDING_POOL),
      toScVal.i128(amount),
      toScVal.u32(liveUntilLedger),
    ],
    publicKey,
  });

  const signedTxXdr = await signTransaction(transaction.toXDR());
  await submitTransaction(signedTxXdr);
};

export const enableLendingPoolAllowance = async ({
  publicKey,
  signTransaction,
  amount = DEFAULT_ALLOWANCE_AMOUNT,
}: DepositToLendingPoolParams) => {
  const latestLedger = await getLatestLedgerSequence();
  const liveUntilLedger = latestLedger + ALLOWANCE_LEDGER_BUFFER;

  await submitAllowanceApproval({
    publicKey,
    signTransaction,
    amount,
    liveUntilLedger,
  });

  return amount;
};

type MintTestTokenParams = {
  publicKey: string;
  signTransaction: SignTransactionFn;
  amount: bigint;
  recipient?: string;
};

export const mintTestToken = async ({
  publicKey,
  signTransaction,
  amount,
  recipient,
}: MintTestTokenParams) => {
  const target = recipient ?? publicKey;

  const { transaction } = await buildContractTransaction({
    contractId: CONTRACTS.TEST_TOKEN,
    method: "mint",
    args: [toScVal.address(target), toScVal.i128(amount)],
    publicKey,
  });

  const signedTxXdr = await signTransaction(transaction.toXDR());
  return submitTransaction(signedTxXdr);
};

export const depositToLendingPool = async ({
  publicKey,
  signTransaction,
  amount,
}: DepositToLendingPoolParams) => {
  const currentAllowance = await fetchCurrentAllowance(publicKey);

  if (currentAllowance < amount) {
    throw new Error(
      "Insufficient USDC allowance. Click 'Enable USDC Spending' before depositing.",
    );
  }

  const args = [toScVal.address(publicKey), toScVal.i128(amount)];

  const { transaction } = await buildContractTransaction({
    contractId: CONTRACTS.LENDING_POOL,
    method: "deposit",
    args,
    publicKey,
  });

  const signedTxXdr = await signTransaction(transaction.toXDR());
  return submitTransaction(signedTxXdr);
};

type WithdrawFromLendingPoolParams = {
  publicKey: string;
  signTransaction: SignTransactionFn;
  amount: bigint;
};

export const withdrawFromLendingPool = async ({
  publicKey,
  signTransaction,
  amount,
}: WithdrawFromLendingPoolParams) => {
  const args = [toScVal.address(publicKey), toScVal.i128(amount)];

  const { transaction } = await buildContractTransaction({
    contractId: CONTRACTS.LENDING_POOL,
    method: "withdraw",
    args,
    publicKey,
  });

  const signedTxXdr = await signTransaction(transaction.toXDR());
  return submitTransaction(signedTxXdr);
};

type RequestLoanParams = {
  publicKey: string;
  signTransaction: SignTransactionFn;
  nftCollateralId: bigint;
  loanAmount: bigint;
  durationMonths: number;
};

export const requestLoan = async ({
  publicKey,
  signTransaction,
  nftCollateralId,
  loanAmount,
  durationMonths,
}: RequestLoanParams) => {
  const args = [
    toScVal.address(publicKey),
    toScVal.u64(nftCollateralId),
    toScVal.i128(loanAmount),
    toScVal.u32(durationMonths),
  ];

  const { transaction } = await buildContractTransaction({
    contractId: CONTRACTS.LOAN_MANAGER,
    method: "request_loan",
    args,
    publicKey,
  });

  const signedTxXdr = await signTransaction(transaction.toXDR());
  return submitTransaction(signedTxXdr);
};

type ApproveLoanParams = {
  publicKey: string;
  signTransaction: SignTransactionFn;
  loanId: bigint;
};

export const approveLoan = async ({
  publicKey,
  signTransaction,
  loanId,
}: ApproveLoanParams) => {
  const { transaction } = await buildContractTransaction({
    contractId: CONTRACTS.LOAN_MANAGER,
    method: "approve_loan",
    args: [toScVal.u64(loanId)],
    publicKey,
  });

  const signedTxXdr = await signTransaction(transaction.toXDR());
  return submitTransaction(signedTxXdr);
};

type MakeLoanPaymentParams = {
  publicKey: string;
  signTransaction: SignTransactionFn;
  loanId: bigint;
  amount: bigint;
};

export const makeLoanPayment = async ({
  publicKey,
  signTransaction,
  loanId,
  amount,
}: MakeLoanPaymentParams) => {
  const args = [toScVal.u64(loanId), toScVal.i128(amount)];

  const { transaction } = await buildContractTransaction({
    contractId: CONTRACTS.LOAN_MANAGER,
    method: "make_payment",
    args,
    publicKey,
  });

  const signedTxXdr = await signTransaction(transaction.toXDR());
  return submitTransaction(signedTxXdr);
};

type GetNFTDataParams = {
  tokenId: bigint;
  publicKey: string;
};

export const getNFTData = async ({ tokenId, publicKey }: GetNFTDataParams) => {
  return simulateContractCall({
    contractId: CONTRACTS.REMITTANCE_NFT,
    method: "get_nft_data",
    args: [toScVal.u64(tokenId)],
    publicKey,
  });
};

type GetTokenCounterParams = {
  publicKey: string;
};

export const getTokenCounter = async ({ publicKey }: GetTokenCounterParams) => {
  return simulateContractCall({
    contractId: CONTRACTS.REMITTANCE_NFT,
    method: "get_token_counter",
    args: [],
    publicKey,
  });
};

type GetLoanDetailsParams = {
  loanId: bigint;
  publicKey: string;
};

export const getLoanDetails = async ({
  loanId,
  publicKey,
}: GetLoanDetailsParams) => {
  return simulateContractCall({
    contractId: CONTRACTS.LOAN_MANAGER,
    method: "get_loan",
    args: [toScVal.u64(loanId)],
    publicKey,
  });
};

type GetLenderInfoParams = {
  lenderAddress: string;
  publicKey: string;
};

export const getLenderInfo = async ({
  lenderAddress,
  publicKey,
}: GetLenderInfoParams) => {
  return simulateContractCall({
    contractId: CONTRACTS.LENDING_POOL,
    method: "get_lender_info",
    args: [toScVal.address(lenderAddress)],
    publicKey,
  });
};

type GetAvailableLiquidityParams = {
  publicKey: string;
};

export const getAvailableLiquidity = async ({
  publicKey,
}: GetAvailableLiquidityParams) => {
  return simulateContractCall({
    contractId: CONTRACTS.LENDING_POOL,
    method: "get_available_liquidity",
    args: [],
    publicKey,
  });
};

type GetUtilizationRateParams = {
  publicKey: string;
};

export const getUtilizationRate = async ({
  publicKey,
}: GetUtilizationRateParams) => {
  return simulateContractCall({
    contractId: CONTRACTS.LENDING_POOL,
    method: "get_utilization_rate",
    args: [],
    publicKey,
  });
};
