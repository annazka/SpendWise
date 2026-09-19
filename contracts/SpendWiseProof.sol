// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @title SpendWise Expense Registry
/// @notice Lets each wallet publish immutable expense records on BOT Chain.
/// @dev The contract proves who recorded data and when. It does not prove a purchase occurred.
contract SpendWiseProof {
    struct ExpenseRecord {
        uint256 amountMinor;
        bytes3 currency;
        bytes32 detailsHash;
        uint32 date;
        uint64 recordedAt;
    }

    mapping(address => mapping(bytes32 => ExpenseRecord)) public expenses;

    event ExpenseRecorded(
        address indexed owner,
        bytes32 indexed expenseId,
        uint256 amountMinor,
        bytes3 currency,
        bytes32 detailsHash,
        uint32 date,
        uint64 recordedAt
    );

    error EmptyExpenseId();
    error InvalidAmount();
    error AlreadyRecorded();

    function recordExpense(
        bytes32 expenseId,
        uint256 amountMinor,
        bytes3 currency,
        bytes32 detailsHash,
        uint32 date
    ) external {
        if (expenseId == bytes32(0)) revert EmptyExpenseId();
        if (amountMinor == 0) revert InvalidAmount();
        if (expenses[msg.sender][expenseId].recordedAt != 0) revert AlreadyRecorded();

        uint64 timestamp = uint64(block.timestamp);
        expenses[msg.sender][expenseId] = ExpenseRecord({
            amountMinor: amountMinor,
            currency: currency,
            detailsHash: detailsHash,
            date: date,
            recordedAt: timestamp
        });

        emit ExpenseRecorded(msg.sender, expenseId, amountMinor, currency, detailsHash, date, timestamp);
    }
}
