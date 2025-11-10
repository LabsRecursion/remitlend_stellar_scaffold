/**
 * Custom React hook for interacting with contracts
 * Use this in your components for easy contract interactions
 */

import { useState } from "react";
import { useWallet } from "./useWallet";
import * as contractInteractions from "../contracts/contractInteractions.ts";

export function useContractInteractions() {
  const wallet = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const signTransaction = async (xdr: string): Promise<string> => {
    if (!wallet?.connected || !wallet.signTransaction) {
      throw new Error("Wallet not connected");
    }

    // Sign using the connected wallet
    const result = await wallet.signTransaction(xdr, {
      networkPassphrase: wallet.networkPassphrase || "",
    });

    return result.signedTxXdr;
  };

  const mintNFT = async ({
    monthlyAmount,
    reliabilityScore,
    historyMonths,
    totalSent,
  }: {
    monthlyAmount: bigint;
    reliabilityScore: number;
    historyMonths: number;
    totalSent: bigint;
  }) => {
    if (!wallet?.publicKey) {
      throw new Error("Wallet not connected");
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await contractInteractions.mintRemittanceNFT({
        publicKey: wallet.publicKey,
        signTransaction,
        monthlyAmount,
        reliabilityScore,
        historyMonths,
        totalSent,
      });

      setIsLoading(false);
      return result;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setIsLoading(false);
      throw error;
    }
  };

  const getLendingAllowance = async (): Promise<bigint> => {
    if (!wallet?.publicKey) {
      throw new Error("Wallet not connected");
    }

    try {
      return await contractInteractions.fetchCurrentAllowance(wallet.publicKey);
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    }
  };

  const enableLendingAllowance = async (amount?: bigint): Promise<bigint> => {
    if (!wallet?.publicKey) {
      throw new Error("Wallet not connected");
    }

    setIsLoading(true);
    setError(null);

    try {
      const amountToApprove = amount ?? BigInt(1_000_000_000);
      const approvedAmount =
        await contractInteractions.enableLendingPoolAllowance({
          publicKey: wallet.publicKey,
          signTransaction,
          amount: amountToApprove,
        });

      setIsLoading(false);
      return approvedAmount;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setIsLoading(false);
      throw error;
    }
  };

  const mintTestUSDC = async ({
    amount,
    recipient,
  }: {
    amount: bigint;
    recipient?: string;
  }): Promise<unknown> => {
    if (!wallet?.publicKey) {
      throw new Error("Wallet not connected");
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await contractInteractions.mintTestToken({
        publicKey: wallet.publicKey,
        signTransaction,
        amount,
        recipient,
      });
      setIsLoading(false);
      return result as unknown;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setIsLoading(false);
      throw error;
    }
  };

  const depositToPool = async (amount: bigint): Promise<unknown> => {
    if (!wallet?.publicKey) {
      throw new Error("Wallet not connected");
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await contractInteractions.depositToLendingPool({
        publicKey: wallet.publicKey,
        signTransaction,
        amount,
      });

      setIsLoading(false);
      return result as unknown;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setIsLoading(false);
      throw error;
    }
  };

  const withdrawFromPool = async (amount: bigint): Promise<unknown> => {
    if (!wallet?.publicKey) {
      throw new Error("Wallet not connected");
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await contractInteractions.withdrawFromLendingPool({
        publicKey: wallet.publicKey,
        signTransaction,
        amount,
      });

      setIsLoading(false);
      return result as unknown;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setIsLoading(false);
      throw error;
    }
  };

  const requestLoan = async ({
    nftCollateralId,
    loanAmount,
    durationMonths,
  }: {
    nftCollateralId: bigint;
    loanAmount: bigint;
    durationMonths: number;
  }): Promise<unknown> => {
    if (!wallet?.publicKey) {
      throw new Error("Wallet not connected");
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await contractInteractions.requestLoan({
        publicKey: wallet.publicKey,
        signTransaction,
        nftCollateralId,
        loanAmount,
        durationMonths,
      });

      setIsLoading(false);
      return result as unknown;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setIsLoading(false);
      throw error;
    }
  };

  const approveLoan = async (loanId: bigint): Promise<unknown> => {
    if (!wallet?.publicKey) {
      throw new Error("Wallet not connected");
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await contractInteractions.approveLoan({
        publicKey: wallet.publicKey,
        signTransaction,
        loanId,
      });

      setIsLoading(false);
      return result as unknown;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setIsLoading(false);
      throw error;
    }
  };

  const makeLoanPayment = async ({
    loanId,
    amount,
  }: {
    loanId: bigint;
    amount: bigint;
  }): Promise<unknown> => {
    if (!wallet?.publicKey) {
      throw new Error("Wallet not connected");
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await contractInteractions.makeLoanPayment({
        publicKey: wallet.publicKey,
        signTransaction,
        loanId,
        amount,
      });

      setIsLoading(false);
      return result as unknown;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setIsLoading(false);
      throw error;
    }
  };

  const getNFTData = async (tokenId: bigint): Promise<unknown> => {
    if (!wallet?.publicKey) {
      throw new Error("Wallet not connected");
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await contractInteractions.getNFTData({
        tokenId,
        publicKey: wallet.publicKey,
      });

      setIsLoading(false);
      return result as unknown;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setIsLoading(false);
      throw error;
    }
  };

  const getLoanDetails = async (loanId: bigint): Promise<unknown> => {
    if (!wallet?.publicKey) {
      throw new Error("Wallet not connected");
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await contractInteractions.getLoanDetails({
        loanId,
        publicKey: wallet.publicKey,
      });

      setIsLoading(false);
      return result as unknown;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setIsLoading(false);
      throw error;
    }
  };

  const getLenderInfo = async (lenderAddress?: string): Promise<unknown> => {
    // For read-only operations, we only need a public key for the query
    const queryPublicKey = wallet?.publicKey || wallet?.address;
    if (!queryPublicKey) {
      throw new Error("Wallet not connected");
    }

    const address = lenderAddress || queryPublicKey;

    try {
      const result = await contractInteractions.getLenderInfo({
        lenderAddress: address,
        publicKey: queryPublicKey,
      });

      return result as unknown;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    }
  };

  const getAvailableLiquidity = async (): Promise<unknown> => {
    // For read-only operations, we only need a public key for the query
    const queryPublicKey = wallet?.publicKey || wallet?.address;
    if (!queryPublicKey) {
      throw new Error("Wallet not connected");
    }

    try {
      const result = await contractInteractions.getAvailableLiquidity({
        publicKey: queryPublicKey,
      });

      return result as unknown;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    }
  };

  const getUtilizationRate = async (): Promise<unknown> => {
    // For read-only operations, we only need a public key for the query
    const queryPublicKey = wallet?.publicKey || wallet?.address;
    if (!queryPublicKey) {
      throw new Error("Wallet not connected");
    }

    try {
      const result = await contractInteractions.getUtilizationRate({
        publicKey: queryPublicKey,
      });

      return result as unknown;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    }
  };

  const getTokenCounter = async (): Promise<unknown> => {
    const queryPublicKey = wallet?.publicKey || wallet?.address;
    if (!queryPublicKey) {
      throw new Error("Wallet not connected");
    }

    try {
      const result = await contractInteractions.getTokenCounter({
        publicKey: queryPublicKey,
      });
      return result as unknown;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    }
  };

  return {
    isLoading,
    error,
    mintNFT,
    depositToPool,
    withdrawFromPool,
    requestLoan,
    approveLoan,
    makeLoanPayment,
    getNFTData,
    getLoanDetails,
    getLenderInfo,
    getAvailableLiquidity,
    getUtilizationRate,
    getTokenCounter,
    getLendingAllowance,
    enableLendingAllowance,
    mintTestUSDC,
  };
}
