# ABI Summary — Events & Functions for Indexing

## IdentityRegistry (12 events, 32 functions)

### Events

- `Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)`
- `ApprovalForAll(address indexed owner, address indexed operator, bool approved)`
- `BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId)`
- `EIP712DomainChanged()`
- `Initialized(uint64 version)`
- `MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)`
- `MetadataUpdate(uint256 _tokenId)`
- `OwnershipTransferred(address indexed previousOwner, address indexed newOwner)`
- `Registered(uint256 indexed agentId, string agentURI, address indexed owner)`
- `Transfer(address indexed from, address indexed to, uint256 indexed tokenId)`
- `URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)`
- `Upgraded(address indexed implementation)`

### Functions (non-view)

- `approve(address to, uint256 tokenId)`
- `initialize()`
- `register()`
- `register(string agentURI, tuple[] metadata)`
- `register(string agentURI)`
- `renounceOwnership()`
- `safeTransferFrom(address from, address to, uint256 tokenId)`
- `safeTransferFrom(address from, address to, uint256 tokenId, bytes data)`
- `setAgentURI(uint256 agentId, string newURI)`
- `setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature)`
- `setApprovalForAll(address operator, bool approved)`
- `setMetadata(uint256 agentId, string metadataKey, bytes metadataValue)`
- `transferFrom(address from, address to, uint256 tokenId)`
- `transferOwnership(address newOwner)`
- `unsetAgentWallet(uint256 agentId)`
- `upgradeToAndCall(address newImplementation, bytes data)`

### Functions (view)

- `UPGRADE_INTERFACE_VERSION() → (string)`
- `balanceOf(address owner) → (uint256)`
- `eip712Domain() → (bytes1, string, string, uint256, address, bytes32, uint256[])`
- `getAgentWallet(uint256 agentId) → (address)`
- `getApproved(uint256 tokenId) → (address)`
- `getMetadata(uint256 agentId, string metadataKey) → (bytes)`
- `getVersion() → (string)`
- `isApprovedForAll(address owner, address operator) → (bool)`
- `isAuthorizedOrOwner(address spender, uint256 agentId) → (bool)`
- `name() → (string)`
- `owner() → (address)`
- `ownerOf(uint256 tokenId) → (address)`
- `proxiableUUID() → (bytes32)`
- `supportsInterface(bytes4 interfaceId) → (bool)`
- `symbol() → (string)`
- `tokenURI(uint256 tokenId) → (string)`

---

## ReputationRegistry (6 events, 18 functions)

### Events

- `FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)`
- `Initialized(uint64 version)`
- `NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)`
- `OwnershipTransferred(address indexed previousOwner, address indexed newOwner)`
- `ResponseAppended(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, address indexed responder, string responseURI, bytes32 responseHash)`
- `Upgraded(address indexed implementation)`

### Functions (non-view)

- `appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex, string responseURI, bytes32 responseHash)`
- `giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)`
- `initialize(address identityRegistry_)`
- `renounceOwnership()`
- `revokeFeedback(uint256 agentId, uint64 feedbackIndex)`
- `transferOwnership(address newOwner)`
- `upgradeToAndCall(address newImplementation, bytes data)`

### Functions (view)

- `UPGRADE_INTERFACE_VERSION() → (string)`
- `getClients(uint256 agentId) → (address[])`
- `getIdentityRegistry() → (address)`
- `getLastIndex(uint256 agentId, address clientAddress) → (uint64)`
- `getResponseCount(uint256 agentId, address clientAddress, uint64 feedbackIndex, address[] responders) → (uint64)`
- `getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) → (uint64, int128, uint8)`
- `getVersion() → (string)`
- `owner() → (address)`
- `proxiableUUID() → (bytes32)`
- `readAllFeedback(uint256 agentId, address[] clientAddresses, string tag1, string tag2, bool includeRevoked) → (address[], uint64[], int128[], uint8[], string[], string[], bool[])`
- `readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) → (int128, uint8, string, string, bool)`

---

## ValidationRegistry (5 events, 15 functions)

### Events

- `Initialized(uint64 version)`
- `OwnershipTransferred(address indexed previousOwner, address indexed newOwner)`
- `Upgraded(address indexed implementation)`
- `ValidationRequest(address indexed validatorAddress, uint256 indexed agentId, string requestURI, bytes32 indexed requestHash)`
- `ValidationResponse(address indexed validatorAddress, uint256 indexed agentId, bytes32 indexed requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)`

### Functions (non-view)

- `initialize(address identityRegistry_)`
- `renounceOwnership()`
- `transferOwnership(address newOwner)`
- `upgradeToAndCall(address newImplementation, bytes data)`
- `validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash)`
- `validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)`

### Functions (view)

- `UPGRADE_INTERFACE_VERSION() → (string)`
- `getAgentValidations(uint256 agentId) → (bytes32[])`
- `getIdentityRegistry() → (address)`
- `getSummary(uint256 agentId, address[] validatorAddresses, string tag) → (uint64, uint8)`
- `getValidationStatus(bytes32 requestHash) → (address, uint256, uint8, bytes32, string, uint256)`
- `getValidatorRequests(address validatorAddress) → (bytes32[])`
- `getVersion() → (string)`
- `owner() → (address)`
- `proxiableUUID() → (bytes32)`

---

## AgenticCommerce (17 events, 32 functions)

### Events

- `BudgetSet(uint256 indexed jobId, uint256 amount)`
- `EvaluatorFeePaid(uint256 indexed jobId, address indexed evaluator, uint256 amount)`
- `HookWhitelistUpdated(address indexed hook, bool status)`
- `Initialized(uint64 version)`
- `JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason)`
- `JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)`
- `JobExpired(uint256 indexed jobId)`
- `JobFunded(uint256 indexed jobId, address indexed client, uint256 amount)`
- `JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason)`
- `JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)`
- `PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount)`
- `ProviderSet(uint256 indexed jobId, address indexed provider)`
- `Refunded(uint256 indexed jobId, address indexed client, uint256 amount)`
- `RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole)`
- `RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)`
- `RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)`
- `Upgraded(address indexed implementation)`

### Functions (non-view)

- `claimRefund(uint256 jobId)`
- `complete(uint256 jobId, bytes32 reason, bytes optParams)`
- `createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook)`
- `fund(uint256 jobId, bytes optParams)`
- `grantRole(bytes32 role, address account)`
- `initialize(address paymentToken_, address treasury_, address admin_)`
- `reject(uint256 jobId, bytes32 reason, bytes optParams)`
- `renounceRole(bytes32 role, address callerConfirmation)`
- `revokeRole(bytes32 role, address account)`
- `setBudget(uint256 jobId, uint256 amount, bytes optParams)`
- `setEvaluatorFee(uint256 feeBP_)`
- `setHookWhitelist(address hook, bool status)`
- `setPlatformFee(uint256 feeBP_, address treasury_)`
- `setProvider(uint256 jobId, address provider_)`
- `submit(uint256 jobId, bytes32 deliverable, bytes optParams)`
- `upgradeToAndCall(address newImplementation, bytes data)`

### Functions (view)

- `ADMIN_ROLE() → (bytes32)`
- `DEFAULT_ADMIN_ROLE() → (bytes32)`
- `UPGRADE_INTERFACE_VERSION() → (string)`
- `evaluatorFeeBP() → (uint256)`
- `getJob(uint256 jobId) → (tuple)`
- `getRoleAdmin(bytes32 role) → (bytes32)`
- `hasRole(bytes32 role, address account) → (bool)`
- `jobCounter() → (uint256)`
- `jobHasBudget(uint256 jobId) → (bool)`
- `jobs(uint256 ) → (uint256, address, address, address, string, uint256, uint256, uint8, address)`
- `paymentToken() → (address)`
- `platformFeeBP() → (uint256)`
- `platformTreasury() → (address)`
- `proxiableUUID() → (bytes32)`
- `supportsInterface(bytes4 interfaceId) → (bool)`
- `whitelistedHooks(address ) → (bool)`

---

