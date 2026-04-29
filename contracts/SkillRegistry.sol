// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SkillRegistry is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant CURATOR_ROLE = keccak256("CURATOR_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant MAX_TAGS_PER_VERSION = 20;
    uint256 public constant MAX_TAG_LENGTH = 64;
    uint256 public constant MAX_NAME_LENGTH = 128;
    uint256 public constant MAX_NAMESPACE_LENGTH = 128;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 5000;
    uint256 public constant MAX_URI_LENGTH = 512;

    enum SkillStatus {
        Draft,
        Active,
        Paused,
        Deprecated,
        Revoked
    }

    struct SkillVersion {
        uint256 version;
        string implementationUri;
        string metadataUri;
        string storageUri;
        string computeModel;
        string entrypoint;
        bytes32 inputSchemaHash;
        bytes32 outputSchemaHash;
        bytes32 codeHash;
        bool requiresWallet;
        bool requiresApproval;
        bool publicUse;
        bool enabled;
        uint256 createdAt;
        uint256 updatedAt;
        string[] tags;
        string[] capabilityHints;
    }

    struct SkillRecord {
        bytes32 skillId;
        address owner;
        string namespace;
        string name;
        string description;
        SkillStatus status;
        uint256 activeVersion;
        uint256 latestVersion;
        uint256 createdAt;
        uint256 updatedAt;
        uint256 totalUsage;
        uint256 totalSuccesses;
        uint256 totalFailures;
        uint256 averageLatencyMs;
        uint256 feeBps;
        bool allowPublicUse;
        bool approved;
        bool pinnedTo0G;
        string pinnedStorageUri;
        string pinnedComputeUri;
        string explorerUri;
        address implementationAddress;
        address lastUpdatedBy;
        bytes32 metadataHash;
    }

    struct SkillInput {
        address owner;
        string namespace;
        string name;
        string description;
        string implementationUri;
        string metadataUri;
        string storageUri;
        string computeModel;
        string entrypoint;
        bytes32 inputSchemaHash;
        bytes32 outputSchemaHash;
        bytes32 codeHash;
        bool requiresWallet;
        bool requiresApproval;
        bool publicUse;
        uint256 feeBps;
        string pinnedStorageUri;
        string pinnedComputeUri;
        string explorerUri;
        address implementationAddress;
        bytes32 metadataHash;
        string[] tags;
        string[] capabilityHints;
    }

    struct SkillVersionInput {
        string implementationUri;
        string metadataUri;
        string storageUri;
        string computeModel;
        string entrypoint;
        bytes32 inputSchemaHash;
        bytes32 outputSchemaHash;
        bytes32 codeHash;
        bool requiresWallet;
        bool requiresApproval;
        bool publicUse;
        address implementationAddress;
        bytes32 metadataHash;
        string[] tags;
        string[] capabilityHints;
    }

    struct UsageReport {
        uint256 successCount;
        uint256 failureCount;
        uint256 totalLatencyMs;
        uint256 lastUsedAt;
        bytes32 lastRunHash;
    }

    struct Pagination {
        uint256 offset;
        uint256 limit;
    }

    mapping(bytes32 => SkillRecord) private _skills;
    mapping(bytes32 => mapping(uint256 => SkillVersion)) private _versions;
    mapping(bytes32 => uint256[]) private _versionList;
    mapping(bytes32 => UsageReport) private _usage;
    bytes32[] private _skillIds;
    mapping(address => bytes32[]) private _skillsByOwner;
    mapping(address => mapping(bytes32 => bool)) private _ownerSkillIndex;
    mapping(bytes32 => mapping(address => bool)) private _curatedBy;
    mapping(bytes32 => mapping(address => bool)) private _approvedOperators;

    event SkillRegistered(
        bytes32 indexed skillId,
        address indexed owner,
        string namespace,
        string name,
        uint256 version,
        address implementationAddress,
        bytes32 metadataHash
    );
    event SkillVersionAdded(
        bytes32 indexed skillId,
        uint256 indexed version,
        address indexed owner,
        address implementationAddress,
        bytes32 metadataHash
    );
    event SkillActivated(bytes32 indexed skillId, uint256 indexed version, address indexed operator);
    event SkillPaused(bytes32 indexed skillId, address indexed operator);
    event SkillDeprecated(bytes32 indexed skillId, address indexed operator);
    event SkillRevoked(bytes32 indexed skillId, address indexed operator, string reason);
    event SkillApproved(bytes32 indexed skillId, address indexed approver, bool approved);
    event SkillOwnershipTransferred(bytes32 indexed skillId, address indexed previousOwner, address indexed newOwner);
    event SkillUsageReported(bytes32 indexed skillId, address indexed reporter, bool success, uint256 latencyMs, bytes32 runHash);
    event SkillPinned(bytes32 indexed skillId, string storageUri, string computeUri, bytes32 metadataHash);
    event CuratorGranted(bytes32 indexed skillId, address indexed curator);
    event CuratorRevoked(bytes32 indexed skillId, address indexed curator);
    event OperatorApproved(bytes32 indexed skillId, address indexed operator);
    event OperatorRevoked(bytes32 indexed skillId, address indexed operator);

    error SkillAlreadyExists(bytes32 skillId);
    error SkillNotFound(bytes32 skillId);
    error SkillVersionNotFound(bytes32 skillId, uint256 version);
    error NotSkillOwner(address sender, address owner);
    error NotApproved(bytes32 skillId);
    error InvalidNamespace();
    error InvalidName();
    error InvalidDescription();
    error InvalidUri();
    error InvalidFeeBps();
    error InvalidTagCount();
    error InvalidTagLength();
    error InvalidSchemaHash();
    error InvalidOperation(string reason);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(CURATOR_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function registerSkill(SkillInput calldata input) external whenNotPaused nonReentrant returns (bytes32 skillId) {
        return _registerSkill(input, msg.sender);
    }

    function registerSkillForOwner(SkillInput calldata input) external whenNotPaused onlyRole(CURATOR_ROLE) nonReentrant returns (bytes32 skillId) {
        return _registerSkill(input, input.owner);
    }

    function _registerSkill(SkillInput calldata input, address normalizedOwner) internal returns (bytes32 skillId) {
        _validateBasicInput(
            input.namespace,
            input.name,
            input.description,
            input.implementationUri,
            input.metadataUri,
            input.storageUri,
            input.computeModel,
            input.entrypoint,
            input.feeBps,
            input.tags,
            input.capabilityHints
        );
        if (input.owner != normalizedOwner && !hasRole(CURATOR_ROLE, msg.sender)) revert NotSkillOwner(msg.sender, input.owner);

        skillId = _skillId(normalizedOwner, input.namespace, input.name);
        if (_skills[skillId].createdAt != 0) revert SkillAlreadyExists(skillId);

        SkillRecord storage record = _skills[skillId];
        record.skillId = skillId;
        record.owner = normalizedOwner;
        record.namespace = input.namespace;
        record.name = input.name;
        record.description = input.description;
        record.status = SkillStatus.Draft;
        record.activeVersion = 1;
        record.latestVersion = 1;
        record.createdAt = block.timestamp;
        record.updatedAt = block.timestamp;
        record.allowPublicUse = input.publicUse;
        record.approved = false;
        record.pinnedTo0G = bytes(input.pinnedStorageUri).length > 0 || bytes(input.pinnedComputeUri).length > 0;
        record.pinnedStorageUri = input.pinnedStorageUri;
        record.pinnedComputeUri = input.pinnedComputeUri;
        record.explorerUri = input.explorerUri;
        record.implementationAddress = input.implementationAddress;
        record.lastUpdatedBy = msg.sender;
        record.metadataHash = input.metadataHash;
        record.feeBps = input.feeBps;

        _skillIds.push(skillId);
        if (!_ownerSkillIndex[normalizedOwner][skillId]) {
            _skillsByOwner[normalizedOwner].push(skillId);
            _ownerSkillIndex[normalizedOwner][skillId] = true;
        }

        _versions[skillId][1] = SkillVersion({
            version: 1,
            implementationUri: input.implementationUri,
            metadataUri: input.metadataUri,
            storageUri: input.storageUri,
            computeModel: input.computeModel,
            entrypoint: input.entrypoint,
            inputSchemaHash: input.inputSchemaHash,
            outputSchemaHash: input.outputSchemaHash,
            codeHash: input.codeHash,
            requiresWallet: input.requiresWallet,
            requiresApproval: input.requiresApproval,
            publicUse: input.publicUse,
            enabled: true,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            tags: input.tags,
            capabilityHints: input.capabilityHints
        });
        _versionList[skillId].push(1);
        _usage[skillId] = UsageReport(0, 0, 0, 0, bytes32(0));

        emit SkillRegistered(skillId, normalizedOwner, input.namespace, input.name, 1, input.implementationAddress, input.metadataHash);
    }

    function addSkillVersion(bytes32 skillId, SkillVersionInput calldata input) external whenNotPaused nonReentrant returns (uint256 version) {
        SkillRecord storage record = _mustGetSkill(skillId);
        _requireOwnerOrCurator(record);
        _validateBasicVersionInput(
            input.implementationUri,
            input.metadataUri,
            input.storageUri,
            input.computeModel,
            input.entrypoint,
            input.tags,
            input.capabilityHints,
            input.inputSchemaHash,
            input.outputSchemaHash
        );

        version = record.latestVersion + 1;
        record.latestVersion = version;
        record.updatedAt = block.timestamp;
        record.lastUpdatedBy = msg.sender;
        record.implementationAddress = input.implementationAddress;
        record.metadataHash = input.metadataHash;
        record.allowPublicUse = input.publicUse;
        if (bytes(input.storageUri).length > 0) record.pinnedStorageUri = input.storageUri;
        if (bytes(input.computeModel).length > 0) record.pinnedComputeUri = input.computeModel;

        _versions[skillId][version] = SkillVersion({
            version: version,
            implementationUri: input.implementationUri,
            metadataUri: input.metadataUri,
            storageUri: input.storageUri,
            computeModel: input.computeModel,
            entrypoint: input.entrypoint,
            inputSchemaHash: input.inputSchemaHash,
            outputSchemaHash: input.outputSchemaHash,
            codeHash: input.codeHash,
            requiresWallet: input.requiresWallet,
            requiresApproval: input.requiresApproval,
            publicUse: input.publicUse,
            enabled: true,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            tags: input.tags,
            capabilityHints: input.capabilityHints
        });
        _versionList[skillId].push(version);

        emit SkillVersionAdded(skillId, version, record.owner, input.implementationAddress, input.metadataHash);
    }

    function activateSkillVersion(bytes32 skillId, uint256 version) external whenNotPaused nonReentrant {
        SkillRecord storage record = _mustGetSkill(skillId);
        _requireOwnerOrCurator(record);
        SkillVersion storage skillVersion = _mustGetVersion(skillId, version);
        if (!skillVersion.enabled) revert InvalidOperation("version is disabled");
        record.activeVersion = version;
        record.status = SkillStatus.Active;
        record.updatedAt = block.timestamp;
        record.lastUpdatedBy = msg.sender;
        emit SkillActivated(skillId, version, msg.sender);
    }

    function disableSkillVersion(bytes32 skillId, uint256 version) external whenNotPaused nonReentrant {
        SkillRecord storage record = _mustGetSkill(skillId);
        _requireOwnerOrCurator(record);
        SkillVersion storage skillVersion = _mustGetVersion(skillId, version);
        skillVersion.enabled = false;
        skillVersion.updatedAt = block.timestamp;
        record.updatedAt = block.timestamp;
        record.lastUpdatedBy = msg.sender;
        if (record.activeVersion == version) record.status = SkillStatus.Paused;
    }

    function deprecateSkill(bytes32 skillId, string calldata reason) external whenNotPaused nonReentrant {
        SkillRecord storage record = _mustGetSkill(skillId);
        _requireOwnerOrCurator(record);
        record.status = SkillStatus.Deprecated;
        record.updatedAt = block.timestamp;
        record.lastUpdatedBy = msg.sender;
        emit SkillDeprecated(skillId, msg.sender);
        if (bytes(reason).length > 0) emit SkillRevoked(skillId, msg.sender, reason);
    }

    function pauseSkill(bytes32 skillId) external whenNotPaused nonReentrant {
        SkillRecord storage record = _mustGetSkill(skillId);
        _requireOwnerOrCurator(record);
        record.status = SkillStatus.Paused;
        record.updatedAt = block.timestamp;
        record.lastUpdatedBy = msg.sender;
        emit SkillPaused(skillId, msg.sender);
    }

    function unpauseSkill(bytes32 skillId) external whenNotPaused nonReentrant {
        SkillRecord storage record = _mustGetSkill(skillId);
        _requireOwnerOrCurator(record);
        record.status = SkillStatus.Active;
        record.updatedAt = block.timestamp;
        record.lastUpdatedBy = msg.sender;
    }

    function approveSkill(bytes32 skillId, bool approved) external onlyRole(CURATOR_ROLE) whenNotPaused {
        SkillRecord storage record = _mustGetSkill(skillId);
        record.approved = approved;
        record.updatedAt = block.timestamp;
        record.lastUpdatedBy = msg.sender;
        emit SkillApproved(skillId, msg.sender, approved);
    }

    function approveOperator(bytes32 skillId, address operator) external onlyRole(CURATOR_ROLE) whenNotPaused {
        _mustGetSkill(skillId);
        _approvedOperators[skillId][operator] = true;
        emit OperatorApproved(skillId, operator);
    }

    function revokeOperator(bytes32 skillId, address operator) external onlyRole(CURATOR_ROLE) whenNotPaused {
        _mustGetSkill(skillId);
        _approvedOperators[skillId][operator] = false;
        emit OperatorRevoked(skillId, operator);
    }

    function grantCurator(bytes32 skillId, address curator) external onlyRole(CURATOR_ROLE) whenNotPaused {
        _mustGetSkill(skillId);
        _curatedBy[skillId][curator] = true;
        emit CuratorGranted(skillId, curator);
    }

    function revokeCurator(bytes32 skillId, address curator) external onlyRole(CURATOR_ROLE) whenNotPaused {
        _mustGetSkill(skillId);
        _curatedBy[skillId][curator] = false;
        emit CuratorRevoked(skillId, curator);
    }

    function transferSkillOwnership(bytes32 skillId, address newOwner) external whenNotPaused nonReentrant {
        SkillRecord storage record = _mustGetSkill(skillId);
        if (msg.sender != record.owner && !hasRole(CURATOR_ROLE, msg.sender)) revert NotSkillOwner(msg.sender, record.owner);
        if (newOwner == address(0)) revert InvalidOperation("new owner cannot be zero address");
        address previousOwner = record.owner;
        record.owner = newOwner;
        record.updatedAt = block.timestamp;
        record.lastUpdatedBy = msg.sender;
        if (!_ownerSkillIndex[newOwner][skillId]) {
            _skillsByOwner[newOwner].push(skillId);
            _ownerSkillIndex[newOwner][skillId] = true;
        }
        emit SkillOwnershipTransferred(skillId, previousOwner, newOwner);
    }

    function pinSkill(bytes32 skillId, string calldata storageUri, string calldata computeUri, bytes32 metadataHash) external whenNotPaused nonReentrant {
        SkillRecord storage record = _mustGetSkill(skillId);
        _requireOwnerOrCurator(record);
        _validateUri(storageUri);
        _validateUri(computeUri);
        record.pinnedTo0G = true;
        record.pinnedStorageUri = storageUri;
        record.pinnedComputeUri = computeUri;
        record.metadataHash = metadataHash;
        record.updatedAt = block.timestamp;
        record.lastUpdatedBy = msg.sender;
        emit SkillPinned(skillId, storageUri, computeUri, metadataHash);
    }

    function setExplorerUri(bytes32 skillId, string calldata explorerUri) external whenNotPaused nonReentrant {
        SkillRecord storage record = _mustGetSkill(skillId);
        _requireOwnerOrCurator(record);
        _validateUri(explorerUri);
        record.explorerUri = explorerUri;
        record.updatedAt = block.timestamp;
        record.lastUpdatedBy = msg.sender;
    }

    function reportUsage(bytes32 skillId, bool success, uint256 latencyMs, bytes32 runHash) external whenNotPaused nonReentrant {
        SkillRecord storage record = _mustGetSkill(skillId);
        if (!record.approved && !hasRole(CURATOR_ROLE, msg.sender) && msg.sender != record.owner && !_approvedOperators[skillId][msg.sender]) {
            revert NotApproved(skillId);
        }

        UsageReport storage usage = _usage[skillId];
        if (success) {
            usage.successCount += 1;
            record.totalSuccesses += 1;
        } else {
            usage.failureCount += 1;
            record.totalFailures += 1;
        }
        usage.totalLatencyMs += latencyMs;
        usage.lastUsedAt = block.timestamp;
        usage.lastRunHash = runHash;
        record.totalUsage += 1;
        uint256 count = usage.successCount + usage.failureCount;
        record.averageLatencyMs = count > 0 ? usage.totalLatencyMs / count : 0;
        record.updatedAt = block.timestamp;
        record.lastUpdatedBy = msg.sender;

        emit SkillUsageReported(skillId, msg.sender, success, latencyMs, runHash);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function skillExists(bytes32 skillId) external view returns (bool) {
        return _skills[skillId].createdAt != 0;
    }

    function getSkill(bytes32 skillId) external view returns (SkillRecord memory) {
        return _mustGetSkill(skillId);
    }

    function getSkillById(bytes32 skillId) external view returns (SkillRecord memory record, SkillVersion memory activeVersion, UsageReport memory usage) {
        record = _mustGetSkill(skillId);
        activeVersion = _mustGetVersion(skillId, record.activeVersion);
        usage = _usage[skillId];
    }

    function getSkillVersion(bytes32 skillId, uint256 version) external view returns (SkillVersion memory) {
        return _mustGetVersion(skillId, version);
    }

    function getAllVersions(bytes32 skillId) external view returns (uint256[] memory) {
        return _versionList[skillId];
    }

    function getSkillIds(Pagination calldata page) external view returns (bytes32[] memory ids) {
        uint256 start = page.offset;
        if (start >= _skillIds.length) return new bytes32[](0);
        uint256 end = _skillIds.length;
        if (page.limit > 0 && start + page.limit < end) end = start + page.limit;
        ids = new bytes32[](end - start);
        for (uint256 i = start; i < end; i++) ids[i - start] = _skillIds[i];
    }

    function getSkillsByOwner(address owner, Pagination calldata page) external view returns (bytes32[] memory ids) {
        bytes32[] storage owned = _skillsByOwner[owner];
        uint256 start = page.offset;
        if (start >= owned.length) return new bytes32[](0);
        uint256 end = owned.length;
        if (page.limit > 0 && start + page.limit < end) end = start + page.limit;
        ids = new bytes32[](end - start);
        for (uint256 i = start; i < end; i++) ids[i - start] = owned[i];
    }

    function getUsage(bytes32 skillId) external view returns (UsageReport memory) {
        _mustGetSkill(skillId);
        return _usage[skillId];
    }

    function isApprovedOperator(bytes32 skillId, address operator) external view returns (bool) {
        return _approvedOperators[skillId][operator];
    }

    function isCurator(bytes32 skillId, address account) external view returns (bool) {
        return _curatedBy[skillId][account] || hasRole(CURATOR_ROLE, account);
    }

    function isSkillReady(bytes32 skillId) external view returns (bool) {
        SkillRecord storage record = _skills[skillId];
        if (record.createdAt == 0) return false;
        if (record.status != SkillStatus.Active) return false;
        if (!record.approved && !record.allowPublicUse) return false;
        SkillVersion storage version = _versions[skillId][record.activeVersion];
        if (!version.enabled) return false;
        return true;
    }

    function skillKey(address owner, string calldata namespace, string calldata name) external pure returns (bytes32) {
        return _skillId(owner, namespace, name);
    }

    function totalSkills() external view returns (uint256) {
        return _skillIds.length;
    }

    function _skillId(address owner, string memory namespace, string memory name) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(owner, keccak256(bytes(namespace)), keccak256(bytes(name))));
    }

    function _mustGetSkill(bytes32 skillId) internal view returns (SkillRecord storage) {
        if (_skills[skillId].createdAt == 0) revert SkillNotFound(skillId);
        return _skills[skillId];
    }

    function _mustGetVersion(bytes32 skillId, uint256 version) internal view returns (SkillVersion storage) {
        if (_skills[skillId].createdAt == 0) revert SkillNotFound(skillId);
        if (_versions[skillId][version].createdAt == 0) revert SkillVersionNotFound(skillId, version);
        return _versions[skillId][version];
    }

    function _requireOwnerOrCurator(SkillRecord storage record) internal view {
        if (msg.sender != record.owner && !hasRole(CURATOR_ROLE, msg.sender)) revert NotSkillOwner(msg.sender, record.owner);
    }

    function _validateBasicInput(
        string memory namespace,
        string memory name,
        string memory description,
        string memory implementationUri,
        string memory metadataUri,
        string memory storageUri,
        string memory computeModel,
        string memory entrypoint,
        uint256 feeBps,
        string[] memory tags,
        string[] memory capabilityHints
    ) internal pure {
        if (bytes(namespace).length == 0 || bytes(namespace).length > MAX_NAMESPACE_LENGTH) revert InvalidNamespace();
        if (bytes(name).length == 0 || bytes(name).length > MAX_NAME_LENGTH) revert InvalidName();
        if (bytes(description).length == 0 || bytes(description).length > MAX_DESCRIPTION_LENGTH) revert InvalidDescription();
        _validateUri(implementationUri);
        _validateUri(metadataUri);
        _validateUri(storageUri);
        if (bytes(computeModel).length == 0) revert InvalidOperation("compute model required");
        if (bytes(entrypoint).length == 0) revert InvalidOperation("entrypoint required");
        if (feeBps > 10_000) revert InvalidFeeBps();
        _validateTags(tags);
        _validateTags(capabilityHints);
    }

    function _validateBasicVersionInput(
        string memory implementationUri,
        string memory metadataUri,
        string memory storageUri,
        string memory computeModel,
        string memory entrypoint,
        string[] memory tags,
        string[] memory capabilityHints,
        bytes32 inputSchemaHash,
        bytes32 outputSchemaHash
    ) internal pure {
        _validateUri(implementationUri);
        _validateUri(metadataUri);
        _validateUri(storageUri);
        if (bytes(computeModel).length == 0) revert InvalidOperation("compute model required");
        if (bytes(entrypoint).length == 0) revert InvalidOperation("entrypoint required");
        if (inputSchemaHash == bytes32(0) || outputSchemaHash == bytes32(0)) revert InvalidSchemaHash();
        _validateTags(tags);
        _validateTags(capabilityHints);
    }

    function _validateUri(string memory uri) internal pure {
        if (bytes(uri).length == 0 || bytes(uri).length > MAX_URI_LENGTH) revert InvalidUri();
    }

    function _validateTags(string[] memory tags) internal pure {
        if (tags.length > MAX_TAGS_PER_VERSION) revert InvalidTagCount();
        for (uint256 i = 0; i < tags.length; i++) {
            if (bytes(tags[i]).length == 0 || bytes(tags[i]).length > MAX_TAG_LENGTH) revert InvalidTagLength();
        }
    }
}
