// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title SpendWise Expense Registry
/// @notice Lets each wallet publish immutable expense records on BOT Chain.
/// @dev The contract proves who recorded data and when. It does not prove a purchase occurred.
contract SpendWiseProof {
    struct ExpenseRecord {
        uint256 amountMinor;
        bytes3 currency;
        bytes32 detailsHash;
        uint32 transactionDate;
        uint64 recordedAt;
    }

    mapping(address => mapping(bytes32 => ExpenseRecord)) public expenses;

    event ExpenseRecorded(
        address indexed owner,
        bytes32 indexed expenseId,
        uint256 amountMinor,
        bytes3 currency,
        bytes32 detailsHash,
        uint32 transactionDate,
        uint64 recordedAt
    );

    error EmptyExpenseId();
    error InvalidAmount();
    error InvalidCurrency();
    error EmptyDetailsHash();
    error InvalidDate();
    error ExpenseAlreadyRecorded();

    function recordExpense(
        bytes32 expenseId,
        uint256 amountMinor,
        bytes3 currency,
        bytes32 detailsHash,
        uint32 transactionDate
    ) external {
        if (expenseId == bytes32(0)) revert EmptyExpenseId();
        if (amountMinor == 0) revert InvalidAmount();
        if (
            currency != bytes3("IDR") &&
            currency != bytes3("USD") &&
            currency != bytes3("MYR") &&
            currency != bytes3("SGD")
        ) revert InvalidCurrency();
        if (detailsHash == bytes32(0)) revert EmptyDetailsHash();
        if (transactionDate == 0) revert InvalidDate();
        if (expenses[msg.sender][expenseId].recordedAt != 0) revert ExpenseAlreadyRecorded();

        uint64 timestamp = uint64(block.timestamp);
        expenses[msg.sender][expenseId] = ExpenseRecord({
            amountMinor: amountMinor,
            currency: currency,
            detailsHash: detailsHash,
            transactionDate: transactionDate,
            recordedAt: timestamp
        });

        emit ExpenseRecorded(msg.sender, expenseId, amountMinor, currency, detailsHash, transactionDate, timestamp);
    }

    function verifyExpense(
        address wallet,
        bytes32 expenseId
    )
        external
        view
        returns (
            bool exists,
            uint256 amountMinor,
            bytes3 currency,
            bytes32 detailsHash,
            uint32 transactionDate,
            uint64 recordedAt
        )
    {
        ExpenseRecord memory expense = expenses[wallet][expenseId];

        return (
            expense.recordedAt != 0,
            expense.amountMinor,
            expense.currency,
            expense.detailsHash,
            expense.transactionDate,
            expense.recordedAt
        );
    }
}
