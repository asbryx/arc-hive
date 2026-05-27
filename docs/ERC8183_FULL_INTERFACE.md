# ERC-8183 Full Interface (from erc-8183/base-contracts + hook-contracts)

## Core Contract: AgenticCommerce (ERC8183)

Address on Arc Testnet: `0x0747EEf0706327138c69792bF28Cd525089e4583`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC8183AgenticCommerce {
    enum JobStatus {
        Open,
        Funded,
        Submitted,
        Completed,
        Rejected,
        Expired
    }

    struct Job {
        address client;
        JobStatus status;
        address provider;
        uint48 expiredAt;
        address evaluator;
        uint48 submittedAt;
        uint256 budget;
        address hook;
        address paymentToken;
        uint256 providerAgentId;
        string description;
    }

    // ─── Events ───────────────────────────────────────────────────────────────
    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed provider,
        address evaluator,
        uint48 expiredAt,
        address hook
    );
    event ProviderSet(uint256 indexed jobId, address indexed provider, uint256 agentId);
    event BudgetSet(uint256 indexed jobId, address indexed token, uint256 amount);
    event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable);
    event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason);
    event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason);
    event JobExpired(uint256 indexed jobId);
    event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount);
    event PlatformFeePaid(uint256 indexed jobId, address indexed platformTreasury, uint256 amount);
    event EvaluatorFeePaid(uint256 indexed jobId, address indexed evaluator, uint256 amount);
    event Refunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event HookWhitelistUpdated(address indexed hook, bool status);
    event PaymentTokenAllowlistUpdated(address indexed token, bool status);
    event HookDetached(uint256 indexed jobId, address indexed hook);
    event PlatformFeeUpdated(uint256 feeBP, address indexed treasury);
    event EvaluatorFeeUpdated(uint256 feeBP);
    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);

    // ─── Errors ───────────────────────────────────────────────────────────────
    error InvalidJob();
    error InvalidHook();
    error WrongStatus();
    error Unauthorized();
    error ZeroAddress();
    error ExpiryTooShort();
    error ProviderNotSet();
    error FeesTooHigh();
    error HookNotWhitelisted();
    error BudgetMismatch();
    error ProviderCannotBeEvaluator();
    error ClientCannotBeProvider();
    error GracePeriodActive();
    error PaymentTokenNotAllowed();
    error UnexpectedFundedAmount();

    // ─── Admin ────────────────────────────────────────────────────────────────
    function ADMIN_ROLE() external view returns (bytes32);
    function DEFAULT_ADMIN_ROLE() external view returns (bytes32);
    function EVALUATION_GRACE_PERIOD() external view returns (uint256);
    function UPGRADE_INTERFACE_VERSION() external view returns (string memory);

    function initialize(address treasury_, address admin_) external;
    function pause() external;
    function unpause() external;
    function paused() external view returns (bool);
    function emergencyWithdraw(address token, address to, uint256 amount) external;
    function setPlatformFee(uint256 feeBP_, address treasury_) external;
    function setEvaluatorFee(uint256 feeBP_) external;
    function setHookWhitelist(address hook, bool status) external;
    function setPaymentTokenAllowed(address token, bool status) external;
    function batchDetachHook(uint256[] calldata jobIds) external;

    // ─── Job Lifecycle ────────────────────────────────────────────────────────
    function createJob(
        address provider,
        address evaluator,
        uint48 expiredAt,
        string calldata description,
        address hook,
        uint256 providerAgentId
    ) external returns (uint256);

    function setProvider(uint256 jobId, address provider_, uint256 agentId) external;

    function setBudget(
        uint256 jobId,
        address token,
        uint256 amount,
        bytes calldata optParams
    ) external;

    function fund(
        uint256 jobId,
        uint256 expectedBudget,
        bytes calldata optParams
    ) external;

    function submit(
        uint256 jobId,
        bytes32 deliverable,
        bytes calldata optParams
    ) external;

    function complete(
        uint256 jobId,
        bytes32 reason,
        bytes calldata optParams
    ) external;

    function reject(
        uint256 jobId,
        bytes32 reason,
        bytes calldata optParams
    ) external;

    function claimRefund(uint256 jobId) external;

    // ─── Views ────────────────────────────────────────────────────────────────
    function getJob(uint256 jobId) external view returns (Job memory);
    function jobCounter() external view returns (uint256);
    function whitelistedHooks(address hook) external view returns (bool);
    function allowedPaymentTokens(address token) external view returns (bool);
    function platformFeeBP() external view returns (uint256);
    function platformTreasury() external view returns (address);
    function evaluatorFeeBP() external view returns (uint256);
}
```

## Hook Interface

```solidity
interface IERC8183Hook {
    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata data) external;
    function afterAction(uint256 jobId, bytes4 selector, bytes calldata data) external;
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IERC8183HookMetadata {
    function requiredSelectors() external view returns (bytes4[] memory);
}
```

## Hook Callback Data Encodings

```solidity
// selector: setBudget(uint256,address,uint256,bytes)
abi.encode(caller, token, amount, optParams);

// selector: fund(uint256,uint256,bytes)
abi.encode(caller, optParams);

// selector: submit(uint256,bytes32,bytes)
abi.encode(caller, deliverable, optParams);

// selector: complete(uint256,bytes32,bytes)
abi.encode(caller, reason, optParams);

// selector: reject(uint256,bytes32,bytes)
abi.encode(caller, reason, optParams);
```

## Hookable Selectors

```solidity
bytes4 constant SEL_SET_BUDGET = bytes4(keccak256("setBudget(uint256,address,uint256,bytes)"));
bytes4 constant SEL_FUND       = bytes4(keccak256("fund(uint256,uint256,bytes)"));
bytes4 constant SEL_SUBMIT     = bytes4(keccak256("submit(uint256,bytes32,bytes)"));
bytes4 constant SEL_COMPLETE   = bytes4(keccak256("complete(uint256,bytes32,bytes)"));
bytes4 constant SEL_REJECT     = bytes4(keccak256("reject(uint256,bytes32,bytes)"));
```

## Key Events for Indexing

For ArcHive indexer, these are the critical events to watch:

### Must-index (core lifecycle):
- `JobCreated` — new job, captures client/provider/evaluator/expiry/hook
- `ProviderSet` — provider assigned (includes agentId link to ERC-8004)
- `BudgetSet` — budget amount + payment token
- `JobFunded` — escrow funded
- `JobSubmitted` — deliverable hash submitted
- `JobCompleted` — job done, reason hash
- `JobRejected` — job rejected, reason hash
- `JobExpired` — job expired without completion

### Nice-to-index (financial):
- `PaymentReleased` — actual payout amount to provider
- `PlatformFeePaid` — fee taken
- `EvaluatorFeePaid` — evaluator compensation
- `Refunded` — client got money back
