# Contract Interfaces Extracted from Arc Agentic Economy Docs

Source files read in full:

- `/root/building-arc/arc-docs-raw/020_build_agentic-economy.md`
- `/root/building-arc/arc-docs-raw/021_arc_tutorials_register-your-first-ai-agent.md`
- `/root/building-arc/arc-docs-raw/022_arc_tutorials_create-your-first-erc-8183-job.md`

## Contract Addresses

### ERC-8004 Contracts on Arc Testnet

| Contract | Address |
| --- | --- |
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` |

### ERC-8183 Contract on Arc Testnet

| Contract | Address |
| --- | --- |
| AgenticCommerce reference implementation | `0x0747EEf0706327138c69792bF28Cd525089e4583` |

### Token Contract Used by ERC-8183 Flow

| Contract | Address |
| --- | --- |
| USDC Testnet | `0x3600000000000000000000000000000000000000` |

## Technical Notes from Source Docs

- ERC-8004 provides onchain agent identity, reputation events, and credential validation.
- ERC-8183 defines an agentic job lifecycle: creation, escrow funding, deliverable submission, evaluation, and settlement.
- Arc Testnet gas is approximately `0.006 USDC-TESTNET` per transaction in the Circle Wallets flow.
- ERC-8004 agent owners cannot record reputation for their own agents; a separate validator wallet records reputation.
- ERC-8004 validation is a two-step request/response flow: owner requests validation, validator submits response.
- ERC-8183 quickstarts use the client wallet as evaluator.
- ERC-8183 quickstarts use `address(0)` for the hook to follow the non-hooked path.
- The deployed ERC-8183 reference implementation's `getJob()` return value does not include the submitted deliverable hash.
- If platform or evaluator fees are configured on the deployed ERC-8183 contract, the provider receives the net amount after fees instead of the full job budget.

## ERC-8004: IdentityRegistry

Address: `0x8004A818BFB912233c491871b3d84c89A494BD9e`

### Function Signatures

```solidity
function register(string memory metadataURI) external;
function ownerOf(uint256 tokenId) external view returns (address);
function tokenURI(uint256 tokenId) external view returns (string memory);
```

### Event Definitions

```solidity
event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
```

### Struct Definitions

No explicit Solidity struct definition for `IdentityRegistry` is documented in the source files.

### State Variables

No explicit Solidity state variables for `IdentityRegistry` are documented in the source files.

### Complete Solidity Interface from Docs

```solidity
interface IIdentityRegistry {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function register(string memory metadataURI) external;

    function ownerOf(uint256 tokenId) external view returns (address);

    function tokenURI(uint256 tokenId) external view returns (string memory);
}
```

## ERC-8004: ReputationRegistry

Address: `0x8004B663056A597Dffe9eCcC1965A193B7388713`

### Function Signatures

```solidity
function giveFeedback(
    uint256 agentId,
    int128 score,
    uint8 feedbackType,
    string memory tag,
    string memory metadataURI,
    string memory evidenceURI,
    string memory comment,
    bytes32 feedbackHash
) external;
```

### Event Definitions

The docs reference reputation/feedback events generally and count logs emitted by the `ReputationRegistry`, but no concrete event ABI or Solidity event signature is documented in the source files.

### Struct Definitions

No explicit Solidity struct definition for `ReputationRegistry` is documented in the source files.

### State Variables

No explicit Solidity state variables for `ReputationRegistry` are documented in the source files.

### Complete Solidity Interface from Docs

```solidity
interface IReputationRegistry {
    function giveFeedback(
        uint256 agentId,
        int128 score,
        uint8 feedbackType,
        string memory tag,
        string memory metadataURI,
        string memory evidenceURI,
        string memory comment,
        bytes32 feedbackHash
    ) external;
}
```

## ERC-8004: ValidationRegistry

Address: `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`

### Function Signatures

```solidity
function validationRequest(
    address validator,
    uint256 agentId,
    string memory requestURI,
    bytes32 requestHash
) external;

function validationResponse(
    bytes32 requestHash,
    uint8 response,
    string memory responseURI,
    bytes32 responseHash,
    string memory tag
) external;

function getValidationStatus(bytes32 requestHash)
    external
    view
    returns (
        address validatorAddress,
        uint256 agentId,
        uint8 response,
        bytes32 responseHash,
        string memory tag,
        uint256 lastUpdate
    );
```

### Event Definitions

No explicit Solidity event definitions for `ValidationRegistry` are documented in the source files.

### Struct Definitions

No named Solidity struct definition for `ValidationRegistry` is documented in the source files.

The `getValidationStatus(bytes32)` return tuple documents the validation status shape:

```solidity
struct ValidationStatus {
    address validatorAddress;
    uint256 agentId;
    uint8 response;
    bytes32 responseHash;
    string tag;
    uint256 lastUpdate;
}
```

Note: `ValidationStatus` is inferred from the documented return tuple. The docs do not state that this named struct exists onchain.

### State Variables

No explicit Solidity state variables for `ValidationRegistry` are documented in the source files.

### Complete Solidity Interface from Docs

```solidity
interface IValidationRegistry {
    function validationRequest(
        address validator,
        uint256 agentId,
        string memory requestURI,
        bytes32 requestHash
    ) external;

    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string memory responseURI,
        bytes32 responseHash,
        string memory tag
    ) external;

    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (
            address validatorAddress,
            uint256 agentId,
            uint8 response,
            bytes32 responseHash,
            string memory tag,
            uint256 lastUpdate
        );
}
```

## ERC-8183: AgenticCommerce Reference Implementation

Address: `0x0747EEf0706327138c69792bF28Cd525089e4583`

### Function Signatures

```solidity
function createJob(
    address provider,
    address evaluator,
    uint256 expiredAt,
    string memory description,
    address hook
) external returns (uint256 jobId);

function setBudget(uint256 jobId, uint256 amount, bytes memory optParams) external;

function fund(uint256 jobId, bytes memory optParams) external;

function submit(uint256 jobId, bytes32 deliverable, bytes memory optParams) external;

function complete(uint256 jobId, bytes32 reason, bytes memory optParams) external;

function getJob(uint256 jobId) external view returns (Job memory);
```

### Event Definitions

```solidity
event JobCreated(
    uint256 indexed jobId,
    address indexed client,
    address indexed provider,
    address evaluator,
    uint256 expiredAt,
    address hook
);
```

### Struct Definitions

```solidity
struct Job {
    uint256 id;
    address client;
    address provider;
    address evaluator;
    string description;
    uint256 budget;
    uint256 expiredAt;
    uint8 status;
    address hook;
}
```

### Status Values

The docs provide the following status name ordering for the `uint8 status` field:

```solidity
// uint8 status values inferred from STATUS_NAMES arrays in the docs.
// 0 = Open
// 1 = Funded
// 2 = Submitted
// 3 = Completed
// 4 = Rejected
// 5 = Expired
```

### State Variables

No explicit Solidity state variables for the `AgenticCommerce` reference implementation are documented in the source files.

The docs define client-side constants used by examples:

```solidity
address constant AGENTIC_COMMERCE_CONTRACT = 0x0747EEf0706327138c69792bF28Cd525089e4583;
uint256 constant JOB_BUDGET_EXAMPLE_CIRCLE = 5_000_000; // 5 USDC with 6 decimals
uint256 constant JOB_BUDGET_EXAMPLE_VIEM = 1_000_000; // 1 USDC with 6 decimals
```

These are tutorial constants, not documented onchain state variables.

### Complete Solidity Interface from Docs

```solidity
interface IAgenticCommerce {
    struct Job {
        uint256 id;
        address client;
        address provider;
        address evaluator;
        string description;
        uint256 budget;
        uint256 expiredAt;
        uint8 status;
        address hook;
    }

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed provider,
        address evaluator,
        uint256 expiredAt,
        address hook
    );

    function createJob(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string memory description,
        address hook
    ) external returns (uint256 jobId);

    function setBudget(uint256 jobId, uint256 amount, bytes memory optParams) external;

    function fund(uint256 jobId, bytes memory optParams) external;

    function submit(uint256 jobId, bytes32 deliverable, bytes memory optParams) external;

    function complete(uint256 jobId, bytes32 reason, bytes memory optParams) external;

    function getJob(uint256 jobId) external view returns (Job memory);
}
```

## ERC-20: USDC Functions Used in ERC-8183 Flow

Address: `0x3600000000000000000000000000000000000000`

### Function Signatures

```solidity
function approve(address spender, uint256 amount) external returns (bool);
function balanceOf(address account) external view returns (uint256);
```

### Event Definitions

No ERC-20 event definitions are documented in the source files.

### Struct Definitions

No ERC-20 struct definitions are documented in the source files.

### State Variables

No ERC-20 state variables are documented in the source files.

### Complete Solidity Interface from Docs

```solidity
interface IERC20FromArcTutorials {
    function approve(address spender, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);
}
```

## Consolidated Function Signature List

```solidity
// ERC-8004 IdentityRegistry
function register(string memory metadataURI) external;
function ownerOf(uint256 tokenId) external view returns (address);
function tokenURI(uint256 tokenId) external view returns (string memory);

// ERC-8004 ReputationRegistry
function giveFeedback(uint256 agentId, int128 score, uint8 feedbackType, string memory tag, string memory metadataURI, string memory evidenceURI, string memory comment, bytes32 feedbackHash) external;

// ERC-8004 ValidationRegistry
function validationRequest(address validator, uint256 agentId, string memory requestURI, bytes32 requestHash) external;
function validationResponse(bytes32 requestHash, uint8 response, string memory responseURI, bytes32 responseHash, string memory tag) external;
function getValidationStatus(bytes32 requestHash) external view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string memory tag, uint256 lastUpdate);

// ERC-8183 AgenticCommerce
function createJob(address provider, address evaluator, uint256 expiredAt, string memory description, address hook) external returns (uint256 jobId);
function setBudget(uint256 jobId, uint256 amount, bytes memory optParams) external;
function fund(uint256 jobId, bytes memory optParams) external;
function submit(uint256 jobId, bytes32 deliverable, bytes memory optParams) external;
function complete(uint256 jobId, bytes32 reason, bytes memory optParams) external;
function getJob(uint256 jobId) external view returns (Job memory);

// ERC-20 USDC functions used by tutorials
function approve(address spender, uint256 amount) external returns (bool);
function balanceOf(address account) external view returns (uint256);
```

## Consolidated Event Definition List

```solidity
// IdentityRegistry / ERC-721 event used to retrieve the minted agent token ID
event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

// AgenticCommerce event used to retrieve the created job ID
event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook);
```

## Consolidated Struct Definition List

```solidity
// Inferred from AgenticCommerce getJob(uint256) return tuple
struct Job {
    uint256 id;
    address client;
    address provider;
    address evaluator;
    string description;
    uint256 budget;
    uint256 expiredAt;
    uint8 status;
    address hook;
}

// Inferred from ValidationRegistry getValidationStatus(bytes32) return tuple;
// not documented as a named onchain Solidity struct.
struct ValidationStatus {
    address validatorAddress;
    uint256 agentId;
    uint8 response;
    bytes32 responseHash;
    string tag;
    uint256 lastUpdate;
}
```

## Full Consolidated Solidity Interfaces

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IIdentityRegistry {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function register(string memory metadataURI) external;

    function ownerOf(uint256 tokenId) external view returns (address);

    function tokenURI(uint256 tokenId) external view returns (string memory);
}

interface IReputationRegistry {
    function giveFeedback(
        uint256 agentId,
        int128 score,
        uint8 feedbackType,
        string memory tag,
        string memory metadataURI,
        string memory evidenceURI,
        string memory comment,
        bytes32 feedbackHash
    ) external;
}

interface IValidationRegistry {
    function validationRequest(
        address validator,
        uint256 agentId,
        string memory requestURI,
        bytes32 requestHash
    ) external;

    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string memory responseURI,
        bytes32 responseHash,
        string memory tag
    ) external;

    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (
            address validatorAddress,
            uint256 agentId,
            uint8 response,
            bytes32 responseHash,
            string memory tag,
            uint256 lastUpdate
        );
}

interface IAgenticCommerce {
    struct Job {
        uint256 id;
        address client;
        address provider;
        address evaluator;
        string description;
        uint256 budget;
        uint256 expiredAt;
        uint8 status;
        address hook;
    }

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed provider,
        address evaluator,
        uint256 expiredAt,
        address hook
    );

    function createJob(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string memory description,
        address hook
    ) external returns (uint256 jobId);

    function setBudget(uint256 jobId, uint256 amount, bytes memory optParams) external;

    function fund(uint256 jobId, bytes memory optParams) external;

    function submit(uint256 jobId, bytes32 deliverable, bytes memory optParams) external;

    function complete(uint256 jobId, bytes32 reason, bytes memory optParams) external;

    function getJob(uint256 jobId) external view returns (Job memory);
}

interface IERC20FromArcTutorials {
    function approve(address spender, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);
}
```
