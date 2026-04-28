// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SkillRegistry
 * @notice On-chain registry for CLAW_MACHINE agent skills on 0G Network (chainId 16600).
 *
 * Skills are published with a content hash pointing to code stored on 0G Storage.
 * Any agent can discover, verify, and load skills from this registry.
 *
 * Deploy to 0G Newton Testnet:
 *   npx hardhat run scripts/deploy.ts --network zerog
 */
contract SkillRegistry {
    // ── Events ────────────────────────────────────────────────────────────────

    event SkillPublished(
        bytes32 indexed skillId,
        address indexed author,
        string  id,
        string  name,
        string  contentHash,
        uint256 version
    );

    event SkillUpdated(
        bytes32 indexed skillId,
        address indexed author,
        string  contentHash,
        uint256 version
    );

    event SkillDeprecated(bytes32 indexed skillId, address indexed author);

    event SkillEndorsed(bytes32 indexed skillId, address indexed endorser);

    // ── Structs ───────────────────────────────────────────────────────────────

    struct Skill {
        string   id;           // e.g. "defi.price"
        string   name;         // Human-readable name
        string   description;  // Short description
        string   contentHash;  // 0G Storage root hash of the skill code
        string[] tags;         // Searchable tags
        address  author;       // Publisher address
        uint256  version;      // Monotonically increasing version
        uint256  publishedAt;  // Block timestamp of first publish
        uint256  updatedAt;    // Block timestamp of last update
        bool     deprecated;   // Whether this skill is deprecated
        uint256  endorsements; // Number of endorsements from other agents/devs
        bool     requiresWallet;
        bool     touchesChain;
        bool     usesCompute;
        bool     usesStorage;
    }

    // ── Storage ───────────────────────────────────────────────────────────────

    mapping(bytes32 => Skill) private _skills;
    mapping(bytes32 => mapping(address => bool)) private _endorsed;
    bytes32[] private _skillIds;

    // Reverse lookup: string id → bytes32 key
    mapping(string => bytes32) private _idToKey;

    // Author index
    mapping(address => bytes32[]) private _authorSkills;

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyAuthor(bytes32 skillKey) {
        require(_skills[skillKey].author == msg.sender, "SkillRegistry: not author");
        _;
    }

    modifier skillExists(bytes32 skillKey) {
        require(_skills[skillKey].author != address(0), "SkillRegistry: skill not found");
        _;
    }

    // ── Write functions ───────────────────────────────────────────────────────

    /**
     * @notice Publish a new skill to the registry.
     * @param id          Unique string identifier, e.g. "defi.price"
     * @param name        Human-readable name
     * @param description Short description
     * @param contentHash 0G Storage root hash of the skill TypeScript code
     * @param tags        Searchable tags (max 10)
     * @param requiresWallet Whether the skill requires a connected wallet
     * @param touchesChain   Whether the skill sends on-chain transactions
     * @param usesCompute    Whether the skill calls 0G Compute
     * @param usesStorage    Whether the skill reads/writes 0G Storage
     */
    function publishSkill(
        string calldata id,
        string calldata name,
        string calldata description,
        string calldata contentHash,
        string[] calldata tags,
        bool requiresWallet,
        bool touchesChain,
        bool usesCompute,
        bool usesStorage
    ) external returns (bytes32 skillKey) {
        require(bytes(id).length > 0, "SkillRegistry: empty id");
        require(bytes(id).length <= 64, "SkillRegistry: id too long");
        require(bytes(contentHash).length > 0, "SkillRegistry: empty contentHash");
        require(tags.length <= 10, "SkillRegistry: too many tags");
        require(_idToKey[id] == bytes32(0), "SkillRegistry: id already registered");

        skillKey = keccak256(abi.encodePacked(id, msg.sender));

        _skills[skillKey] = Skill({
            id:              id,
            name:            name,
            description:     description,
            contentHash:     contentHash,
            tags:            tags,
            author:          msg.sender,
            version:         1,
            publishedAt:     block.timestamp,
            updatedAt:       block.timestamp,
            deprecated:      false,
            endorsements:    0,
            requiresWallet:  requiresWallet,
            touchesChain:    touchesChain,
            usesCompute:     usesCompute,
            usesStorage:     usesStorage
        });

        _skillIds.push(skillKey);
        _idToKey[id] = skillKey;
        _authorSkills[msg.sender].push(skillKey);

        emit SkillPublished(skillKey, msg.sender, id, name, contentHash, 1);
    }

    /**
     * @notice Update the content hash of an existing skill (new version).
     */
    function updateSkill(
        bytes32 skillKey,
        string calldata newContentHash,
        string calldata newDescription
    ) external onlyAuthor(skillKey) skillExists(skillKey) {
        require(!_skills[skillKey].deprecated, "SkillRegistry: skill deprecated");
        _skills[skillKey].contentHash  = newContentHash;
        _skills[skillKey].description  = newDescription;
        _skills[skillKey].version     += 1;
        _skills[skillKey].updatedAt    = block.timestamp;
        emit SkillUpdated(skillKey, msg.sender, newContentHash, _skills[skillKey].version);
    }

    /**
     * @notice Mark a skill as deprecated. Cannot be undone.
     */
    function deprecateSkill(bytes32 skillKey)
        external onlyAuthor(skillKey) skillExists(skillKey)
    {
        _skills[skillKey].deprecated = true;
        emit SkillDeprecated(skillKey, msg.sender);
    }

    /**
     * @notice Endorse a skill (each address can endorse once).
     */
    function endorseSkill(bytes32 skillKey) external skillExists(skillKey) {
        require(!_endorsed[skillKey][msg.sender], "SkillRegistry: already endorsed");
        require(_skills[skillKey].author != msg.sender, "SkillRegistry: cannot self-endorse");
        _endorsed[skillKey][msg.sender] = true;
        _skills[skillKey].endorsements += 1;
        emit SkillEndorsed(skillKey, msg.sender);
    }

    // ── Read functions ────────────────────────────────────────────────────────

    function getSkill(bytes32 skillKey) external view returns (Skill memory) {
        return _skills[skillKey];
    }

    function getSkillByStringId(string calldata id) external view returns (Skill memory) {
        return _skills[_idToKey[id]];
    }

    function getSkillKey(string calldata id) external view returns (bytes32) {
        return _idToKey[id];
    }

    function totalSkills() external view returns (uint256) {
        return _skillIds.length;
    }

    /**
     * @notice Paginated list of all skill keys.
     * @param offset Start index
     * @param limit  Max results (capped at 100)
     */
    function listSkills(uint256 offset, uint256 limit)
        external view returns (bytes32[] memory keys, uint256 total)
    {
        total = _skillIds.length;
        if (offset >= total) return (new bytes32[](0), total);
        uint256 end = offset + (limit > 100 ? 100 : limit);
        if (end > total) end = total;
        keys = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            keys[i - offset] = _skillIds[i];
        }
    }

    /**
     * @notice Get all skills published by a given author.
     */
    function getAuthorSkills(address author) external view returns (bytes32[] memory) {
        return _authorSkills[author];
    }

    /**
     * @notice Check if a given address has endorsed a skill.
     */
    function hasEndorsed(bytes32 skillKey, address endorser) external view returns (bool) {
        return _endorsed[skillKey][endorser];
    }
}
