import React, { useState, useEffect, useCallback, useRef } from "react";
import { scValToNative } from "@stellar/stellar-sdk";
import { useWallet } from "../hooks/useWallet";
import { useContractInteractions } from "../hooks/useContractInteractions";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  CreditCard,
  TrendingUp,
  Calendar,
  DollarSign,
  AlertCircle,
  Award,
  Loader2,
} from "lucide-react";

type LoanStatusLabel = "Pending" | "Active" | "Repaid" | "Defaulted";

interface Loan {
  loanId: number;
  amount: number;
  outstandingBalance: number;
  interestRate: number;
  monthlyPayment: number;
  nextPaymentDue: number;
  paymentsRemaining: number;
  totalPayments: number;
  status: LoanStatusLabel;
  startTimestamp: number;
  borrower?: string;
}

interface NFT {
  tokenId: number;
  monthlyAmount: number;
  reliabilityScore: number;
  historyMonths: number;
  totalSent: number;
  isStaked: boolean;
  owner: string;
}

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const lumensFromStroops = (value: unknown): number =>
  toNumber(value) / 10_000_000;

const extractOwner = (ownerValue: unknown): string | undefined => {
  if (!ownerValue) return undefined;
  if (typeof ownerValue === "string") {
    return ownerValue;
  }
  if (typeof ownerValue === "object") {
    const candidate = ownerValue as Record<string, unknown>;
    // Common shapes after scValToNative: { accountId: "G..." }, { value: "G..." }
    const possibleKeys = [
      "accountId",
      "publicKey",
      "value",
      "address",
      "id",
      "Account",
      "Address",
    ];
    for (const key of possibleKeys) {
      const val = candidate[key];
      if (typeof val === "string") return val;
      if (val && typeof val === "object") {
        const nested = extractOwner(val);
        if (nested) return nested;
      }
    }
  }
  return undefined;
};

const statusLabels: Record<number, LoanStatusLabel> = {
  0: "Pending",
  1: "Active",
  2: "Repaid",
  3: "Defaulted",
};

const parseLoanStruct = (loanId: number, rawLoan: unknown): Loan => {
  const native: Record<string, unknown> =
    rawLoan && typeof rawLoan === "object"
      ? (() => {
          try {
            return scValToNative(rawLoan as never) as Record<string, unknown>;
          } catch {
            return rawLoan as Record<string, unknown>;
          }
        })()
      : {};

  return {
    loanId,
    amount:
      Math.round(
        lumensFromStroops(native["loan_amount"] ?? native["loanAmount"] ?? 0) *
          100,
      ) / 100,
    outstandingBalance:
      Math.round(
        lumensFromStroops(
          native["outstanding_balance"] ?? native["outstandingBalance"] ?? 0,
        ) * 100,
      ) / 100,
    interestRate:
      toNumber(native["interest_rate"] ?? native["interestRate"] ?? 0) / 100,
    monthlyPayment:
      Math.round(
        lumensFromStroops(
          native["monthly_payment"] ?? native["monthlyPayment"] ?? 0,
        ) * 100,
      ) / 100,
    nextPaymentDue: toNumber(native["next_payment_due"] ?? 0) * 1000,
    paymentsRemaining: Math.max(
      0,
      toNumber(native["duration_months"] ?? 0) -
        toNumber(native["payments_made"] ?? 0),
    ),
    totalPayments: toNumber(native["duration_months"] ?? 0),
    status:
      typeof native.status === "string"
        ? (native.status as LoanStatusLabel)
        : (statusLabels[toNumber(native["status"] ?? 0)] ?? "Pending"),
    startTimestamp: toNumber(native["start_timestamp"] ?? 0) * 1000,
    borrower: extractOwner(
      native["borrower"] ??
        native["Borrower"] ??
        native["address"] ??
        native["BorrowerAddress"],
    ),
  };
};

const formatDate = (timestamp: number) => {
  if (!timestamp) {
    return "—";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString();
};

const getStatusClasses = (status: LoanStatusLabel) => {
  switch (status) {
    case "Active":
      return "bg-success-500/20 text-success-400 border border-success-500/30";
    case "Repaid":
      return "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
    case "Defaulted":
      return "bg-danger-500/20 text-danger-400 border border-danger-500/30";
    case "Pending":
    default:
      return "bg-warning-500/20 text-warning-400 border border-warning-500/30";
  }
};

const toNativeObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  try {
    return scValToNative(value as never) as Record<string, unknown>;
  } catch {
    return value as Record<string, unknown>;
  }
};

const BorrowerDashboard: React.FC = () => {
  const { connected, publicKey } = useWallet();
  const {
    requestLoan,
    makeLoanPayment,
    getNFTData,
    getLoanDetails,
    getTokenCounter,
    isLoading,
  } = useContractInteractions();
  const [activeTab, setActiveTab] = useState<
    "overview" | "loans" | "nft" | "request"
  >("overview");
  const [nftData, setNftData] = useState<NFT | null>(null);
  const [loanData, setLoanData] = useState<Loan[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [nftFetchError, setNftFetchError] = useState<string | null>(null);

  // New loan request form state
  const [newLoanForm, setNewLoanForm] = useState({
    nftId: "",
    amount: "",
    interestRate: "500", // 5% in basis points
    duration: "12",
  });

  const [storedNftId, setStoredNftId] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const lastId = window.localStorage.getItem("remitlend_last_nft_id") ?? "";
    setStoredNftId(lastId);
    if (lastId) {
      setNewLoanForm((prev) =>
        prev.nftId ? prev : { ...prev, nftId: lastId },
      );
    }
  }, []);

  const contractFnsRef = useRef({
    getNFTData,
    getLoanDetails,
    getTokenCounter,
  });
  const isFetchingRef = useRef(false);

  useEffect(() => {
    contractFnsRef.current = { getNFTData, getLoanDetails, getTokenCounter };
  }, [getNFTData, getLoanDetails, getTokenCounter]);

  const loadDashboardData = useCallback(
    async (forceRefresh = false) => {
      if (!connected || !publicKey) {
        setNftData(null);
        setLoanData([]);
        return;
      }

      if (!forceRefresh && isFetchingRef.current) {
        return;
      }

      isFetchingRef.current = true;
      setLoadingData(true);
      setNftFetchError(null);

      try {
        const {
          getNFTData: safeGetNFTData,
          getLoanDetails: safeGetLoanDetails,
          getTokenCounter: safeGetTokenCounter,
        } = contractFnsRef.current;

        const counterResultRaw = await safeGetTokenCounter();
        const latestTokenId = Math.max(
          toNumber(counterResultRaw),
          storedNftId ? Number(storedNftId) : 0,
        );

        const candidates: number[] = [];
        if (latestTokenId > 0) {
          candidates.push(latestTokenId);
          for (
            let id = latestTokenId - 1;
            id >= 1 && candidates.length < 5;
            id -= 1
          ) {
            candidates.push(id);
          }
        } else {
          candidates.push(1);
        }

        let fetchedNft: NFT | null = null;

        for (const candidate of candidates) {
          const candidateId = candidate.toString();
          try {
            const nftResult = await safeGetNFTData(BigInt(candidateId));

            const payload =
              nftResult &&
              typeof nftResult === "object" &&
              "result" in nftResult
                ? ((
                    (nftResult as Record<string, unknown>).result as {
                      retval?: unknown;
                    }
                  )?.retval ?? (nftResult as Record<string, unknown>).result)
                : nftResult;

            const structured = toNativeObject(payload);
            if (!structured) continue;

            const ownerValue =
              structured["owner"] ??
              structured["address"] ??
              structured["account"] ??
              structured["Owner"] ??
              structured["Address"];
            const owner = extractOwner(ownerValue);

            if (typeof owner !== "string" || owner !== publicKey) {
              continue;
            }

            fetchedNft = {
              tokenId: Number(candidateId),
              monthlyAmount:
                Math.round(
                  lumensFromStroops(
                    structured["monthly_amount"] ?? structured["monthlyAmount"],
                  ) * 100,
                ) / 100,
              reliabilityScore: toNumber(
                structured["reliability_score"] ??
                  structured["reliabilityScore"],
              ),
              historyMonths: toNumber(
                structured["history_months"] ?? structured["historyMonths"],
              ),
              totalSent:
                Math.round(
                  lumensFromStroops(
                    structured["total_sent"] ?? structured["totalSent"],
                  ) * 100,
                ) / 100,
              isStaked: Boolean(
                structured["is_staked"] ?? structured["isStaked"],
              ),
              owner,
            };

            setStoredNftId((prev) =>
              prev === candidateId ? prev : candidateId,
            );
            if (typeof window !== "undefined") {
              window.localStorage.setItem("remitlend_last_nft_id", candidateId);
              window.localStorage.setItem(
                "remitlend_last_nft_owner",
                owner ?? "",
              );
            }
            break;
          } catch {
            // ignore missing token
          }
        }

        if (fetchedNft) {
          const nftDetails = fetchedNft;
          setNftData(nftDetails);
          setNewLoanForm((prev) => ({
            ...prev,
            nftId: prev.nftId || nftDetails.tokenId.toString(),
          }));
          setNftFetchError(null);
        } else {
          setNftData(null);
          setNftFetchError(
            "No Remittance NFT found for this wallet. Mint one via the verification flow before requesting a loan.",
          );
        }

        const loans: Loan[] = [];
        for (let loanId = 1; loanId <= 10; loanId++) {
          try {
            const loanResult = await safeGetLoanDetails(BigInt(loanId));
            if (!loanResult) continue;

            const payload =
              loanResult &&
              typeof loanResult === "object" &&
              "result" in loanResult
                ? ((
                    (loanResult as Record<string, unknown>).result as {
                      retval?: unknown;
                    }
                  )?.retval ?? (loanResult as Record<string, unknown>).result)
                : loanResult;

            const parsed = parseLoanStruct(loanId, payload);
            if (parsed.borrower && parsed.borrower !== publicKey) {
              continue;
            }
            loans.push(parsed);
          } catch {
            // loan not found; ignore
          }
        }

        setLoanData(loans);
      } catch (err) {
        console.error("Error fetching data:", err);
        setNftFetchError(
          "Unable to load NFT data from the network. Please check your connection and try again.",
        );
      } finally {
        isFetchingRef.current = false;
        setLoadingData(false);
      }
    },
    [connected, publicKey, storedNftId],
  );

  useEffect(() => {
    void loadDashboardData(true);
  }, [loadDashboardData]);

  const handleRequestLoan = async (e: React.FormEvent) => {
    e.preventDefault();

    const nftId = newLoanForm.nftId || storedNftId;

    if (!nftId) {
      alert("No NFT detected. Please verify your remittance first.");
      return;
    }

    if (!nftData || nftData.owner !== publicKey) {
      alert("The selected NFT does not belong to the connected wallet.");
      return;
    }

    if (!newLoanForm.amount) {
      alert("Please enter the loan amount.");
      return;
    }

    try {
      // Convert amount to stroops (1 XLM = 10,000,000 stroops)
      const amountInStroops = BigInt(
        Math.floor(parseFloat(newLoanForm.amount) * 10_000_000),
      );

      const result = await requestLoan({
        nftCollateralId: BigInt(nftId),
        loanAmount: amountInStroops,
        durationMonths: parseInt(newLoanForm.duration),
      });

      console.log("Loan requested successfully:", result);
      alert("Loan request submitted successfully!");

      // Reset form
      setNewLoanForm({
        nftId,
        amount: "",
        interestRate: "500",
        duration: "12",
      });

      await loadDashboardData(true);
      setActiveTab("loans");
    } catch (err) {
      console.error("Failed to request loan:", err);
      alert("Failed to request loan: " + (err as Error).message);
    }
  };

  // Mock payment history data - replace with real data when available
  const paymentHistory = [
    { month: "Jan", paid: true, amount: 2500 },
    { month: "Feb", paid: true, amount: 2500 },
    { month: "Mar", paid: true, amount: 2500 },
    { month: "Apr", paid: false, amount: 0 },
    { month: "May", paid: true, amount: 2500 },
    { month: "Jun", paid: true, amount: 2500 },
    { month: "Jul", paid: true, amount: 2500 },
    { month: "Aug", paid: true, amount: 2500 },
  ];

  const handleMakePayment = async (loan: Loan) => {
    if (loan.status !== "Active") {
      alert("This loan is not active yet.");
      return;
    }

    if (loan.outstandingBalance <= 0) {
      alert("This loan has already been fully repaid.");
      return;
    }

    try {
      const amountInStroops = BigInt(
        Math.floor(loan.monthlyPayment * 10_000_000),
      );
      const result = await makeLoanPayment({
        loanId: BigInt(loan.loanId),
        amount: amountInStroops,
      });
      console.log("Payment submitted:", result);
      alert("Payment submitted successfully!");
      await loadDashboardData(true);
    } catch (err) {
      console.error("Payment failed:", err);
      alert("Failed to submit payment: " + (err as Error).message);
    }
  };

  if (!connected) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
        <div className="glass rounded-2xl shadow-strong p-12 text-center max-w-md border border-gray-300 dark:border-white/10 backdrop-blur-xl">
          <AlertCircle className="w-16 h-16 text-warning-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Please Connect Your Wallet
          </h2>
          <p className="text-gray-700 dark:text-white">
            Connect your wallet to access the Borrower Dashboard
          </p>
        </div>
      </div>
    );
  }

  const calculateProgress = (loan: Loan) => {
    if (loan.totalPayments === 0) {
      return 0;
    }
    return (
      ((loan.totalPayments - loan.paymentsRemaining) / loan.totalPayments) * 100
    );
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none mx-auto">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-float"></div>
        <div
          className="absolute top-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "2s" }}
        ></div>
        <div
          className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "4s" }}
        ></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Borrower Dashboard
          </h1>
          <p className="text-gray-700 dark:text-white font-mono text-sm">
            {publicKey?.substring(0, 8)}...
            {publicKey?.substring(publicKey.length - 6)}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b-2 border-gray-300 dark:border-white/10">
          {[
            { key: "overview", label: "Overview" },
            { key: "request", label: "Request Loan" },
            { key: "loans", label: "My Loans" },
            { key: "nft", label: "My NFT" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`px-6 py-3 font-semibold transition-all duration-200 border-b-3 ${
                activeTab === tab.key
                  ? "text-indigo-400 border-indigo-400"
                  : "text-gray-700 dark:text-white border-transparent hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {loadingData ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <span className="ml-3 text-gray-700 dark:text-white">
                  Loading data...
                </span>
              </div>
            ) : (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    {
                      icon: DollarSign,
                      label: "Total Borrowed",
                      value: `$${loanData.reduce((sum, loan) => sum + loan.amount, 0).toLocaleString()}`,
                      color: "bg-indigo-500",
                    },
                    {
                      icon: TrendingUp,
                      label: "Outstanding Balance",
                      value: `$${loanData.reduce((sum, loan) => sum + loan.outstandingBalance, 0).toLocaleString()}`,
                      color: "bg-purple-500",
                    },
                    {
                      icon: Calendar,
                      label: "Next Payment Due",
                      value:
                        loanData.length > 0
                          ? new Date(
                              loanData[0].nextPaymentDue,
                            ).toLocaleDateString()
                          : "N/A",
                      color: "bg-cyan-500",
                    },
                    {
                      icon: CreditCard,
                      label: "Monthly Payment",
                      value:
                        loanData.length > 0
                          ? `$${loanData[0].monthlyPayment.toLocaleString()}`
                          : "$0",
                      color: "bg-orange-500",
                    },
                  ].map((stat, index) => {
                    const Icon = stat.icon;
                    return (
                      <div
                        key={index}
                        className="glass rounded-xl shadow-soft hover:shadow-medium transition-all duration-300 p-6 group border border-gray-300 dark:border-white/10 backdrop-blur-xl card-shine"
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className={`${stat.color} w-12 h-12 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg`}
                          >
                            <Icon className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-gray-700 dark:text-white mb-1">
                              {stat.label}
                            </p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                              {stat.value}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Chart Card */}
                <div className="glass rounded-xl shadow-soft p-6 border border-gray-300 dark:border-white/10 backdrop-blur-xl">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                    Payment History (Last 8 Months)
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={paymentHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="month" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1a1a2e",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          borderRadius: "0.5rem",
                          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
                          color: "#f1f5f9",
                        }}
                        labelStyle={{ color: "#f1f5f9" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="amount"
                        stroke="#6366f1"
                        strokeWidth={3}
                        dot={{ fill: "#6366f1", r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}

        {/* Request Loan Tab */}
        {activeTab === "request" && (
          <div className="max-w-3xl mx-auto">
            <div className="glass rounded-2xl shadow-strong p-8 border border-gray-300 dark:border-white/10 backdrop-blur-xl">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
                Request a New Loan
              </h2>
              <p className="text-gray-700 dark:text-white mb-8">
                Use your Remittance NFT as collateral to secure a loan at
                competitive rates.
              </p>

              <form
                onSubmit={(e) => void handleRequestLoan(e)}
                className="space-y-6"
              >
                {/* NFT ID */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-white mb-2">
                    NFT Collateral ID
                  </label>
                  <input
                    type="number"
                    value={newLoanForm.nftId}
                    onChange={(e) =>
                      setNewLoanForm({ ...newLoanForm, nftId: e.target.value })
                    }
                    className="w-full px-4 py-3 glass rounded-lg border border-gray-300 dark:border-white/20 bg-white/50 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter your NFT token ID"
                    required
                  />
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    The NFT ID staked as collateral. Latest verified token will
                    autocomplete.
                  </p>
                  {nftData ? (
                    <p className="text-xs text-indigo-400 mt-1">
                      On-chain owner:{" "}
                      <span className="font-mono">{nftData.owner}</span>
                    </p>
                  ) : null}
                  {nftFetchError ? (
                    <p className="text-xs text-red-400 mt-2">{nftFetchError}</p>
                  ) : null}
                </div>

                {/* Loan Amount */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-white mb-2">
                    Loan Amount (XLM)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newLoanForm.amount}
                    onChange={(e) =>
                      setNewLoanForm({ ...newLoanForm, amount: e.target.value })
                    }
                    className="w-full px-4 py-3 glass rounded-lg border border-gray-300 dark:border-white/20 bg-white/50 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter loan amount in XLM"
                    required
                  />
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Amount you wish to borrow in Stellar Lumens (XLM)
                  </p>
                </div>

                {/* Interest Rate */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-white mb-2">
                    Interest Rate (APR)
                  </label>
                  <select
                    value={newLoanForm.interestRate}
                    onChange={(e) =>
                      setNewLoanForm({
                        ...newLoanForm,
                        interestRate: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 glass rounded-lg border border-gray-300 dark:border-white/20 bg-white/50 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="300">3% APR (Excellent credit)</option>
                    <option value="500">5% APR (Good credit)</option>
                    <option value="800">8% APR (Fair credit)</option>
                    <option value="1200">12% APR (Building credit)</option>
                  </select>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Your rate is determined by your NFT reliability score
                  </p>
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-white mb-2">
                    Loan Duration
                  </label>
                  <select
                    value={newLoanForm.duration}
                    onChange={(e) =>
                      setNewLoanForm({
                        ...newLoanForm,
                        duration: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 glass rounded-lg border border-gray-300 dark:border-white/20 bg-white/50 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="6">6 months</option>
                    <option value="12">12 months</option>
                    <option value="18">18 months</option>
                    <option value="24">24 months</option>
                    <option value="36">36 months</option>
                  </select>
                </div>

                {/* Submit Button */}
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={
                      isLoading || !nftData || nftData.owner !== publicKey
                    }
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transform hover:scale-105 disabled:transform-none flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-5 h-5" />
                        Request Loan
                      </>
                    )}
                  </button>
                </div>

                {/* Info Box */}
                <div className="glass bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-4">
                  <p className="text-sm text-indigo-300">
                    💡 <strong>Note:</strong> Your NFT will be staked as
                    collateral and cannot be transferred until the loan is fully
                    repaid. Make sure you understand the terms before
                    proceeding.
                  </p>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Loans Tab */}
        {activeTab === "loans" && (
          <div className="space-y-6">
            {loadingData ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <span className="ml-3 text-gray-700 dark:text-white">
                  Loading loans...
                </span>
              </div>
            ) : loanData.length === 0 ? (
              <div className="glass rounded-xl shadow-soft p-12 text-center border border-gray-300 dark:border-white/10 backdrop-blur-xl">
                <CreditCard className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  No Active Loans
                </h3>
                <p className="text-gray-700 dark:text-white mb-6">
                  You don't have any active loans yet. Request a loan to get
                  started!
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("request")}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-3 px-8 rounded-xl transition-all duration-200 shadow-lg"
                >
                  Request a Loan
                </button>
              </div>
            ) : (
              <>
                {loanData.map((loan) => (
                  <div
                    key={loan.loanId}
                    className="glass rounded-xl shadow-soft p-8 border border-gray-300 dark:border-white/10 backdrop-blur-xl card-shine"
                  >
                    <div className="flex justify-between items-start mb-6">
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Loan #{loan.loanId}
                      </h3>
                      <span
                        className={`px-4 py-2 rounded-full text-sm font-semibold ${getStatusClasses(
                          loan.status,
                        )}`}
                      >
                        {loan.status}
                      </span>
                    </div>
                    <div className="grid md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        {[
                          {
                            label: "Loan Amount",
                            value: `${loan.amount.toLocaleString()} XLM`,
                          },
                          {
                            label: "Outstanding Balance",
                            value: `${loan.outstandingBalance.toLocaleString()} XLM`,
                          },
                          {
                            label: "Interest Rate",
                            value: `${loan.interestRate}% APR`,
                          },
                          {
                            label: "Monthly Payment",
                            value: `${loan.monthlyPayment.toLocaleString()} XLM`,
                          },
                          {
                            label: "Next Payment Due",
                            value: formatDate(loan.nextPaymentDue),
                          },
                          {
                            label: "Payments Remaining",
                            value: `${loan.paymentsRemaining} of ${loan.totalPayments}`,
                          },
                          {
                            label: "Start Date",
                            value: formatDate(loan.startTimestamp),
                          },
                          {
                            label: "Estimated Maturity",
                            value: formatDate(
                              loan.startTimestamp +
                                loan.totalPayments * 30 * 24 * 60 * 60 * 1000,
                            ),
                          },
                        ].map((item, index) => (
                          <div
                            key={index}
                            className="flex justify-between py-3 border-b border-gray-300 dark:border-white/10"
                          >
                            <span className="text-gray-700 dark:text-white font-medium">
                              {item.label}:
                            </span>
                            <span className="text-gray-900 dark:text-white font-semibold">
                              {item.value}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-col justify-center">
                        <p className="text-sm font-semibold text-gray-700 dark:text-white mb-3">
                          Repayment Progress
                        </p>
                        <div className="relative h-6 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden mb-2">
                          <div
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-500"
                            style={{ width: `${calculateProgress(loan)}%` }}
                          />
                        </div>
                        <p className="text-center text-sm text-gray-700 dark:text-white font-medium">
                          {calculateProgress(loan).toFixed(1)}% Complete
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4 mt-8">
                      <button
                        type="button"
                        onClick={() => void handleMakePayment(loan)}
                        disabled={
                          isLoading ||
                          loan.status !== "Active" ||
                          loan.paymentsRemaining === 0 ||
                          loan.outstandingBalance <= 0
                        }
                        className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                      >
                        Make Payment
                      </button>
                      <button
                        type="button"
                        className="flex-1 glass hover:bg-white/10 text-indigo-400 font-semibold py-4 px-6 rounded-xl border-2 border-indigo-500/30 hover:border-indigo-500/50 transition-all duration-200 transform hover:scale-105"
                      >
                        View Payment Schedule
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* NFT Tab */}
        {activeTab === "nft" && (
          <div className="space-y-6">
            {loadingData ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <span className="ml-3 text-gray-700 dark:text-white">
                  Loading NFT data...
                </span>
              </div>
            ) : !nftData ? (
              <div className="glass rounded-xl shadow-soft p-12 text-center border border-gray-300 dark:border-white/10 backdrop-blur-xl">
                <Award className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  No NFT Found
                </h3>
                <p className="text-gray-700 dark:text-white mb-6">
                  You need to mint a Remittance NFT before you can request a
                  loan.
                </p>
                <button
                  type="button"
                  onClick={() => (window.location.href = "/verify")}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-3 px-8 rounded-xl transition-all duration-200 shadow-lg"
                >
                  Get Verified
                </button>
              </div>
            ) : (
              <>
                <div className="glass rounded-2xl shadow-strong p-8 border border-gray-300 dark:border-white/10 backdrop-blur-xl overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-indigo-600/20 to-blue-600/20 animate-gradient"></div>
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-8">
                      <div className="flex items-center gap-3">
                        <Award className="w-8 h-8 text-purple-400" />
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                          Remittance NFT #{nftData.tokenId}
                        </h3>
                      </div>
                      {nftData.isStaked && (
                        <span className="px-4 py-2 bg-warning-500/20 text-warning-400 rounded-full text-sm font-semibold border border-warning-500/30">
                          Staked as Collateral
                        </span>
                      )}
                    </div>

                    <div className="grid md:grid-cols-3 gap-8 items-center">
                      <div className="flex justify-center">
                        <div className="relative">
                          <div className="w-48 h-48 rounded-full glass flex flex-col items-center justify-center shadow-2xl border border-gray-300 dark:border-white/20">
                            <div className="text-6xl font-bold bg-gradient-to-br from-purple-400 to-indigo-400 bg-clip-text text-transparent">
                              {nftData.reliabilityScore}
                            </div>
                            <div className="text-sm font-semibold text-gray-700 dark:text-white">
                              Reliability Score
                            </div>
                          </div>
                          <div className="absolute -inset-1 bg-gradient-to-r from-purple-400 to-indigo-400 rounded-full blur opacity-40"></div>
                        </div>
                      </div>

                      <div className="md:col-span-2 space-y-4">
                        {[
                          {
                            label: "Monthly Remittance",
                            value: `$${nftData.monthlyAmount.toLocaleString()}`,
                          },
                          {
                            label: "History Length",
                            value: `${nftData.historyMonths} months`,
                          },
                          {
                            label: "Total Sent",
                            value: `$${nftData.totalSent.toLocaleString()}`,
                          },
                        ].map((stat, index) => (
                          <div
                            key={index}
                            className="glass bg-white/5 dark:bg-white/5 backdrop-blur-sm rounded-xl p-4 flex justify-between items-center border border-gray-300 dark:border-white/10"
                          >
                            <span className="text-gray-700 dark:text-white font-medium">
                              {stat.label}
                            </span>
                            <span className="text-gray-900 dark:text-white font-bold text-xl">
                              {stat.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="glass rounded-xl shadow-soft p-8 border border-gray-300 dark:border-white/10 backdrop-blur-xl">
                  <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                    What does this mean?
                  </h4>
                  <p className="text-gray-700 dark:text-white leading-relaxed mb-4">
                    Your reliability score is calculated based on your
                    remittance consistency over the last 24 months. A higher
                    score means better loan terms!
                  </p>
                  <div className="glass bg-indigo-500/10 border-l-4 border-indigo-500 p-4 rounded">
                    <p className="text-indigo-300 font-medium">
                      💡 Continue making regular remittances to improve your
                      score and unlock even better rates.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BorrowerDashboard;
