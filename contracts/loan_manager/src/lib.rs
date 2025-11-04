#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address};

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum LoanStatus {
    Pending = 0,
    Active = 1,
    Repaid = 2,
    Defaulted = 3,
}

#[contracttype]
#[derive(Clone)]
pub struct Loan {
    pub loan_id: u64,
    pub borrower: Address,
    pub nft_collateral_id: u64,
    pub loan_amount: i128,
    pub outstanding_balance: i128,
    pub total_repaid: i128,
    pub interest_rate: u32,          // APR in basis points
    pub duration_months: u32,
    pub monthly_payment: i128,
    pub start_timestamp: u64,
    pub next_payment_due: u64,
    pub status: LoanStatus,
    pub payments_made: u32,
    pub payments_missed: u32,
}

#[contracttype]
pub enum DataKey {
    LoanCounter,
    Loan(u64),
    BorrowerLoans(Address),
    RemittanceNFTContract,
    LendingPoolContract,
    OracleContract,
    USDCTokenAddress,
}


#[contract]
pub struct LoanManager;

#[contractimpl]
impl LoanManager {}