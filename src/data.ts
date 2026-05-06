import type {
    AdvancementDefinition,
    AffinityDefinition,
    Character,
    CharacterKind,
    CharacterTypeDefinition,
    CurrencyDefinition,
    HalfMonsterFocus,
    ItemDefinition,
    PrimaryStatDefinition,
    Rarity,
    RarityDefinition,
    SecondaryStatDefinition,
    SkillDefinition,
    StatBlock,
    StatCategoryDefinition,
    StatKey,
    TierDefinition,
    TierProgression,
    TierRule,
} from "./types";

export const RARITIES: Rarity[] = [
    "Common",
    "Uncommon",
    "Rare",
    "Epic",
    "Legendary",
    "Mythical",
    "Divine",
];

export const RARITY_MULTIPLIERS: Record<Rarity, number> = {
    Common: 1,
    Uncommon: 1.5,
    Rare: 2,
    Epic: 2.5,
    Legendary: 3,
    Mythical: 3.5,
    Divine: 4,
};

export const DEFAULT_RARITY_DEFINITIONS: RarityDefinition[] = [
    { id: "rarity-common", name: "Common", multiplier: 1, color: "#c9d0dc" },
    { id: "rarity-uncommon", name: "Uncommon", multiplier: 1.5, color: "#53e0c1" },
    { id: "rarity-rare", name: "Rare", multiplier: 2, color: "#64a9ff" },
    { id: "rarity-epic", name: "Epic", multiplier: 2.5, color: "#c887ff" },
    { id: "rarity-legendary", name: "Legendary", multiplier: 3, color: "#ffd369" },
    { id: "rarity-mythical", name: "Mythical", multiplier: 3.5, color: "#ff6464" },
    { id: "rarity-divine", name: "Divine", multiplier: 4, color: "#ffffff" },
];

export const DEFAULT_CHARACTER_TYPE_DEFINITIONS: CharacterTypeDefinition[] = [
    { id: "character-type-humanoid", kind: "humanoid", label: "Humanoid", multiplier: 1 },
    { id: "character-type-half-monster", kind: "half-monster", label: "Half-monster", multiplier: 2 },
    { id: "character-type-monster", kind: "monster", label: "Monster", multiplier: 3 },
];

export const TIER_RULES: TierRule[] = [
    {
        tier: 1,
        maxLevel: 10,
        title: "Starter",
        details:
            "The most basic starting tier for standard humanoids and mundane monsters.",
    },
    {
        tier: 2,
        maxLevel: 15,
        title: "Lesser",
        details:
            "First evolution tier; magic or supernatural traits may appear.",
    },
    {
        tier: 3,
        maxLevel: 20,
        title: "Standard",
        details:
            "The final tier for average civilization-bound humanoids and many monsters.",
    },
    {
        tier: 4,
        maxLevel: 25,
        title: "Greater",
        details:
            "Common for driven combatants, hunters, and monsters; uncommon variety becomes likely.",
    },
    {
        tier: 5,
        maxLevel: 30,
        title: "Superior",
        details:
            "Mastery of craft or body; further tiers become exceedingly rare.",
    },
    {
        tier: 6,
        maxLevel: 35,
        title: "Apex",
        details:
            "Powerful beings that shape lower-tier ecosystems around them.",
    },
    {
        tier: 7,
        maxLevel: 40,
        title: "Elite",
        details:
            "One-person army scale; rare races and classes are a minimum benchmark.",
    },
    {
        tier: 8,
        maxLevel: 45,
        title: "Ascendant",
        details: "Focused beings nearing the mortal peak.",
    },
    {
        tier: 9,
        maxLevel: 50,
        title: "Transcendent",
        details:
            "Peak mortality; Domains emerge from race, class, or job identity.",
    },
    {
        tier: 10,
        maxLevel: 99,
        title: "God",
        details: "The domain of the gods and ascended legends.",
    },
];

export const DEFAULT_TIER_DEFINITIONS: TierDefinition[] = TIER_RULES.map((rule) => ({
    id: `tier-${rule.tier}`,
    ...rule,
    raceMultiplier: rule.tier * 20,
    classMultiplier: rule.tier * 20,
    jobMultiplier: rule.tier * 20,
    itemMultiplier: rule.tier * 10,
    staticBonus: rule.tier * 10,
}));

export const STAT_GROUPS: Array<{ label: string; keys: StatKey[] }> = [
    { label: "Physical", keys: ["strength", "fortitude"] },
    { label: "Movement", keys: ["agility", "dexterity"] },
    { label: "Mental", keys: ["intelligence", "willpower"] },
    { label: "Social", keys: ["wisdom", "charisma"] },
    { label: "Magical", keys: ["mana", "manaControl"] },
    { label: "Sensory", keys: ["perception", "stealth"] },
];

export const STAT_LABELS: Record<StatKey, string> = {
    strength: "Strength",
    fortitude: "Fortitude",
    agility: "Agility",
    dexterity: "Dexterity",
    intelligence: "Intelligence",
    willpower: "Willpower",
    wisdom: "Wisdom",
    charisma: "Charisma",
    mana: "Mana",
    manaControl: "Mana Control",
    perception: "Perception",
    stealth: "Stealth",
};

export const DEFAULT_STAT_CATEGORIES: StatCategoryDefinition[] = STAT_GROUPS.map((group, index) => ({
    id: `stat-category-${group.label.toLowerCase()}`,
    name: group.label,
    description: `${group.label} primary stats.`,
    order: index + 1,
}));

const AGGRESSIVE_STATS: StatKey[] = ["strength", "dexterity", "intelligence", "charisma", "mana", "perception"];

export const DEFAULT_PRIMARY_STAT_DEFINITIONS: PrimaryStatDefinition[] = STAT_GROUPS.flatMap((group) => {
    const category = DEFAULT_STAT_CATEGORIES.find((entry) => entry.name === group.label)!;
    return group.keys.map((key, index) => ({
        id: `primary-stat-${key}`,
        key,
        label: STAT_LABELS[key],
        categoryId: category.id,
        role: AGGRESSIVE_STATS.includes(key) ? "aggressive" : "defensive",
        description: `${STAT_LABELS[key]} primary stat.`,
        order: index + 1,
    }));
});

export const DEFAULT_SECONDARY_STAT_DEFINITIONS: SecondaryStatDefinition[] = [
    {
        id: "secondary-stat-hp",
        key: "hp",
        shortName: "HP",
        longName: "Health Points",
        description: "Physical vitality and damage capacity.",
        multipliedStat: "fortitude",
        addedStat: "strength",
        order: 1,
    },
    {
        id: "secondary-stat-mp",
        key: "mp",
        shortName: "MP",
        longName: "Mana Points",
        description: "Magical energy available for spells and techniques.",
        multipliedStat: "mana",
        addedStat: "intelligence",
        order: 2,
    },
    {
        id: "secondary-stat-sp",
        key: "sp",
        shortName: "SP",
        longName: "Stamina Points",
        description: "Physical stamina used for exertion and martial techniques.",
        multipliedStat: "fortitude",
        addedStat: "agility",
        order: 3,
    },
    {
        id: "secondary-stat-dp",
        key: "dp",
        shortName: "DP",
        longName: "Divine Points",
        description: "Divine presence and spiritual authority.",
        multipliedStat: "charisma",
        addedStat: "wisdom",
        order: 4,
    },
];

export const EMPTY_STATS: StatBlock = {
    strength: 10,
    fortitude: 10,
    agility: 10,
    dexterity: 10,
    intelligence: 10,
    willpower: 10,
    wisdom: 10,
    charisma: 10,
    mana: 10,
    manaControl: 10,
    perception: 10,
    stealth: 10,
};

export const ZERO_STATS: StatBlock = {
    strength: 0,
    fortitude: 0,
    agility: 0,
    dexterity: 0,
    intelligence: 0,
    willpower: 0,
    wisdom: 0,
    charisma: 0,
    mana: 0,
    manaControl: 0,
    perception: 0,
    stealth: 0,
};

export const DEFAULT_DEFINITIONS: AdvancementDefinition[] = [
    {
        id: "definition-race-human",
        kind: "race",
        raceType: "humanoid",
        name: "Human",
        rarity: "Common",
        minTier: 1,
        statWeights: {
            strength: 5,
            fortitude: 5,
            agility: 5,
            dexterity: 5,
            intelligence: 5,
            willpower: 5,
            wisdom: 5,
            charisma: 5,
            mana: 5,
            manaControl: 5,
            perception: 5,
            stealth: 5,
        },
        description: "Baseline humanoid race with balanced growth.",
        notes: "Baseline humanoid race with balanced growth.",
    },
    {
        id: "definition-race-rabbit",
        kind: "race",
        raceType: "monster",
        name: "Rabbit",
        rarity: "Common",
        minTier: 1,
        statWeights: {
            agility: 9,
            perception: 8,
            stealth: 7,
            dexterity: 6,
            fortitude: 3,
            strength: 2,
            mana: 4,
            manaControl: 4,
            intelligence: 4,
            willpower: 4,
            wisdom: 4,
            charisma: 3,
        },
        description: "Small starter monster with quick sensory growth.",
        notes: "Small starter monster with quick sensory growth.",
    },
    {
        id: "definition-race-half-fox",
        kind: "race",
        raceType: "half-monster",
        name: "Half-Fox",
        rarity: "Uncommon",
        minTier: 1,
        statWeights: {
            agility: 8,
            dexterity: 7,
            perception: 8,
            stealth: 8,
            charisma: 6,
            manaControl: 6,
            intelligence: 5,
            wisdom: 5,
            willpower: 4,
            mana: 5,
            strength: 3,
            fortitude: 4,
        },
        description:
            "Agile half-monster ancestry with stealth and charm emphasis.",
        notes: "Agile half-monster ancestry with stealth and charm emphasis.",
    },
    {
        id: "definition-class-page",
        kind: "class",
        name: "Page",
        rarity: "Common",
        minTier: 1,
        statWeights: {
            strength: 6,
            fortitude: 6,
            agility: 5,
            dexterity: 5,
            willpower: 6,
            perception: 4,
            intelligence: 4,
            wisdom: 4,
            charisma: 4,
            mana: 2,
            manaControl: 2,
            stealth: 3,
        },
        description: "Entry martial class with broad physical growth.",
        notes: "Entry martial class with broad physical growth.",
    },
    {
        id: "definition-job-apothecary",
        kind: "job",
        name: "Apothecary",
        rarity: "Common",
        minTier: 1,
        statWeights: {
            intelligence: 8,
            wisdom: 7,
            dexterity: 7,
            perception: 6,
            manaControl: 4,
            willpower: 5,
            charisma: 4,
            agility: 3,
            stealth: 3,
            mana: 3,
            fortitude: 3,
            strength: 2,
        },
        description: "Careful craft job focused on knowledge and precision.",
        notes: "Careful craft job focused on knowledge and precision.",
    },
];

export const DEFAULT_AFFINITIES: AffinityDefinition[] = [
    {
        id: "affinity-fire",
        name: "Fire",
        color: "#ef4444",
        description: "Heat, combustion, passion, and destructive force.",
        emoji: "🔥",
    },
    {
        id: "affinity-water",
        name: "Water",
        color: "#3b82f6",
        description: "Flow, healing, adaptation, and pressure.",
        emoji: "💧",
    },
    {
        id: "affinity-ice",
        name: "Ice",
        color: "#ADD8E6",
        description: "Freezing, snow, ice, and cold.",
        emoji: "❄️",
    },
    {
        id: "affinity-rock",
        name: "Rock",
        color: "#A52A2A",
        description: "Mountain, rock, ground, and sand.",
        emoji: "⛰️",
    },
    {
        id: "affinity-air",
        name: "Air",
        color: "#93c5fd",
        description: "Wind, motion, breath, and freedom.",
        emoji: "💨",
    },
    {
        id: "affinity-nature",
        name: "Nature",
        color: "#22c55e",
        description: "Plants, beasts, growth, and living cycles.",
        emoji: "🌿",
    },
    {
        id: "affinity-lightning",
        name: "Lightning",
        color: "#facc15",
        description: "Storms, speed, charge, and violent precision.",
        emoji: "⚡",
    },
    {
        id: "affinity-sun",
        name: "Sun",
        color: "#f97316",
        description: "Radiance, warmth, vitality, and revelation.",
        emoji: "☀️",
    },
    {
        id: "affinity-moon",
        name: "Moon",
        color: "#a78bfa",
        description: "Night, tides, dreams, and transformation.",
        emoji: "🌙",
    },
    {
        id: "affinity-light",
        name: "Light",
        color: "#fde68a",
        description: "Illumination, purity, protection, and clarity.",
        emoji: "✨",
    },
    {
        id: "affinity-shadow",
        name: "Shadow",
        color: "#64748b",
        description: "Darkness, concealment, fear, and hidden paths.",
        emoji: "🌑",
    },
    {
        id: "affinity-space",
        name: "Space",
        color: "#2c1744",
        description: "Teleportation magic.",
        emoji: "🌌",
    },
];

export const DEFAULT_CURRENCIES: CurrencyDefinition[] = [
    {
        id: "currency-gold",
        name: "Gold",
        symbol: "G",
        description: "Standard currency for trade and commerce.",
    },
    {
        id: "currency-silver",
        name: "Silver",
        symbol: "S",
        description: "Common silver coins for everyday transactions.",
    },
    {
        id: "currency-copper",
        name: "Copper",
        symbol: "C",
        description: "Basic copper pennies for small purchases.",
    },
];

export const DEFAULT_SKILL_DEFINITIONS: SkillDefinition[] = [
    {
        id: "skill-magic-missile",
        name: "Magic Missile",
        rarity: "Common",
        minTier: 1,
        description: "Launch a simple bolt of force or mana.",
        kind: "Active",
        levelled: true,
        affinityIds: [],
    },
    {
        id: "skill-bite",
        name: "Bite",
        rarity: "Common",
        minTier: 1,
        description: "Attack with teeth, fangs, or mandibles.",
        kind: "Active",
        levelled: true,
        affinityIds: [],
    },
    {
        id: "skill-quick-strike",
        name: "Quick Strike",
        rarity: "Common",
        minTier: 1,
        description: "A fast attack that prioritizes initiative.",
        kind: "Active",
        levelled: true,
        affinityIds: [],
    },
    {
        id: "skill-heavy-strike",
        name: "Heavy Strike",
        rarity: "Common",
        minTier: 1,
        description: "A committed attack that favors force over speed.",
        kind: "Active",
        levelled: true,
        affinityIds: [],
    },
    {
        id: "skill-plant-growth",
        name: "Plant Growth",
        rarity: "Uncommon",
        minTier: 2,
        description: "Encourage nearby plant life to rapidly grow or move.",
        kind: "Active",
        levelled: true,
        affinityIds: ["affinity-nature"],
    },
    {
        id: "skill-claw",
        name: "Claw",
        rarity: "Common",
        minTier: 1,
        description: "Slash with natural claws or claw-like weapons.",
        kind: "Active",
        levelled: true,
        affinityIds: [],
    },
    {
        id: "skill-dash",
        name: "Dash",
        rarity: "Common",
        minTier: 1,
        description: "Burst forward with System-assisted speed.",
        kind: "Active",
        levelled: true,
        affinityIds: ["affinity-air"],
    },
    {
        id: "skill-leap",
        name: "Leap",
        rarity: "Common",
        minTier: 1,
        description: "Jump with enhanced force and control.",
        kind: "Active",
        levelled: true,
        affinityIds: [],
    },
    {
        id: "skill-identify",
        name: "Identify",
        rarity: "Common",
        minTier: 1,
        description: "Reveal basic System-recognized information.",
        kind: "Active",
        levelled: false,
        affinityIds: [],
    },
    {
        id: "skill-bless",
        name: "Bless",
        rarity: "Uncommon",
        minTier: 2,
        description: "Grant a short-lived boon to an ally or object.",
        kind: "Active",
        levelled: false,
        affinityIds: ["affinity-light", "affinity-sun"],
    },
    {
        id: "skill-scrappy",
        name: "Scrappy",
        rarity: "Common",
        minTier: 1,
        description: "Keep fighting when outmatched or injured.",
        kind: "Passive",
        levelled: false,
        affinityIds: [],
    },
    {
        id: "skill-rune-of-fate",
        name: "Rune of Fate",
        rarity: "Rare",
        minTier: 3,
        description: "A strange mark that nudges unlikely outcomes.",
        kind: "Passive",
        levelled: false,
        affinityIds: ["affinity-moon"],
    },
];

export const DEFAULT_ITEM_DEFINITIONS: ItemDefinition[] = [];

export function makeId(prefix: string): string {
    const randomId =
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${randomId}`;
}

export function tierRule(tier: number): TierRule {
    return TIER_RULES.find((rule) => rule.tier === tier) ?? TIER_RULES[0];
}

export function clampPercent(value: number): number {
    return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function createCharacter(
    playerId: string,
    kind: CharacterKind = "humanoid",
    focus: HalfMonsterFocus = "class",
): Character {
    const tier = 1;
    const raceDefinitionId =
        kind === "monster"
            ? "definition-race-rabbit"
            : kind === "half-monster"
              ? "definition-race-half-fox"
              : "definition-race-human";
    const raceName =
        kind === "monster"
            ? "Rabbit"
            : kind === "half-monster"
              ? "Half-Fox"
              : "Human";
    const raceRarity: Rarity = kind === "half-monster" ? "Uncommon" : "Common";

    const currentTrack: TierProgression = {
        tier,
        status: "current",
        race: {
            definitionId: raceDefinitionId,
            name: raceName,
            rarity: raceRarity,
            level: 1,
            exp: 0,
        },
        classTrack:
            kind === "humanoid" ||
            (kind === "half-monster" && focus === "class")
                ? { name: "Page", rarity: "Common", level: 1 }
                : undefined,
        jobTrack:
            kind === "humanoid" || (kind === "half-monster" && focus === "job")
                ? { name: "Apprentice Apothecary", rarity: "Common", level: 1 }
                : undefined,
    };

    const character: Character = {
        id: makeId("character"),
        playerId,
        name: "New Character",
        age: kind === "monster" ? "0" : "10",
        size: "",
        build: "",
        pronouns: "",
        gender: "",
        sexualPreference: "",
        appearance: "",
        kind,
        halfMonsterFocus: kind === "half-monster" ? focus : undefined,
        currentTier: tier,
        tiers: [currentTrack],
        baseStats: { ...EMPTY_STATS },
        raceBonuses: {},
        progressionBonuses: {},
        passiveBonuses: {},
        affinities: [],
        currencies: [],
        skills: [],
        items: [],
        path: [
            {
                id: makeId("path"),
                tier,
                label:
                    kind === "monster"
                        ? "Rabbit"
                        : kind === "half-monster"
                          ? "Half-Monster"
                          : "Human",
                rarity: "Common",
                source: "Race",
                notes: "Starting race granted by The System.",
            },
        ],
        notes: "",
        updatedAt: new Date().toISOString(),
    };

    return character;
}

export function isTrackAllowed(
    character: Character,
    track: "race" | "class" | "job",
): boolean {
    if (track === "race") return true;
    if (character.kind === "monster") return false;
    if (character.kind === "humanoid") return true;
    const focus = character.halfMonsterFocus ?? "class";
    return track === "class" ? focus !== "job" : focus === "job";
}
