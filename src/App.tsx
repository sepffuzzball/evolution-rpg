import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    clampPercent,
    createCharacter,
    EMPTY_STATS,
    isTrackAllowed,
    makeId,
    RARITIES,
    RARITY_MULTIPLIERS,
    STAT_LABELS,
    tierRule,
} from "./data";
import { blankState, loadState, saveState } from "./storage";
import type {
    AppState,
    AdvancementDefinition,
    AffinityDefinition,
    Character,
    CharacterCurrency,
    CharacterKind,
    CharacterTypeDefinition,
    CurrencyDefinition,
    DefinitionKind,
    HalfMonsterFocus,
    Item,
    ItemDefinition,
    ItemSlot,
    LevelTrack,
    PathMilestone,
    Player,
    PrimaryStatDefinition,
    PrimaryStatRole,
    Rarity,
    RarityDefinition,
    SecondaryStatDefinition,
    Skill,
    SkillDefinition,
    SkillKind,
    SkillSource,
    StatBlock,
    StatCategoryDefinition,
    StatKey,
    TierDefinition,
    TierProgression,
    TierTrackSelection,
} from "./types";

const itemSlots: ItemSlot[] = ["Armor", "Accessory", "Weapon", "Other"];
const ITEM_STAT_LIMITS: Record<ItemSlot, number> = {
    Armor: 3,
    Accessory: 3,
    Weapon: 2,
    Other: Number.POSITIVE_INFINITY,
};
const characterKinds: CharacterKind[] = ["humanoid", "monster", "half-monster"];
const skillKinds: SkillKind[] = ["Active", "Passive"];
const skillSources: SkillSource[] = ["Race", "Class", "Job", "Item", "Other"];
const EXP_STAGE_SIZE = 10;
const HOVER_CARD_DELAY_MS = 450;

function tierDefinition(
    tierDefinitions: TierDefinition[] | undefined,
    tier: number,
): TierDefinition {
    const fallback = tierRule(tier);
    return (
        tierDefinitions?.find((definition) => definition.tier === tier) ?? {
            id: `tier-${fallback.tier}`,
            ...fallback,
            raceMultiplier: fallback.tier * 20,
            classMultiplier: fallback.tier * 20,
            jobMultiplier: fallback.tier * 20,
            itemMultiplier: fallback.tier * 10,
            staticBonus: fallback.tier * 10,
        }
    );
}

function maxConfiguredTier(
    tierDefinitions: TierDefinition[] | undefined,
): number {
    return Math.max(
        1,
        ...(tierDefinitions?.map((definition) => definition.tier) ?? [10]),
    );
}

function maxLevelForTier(
    tierDefinitionsOrTier: TierDefinition[] | number | undefined,
    maybeTier?: number,
): number {
    const tierDefinitions = Array.isArray(tierDefinitionsOrTier)
        ? tierDefinitionsOrTier
        : undefined;
    const tier =
        typeof tierDefinitionsOrTier === "number"
            ? tierDefinitionsOrTier
            : (maybeTier ?? 1);
    return tierDefinition(tierDefinitions, tier).maxLevel;
}

type ViewMode = "sheet" | "create" | "path" | "catalogs";
type WizardStep = number;
type WizardStepKey = "identity" | "progression" | "skills" | "items" | "review";
type CompendiumTab =
    | DefinitionKind
    | "tier"
    | "character-type"
    | "stat-category"
    | "primary-stat"
    | "secondary-stat"
    | "rarity"
    | "affinity"
    | "currency"
    | "skill"
    | "item";

const statKeys = Object.keys(EMPTY_STATS) as StatKey[];
const primaryStatRoles: PrimaryStatRole[] = ["aggressive", "defensive"];

function primaryStatDefinition(
    primaryStats: PrimaryStatDefinition[] | undefined,
    key: StatKey,
): PrimaryStatDefinition {
    return (
        primaryStats?.find((stat) => stat.key === key) ?? {
            id: `primary-stat-${key}`,
            key,
            label: STAT_LABELS[key],
            categoryId: "",
            role: "defensive",
            description: "",
            order: statKeys.indexOf(key) + 1,
        }
    );
}

function statLabel(
    primaryStats: PrimaryStatDefinition[] | undefined,
    key: StatKey,
): string {
    return primaryStatDefinition(primaryStats, key).label;
}

function sortedPrimaryStats(
    categories: StatCategoryDefinition[],
    primaryStats: PrimaryStatDefinition[],
): PrimaryStatDefinition[] {
    const categoryOrder = new Map(
        categories.map((category) => [category.id, category.order] as const),
    );
    const roleOrder: Record<PrimaryStatRole, number> = {
        aggressive: 0,
        defensive: 1,
    };
    return [
        ...statKeys.map((key) => primaryStatDefinition(primaryStats, key)),
    ].sort(
        (a, b) =>
            roleOrder[a.role] - roleOrder[b.role] ||
            (categoryOrder.get(a.categoryId) ?? 999) -
                (categoryOrder.get(b.categoryId) ?? 999) ||
            a.order - b.order ||
            a.label.localeCompare(b.label),
    );
}

function secondaryStatValue(
    definition: SecondaryStatDefinition,
    character: Character,
    totals: StatBlock,
): number {
    return (
        totals[definition.multipliedStat] * character.currentTier +
        totals[definition.addedStat]
    );
}

function currentTierData(character: Character): TierProgression | undefined {
    return character.tiers.find((tier) => tier.status === "current");
}

function rosterRaceExperience(character: Character): number {
    const tierData = currentTierData(character);
    if (!tierData) return 0;
    if (character.kind !== "humanoid")
        return clampPercent(tierData.race.exp ?? 0);

    const classLevel = tierData.classTrack?.level ?? 1;
    const jobLevel = tierData.jobTrack?.level ?? 1;
    const classExp = (tierData.classTrack as LevelTrack | undefined)?.exp ?? 0;
    const jobExp = (tierData.jobTrack as LevelTrack | undefined)?.exp ?? 0;
    const raceLevel = Math.floor((classLevel + jobLevel) / 2);
    const trackLevelsTowardNextRaceLevel =
        classLevel + jobLevel - raceLevel * 2;
    const trackExpTowardNextRaceLevel = (classExp + jobExp) / 100;
    return clampPercent(
        ((trackLevelsTowardNextRaceLevel + trackExpTowardNextRaceLevel) / 2) *
            100,
    );
}

function titleCase(value: string): string {
    return value
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("-");
}

function pluralDefinitionLabel(kind: DefinitionKind): string {
    if (kind === "class") return "Classes";
    if (kind === "race") return "Races";
    return "Jobs";
}

function raceTypeLabel(kind: CharacterKind): string {
    if (kind === "half-monster") return "HM";
    if (kind === "monster") return "M";
    return "H";
}

function raceTypeClass(kind: CharacterKind): string {
    return `race-type-tag race-type-${kind}`;
}

function displayNumber(value: number | undefined): number {
    return Math.round(Number.isFinite(value ?? 0) ? (value ?? 0) : 0);
}

function itemSkillLimit(rarity: Rarity): number {
    const index = RARITIES.indexOf(rarity);
    return Math.max(0, index);
}

function rarityNames(rarityDefinitions: RarityDefinition[]): Rarity[] {
    return rarityDefinitions.length
        ? rarityDefinitions.map((definition) => definition.name)
        : RARITIES;
}

function rarityMultiplier(
    rarityDefinitions: RarityDefinition[],
    rarity: Rarity,
): number {
    return (
        rarityDefinitions.find((definition) => definition.name === rarity)
            ?.multiplier ??
        RARITY_MULTIPLIERS[rarity] ??
        1
    );
}

function rarityColor(
    rarityDefinitions: RarityDefinition[],
    rarity: Rarity,
): string | undefined {
    return rarityDefinitions.find((definition) => definition.name === rarity)
        ?.color;
}

function rarityClassSlug(rarity: Rarity): string {
    return rarity.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function duplicatedName(name: string): string {
    const match = name.match(/^(.*?)(?:\s+(\d+))?$/);
    const base = match?.[1]?.trim() || name;
    const nextNumber = match?.[2] ? Number(match[2]) + 1 : 2;
    return `${base} ${nextNumber}`;
}

function cloneCharacter(character: Character): Character {
    return JSON.parse(JSON.stringify(character)) as Character;
}

function trackTemplate(name: string, tier: number): LevelTrack {
    return {
        name,
        rarity: "Common",
        level: 1,
        exp: 0,
        maxLevel: tierRule(tier).maxLevel,
        perLevelBonus: {},
    };
}

function finiteNumber(
    value: string | number,
    fallback: number,
    min = -999,
    max = 999,
): number {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function finiteInteger(
    value: string | number,
    fallback: number,
    min: number,
    max: number,
): number {
    return Math.round(finiteNumber(value, fallback, min, max));
}

interface LevelUpNotice {
    characterName: string;
    trackName: string;
    level: number;
    gained: Partial<StatBlock>;
}

function emptyRatioWeights(): Partial<StatBlock> {
    return statKeys.reduce<Partial<StatBlock>>((weights, key) => {
        weights[key] = 5;
        return weights;
    }, {});
}

function createDefinition(kind: DefinitionKind): AdvancementDefinition {
    return {
        id: makeId("definition"),
        kind,
        raceType: kind === "race" ? "humanoid" : undefined,
        name: `New ${titleCase(kind)}`,
        rarity: "Common",
        minTier: 1,
        statWeights: emptyRatioWeights(),
        description: "",
        notes: "",
    };
}

function createAffinityDefinition(): AffinityDefinition {
    return {
        id: makeId("affinity"),
        name: "New Affinity",
        color: "#8be9fd",
        description: "",
    };
}

function createCurrencyDefinition(): CurrencyDefinition {
    return {
        id: makeId("currency"),
        name: "New Currency",
        symbol: "?",
        description: "",
    };
}

function createRarityDefinition(): RarityDefinition {
    return {
        id: makeId("rarity"),
        name: "New Rarity",
        multiplier: 1,
        color: "#c9d0dc",
    };
}

function createTierDefinition(existing: TierDefinition[]): TierDefinition {
    const tier =
        Math.max(0, ...existing.map((definition) => definition.tier)) + 1;
    return {
        id: makeId("tier"),
        tier,
        maxLevel: 10 + (tier - 1) * 5,
        title: `Tier ${tier}`,
        details: "Custom tier definition.",
        raceMultiplier: tier * 20,
        classMultiplier: tier * 20,
        jobMultiplier: tier * 20,
        itemMultiplier: tier * 10,
        staticBonus: tier * 10,
    };
}

function createStatCategoryDefinition(
    existing: StatCategoryDefinition[],
): StatCategoryDefinition {
    return {
        id: makeId("stat-category"),
        name: "New Stat Category",
        description: "Custom stat category.",
        order:
            Math.max(0, ...existing.map((definition) => definition.order)) + 1,
    };
}

function createSecondaryStatDefinition(
    existing: SecondaryStatDefinition[],
): SecondaryStatDefinition {
    const order =
        Math.max(0, ...existing.map((definition) => definition.order)) + 1;
    return {
        id: makeId("secondary-stat"),
        key: `secondary-${order}`,
        shortName: "NS",
        longName: "New Secondary Stat",
        description: "Custom secondary stat.",
        multipliedStat: "fortitude",
        addedStat: "strength",
        order,
    };
}

function createSkillDefinition(
    kind: SkillKind = "Active",
    levelled = true,
): SkillDefinition {
    return {
        id: makeId("skill-definition"),
        name: "New Skill",
        rarity: "Common",
        minTier: 1,
        description: "",
        kind,
        levelled,
        affinityIds: [],
        mpCost: "Average",
        cooldown: "Instant",
        castingTime: "Instant",
    };
}

function createItemDefinition(): ItemDefinition {
    return {
        id: makeId("item-definition"),
        name: "New Item",
        slot: "Armor",
        tier: 1,
        rarity: "Common",
        description: "",
        statWeights: emptyRatioWeights(),
        skillIds: [],
        affinityIds: [],
    };
}

function skillFromDefinition(
    definition: SkillDefinition,
    source: SkillSource = "Other",
): Skill {
    return {
        id: makeId("skill"),
        definitionId: definition.id,
        name: definition.name,
        kind: definition.kind,
        source,
        rarity: definition.rarity,
        level: definition.levelled ? 1 : null,
        exp: 0,
        mpCost:
            definition.mpCost ??
            (definition.kind === "Active" ? "Average" : "N/A"),
        castingTime:
            definition.castingTime ??
            (definition.kind === "Active" ? "Instant" : "N/A"),
        cooldown:
            definition.cooldown ??
            (definition.kind === "Active" ? "None" : "N/A"),
        description: definition.description,
    };
}

function trackKeyDefinitionKind(
    track: "race" | "classTrack" | "jobTrack",
): DefinitionKind {
    return track === "race" ? "race" : track === "classTrack" ? "class" : "job";
}

function trackFromDefinition(
    definition: AdvancementDefinition,
    tier: number,
    existing?: LevelTrack,
): LevelTrack {
    return {
        definitionId: definition.id,
        name: definition.name,
        rarity: definition.rarity,
        level: existing?.level ?? 1,
        exp: existing?.exp ?? 0,
        maxLevel: tierRule(tier).maxLevel,
        perLevelBonus: existing?.perLevelBonus ?? {},
    };
}

function definitionForTrack(
    definitions: AdvancementDefinition[],
    track: LevelTrack,
    kind: DefinitionKind,
): AdvancementDefinition {
    return (
        definitions.find(
            (definition) =>
                definition.id === track.definitionId &&
                definition.kind === kind,
        ) ?? {
            id: track.definitionId ?? makeId("definition-fallback"),
            kind,
            name: track.name,
            rarity: track.rarity,
            minTier: 1,
            statWeights: emptyRatioWeights(),
            description: "Fallback definition created from the assigned track.",
            notes: "Fallback definition created from the assigned track.",
        }
    );
}

function characterTypeMultiplier(
    characterTypeDefinitions: CharacterTypeDefinition[],
    kind: CharacterKind,
): number {
    return (
        characterTypeDefinitions.find((definition) => definition.kind === kind)
            ?.multiplier ?? 1
    );
}

function pointsForLevelUp(
    character: Character,
    definition: AdvancementDefinition,
    assignedTier: number,
    tierDefinitions: TierDefinition[],
    characterTypeDefinitions: CharacterTypeDefinition[],
    rarityDefinitions: RarityDefinition[],
): number {
    const multiplier = rarityMultiplier(rarityDefinitions, definition.rarity);
    const tierDef = tierDefinition(tierDefinitions, assignedTier);
    if (definition.kind === "race") {
        return (
            characterTypeMultiplier(characterTypeDefinitions, character.kind) *
            tierDef.raceMultiplier *
            multiplier
        );
    }
    if (definition.kind === "class")
        return tierDef.classMultiplier * multiplier;
    return tierDef.jobMultiplier * multiplier;
}

function distributedStatGain(
    character: Character,
    definition: AdvancementDefinition,
    assignedTier: number,
    tierDefinitions: TierDefinition[],
    characterTypeDefinitions: CharacterTypeDefinition[],
    rarityDefinitions: RarityDefinition[],
): Partial<StatBlock> {
    const totalPoints = Math.max(
        0,
        Math.round(
            pointsForLevelUp(
                character,
                definition,
                assignedTier,
                tierDefinitions,
                characterTypeDefinitions,
                rarityDefinitions,
            ),
        ),
    );
    const weights = statKeys.map((key) =>
        Math.max(0, definition.statWeights[key] ?? 0),
    );
    const weightTotal =
        weights.reduce((sum, weight) => sum + weight, 0) || statKeys.length;
    const effectiveWeights =
        weightTotal === statKeys.length && weights.every((entry) => entry === 0)
            ? statKeys.map(() => 1)
            : weights;
    const exactShares = effectiveWeights.map(
        (weight) => (totalPoints * weight) / weightTotal,
    );
    const floors = exactShares.map(Math.floor);
    let remaining = totalPoints - floors.reduce((sum, value) => sum + value, 0);
    const order = exactShares
        .map((share, index) => ({
            index,
            remainder: share - Math.floor(share),
        }))
        .sort((a, b) => b.remainder - a.remainder);

    for (let i = 0; i < remaining; i += 1) {
        floors[order[i % order.length].index] += 1;
    }

    return statKeys.reduce<Partial<StatBlock>>((gain, key, index) => {
        if (floors[index]) gain[key] = floors[index];
        return gain;
    }, {});
}

function distributedItemBonuses(
    definition: ItemDefinition,
    tierDefinitions: TierDefinition[],
    rarityDefinitions: RarityDefinition[],
): Partial<StatBlock> {
    const totalPoints = Math.max(
        0,
        Math.round(
            tierDefinition(tierDefinitions, definition.tier).itemMultiplier *
                rarityMultiplier(rarityDefinitions, definition.rarity),
        ),
    );
    const weights = statKeys.map((key) =>
        Math.max(0, definition.statWeights[key] ?? 0),
    );
    const weightTotal =
        weights.reduce((sum, weight) => sum + weight, 0) || statKeys.length;
    const effectiveWeights =
        weightTotal === statKeys.length && weights.every((entry) => entry === 0)
            ? statKeys.map(() => 1)
            : weights;
    const exactShares = effectiveWeights.map(
        (weight) => (totalPoints * weight) / weightTotal,
    );
    const floors = exactShares.map(Math.floor);
    let remaining = totalPoints - floors.reduce((sum, value) => sum + value, 0);
    const order = exactShares
        .map((share, index) => ({
            index,
            remainder: share - Math.floor(share),
        }))
        .sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < remaining; i += 1)
        floors[order[i % order.length].index] += 1;
    return statKeys.reduce<Partial<StatBlock>>((bonuses, key, index) => {
        if (floors[index]) bonuses[key] = floors[index];
        return bonuses;
    }, {});
}

function scaledStatGain(
    singleLevelGain: Partial<StatBlock>,
    levels: number,
): Partial<StatBlock> {
    return statKeys.reduce<Partial<StatBlock>>((total, key) => {
        const value = partialStatTotal(singleLevelGain, key) * levels;
        if (value) total[key] = Math.round(value * 10) / 10;
        return total;
    }, {});
}

function tierBonusStats(
    tierDefinitions: TierDefinition[],
    currentTier: number,
): Partial<StatBlock> {
    const bonus = tierDefinitions
        .filter((definition) => definition.tier <= currentTier)
        .reduce((total, definition) => total + definition.staticBonus, 0);
    return statKeys.reduce<Partial<StatBlock>>((stats, key) => {
        if (bonus) stats[key] = bonus;
        return stats;
    }, {});
}

function itemFromDefinition(
    definition: ItemDefinition,
    skillDefinitions: SkillDefinition[],
    tierDefinitions: TierDefinition[],
    rarityDefinitions: RarityDefinition[],
): Item {
    const skillNames = definition.skillIds
        .map(
            (skillId) =>
                skillDefinitions.find((skill) => skill.id === skillId)?.name,
        )
        .filter((name): name is string => Boolean(name));
    return {
        id: makeId("item"),
        definitionId: definition.id,
        name: definition.name,
        slot: definition.slot,
        tier: definition.tier,
        rarity: definition.rarity,
        statBonuses: distributedItemBonuses(
            definition,
            tierDefinitions,
            rarityDefinitions,
        ),
        skillName: skillNames[0] ?? "",
        skillNames,
        skillSet: false,
        setSkillNames: [],
        equipped: false,
        description: definition.description,
        notes: definition.description,
    };
}

function itemSetSkills(
    character: Character,
    skillDefinitions: SkillDefinition[],
): Skill[] {
    return character.items.flatMap((item) => {
        const setNames = item.setSkillNames?.length
            ? item.setSkillNames
            : item.skillSet && item.skillName
              ? [item.skillName]
              : [];

        return setNames.map((skillName) => {
            const definition = skillDefinitions.find(
                (skill) => skill.name === skillName,
            );
            return {
                id: `item-skill-${item.id}-${skillName}`,
                definitionId: definition?.id,
                name: skillName,
                kind: definition?.kind ?? "Active",
                source: "Item",
                rarity: definition?.rarity ?? item.rarity,
                level: definition?.levelled === false ? null : 1,
                exp: 0,
                mpCost:
                    definition?.mpCost ??
                    (definition?.kind === "Passive" ? "N/A" : "Average"),
                castingTime:
                    definition?.castingTime ??
                    (definition?.kind === "Passive" ? "N/A" : "Instant"),
                cooldown:
                    definition?.cooldown ??
                    (definition?.kind === "Passive" ? "N/A" : "Instant"),
                description:
                    definition?.description ??
                    `Set skill provided by ${item.name}.`,
            } satisfies Skill;
        });
    });
}

function itemSetSkillCount(items: Item[]): number {
    return items.reduce(
        (count, item) =>
            count +
            (item.setSkillNames?.length ??
                (item.skillSet && item.skillName ? 1 : 0)),
        0,
    );
}

function findDefinitionByTrack(
    definitions: AdvancementDefinition[],
    kind: DefinitionKind,
    trackName?: string,
    definitionId?: string,
): AdvancementDefinition | undefined {
    if (definitionId) {
        const byId = definitions.find(
            (d) => d.kind === kind && d.id === definitionId,
        );
        if (byId) return byId;
    }
    return trackName
        ? definitions.find((d) => d.kind === kind && d.name === trackName)
        : undefined;
}

function calculatedProgressionBonuses(
    character: Character,
    definitions: AdvancementDefinition[],
    tierDefinitions: TierDefinition[],
    characterTypeDefinitions: CharacterTypeDefinition[],
    rarityDefinitions: RarityDefinition[],
): Partial<StatBlock> {
    const gains: Partial<StatBlock>[] = [];

    character.tiers.forEach((tierData) => {
        // Use the actual level stored on each track. For completed tiers this is
        // already maxed-out; for the current tier it is whatever level was reached.
        // Humanoid race level is derived from Class+Job average.
        let raceLevel: number;
        if (
            character.kind === "humanoid" &&
            tierData.classTrack &&
            tierData.jobTrack
        ) {
            const classL = (tierData.classTrack as any).level ?? 1;
            const jobL = (tierData.jobTrack as any).level ?? 1;
            raceLevel = Math.floor((classL + jobL) / 2);
        } else {
            raceLevel = tierData.race.level ?? 1;
        }

        // Race progression. Level 1 counts as the first earned level for the assigned tier.
        if (raceLevel > 0) {
            const raceDefinition = findDefinitionByTrack(
                definitions,
                "race",
                tierData.race.name,
                tierData.race.definitionId,
            );
            if (raceDefinition) {
                const singleLevelGain = distributedStatGain(
                    character,
                    raceDefinition,
                    tierData.tier,
                    tierDefinitions,
                    characterTypeDefinitions,
                    rarityDefinitions,
                );
                gains.push(scaledStatGain(singleLevelGain, raceLevel));
            }
        }

        // Class progression
        const classTrack =
            tierData.classTrack as TierProgression["classTrack"] & {
                definitionId?: string;
            };
        if (classTrack) {
            const classLevel = classTrack.level ?? 1;
            if (classLevel > 0) {
                const classDefinition = findDefinitionByTrack(
                    definitions,
                    "class",
                    (tierData.classTrack as any)?.name,
                    (tierData.classTrack as any)?.definitionId,
                );
                if (classDefinition) {
                    const singleLevelGain = distributedStatGain(
                        character,
                        classDefinition,
                        tierData.tier,
                        tierDefinitions,
                        characterTypeDefinitions,
                        rarityDefinitions,
                    );
                    gains.push(scaledStatGain(singleLevelGain, classLevel));
                }
            }
        }

        // Job progression
        const jobTrack = tierData.jobTrack as TierProgression["jobTrack"] & {
            definitionId?: string;
        };
        if (jobTrack) {
            const jobLevel = jobTrack.level ?? 1;
            if (jobLevel > 0) {
                const jobDefinition = findDefinitionByTrack(
                    definitions,
                    "job",
                    (tierData.jobTrack as any)?.name,
                    (tierData.jobTrack as any)?.definitionId,
                );
                if (jobDefinition) {
                    const singleLevelGain = distributedStatGain(
                        character,
                        jobDefinition,
                        tierData.tier,
                        tierDefinitions,
                        characterTypeDefinitions,
                        rarityDefinitions,
                    );
                    gains.push(scaledStatGain(singleLevelGain, jobLevel));
                }
            }
        }
    });

    return addStats(...gains);
}

interface StatBreakdownRow {
    tier: number;
    title: string;
    tierBonus: number;
    race: number;
    classBonus: number;
    job: number;
    items: number;
    total: number;
}

function trackStatContribution(
    character: Character,
    definitions: AdvancementDefinition[],
    tierDefinitions: TierDefinition[],
    characterTypeDefinitions: CharacterTypeDefinition[],
    rarityDefinitions: RarityDefinition[],
    tierData: TierProgression,
    kind: DefinitionKind,
    track: TierTrackSelection | undefined,
    level: number,
    statKey: StatKey,
): number {
    if (!track || level <= 0) return 0;
    const definition = findDefinitionByTrack(
        definitions,
        kind,
        track.name,
        track.definitionId,
    );
    if (!definition) return 0;
    const singleLevelGain = distributedStatGain(
        character,
        definition,
        tierData.tier,
        tierDefinitions,
        characterTypeDefinitions,
        rarityDefinitions,
    );
    return partialStatTotal(scaledStatGain(singleLevelGain, level), statKey);
}

function statBreakdownRows(
    character: Character,
    definitions: AdvancementDefinition[],
    tierDefinitions: TierDefinition[],
    characterTypeDefinitions: CharacterTypeDefinition[],
    rarityDefinitions: RarityDefinition[],
    statKey: StatKey,
): StatBreakdownRow[] {
    return [...character.tiers]
        .sort((a, b) => a.tier - b.tier)
        .map((tierData) => {
            const tierDef = tierDefinition(tierDefinitions, tierData.tier);
            const raceLevel =
                character.kind === "humanoid" &&
                tierData.classTrack &&
                tierData.jobTrack
                    ? Math.floor(
                          (((tierData.classTrack as any).level ?? 1) +
                              ((tierData.jobTrack as any).level ?? 1)) /
                              2,
                      )
                    : (tierData.race.level ?? 1);
            const race = trackStatContribution(
                character,
                definitions,
                tierDefinitions,
                characterTypeDefinitions,
                rarityDefinitions,
                tierData,
                "race",
                tierData.race,
                raceLevel,
                statKey,
            );
            const classBonus = trackStatContribution(
                character,
                definitions,
                tierDefinitions,
                characterTypeDefinitions,
                rarityDefinitions,
                tierData,
                "class",
                tierData.classTrack,
                (tierData.classTrack as any)?.level ?? 0,
                statKey,
            );
            const job = trackStatContribution(
                character,
                definitions,
                tierDefinitions,
                characterTypeDefinitions,
                rarityDefinitions,
                tierData,
                "job",
                tierData.jobTrack,
                (tierData.jobTrack as any)?.level ?? 0,
                statKey,
            );
            const items = character.items.reduce(
                (sum, item) =>
                    itemBonusApplies(character.items, item.id) &&
                    (item.tier ?? character.currentTier) === tierData.tier
                        ? sum + partialStatTotal(item.statBonuses, statKey)
                        : sum,
                0,
            );
            const tierBonus = tierDef.staticBonus;
            return {
                tier: tierData.tier,
                title: tierDef.title,
                tierBonus,
                race,
                classBonus,
                job,
                items,
                total: tierBonus + race + classBonus + job + items,
            };
        });
}

function formatStatGain(gained: Partial<StatBlock>): string[] {
    return statKeys
        .filter((key) => gained[key])
        .map((key) => `${STAT_LABELS[key]} +${displayNumber(gained[key])}`);
}

function normalizeTrack(track: LevelTrack, tier: number): LevelTrack {
    const maxLevel = tierRule(tier).maxLevel;
    return {
        ...track,
        maxLevel,
        level: finiteInteger(track.level, 1, 1, maxLevel),
        exp: clampPercent(track.exp),
    };
}

function stepTrackExperience(track: LevelTrack, direction: 1 | -1): LevelTrack {
    if (direction === 1) {
        if (track.exp >= 100 - EXP_STAGE_SIZE) {
            if (track.level >= track.maxLevel) return { ...track, exp: 100 };
            return { ...track, level: track.level + 1, exp: 0 };
        }
        return { ...track, exp: clampPercent(track.exp + EXP_STAGE_SIZE) };
    }

    if (track.exp > 0)
        return { ...track, exp: clampPercent(track.exp - EXP_STAGE_SIZE) };
    if (track.level > 1)
        return { ...track, level: track.level - 1, exp: 100 - EXP_STAGE_SIZE };
    return { ...track, exp: 0 };
}

function stepSkillExperience(skill: Skill, direction: 1 | -1): Skill {
    const level = skill.level ?? 1;
    if (direction === 1) {
        if (skill.exp >= 100 - EXP_STAGE_SIZE)
            return { ...skill, level: level + 1, exp: 0 };
        return {
            ...skill,
            level,
            exp: clampPercent(skill.exp + EXP_STAGE_SIZE),
        };
    }

    if (skill.exp > 0)
        return {
            ...skill,
            level,
            exp: clampPercent(skill.exp - EXP_STAGE_SIZE),
        };
    if (level > 1)
        return { ...skill, level: level - 1, exp: 100 - EXP_STAGE_SIZE };
    return { ...skill, level: 1, exp: 0 };
}

function enforceItemSkillLimit(items: Item[], tier: number): Item[] {
    let setCount = 0;
    return items.map((item) => {
        const currentSet = item.setSkillNames?.length
            ? item.setSkillNames
            : item.skillSet && item.skillName
              ? [item.skillName]
              : [];
        if (!currentSet.length) return item;

        const allowed = currentSet.slice(0, Math.max(0, tier - setCount));
        setCount += allowed.length;
        return {
            ...item,
            setSkillNames: allowed,
            skillSet: allowed.length > 0,
            skillName: item.skillName || allowed[0] || "",
        };
    });
}

function enforceEquipmentLimits(
    items: Item[],
    maxPerSlot: Record<ItemSlot, number>,
): Item[] {
    const equippedBySlot = {} as Record<ItemSlot, number>;

    // First pass: count equipped items per slot
    items.forEach((item) => {
        if (item.equipped && item.slot !== "Other") {
            equippedBySlot[item.slot] = (equippedBySlot[item.slot] ?? 0) + 1;
        }
    });

    // Second pass: unequip items that exceed limits (keep first N equipped per slot)
    let slotCounts = {} as Record<ItemSlot, number>;
    return items.map((item) => {
        if (!item.equipped || item.slot === "Other") return item;

        const slot = item.slot;
        slotCounts[slot] = (slotCounts[slot] ?? 0) + 1;

        if (slotCounts[slot] > maxPerSlot[slot]) {
            return { ...item, equipped: false };
        }

        return item;
    });
}

function itemBonusApplies(items: Item[], itemId: string): boolean {
    const item = items.find((entry) => entry.id === itemId);
    if (!item || !item.equipped) return false;
    const sameSlotIndex = items
        .filter((entry) => entry.equipped && entry.slot === item.slot)
        .findIndex((entry) => entry.id === itemId);
    return sameSlotIndex >= 0 && sameSlotIndex < ITEM_STAT_LIMITS[item.slot];
}

function normalizeProgression(
    character: Character,
    tierDefinitions?: TierDefinition[],
): Character {
    const tier = finiteInteger(
        character.currentTier,
        1,
        1,
        maxConfiguredTier(tierDefinitions),
    );

    const normalizedTiers = character.tiers.map((tierData) => {
        if (tierData.status !== "current") return tierData;

        const maxLevel = maxLevelForTier(tierDefinitions, tier);
        const normalizedRace = {
            ...tierData.race,
            level: finiteInteger(tierData.race.level, 1, 1, maxLevel),
            exp: clampPercent(tierData.race.exp),
        };

        return {
            ...tierData,
            tier,
            race: normalizedRace,
            classTrack: tierData.classTrack
                ? { ...tierData.classTrack }
                : undefined,
            jobTrack: tierData.jobTrack ? { ...tierData.jobTrack } : undefined,
        };
    });

    const next: Character = {
        ...character,
        currentTier: tier,
        tiers: normalizedTiers,
        items: enforceItemSkillLimit(character.items, tier),
    };

    if (next.kind === "monster") {
        next.tiers = next.tiers.map((t) => ({
            ...t,
            classTrack: undefined,
            jobTrack: undefined,
            halfMonsterFocus: undefined as any,
        }));
    }

    if (character.kind === "humanoid") {
        next.tiers = next.tiers.map((t) => ({
            ...t,
            halfMonsterFocus: undefined as any,
            classTrack: t.classTrack ?? {
                name: "Page",
                rarity: "Common" as const,
                level:
                    t.status === "completed"
                        ? maxLevelForTier(tierDefinitions, t.tier)
                        : 1,
            },
            jobTrack: t.jobTrack ?? {
                name: "Apprentice Apothecary",
                rarity: "Common" as const,
                level:
                    t.status === "completed"
                        ? maxLevelForTier(tierDefinitions, t.tier)
                        : 1,
            },
        }));
    }

    if (character.kind === "half-monster") {
        const focus = character.halfMonsterFocus ?? "class";
        next.halfMonsterFocus = focus;
        next.tiers = next.tiers.map((t) => ({
            ...t,
            classTrack:
                focus !== "job"
                    ? (t.classTrack ?? {
                          name: "Page",
                          rarity: "Common" as const,
                          level:
                              t.status === "completed"
                                  ? maxLevelForTier(tierDefinitions, t.tier)
                                  : 1,
                      })
                    : undefined,
            jobTrack:
                focus === "job"
                    ? (t.jobTrack ?? {
                          name: "Apprentice Apothecary",
                          rarity: "Common" as const,
                          level:
                              t.status === "completed"
                                  ? maxLevelForTier(tierDefinitions, t.tier)
                                  : 1,
                      })
                    : undefined,
        }));
    }

    return next;
}

function partialStatTotal(
    block: Partial<StatBlock> | undefined,
    key: StatKey,
): number {
    return block?.[key] ?? 0;
}

function addStats(...blocks: Array<Partial<StatBlock> | undefined>): StatBlock {
    return statKeys.reduce(
        (total, key) => {
            total[key] = blocks.reduce(
                (sum, block) => sum + partialStatTotal(block, key),
                0,
            );
            return total;
        },
        {
            ...EMPTY_STATS,
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
        },
    );
}

function equipmentBonuses(items: Item[]): StatBlock {
    return items.reduce(
        (total, item) =>
            itemBonusApplies(items, item.id)
                ? addStats(total, item.statBonuses)
                : total,
        addStats(),
    );
}

function calculateTotals(
    character: Character,
    definitions: AdvancementDefinition[],
    tierDefinitions: TierDefinition[],
    characterTypeDefinitions: CharacterTypeDefinition[],
    rarityDefinitions: RarityDefinition[],
): StatBlock {
    return addStats(
        tierBonusStats(tierDefinitions, character.currentTier),
        calculatedProgressionBonuses(
            character,
            definitions,
            tierDefinitions,
            characterTypeDefinitions,
            rarityDefinitions,
        ),
        character.passiveBonuses,
        equipmentBonuses(character.items),
    );
}

function trackLabel(character: Character): string {
    const currentTierData = character.tiers.find((t) => t.status === "current");
    if (character.kind === "monster")
        return `Race Level (T${character.currentTier})`;
    if (character.kind === "half-monster") {
        const focus = character.halfMonsterFocus ?? "class";
        if (focus === "job")
            return `Race + Job Levels (T${character.currentTier})`;
        return `Race + Class Levels (T${character.currentTier})`;
    }
    return `Class + Job Levels (T${character.currentTier})`;
}

function currentTrackMilestones(
    character: Character,
    tierDefinitions: TierDefinition[],
): PathMilestone[] {
    const currentTierData = character.tiers.find((t) => t.status === "current");
    if (!currentTierData) return [];

    const milestones: PathMilestone[] = [
        {
            id: "current-race",
            tier: character.currentTier,
            label: currentTierData.race.name || "Unassigned Race",
            rarity: currentTierData.race.rarity,
            source: "Race",
            notes: `Current race track · level ${currentTierData.race.level}/${maxLevelForTier(tierDefinitions, character.currentTier)}`,
        },
    ];

    if (currentTierData.classTrack) {
        milestones.push({
            id: "current-class",
            tier: character.currentTier,
            label: currentTierData.classTrack.name || "Unassigned Class",
            rarity: currentTierData.classTrack.rarity,
            source: "Class",
            notes: `Current class track`,
        });
    }

    if (currentTierData.jobTrack) {
        milestones.push({
            id: "current-job",
            tier: character.currentTier,
            label: currentTierData.jobTrack.name || "Unassigned Job",
            rarity: currentTierData.jobTrack.rarity,
            source: "Job",
            notes: `Current job track`,
        });
    }

    return milestones;
}

function sortedPath(
    character: Character,
    tierDefinitions: TierDefinition[],
): PathMilestone[] {
    const manualPath = character.path.filter(
        (milestone) =>
            !(
                milestone.source === "Race" &&
                milestone.notes === "Starting race granted by The System."
            ),
    );
    return [
        ...currentTrackMilestones(character, tierDefinitions),
        ...manualPath,
    ].sort((a, b) => a.tier - b.tier || a.label.localeCompare(b.label));
}

function recalculateCharacter(
    character: Character,
    definitions: AdvancementDefinition[],
    itemDefinitions: ItemDefinition[],
    tierDefinitions: TierDefinition[],
    characterTypeDefinitions: CharacterTypeDefinition[],
    rarityDefinitions: RarityDefinition[],
): Character {
    // Recalculate progression bonuses from live definition weights.
    const newProgressionBonuses = calculatedProgressionBonuses(
        character,
        definitions,
        tierDefinitions,
        characterTypeDefinitions,
        rarityDefinitions,
    );
    const oldEntries = Object.entries(character.progressionBonuses).sort(
        ([a], [b]) => a.localeCompare(b),
    );
    const newEntries = Object.entries(newProgressionBonuses).sort(([a], [b]) =>
        a.localeCompare(b),
    );
    let progressionChanged = oldEntries.length !== newEntries.length;
    if (!progressionChanged) {
        for (let i = 0; i < oldEntries.length; i++) {
            if (oldEntries[i][1] !== newEntries[i]?.[1]) {
                progressionChanged = true;
                break;
            }
        }
    }

    // Recalculate item stat bonuses from their source definitions.
    const updatedItems = character.items.map((item) => {
        if (!item.definitionId) return item;
        const definition = itemDefinitions.find(
            (entry) => entry.id === item.definitionId,
        );
        if (!definition) return item;

        const statBonuses = distributedItemBonuses(
            definition,
            tierDefinitions,
            rarityDefinitions,
        );
        const itemOldEntries = Object.entries(item.statBonuses).sort(
            ([a], [b]) => a.localeCompare(b),
        );
        const itemNewEntries = Object.entries(statBonuses).sort(([a], [b]) =>
            a.localeCompare(b),
        );
        let itemChanged = itemOldEntries.length !== itemNewEntries.length;
        if (!itemChanged) {
            for (let i = 0; i < itemOldEntries.length; i++) {
                if (itemOldEntries[i][1] !== itemNewEntries[i]?.[1]) {
                    itemChanged = true;
                    break;
                }
            }
        }

        return itemChanged ? { ...item, statBonuses } : item;
    });
    const itemsChanged = updatedItems.some(
        (item, index) => item !== character.items[index],
    );

    if (!progressionChanged && !itemsChanged) {
        return character;
    }

    return {
        ...character,
        progressionBonuses: newProgressionBonuses,
        raceBonuses: newProgressionBonuses,
        items: itemsChanged ? updatedItems : character.items,
    };
}

function rarityClass(rarity: Rarity): string {
    return `rarity rarity-${rarityClassSlug(rarity)}`;
}

function App() {
    const [state, setState] = useState<AppState>(() => blankState());
    const [loadedSharedState, setLoadedSharedState] = useState(false);
    const [storageStatus, setStorageStatus] = useState(
        "Loading shared ledger…",
    );
    const [mode, setMode] = useState<ViewMode>("sheet");
    const [newPlayerName, setNewPlayerName] = useState("");
    const [collapsedPlayerIds, setCollapsedPlayerIds] = useState<Set<string>>(
        () => new Set(),
    );
    const [draft, setDraft] = useState<Character | null>(null);
    const [wizardStep, setWizardStep] = useState<WizardStep>(0);
    const [levelUpNotices, setLevelUpNotices] = useState<LevelUpNotice[]>([]);

    useEffect(() => {
        let cancelled = false;

        loadState()
            .then((loadedState) => {
                if (cancelled) return;
                setState(loadedState);
                setLoadedSharedState(true);
                setStorageStatus("");
            })
            .catch((error) => {
                if (cancelled) return;
                setLoadedSharedState(false);
                setStorageStatus(
                    error instanceof Error
                        ? error.message
                        : "Failed to load shared ledger.",
                );
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!loadedSharedState) return;
        let cancelled = false;

        saveState(state)
            .then(() => {
                if (!cancelled) setStorageStatus("");
            })
            .catch((error) => {
                if (cancelled) return;
                setStorageStatus(
                    error instanceof Error
                        ? error.message
                        : "Failed to save shared ledger.",
                );
            });

        return () => {
            cancelled = true;
        };
    }, [loadedSharedState, state]);

    useEffect(() => {
        if (mode !== "sheet") return;
        setState((current) => {
            const characters = current.characters.map((character) =>
                recalculateCharacter(
                    character,
                    current.definitions,
                    current.itemDefinitions,
                    current.tierDefinitions,
                    current.characterTypeDefinitions,
                    current.rarityDefinitions,
                ),
            );
            const changed = characters.some(
                (character, index) => character !== current.characters[index],
            );
            return changed ? { ...current, characters } : current;
        });
    }, [mode]);

    const selectedCharacter = useMemo(
        () =>
            state.characters.find(
                (character) => character.id === state.selectedCharacterId,
            ) ?? state.characters[0],
        [state.characters, state.selectedCharacterId],
    );

    const selectedPlayer = useMemo(
        () =>
            state.players.find(
                (player) => player.id === selectedCharacter?.playerId,
            ) ?? state.players[0],
        [selectedCharacter?.playerId, state.players],
    );

    const dynamicRarityStyles = useMemo(
        () =>
            state.rarityDefinitions
                .map(
                    (definition) =>
                        `.rarity-${rarityClassSlug(definition.name)} { color: ${definition.color}; }`,
                )
                .join("\n"),
        [state.rarityDefinitions],
    );

    function patchState(updater: (current: AppState) => AppState): void {
        setState((current) => updater(current));
    }

    function addPlayer(): void {
        const name = newPlayerName.trim();
        if (!name) return;
        const player: Player = { id: makeId("player"), name };
        patchState((current) => ({
            ...current,
            players: [...current.players, player],
        }));
        setNewPlayerName("");
    }

    function togglePlayerCollapsed(playerId: string): void {
        setCollapsedPlayerIds((current) => {
            const next = new Set(current);
            if (next.has(playerId)) next.delete(playerId);
            else next.add(playerId);
            return next;
        });
    }

    function startCreate(kind: CharacterKind = "humanoid"): void {
        const playerId =
            selectedPlayer?.id ?? state.players[0]?.id ?? makeId("player");
        const player = state.players.find((entry) => entry.id === playerId) ?? {
            id: playerId,
            name: "Player",
        };
        if (!state.players.some((entry) => entry.id === playerId)) {
            patchState((current) => ({
                ...current,
                players: [...current.players, player],
            }));
        }
        setDraft(createCharacter(playerId, kind));
        setWizardStep(0);
        setMode("create");
    }

    function editSelected(): void {
        if (!selectedCharacter) return;
        setDraft(cloneCharacter(selectedCharacter));
        setWizardStep(0);
        setMode("create");
    }

    function updateDraft(updater: (current: Character) => Character): void {
        setDraft((current) =>
            current
                ? normalizeProgression(
                      {
                          ...updater(current),
                          updatedAt: new Date().toISOString(),
                      },
                      state.tierDefinitions,
                  )
                : current,
        );
    }

    function saveDraft(): void {
        if (!draft) return;
        const cleanDraft = normalizeProgression(
            {
                ...draft,
                updatedAt: new Date().toISOString(),
            },
            state.tierDefinitions,
        );
        patchState((current) => {
            const exists = current.characters.some(
                (character) => character.id === cleanDraft.id,
            );
            return {
                ...current,
                characters: exists
                    ? current.characters.map((character) =>
                          character.id === cleanDraft.id
                              ? cleanDraft
                              : character,
                      )
                    : [...current.characters, cleanDraft],
                selectedCharacterId: cleanDraft.id,
            };
        });
        setDraft(null);
        setMode("sheet");
    }

    function updateSelected(updater: (current: Character) => Character): void {
        if (!selectedCharacter) return;
        patchState((current) => ({
            ...current,
            characters: current.characters.map((character) =>
                character.id === selectedCharacter.id
                    ? normalizeProgression(
                          {
                              ...updater(character),
                              updatedAt: new Date().toISOString(),
                          },
                          current.tierDefinitions,
                      )
                    : character,
            ),
        }));
    }

    function deleteSelected(): void {
        if (!selectedCharacter) return;
        const nextCharacters = state.characters.filter(
            (character) => character.id !== selectedCharacter.id,
        );
        patchState((current) => ({
            ...current,
            characters: nextCharacters,
            selectedCharacterId: nextCharacters[0]?.id,
        }));
    }

    return (
        <main className="app-shell">
            <style>{dynamicRarityStyles}</style>
            <aside className="roster-panel glass-panel">
                <div className="brand-lockup">
                    <span className="system-glyph">Σ</span>
                    <div>
                        <p className="eyebrow">The System</p>
                        <h1>Evolution RPG</h1>
                    </div>
                </div>

                <div className="toolbar compact">
                    <button
                        type="button"
                        onClick={() => startCreate("humanoid")}
                    >
                        New Character
                    </button>
                </div>
                {storageStatus ? (
                    <p className="error-text">{storageStatus}</p>
                ) : null}

                <section className="player-create">
                    <label htmlFor="player-name">Add player or group</label>
                    <div className="inline-form">
                        <input
                            id="player-name"
                            value={newPlayerName}
                            onChange={(event) =>
                                setNewPlayerName(event.target.value)
                            }
                            placeholder="Player name"
                        />
                        <button
                            type="button"
                            className="secondary"
                            onClick={addPlayer}
                        >
                            Add
                        </button>
                    </div>
                </section>

                <section className="roster-list">
                    {state.players.map((player) => {
                        const characters = state.characters.filter(
                            (character) => character.playerId === player.id,
                        );
                        const collapsed = collapsedPlayerIds.has(player.id);
                        return (
                            <div
                                key={player.id}
                                className={`player-group ${collapsed ? "collapsed" : ""}`}
                            >
                                <button
                                    type="button"
                                    className="player-group-toggle"
                                    onClick={() => togglePlayerCollapsed(player.id)}
                                    aria-expanded={!collapsed}
                                >
                                    <span className="collapse-indicator">
                                        {collapsed ? "▸" : "▾"}
                                    </span>
                                    <span>{player.name}</span>
                                    <span className="player-count">
                                        {characters.length}
                                    </span>
                                </button>
                                {!collapsed && characters.length === 0 ? (
                                    <p className="muted small">
                                        No characters yet.
                                    </p>
                                ) : null}
                                {!collapsed && characters.map((character) => {
                                    const tierData = currentTierData(character);
                                    const classLevel =
                                        tierData?.classTrack?.level ?? 1;
                                    const jobLevel =
                                        tierData?.jobTrack?.level ?? 1;
                                    const raceLevel =
                                        character.kind === "humanoid"
                                            ? Math.floor(
                                                  (classLevel + jobLevel) / 2,
                                              )
                                            : (tierData?.race.level ?? 1);

                                    return (
                                        <button
                                            key={character.id}
                                            type="button"
                                            className={`character-card ${selectedCharacter?.id === character.id ? "selected" : ""}`}
                                            onClick={() => {
                                                setState((current) => ({
                                                    ...current,
                                                    selectedCharacterId:
                                                        character.id,
                                                }));
                                                setMode("sheet");
                                            }}
                                        >
                                            <span className="card-title">
                                                {character.name}
                                            </span>
                                            <span>
                                                <span
                                                    className={raceTypeClass(
                                                        character.kind,
                                                    )}
                                                >
                                                    {raceTypeLabel(
                                                        character.kind,
                                                    )}
                                                </span>{" "}
                                                ·{" "}
                                                {tierData?.race.name ??
                                                    "Unknown Race"}{" "}
                                                · T
                                                {String(
                                                    character.currentTier,
                                                ).padStart(2, "0")}{" "}
                                                · L
                                                {String(raceLevel).padStart(
                                                    2,
                                                    "0",
                                                )}
                                            </span>
                                            <span className="mini-track">
                                                <span
                                                    style={{
                                                        width: `${rosterRaceExperience(character)}%`,
                                                    }}
                                                />
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}
                </section>
            </aside>

            <section className="workspace">
                <nav className="top-tabs glass-panel">
                    <button
                        type="button"
                        className={mode === "sheet" ? "active" : ""}
                        onClick={() => setMode("sheet")}
                    >
                        Character Sheet
                    </button>
                    <button
                        type="button"
                        className={mode === "create" ? "active" : ""}
                        onClick={() =>
                            draft ? setMode("create") : editSelected()
                        }
                    >
                        Create / Edit
                    </button>
                    <button
                        type="button"
                        className={mode === "path" ? "active" : ""}
                        onClick={() => setMode("path")}
                    >
                        System Path
                    </button>
                    <button
                        type="button"
                        className={mode === "catalogs" ? "active" : ""}
                        onClick={() => setMode("catalogs")}
                    >
                        Compendium
                    </button>
                </nav>

                {mode === "sheet" ? (
                    selectedCharacter ? (
                        <CharacterSheet
                            character={selectedCharacter}
                            player={selectedPlayer}
                            definitions={state.definitions}
                            tierDefinitions={state.tierDefinitions}
                            characterTypeDefinitions={
                                state.characterTypeDefinitions
                            }
                            statCategoryDefinitions={
                                state.statCategoryDefinitions
                            }
                            primaryStatDefinitions={
                                state.primaryStatDefinitions
                            }
                            secondaryStatDefinitions={
                                state.secondaryStatDefinitions
                            }
                            rarityDefinitions={state.rarityDefinitions}
                            skillDefinitions={state.skillDefinitions}
                            itemDefinitions={state.itemDefinitions}
                            affinityDefinitions={state.affinityDefinitions}
                            currencyDefinitions={state.currencyDefinitions}
                            onEdit={editSelected}
                            onDelete={deleteSelected}
                            onUpdate={updateSelected}
                            onLevelUp={(notice) =>
                                setLevelUpNotices((current) => [
                                    ...current,
                                    notice,
                                ])
                            }
                        />
                    ) : (
                        <EmptyState onCreate={() => startCreate("humanoid")} />
                    )
                ) : null}

                {mode === "create" ? (
                    draft ? (
                        <CreatorWizard
                            draft={draft}
                            step={wizardStep}
                            onStep={setWizardStep}
                            players={state.players}
                            definitions={state.definitions}
                            tierDefinitions={state.tierDefinitions}
                            characterTypeDefinitions={
                                state.characterTypeDefinitions
                            }
                            rarityDefinitions={state.rarityDefinitions}
                            skillDefinitions={state.skillDefinitions}
                            itemDefinitions={state.itemDefinitions}
                            affinityDefinitions={state.affinityDefinitions}
                            onDraft={updateDraft}
                            onCancel={() => {
                                setDraft(null);
                                setMode("sheet");
                            }}
                            onSave={saveDraft}
                        />
                    ) : (
                        <EmptyState onCreate={() => startCreate("humanoid")} />
                    )
                ) : null}

                {mode === "path" ? (
                    selectedCharacter ? (
                        <SystemPath
                            character={selectedCharacter}
                            definitions={state.definitions}
                            tierDefinitions={state.tierDefinitions}
                            characterTypeDefinitions={
                                state.characterTypeDefinitions
                            }
                            rarityDefinitions={state.rarityDefinitions}
                            onEdit={editSelected}
                        />
                    ) : (
                        <EmptyState onCreate={() => startCreate("monster")} />
                    )
                ) : null}

                {mode === "catalogs" ? (
                    <CatalogManager
                        state={state}
                        onChange={(patch) =>
                            setState((current) => ({ ...current, ...patch }))
                        }
                    />
                ) : null}
            </section>

            {levelUpNotices[0] ? (
                <LevelUpModal
                    notice={levelUpNotices[0]}
                    onClose={() =>
                        setLevelUpNotices((current) => current.slice(1))
                    }
                />
            ) : null}
        </main>
    );
}

interface EmptyStateProps {
    onCreate: () => void;
}

function EmptyState({ onCreate }: EmptyStateProps) {
    return (
        <section className="glass-panel empty-state">
            <h2>No character selected</h2>
            <p>
                Create a humanoid, monster, or half-monster to begin tracking
                their System record.
            </p>
            <button type="button" onClick={onCreate}>
                Create Character
            </button>
        </section>
    );
}

interface CharacterSheetProps {
    character: Character;
    player?: Player;
    definitions: AdvancementDefinition[];
    tierDefinitions: TierDefinition[];
    characterTypeDefinitions: CharacterTypeDefinition[];
    statCategoryDefinitions: StatCategoryDefinition[];
    primaryStatDefinitions: PrimaryStatDefinition[];
    secondaryStatDefinitions: SecondaryStatDefinition[];
    rarityDefinitions: RarityDefinition[];
    skillDefinitions: SkillDefinition[];
    itemDefinitions: ItemDefinition[];
    affinityDefinitions: AffinityDefinition[];
    currencyDefinitions: CurrencyDefinition[];
    onEdit: () => void;
    onDelete: () => void;
    onUpdate: (updater: (current: Character) => Character) => void;
    onLevelUp: (notice: LevelUpNotice) => void;
}

function CharacterSheet({
    character,
    player,
    definitions,
    tierDefinitions,
    characterTypeDefinitions,
    statCategoryDefinitions,
    primaryStatDefinitions,
    secondaryStatDefinitions,
    rarityDefinitions,
    skillDefinitions,
    itemDefinitions,
    affinityDefinitions,
    currencyDefinitions,
    onEdit,
    onDelete,
    onUpdate,
    onLevelUp,
}: CharacterSheetProps) {
    const totals = calculateTotals(
        character,
        definitions,
        tierDefinitions,
        characterTypeDefinitions,
        rarityDefinitions,
    );
    const equippedBonuses = equipmentBonuses(character.items);
    const [itemSearch, setItemSearch] = useState("");
    const emittedLevelUpKeysRef = useRef<Set<string>>(new Set());
    const sortedStats = sortedPrimaryStats(
        statCategoryDefinitions,
        primaryStatDefinitions,
    );
    const sortedStatCategories = [...statCategoryDefinitions].sort(
        (a, b) => a.order - b.order || a.name.localeCompare(b.name),
    );
    const itemSkillLimit = character.currentTier;
    const itemSkillsSet = itemSetSkillCount(character.items);
    const itemProvidedSkills = itemSetSkills(character, skillDefinitions);
    const activeSkills = [...character.skills, ...itemProvidedSkills].filter(
        (skill) => skill.kind === "Active",
    );
    const passiveSkills = [...character.skills, ...itemProvidedSkills].filter(
        (skill) => skill.kind === "Passive",
    );
    const filteredQuickItems = itemDefinitions
        .filter((item) =>
            item.name.toLowerCase().includes(itemSearch.trim().toLowerCase()),
        )
        .slice(0, 6);

    function renderStatBreakdown(statKey: StatKey): JSX.Element {
        const rows = statBreakdownRows(
            character,
            definitions,
            tierDefinitions,
            characterTypeDefinitions,
            rarityDefinitions,
            statKey,
        );
        const passive = partialStatTotal(character.passiveBonuses, statKey);
        const tierRowsTotal = rows.reduce((sum, row) => sum + row.total, 0);
        const total = passive + tierRowsTotal;

        return (
            <div
                className="stat-breakdown-popover calculation-popover"
                role="tooltip"
            >
                <div className="stat-breakdown-popover-scroll">
                    <table className="stat-breakdown-table">
                        <caption>
                            {statLabel(primaryStatDefinitions, statKey)}{" "}
                            calculation
                        </caption>
                        <thead>
                            <tr>
                                <th>Tier</th>
                                <th>Tier Bonus</th>
                                <th>Race</th>
                                <th>Class</th>
                                <th>Job</th>
                                <th>Items</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.tier}>
                                    <th scope="row">
                                        T{row.tier} · {row.title}
                                    </th>
                                    <td>{displayNumber(row.tierBonus)}</td>
                                    <td>{displayNumber(row.race)}</td>
                                    <td>{displayNumber(row.classBonus)}</td>
                                    <td>{displayNumber(row.job)}</td>
                                    <td>{displayNumber(row.items)}</td>
                                    <td>{displayNumber(row.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <th scope="row">Passive bonuses</th>
                                <td colSpan={5} />
                                <td>{displayNumber(passive)}</td>
                            </tr>
                            <tr>
                                <th scope="row">Calculated total</th>
                                <td colSpan={5}>
                                    {displayNumber(tierRowsTotal)} tier-derived
                                </td>
                                <td>{displayNumber(total)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    }

    function renderSecondaryBreakdown(
        definition: SecondaryStatDefinition,
    ): JSX.Element {
        const primary = totals[definition.multipliedStat];
        const secondary = totals[definition.addedStat];
        const scaled = primary * character.currentTier;
        const total = scaled + secondary;

        return (
            <div
                className="stat-breakdown-popover vital-breakdown-popover calculation-popover"
                role="tooltip"
            >
                <div className="stat-breakdown-popover-scroll">
                    <table className="stat-breakdown-table vital-breakdown-table">
                        <caption>
                            {definition.longName} ({definition.shortName})
                        </caption>
                        <tbody>
                            <tr>
                                <th scope="row">Description</th>
                                <td>
                                    {definition.description ||
                                        "No description."}
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">
                                    {statLabel(
                                        primaryStatDefinitions,
                                        definition.multipliedStat,
                                    )}
                                </th>
                                <td>{displayNumber(primary)}</td>
                            </tr>
                            <tr>
                                <th scope="row">Current tier multiplier</th>
                                <td>
                                    × {displayNumber(character.currentTier)}
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">Tier-scaled subtotal</th>
                                <td>{displayNumber(scaled)}</td>
                            </tr>
                            <tr>
                                <th scope="row">
                                    +{" "}
                                    {statLabel(
                                        primaryStatDefinitions,
                                        definition.addedStat,
                                    )}
                                </th>
                                <td>{displayNumber(secondary)}</td>
                            </tr>
                        </tbody>
                        <tfoot>
                            <tr>
                                <th scope="row">
                                    Total {definition.shortName}
                                </th>
                                <td>{displayNumber(total)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    }

    function getCurrentTierData(): TierProgression | undefined {
        return character.tiers.find((t) => t.status === "current");
    }

    function emitLevelUpNotice(notice: LevelUpNotice): void {
        const key = `${character.id}:${notice.trackName}:${notice.level}`;
        if (emittedLevelUpKeysRef.current.has(key)) return;
        emittedLevelUpKeysRef.current.add(key);
        window.setTimeout(
            () => emittedLevelUpKeysRef.current.delete(key),
            1000,
        );
        onLevelUp(notice);
    }

    function updateTrack(
        track: "race" | "classTrack" | "jobTrack",
        updater: (
            track: TierTrackSelection & { level: number; exp: number },
        ) => TierTrackSelection & { level: number; exp: number },
    ): void {
        onUpdate((current) => {
            const tiers = current.tiers.map((t) =>
                t.status === "current"
                    ? { ...t, [track]: updater(t[track]! as LevelTrack) }
                    : t,
            );
            return { ...current, tiers };
        });
    }

    function advanceTrack(
        track: "race" | "classTrack" | "jobTrack",
        direction: 1 | -1,
    ): void {
        onUpdate((current) => {
            const currentTierData = current.tiers.find(
                (t) => t.status === "current",
            );
            if (!currentTierData?.[track]) return current;
            const trackData = currentTierData[track]! as LevelTrack;
            const nextTrack = stepTrackExperience(trackData, direction);
            const leveledUp = nextTrack.level > trackData.level;

            const previousRaceLevel = currentTierData.race.level ?? 1;

            // For humanoids, advancing Class or Job also updates stored race level.
            let finalTiers = current.tiers.map((t) => {
                if (t.status !== "current") return t;
                return { ...t, [track]: nextTrack };
            });

            let humanoidRaceLeveledUp = false;
            let derivedRaceLevel = previousRaceLevel;

            if (
                current.kind === "humanoid" &&
                track !== "race" &&
                currentTierData.classTrack &&
                currentTierData.jobTrack
            ) {
                const updatedTier = finalTiers.find(
                    (t) => t.status === "current",
                )!;
                const classL = (updatedTier.classTrack as any)?.level ?? 1;
                const jobL = (updatedTier.jobTrack as any)?.level ?? 1;
                derivedRaceLevel = Math.floor((classL + jobL) / 2);
                humanoidRaceLeveledUp = derivedRaceLevel > previousRaceLevel;
                finalTiers = finalTiers.map((t) => {
                    if (t.status !== "current") return t;
                    return {
                        ...t,
                        race: { ...t.race, level: derivedRaceLevel },
                    };
                });
            }

            if (!leveledUp) return { ...current, tiers: finalTiers };

            const definitionKind =
                track === "race"
                    ? "race"
                    : track === "classTrack"
                      ? "class"
                      : "job";
            const currentTierDataAfter = finalTiers.find(
                (t) => t.status === "current",
            )!;
            const definition = definitionForTrack(
                definitions,
                currentTierDataAfter[track]! as LevelTrack,
                definitionKind,
            );
            const gained = distributedStatGain(
                current,
                definition,
                currentTierDataAfter.tier,
                tierDefinitions,
                characterTypeDefinitions,
                rarityDefinitions,
            );
            emitLevelUpNotice({
                characterName: current.name,
                trackName:
                    (currentTierDataAfter[track] as any).name || "Unknown",
                level: nextTrack.level,
                gained,
            });

            if (humanoidRaceLeveledUp) {
                const raceDefinition = definitionForTrack(
                    definitions,
                    currentTierDataAfter.race as LevelTrack,
                    "race",
                );
                emitLevelUpNotice({
                    characterName: current.name,
                    trackName: currentTierDataAfter.race.name || "Race",
                    level: derivedRaceLevel,
                    gained: distributedStatGain(
                        current,
                        raceDefinition,
                        currentTierDataAfter.tier,
                        tierDefinitions,
                        characterTypeDefinitions,
                        rarityDefinitions,
                    ),
                });
            }

            return { ...current, tiers: finalTiers };
        });
    }

    function toggleItemEquipped(itemId: string): void {
        onUpdate((current) => ({
            ...current,
            items: current.items.map((item) =>
                item.id === itemId
                    ? { ...item, equipped: !item.equipped }
                    : item,
            ),
        }));
    }

    function toggleItemSkill(itemId: string, skillName: string): void {
        onUpdate((current) => {
            const setCount = current.items.reduce(
                (count, item) =>
                    count +
                    (item.setSkillNames?.length ??
                        (item.skillSet && item.skillName ? 1 : 0)),
                0,
            );
            return {
                ...current,
                items: current.items.map((item) => {
                    if (item.id !== itemId) return item;
                    const currentSet =
                        item.setSkillNames ??
                        (item.skillSet && item.skillName
                            ? [item.skillName]
                            : []);
                    const isSet = currentSet.includes(skillName);
                    if (!isSet && setCount >= current.currentTier) return item;
                    const nextSet = isSet
                        ? currentSet.filter((entry) => entry !== skillName)
                        : [...currentSet, skillName];
                    return {
                        ...item,
                        setSkillNames: nextSet,
                        skillSet: nextSet.length > 0,
                        skillName: item.skillName || skillName,
                    };
                }),
            };
        });
    }

    function addItemFromDefinitionToSheet(definition: ItemDefinition): void {
        onUpdate((current) => ({
            ...current,
            items: [
                ...current.items,
                itemFromDefinition(
                    definition,
                    skillDefinitions,
                    tierDefinitions,
                    rarityDefinitions,
                ),
            ],
        }));
        setItemSearch("");
    }

    const currentTierData = getCurrentTierData();

    return (
        <div className="sheet-grid">
            <header className="sheet-header glass-panel">
                <div>
                    <p className="eyebrow">
                        {player?.name ?? "Unassigned Player"} ·{" "}
                        {trackLabel(character)}
                    </p>
                    <h2>{character.name}</h2>
                    <p className="muted">
                        {character.age ? `Age ${character.age}` : "Age unknown"}{" "}
                        · {currentTierData?.race.name} ·{" "}
                        {titleCase(character.kind)}
                    </p>
                </div>
                <div className="header-actions">
                    <span className="tier-badge">
                        Tier {String(character.currentTier).padStart(2, "0")} ·{" "}
                        {
                            tierDefinition(
                                tierDefinitions,
                                character.currentTier,
                            ).title
                        }
                    </span>
                    <button type="button" onClick={onEdit}>
                        Edit
                    </button>
                    <button type="button" className="danger" onClick={onDelete}>
                        Delete
                    </button>
                </div>
            </header>

            <section className="vitals glass-panel">
                <h3>Secondary Stats</h3>
                {[...secondaryStatDefinitions]
                    .sort(
                        (a, b) =>
                            a.order - b.order ||
                            a.shortName.localeCompare(b.shortName),
                    )
                    .map((definition) => (
                        <div
                            key={definition.id}
                            className="vital-row vital-row--breakdown"
                            tabIndex={0}
                        >
                            <span title={definition.longName}>
                                {definition.shortName}
                            </span>
                            <strong>
                                {displayNumber(
                                    secondaryStatValue(
                                        definition,
                                        character,
                                        totals,
                                    ),
                                )}
                            </strong>
                            {renderSecondaryBreakdown(definition)}
                        </div>
                    ))}
                <div className="affinity-list">
                    {character.affinities.length ? (
                        character.affinities.map((affName) => {
                            const aff = affinityDefinitions.find(
                                (a) => a.name === affName,
                            );
                            return (
                                <span
                                    key={affName}
                                    className="affinity-tag"
                                    style={{
                                        backgroundColor: aff?.color ?? "#888",
                                    }}
                                >
                                    <span className="affinity-dot">
                                        {aff?.emoji ?? affName.charAt(0)}
                                    </span>{" "}
                                    {affName}
                                </span>
                            );
                        })
                    ) : (
                        <span className="muted">No affinities recorded</span>
                    )}
                </div>
            </section>

            <section className="tracks glass-panel">
                <h3>Levels</h3>
                {currentTierData?.race
                    ? (() => {
                          const classLevel =
                              currentTierData.classTrack?.level ?? 1;
                          const jobLevel = currentTierData.jobTrack?.level ?? 1;

                          // Humanoid race level is auto-calculated from Class+Job average (rounded down)
                          let raceLevel: number;
                          let canAdvanceRace: boolean;

                          if (character.kind === "humanoid") {
                              raceLevel = Math.floor(
                                  (classLevel + jobLevel) / 2,
                              );
                              canAdvanceRace = false;
                          } else {
                              // Monster and Half-Monster: race is directly upgradeable
                              raceLevel = currentTierData.race.level ?? 1;
                              canAdvanceRace = true;
                          }

                          return (
                              <TrackProgress
                                  label="Race"
                                  track={{
                                      ...currentTierData.race,
                                      level: raceLevel,
                                      exp:
                                          character.kind === "humanoid"
                                              ? 0
                                              : (currentTierData.race.exp ?? 0),
                                      maxLevel: maxLevelForTier(
                                          tierDefinitions,
                                          character.currentTier,
                                      ),
                                      perLevelBonus: {},
                                  }}
                                  onStep={
                                      canAdvanceRace
                                          ? (direction) =>
                                                advanceTrack("race", direction)
                                          : undefined
                                  }
                              />
                          );
                      })()
                    : null}
                {currentTierData?.classTrack ? (
                    <TrackProgress
                        label="Class"
                        track={{
                            ...currentTierData.classTrack,
                            level: currentTierData.classTrack.level ?? 1,
                            exp: (currentTierData.classTrack as any).exp ?? 0,
                            maxLevel: maxLevelForTier(
                                tierDefinitions,
                                character.currentTier,
                            ),
                            perLevelBonus: {},
                        }}
                        onStep={(direction) =>
                            advanceTrack("classTrack", direction)
                        }
                    />
                ) : null}
                {currentTierData?.jobTrack ? (
                    <TrackProgress
                        label="Job"
                        track={{
                            ...currentTierData.jobTrack,
                            level: currentTierData.jobTrack.level ?? 1,
                            exp: (currentTierData.jobTrack as any).exp ?? 0,
                            maxLevel: maxLevelForTier(
                                tierDefinitions,
                                character.currentTier,
                            ),
                            perLevelBonus: {},
                        }}
                        onStep={(direction) =>
                            advanceTrack("jobTrack", direction)
                        }
                    />
                ) : null}
            </section>

            <section className="stats-panel glass-panel">
                <h3>Stats</h3>
                <div className="stat-groups">
                    {sortedStatCategories.map((category) => {
                        const categoryStats = sortedStats
                            .filter((stat) => stat.categoryId === category.id)
                            .sort(
                                (a, b) =>
                                    (a.role === b.role
                                        ? 0
                                        : a.role === "aggressive"
                                          ? -1
                                          : 1) ||
                                    a.order - b.order ||
                                    a.label.localeCompare(b.label),
                            );
                        if (!categoryStats.length) return null;

                        return (
                            <div key={category.id} className="stat-group">
                                <h4>{category.name}</h4>
                                {categoryStats.map((stat) => (
                                    <div
                                        key={stat.key}
                                        className="stat-row stat-row--breakdown"
                                        tabIndex={0}
                                    >
                                        <span>
                                            {stat.label}{" "}
                                            <span
                                                className={`stat-role-marker stat-role-${stat.role}`}
                                            >
                                                {stat.role === "aggressive"
                                                    ? "A"
                                                    : "D"}
                                            </span>
                                        </span>
                                        <strong>
                                            {displayNumber(totals[stat.key])}{" "}
                                            <em>
                                                (+eq{" "}
                                                {displayNumber(
                                                    partialStatTotal(
                                                        equippedBonuses,
                                                        stat.key,
                                                    ),
                                                )}
                                                )
                                            </em>
                                        </strong>
                                        {renderStatBreakdown(stat.key)}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="skills-panel glass-panel">
                <h3>Skills</h3>
                <SkillList
                    title="Active"
                    skills={activeSkills}
                    onChange={(skillId, updater) =>
                        onUpdate((current) => ({
                            ...current,
                            skills: current.skills.map((skill) =>
                                skill.id === skillId ? updater(skill) : skill,
                            ),
                        }))
                    }
                />
                <SkillList
                    title="Passive"
                    skills={passiveSkills}
                    onChange={(skillId, updater) =>
                        onUpdate((current) => ({
                            ...current,
                            skills: current.skills.map((skill) =>
                                skill.id === skillId ? updater(skill) : skill,
                            ),
                        }))
                    }
                />
            </section>

            <section className="items-panel glass-panel">
                <h3>Items</h3>
                <div className="quick-add-row">
                    <label>
                        Quick add item
                        <input
                            type="search"
                            value={itemSearch}
                            placeholder="Search item compendium..."
                            onChange={(event) =>
                                setItemSearch(event.target.value)
                            }
                        />
                    </label>
                    {itemSearch.trim() ? (
                        <div className="quick-add-results">
                            {filteredQuickItems.length ? (
                                filteredQuickItems.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className="secondary"
                                        onClick={() =>
                                            addItemFromDefinitionToSheet(item)
                                        }
                                    >
                                        + {item.name} · T{item.tier} ·{" "}
                                        {item.rarity}
                                    </button>
                                ))
                            ) : (
                                <span className="muted small">
                                    No matching items.
                                </span>
                            )}
                        </div>
                    ) : null}
                </div>
                <p className="muted small">
                    Stat bonus limits: 3 armor, 3 accessories, 2 weapons. Item
                    skill slots equal current tier. Item Skills Set:{" "}
                    {itemSkillsSet}/{itemSkillLimit}.
                </p>
                <div className="item-grid">
                    {character.items.length ? (
                        character.items.map((item) => (
                            <article key={item.id} className="item-card">
                                <div className="item-card-header">
                                    <strong>{item.name}</strong>
                                    <span className={rarityClass(item.rarity)}>
                                        {item.rarity}
                                    </span>
                                </div>
                                <p>
                                    Tier {item.tier ?? 1} · {item.slot}
                                    {item.equipped
                                        ? itemBonusApplies(
                                              character.items,
                                              item.id,
                                          )
                                            ? " · equipped"
                                            : " · equipped beyond stat cap"
                                        : " · inventory"}
                                </p>
                                <label className="toggle-row">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(item.equipped)}
                                        onChange={() =>
                                            toggleItemEquipped(item.id)
                                        }
                                    />
                                    Equipped
                                </label>
                                {(item.skillNames?.length
                                    ? item.skillNames
                                    : item.skillName
                                      ? [item.skillName]
                                      : []
                                ).length ? (
                                    <div className="item-skill-list">
                                        {(item.skillNames?.length
                                            ? item.skillNames
                                            : item.skillName
                                              ? [item.skillName]
                                              : []
                                        ).map((skillName) => (
                                            <label
                                                key={skillName}
                                                className="toggle-row"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(
                                                        item.setSkillNames?.includes(
                                                            skillName,
                                                        ) ||
                                                        (item.skillSet &&
                                                            item.skillName ===
                                                                skillName),
                                                    )}
                                                    onChange={() =>
                                                        toggleItemSkill(
                                                            item.id,
                                                            skillName,
                                                        )
                                                    }
                                                />
                                                Set skill: {skillName}
                                            </label>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="muted small">
                                        No item skill.
                                    </p>
                                )}
                                {item.description || item.notes ? (
                                    <p className="small">
                                        {item.description ?? item.notes}
                                    </p>
                                ) : null}
                            </article>
                        ))
                    ) : (
                        <p className="muted">No items recorded.</p>
                    )}
                </div>
            </section>

            <section className="items-panel glass-panel">
                <h3>Currencies</h3>
                <div className="item-grid">
                    {character.currencies.length ? (
                        character.currencies.map((charCurrency) => {
                            const def = currencyDefinitions.find(
                                (d) => d.id === charCurrency.currencyId,
                            );
                            return (
                                <article
                                    key={charCurrency.id}
                                    className="item-card"
                                >
                                    <div className="item-card-header">
                                        <strong>
                                            {def?.name ?? "Unknown Currency"}
                                        </strong>
                                        <span style={{ fontWeight: "bold" }}>
                                            {def?.symbol ?? "?"}
                                        </span>
                                    </div>
                                    <div className="stepper-control">
                                        <span className="stepper-label">
                                            Quantity
                                        </span>
                                        <span className="stepper-row">
                                            <button
                                                type="button"
                                                className="stepper-btn"
                                                disabled={
                                                    charCurrency.quantity <= 0
                                                }
                                                onClick={() => {
                                                    onUpdate((current) => ({
                                                        ...current,
                                                        currencies:
                                                            current.currencies.map(
                                                                (c) =>
                                                                    c.id ===
                                                                    charCurrency.id
                                                                        ? {
                                                                              ...c,
                                                                              quantity:
                                                                                  Math.max(
                                                                                      0,
                                                                                      c.quantity -
                                                                                          1,
                                                                                  ),
                                                                          }
                                                                        : c,
                                                            ),
                                                    }));
                                                }}
                                                aria-label="Decrease quantity"
                                            >
                                                −
                                            </button>
                                            <span className="stepper-value">
                                                {charCurrency.quantity}
                                            </span>
                                            <button
                                                type="button"
                                                className="stepper-btn"
                                                disabled={
                                                    charCurrency.quantity >=
                                                    99999998
                                                }
                                                onClick={() => {
                                                    onUpdate((current) => ({
                                                        ...current,
                                                        currencies:
                                                            current.currencies.map(
                                                                (c) =>
                                                                    c.id ===
                                                                    charCurrency.id
                                                                        ? {
                                                                              ...c,
                                                                              quantity:
                                                                                  c.quantity +
                                                                                  1,
                                                                          }
                                                                        : c,
                                                            ),
                                                    }));
                                                }}
                                                aria-label="Increase quantity"
                                            >
                                                +
                                            </button>
                                        </span>
                                    </div>
                                    {def?.description ? (
                                        <p className="small muted">
                                            {def.description}
                                        </p>
                                    ) : null}
                                    <div className="toolbar compact">
                                        <button
                                            type="button"
                                            className="danger"
                                            onClick={() => {
                                                onUpdate((current) => ({
                                                    ...current,
                                                    currencies:
                                                        current.currencies.filter(
                                                            (c) =>
                                                                c.id !==
                                                                charCurrency.id,
                                                        ),
                                                }));
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </article>
                            );
                        })
                    ) : (
                        <p className="muted">No currencies recorded.</p>
                    )}
                </div>
                {currencyDefinitions.length ? (
                    <div className="toolbar compact">
                        <label
                            className="small muted"
                            style={{ marginRight: "8px" }}
                        >
                            Add from compendium:
                        </label>
                        <select
                            value=""
                            onChange={(event) => {
                                const currencyId = event.target.value;
                                if (!currencyId) return;
                                onUpdate((current) => ({
                                    ...current,
                                    currencies: [
                                        ...current.currencies,
                                        {
                                            id: makeId("character-currency"),
                                            currencyId,
                                            quantity: 0,
                                        },
                                    ],
                                }));
                            }}
                        >
                            <option value="">— select —</option>
                            {currencyDefinitions.map((def) => (
                                <option key={def.id} value={def.id}>
                                    {def.name} ({def.symbol})
                                </option>
                            ))}
                        </select>
                    </div>
                ) : null}
            </section>
        </div>
    );
}

interface TrackProgressProps {
    label: string;
    track: LevelTrack;
    onStep?: (direction: 1 | -1) => void;
}

function TrackProgress({ label, track, onStep }: TrackProgressProps) {
    return (
        <div className="track-progress">
            <div className="track-title">
                <span>
                    {label}: {track.name}
                </span>
                <span className={rarityClass(track.rarity)}>
                    {track.rarity}
                </span>
            </div>
            <span className="muted small">
                Level {track.level} / {track.maxLevel}
            </span>
            {onStep ? (
                <ProgressionControls
                    levelLabel={``}
                    exp={track.exp}
                    onDecrease={() => onStep(-1)}
                    onIncrease={() => onStep(1)}
                    decreaseDisabled={track.level <= 1 && track.exp <= 0}
                    increaseDisabled={
                        track.level >= track.maxLevel && track.exp >= 100
                    }
                />
            ) : null}
        </div>
    );
}

function SkillList({
    title,
    skills,
    onChange,
}: {
    title: string;
    skills: Skill[];
    onChange: (skillId: string, updater: (skill: Skill) => Skill) => void;
}) {
    return (
        <div className="skill-list">
            <h4>{title}</h4>
            {skills.length ? (
                skills.map((skill) => {
                    const isItemProvided = skill.id.startsWith("item-skill-");

                    return (
                        <article key={skill.id} className="skill-card">
                            <div className="skill-card-header">
                                <strong>{skill.name}</strong>
                                <span className={rarityClass(skill.rarity)}>
                                    {skill.rarity}
                                </span>
                            </div>
                            <p>{skill.description || "No description yet."}</p>
                            <p className="small muted">
                                {skill.source} · MP {skill.mpCost || "N/A"} ·
                                Cooldown {skill.cooldown || "N/A"}
                            </p>
                            {isItemProvided ? (
                                <p className="small muted">
                                    Provided by a set item skill.
                                </p>
                            ) : (
                                <ProgressionControls
                                    levelLabel={`Level ${skill.level ?? 1}`}
                                    exp={skill.exp}
                                    onDecrease={() =>
                                        onChange(skill.id, (current) =>
                                            stepSkillExperience(current, -1),
                                        )
                                    }
                                    onIncrease={() =>
                                        onChange(skill.id, (current) =>
                                            stepSkillExperience(current, 1),
                                        )
                                    }
                                    decreaseDisabled={
                                        (skill.level ?? 1) <= 1 &&
                                        skill.exp <= 0
                                    }
                                />
                            )}
                        </article>
                    );
                })
            ) : (
                <p className="muted small">
                    No {title.toLowerCase()} skills recorded.
                </p>
            )}
        </div>
    );
}

function ProgressionControls({
    levelLabel,
    exp,
    onDecrease,
    onIncrease,
    decreaseDisabled = false,
    increaseDisabled = false,
}: {
    levelLabel: string;
    exp: number;
    onDecrease: () => void;
    onIncrease: () => void;
    decreaseDisabled?: boolean;
    increaseDisabled?: boolean;
}) {
    const filledStages = Math.round(clampPercent(exp) / EXP_STAGE_SIZE);

    return (
        <div
            className="progression-control"
            aria-label={`${levelLabel}, ${filledStages} of 10 experience stages filled`}
        >
            {levelLabel ? (
                <div className="progression-header">
                    <strong>{levelLabel}</strong>
                    <span>{filledStages}/10 EXP</span>
                </div>
            ) : null}
            <div className="progression-row">
                <button
                    type="button"
                    className="exp-step"
                    onClick={onDecrease}
                    disabled={decreaseDisabled}
                    aria-label="Decrease experience"
                >
                    −
                </button>
                <div className="stage-bar" aria-hidden="true">
                    {Array.from({ length: 10 }, (_, index) => (
                        <span
                            key={index}
                            className={index < filledStages ? "filled" : ""}
                        />
                    ))}
                </div>
                <button
                    type="button"
                    className="exp-step"
                    onClick={onIncrease}
                    disabled={increaseDisabled}
                    aria-label="Increase experience"
                >
                    +
                </button>
            </div>
        </div>
    );
}

interface CreatorWizardProps {
    draft: Character;
    step: WizardStep;
    players: Player[];
    definitions: AdvancementDefinition[];
    tierDefinitions: TierDefinition[];
    characterTypeDefinitions: CharacterTypeDefinition[];
    rarityDefinitions: RarityDefinition[];
    skillDefinitions: SkillDefinition[];
    itemDefinitions: ItemDefinition[];
    affinityDefinitions: AffinityDefinition[];
    onStep: (step: WizardStep) => void;
    onDraft: (updater: (current: Character) => Character) => void;
    onCancel: () => void;
    onSave: () => void;
}

function CreatorWizard({
    draft,
    step,
    players,
    definitions,
    tierDefinitions,
    characterTypeDefinitions,
    rarityDefinitions,
    skillDefinitions,
    itemDefinitions,
    affinityDefinitions,
    onStep,
    onDraft,
    onCancel,
    onSave,
}: CreatorWizardProps) {
    const steps: Array<{ key: WizardStepKey; label: string }> = [
        { key: "identity", label: "Identity" },
        { key: "progression", label: "Progression" },
        { key: "skills", label: "Skills" },
        { key: "items", label: "Items" },
        { key: "review", label: "Review" },
    ];
    const currentStepIndex = Math.min(step, steps.length - 1);
    const currentStep = steps[currentStepIndex]?.key ?? "identity";

    function setKind(kind: CharacterKind): void {
        onDraft((current) => {
            const normalized = normalizeProgression(
                { ...current, kind },
                tierDefinitions,
            );
            return normalized;
        });
    }

    function setHalfFocus(focus: HalfMonsterFocus): void {
        onDraft((current) =>
            normalizeProgression(
                { ...current, halfMonsterFocus: focus },
                tierDefinitions,
            ),
        );
    }

    function setCurrentTier(tier: number): void {
        onDraft((current) => {
            const targetTier = finiteInteger(
                tier,
                current.currentTier,
                1,
                maxConfiguredTier(tierDefinitions),
            );

            // Build tier history from 1 to targetTier
            const newTiers: TierProgression[] = [];
            for (let t = 1; t <= targetTier; t++) {
                const isCurrent = t === targetTier;

                if (t === 1) {
                    // First tier always has a race
                    const raceDefinitionId =
                        current.kind === "monster"
                            ? "definition-race-rabbit"
                            : current.kind === "half-monster"
                              ? "definition-race-half-fox"
                              : "definition-race-human";
                    const raceName =
                        current.kind === "monster"
                            ? "Rabbit"
                            : current.kind === "half-monster"
                              ? "Half-Fox"
                              : "Human";
                    const raceRarity: Rarity =
                        current.kind === "half-monster" ? "Uncommon" : "Common";

                    newTiers.push({
                        tier: t,
                        status: isCurrent ? "current" : "completed",
                        race: {
                            definitionId: raceDefinitionId,
                            name: raceName,
                            rarity: raceRarity,
                            level: maxLevelForTier(tierDefinitions, t),
                            exp: 100,
                        },
                        classTrack:
                            current.kind === "humanoid" ||
                            (current.kind === "half-monster" &&
                                current.halfMonsterFocus !== "job")
                                ? {
                                      name: "Page",
                                      rarity: "Common",
                                      level: isCurrent
                                          ? 1
                                          : maxLevelForTier(tierDefinitions, t),
                                  }
                                : undefined,
                        jobTrack:
                            current.kind === "humanoid" ||
                            (current.kind === "half-monster" &&
                                current.halfMonsterFocus === "job")
                                ? {
                                      name: "Apprentice Apothecary",
                                      rarity: "Common",
                                      level: isCurrent
                                          ? 1
                                          : maxLevelForTier(tierDefinitions, t),
                                  }
                                : undefined,
                    });
                } else if (isCurrent) {
                    // Current tier - use existing selections or defaults
                    const prevTier = newTiers[t - 2];
                    newTiers.push({
                        tier: t,
                        status: "current",
                        race: { ...prevTier.race, level: 1, exp: 0 },
                        classTrack: prevTier.classTrack
                            ? { ...prevTier.classTrack, level: 1 }
                            : undefined,
                        jobTrack: prevTier.jobTrack
                            ? { ...prevTier.jobTrack, level: 1 }
                            : undefined,
                    });
                } else {
                    // Previous tiers - copy from existing or create defaults
                    const existing = current.tiers.find(
                        (tData) => tData.tier === t,
                    );
                    if (existing) {
                        const maxLevel = maxLevelForTier(tierDefinitions, t);
                        newTiers.push({
                            ...existing,
                            status: "completed" as const,
                            classTrack: existing.classTrack
                                ? { ...existing.classTrack, level: maxLevel }
                                : undefined,
                            jobTrack: existing.jobTrack
                                ? { ...existing.jobTrack, level: maxLevel }
                                : undefined,
                        });
                    } else {
                        const prevTier = newTiers[t - 2];
                        newTiers.push({
                            tier: t,
                            status: "completed",
                            race: {
                                ...prevTier.race,
                                level: maxLevelForTier(tierDefinitions, t),
                                exp: 100,
                            },
                            classTrack: prevTier.classTrack
                                ? {
                                      ...prevTier.classTrack,
                                      level: maxLevelForTier(
                                          tierDefinitions,
                                          t,
                                      ),
                                  }
                                : undefined,
                            jobTrack: prevTier.jobTrack
                                ? {
                                      ...prevTier.jobTrack,
                                      level: maxLevelForTier(
                                          tierDefinitions,
                                          t,
                                      ),
                                  }
                                : undefined,
                        });
                    }
                }
            }

            return { ...current, currentTier: targetTier, tiers: newTiers };
        });
    }

    function updateCurrentTierRace(
        updater: (
            race: TierTrackSelection & { level: number; exp: number },
        ) => TierTrackSelection & { level: number; exp: number },
    ): void {
        onDraft((current) => {
            const currentTierData = current.tiers.find(
                (t) => t.status === "current",
            );
            if (!currentTierData) return current;

            const newTiers = current.tiers.map((t) =>
                t.status === "current" ? { ...t, race: updater(t.race) } : t,
            );

            return { ...current, tiers: newTiers };
        });
    }

    function assignRaceDefinition(
        definition: AdvancementDefinition,
        targetTier?: number,
    ): void {
        onDraft((current) => {
            if (definition.kind !== "race") return current;

            const newTiers = current.tiers.map((t) => {
                if (targetTier === undefined && t.status !== "current")
                    return t;
                if (targetTier !== undefined && t.tier !== targetTier) return t;
                // Completed tiers keep their maxed-out level; only the current tier starts at 1.
                const isCompleted = t.status === "completed";
                return {
                    ...t,
                    race: {
                        ...definition,
                        level: isCompleted
                            ? maxLevelForTier(tierDefinitions, t.tier)
                            : 1,
                        exp: isCompleted ? 100 : 0,
                    },
                };
            });

            return { ...current, tiers: newTiers };
        });
    }

    function assignClassDefinition(
        definition: AdvancementDefinition,
        targetTier?: number,
    ): void {
        onDraft((current) => {
            if (definition.kind !== "class") return current;

            const newTiers = current.tiers.map((t) => {
                if (targetTier === undefined && t.status !== "current")
                    return t;
                if (targetTier !== undefined && t.tier !== targetTier) return t;
                // Completed tiers keep their maxed-out level.
                const isCompleted = t.status === "completed";
                const level = isCompleted
                    ? maxLevelForTier(tierDefinitions, t.tier)
                    : (t.classTrack?.level ?? 1);
                return {
                    ...t,
                    classTrack: { ...definition, level },
                };
            });

            return { ...current, tiers: newTiers };
        });
    }

    function assignJobDefinition(
        definition: AdvancementDefinition,
        targetTier?: number,
    ): void {
        onDraft((current) => {
            if (definition.kind !== "job") return current;

            const newTiers = current.tiers.map((t) => {
                if (targetTier === undefined && t.status !== "current")
                    return t;
                if (targetTier !== undefined && t.tier !== targetTier) return t;
                // Completed tiers keep their maxed-out level.
                const isCompleted = t.status === "completed";
                const level = isCompleted
                    ? maxLevelForTier(tierDefinitions, t.tier)
                    : (t.jobTrack?.level ?? 1);
                return {
                    ...t,
                    jobTrack: { ...definition, level },
                };
            });

            return { ...current, tiers: newTiers };
        });
    }

    function adjustLevel(
        targetTier: number,
        trackKey: "race" | "classTrack" | "jobTrack",
        delta: 1 | -1,
    ): void {
        onDraft((current) => {
            const newTiers = current.tiers.map((t) => {
                if (t.tier !== targetTier) return t;

                if (trackKey === "race") {
                    // Humanoid race level is auto-calculated, so +/- does nothing.
                    if (current.kind === "humanoid") return t;
                    const maxLevel = maxLevelForTier(
                        tierDefinitions,
                        targetTier,
                    );
                    const level = Math.max(
                        1,
                        Math.min(maxLevel, t.race.level + delta),
                    );
                    return { ...t, race: { ...t.race, level } };
                }

                if (trackKey === "classTrack") {
                    if (!t.classTrack) return t;
                    const maxLevel = maxLevelForTier(
                        tierDefinitions,
                        targetTier,
                    );
                    const newClassLevel = Math.max(
                        1,
                        Math.min(maxLevel, (t.classTrack.level ?? 1) + delta),
                    );
                    let classTrack = { ...t.classTrack, level: newClassLevel };

                    // For humanoids, recalculate race level from class+job average.
                    if (current.kind === "humanoid") {
                        const jobLevel = t.jobTrack?.level ?? 1;
                        const raceLevel = Math.min(
                            maxLevel,
                            Math.max(
                                1,
                                Math.floor((newClassLevel + jobLevel) / 2),
                            ),
                        );
                        return {
                            ...t,
                            classTrack,
                            race: { ...t.race, level: raceLevel },
                        };
                    }

                    return { ...t, classTrack };
                }

                if (!t.jobTrack) return t;
                const maxLevel = maxLevelForTier(tierDefinitions, targetTier);
                const newJobLevel = Math.max(
                    1,
                    Math.min(maxLevel, (t.jobTrack.level ?? 1) + delta),
                );
                let jobTrack = { ...t.jobTrack, level: newJobLevel };

                // For humanoids, recalculate race level from class+job average.
                if (current.kind === "humanoid") {
                    const classLevel = t.classTrack?.level ?? 1;
                    const raceLevel = Math.min(
                        maxLevel,
                        Math.max(1, Math.floor((classLevel + newJobLevel) / 2)),
                    );
                    return {
                        ...t,
                        jobTrack,
                        race: { ...t.race, level: raceLevel },
                    };
                }

                return { ...t, jobTrack };
            });

            return { ...current, tiers: newTiers };
        });
    }

    function addSkill(kind: SkillKind): void {
        const skill: Skill = {
            id: makeId("skill"),
            name: kind === "Active" ? "New Active Skill" : "New Passive Skill",
            kind,
            source: "Race",
            rarity: "Common",
            level: 1,
            exp: 0,
            mpCost: kind === "Active" ? "1 MP" : "N/A",
            castingTime: kind === "Active" ? "Instant" : "N/A",
            cooldown: kind === "Active" ? "None" : "N/A",
            description: "",
        };
        onDraft((current) => ({
            ...current,
            skills: [...current.skills, skill],
        }));
    }

    function addSkillFromDefinition(definition: SkillDefinition): void {
        onDraft((current) => ({
            ...current,
            skills: [...current.skills, skillFromDefinition(definition)],
        }));
    }

    function updateSkill(
        skillId: string,
        updater: (skill: Skill) => Skill,
    ): void {
        onDraft((current) => ({
            ...current,
            skills: current.skills.map((skill) =>
                skill.id === skillId ? updater(skill) : skill,
            ),
        }));
    }

    function removeSkill(skillId: string): void {
        onDraft((current) => ({
            ...current,
            skills: current.skills.filter((skill) => skill.id !== skillId),
        }));
    }

    function addItem(): void {
        const item: Item = {
            id: makeId("item"),
            name: "New Item",
            slot: "Armor",
            rarity: "Common",
            statBonuses: {},
            skillName: "",
            skillSet: false,
            notes: "",
        };
        onDraft((current) => ({ ...current, items: [...current.items, item] }));
    }

    function addItemFromDefinition(definition: ItemDefinition): void {
        onDraft((current) => ({
            ...current,
            items: [
                ...current.items,
                itemFromDefinition(
                    definition,
                    skillDefinitions,
                    tierDefinitions,
                    rarityDefinitions,
                ),
            ],
        }));
    }

    function updateItem(itemId: string, updater: (item: Item) => Item): void {
        onDraft((current) => ({
            ...current,
            items: current.items.map((item) =>
                item.id === itemId ? updater(item) : item,
            ),
        }));
    }

    function removeItem(itemId: string): void {
        onDraft((current) => ({
            ...current,
            items: current.items.filter((item) => item.id !== itemId),
        }));
    }

    const currentTierRule = tierDefinition(tierDefinitions, draft.currentTier);
    const [skillFilter, setSkillFilter] = useState("");
    const filteredSkillDefinitions = useMemo(() => {
        const byTier = skillDefinitions.filter(
            (d) => d.minTier <= draft.currentTier,
        );
        if (!skillFilter) return byTier;
        return byTier.filter((d) =>
            d.name.toLowerCase().includes(skillFilter.toLowerCase()),
        );
    }, [skillDefinitions, draft.currentTier, skillFilter]);
    const [itemFilter, setItemFilter] = useState("");
    const filteredItemDefinitions = useMemo(() => {
        const byTier = itemDefinitions.filter(
            (d) => d.tier <= draft.currentTier && d.rarity !== "Common",
        );
        if (!itemFilter) return byTier;
        return byTier.filter((d) =>
            d.name.toLowerCase().includes(itemFilter.toLowerCase()),
        );
    }, [itemDefinitions, draft.currentTier, itemFilter]);

    function renderTrackStatSummary(
        track:
            | {
                  level?: number;
                  definitionId?: string;
                  name?: string;
                  statWeights?: Partial<StatBlock>;
              }
            | null
            | undefined,
        kind: DefinitionKind,
        assignedTier: number,
    ): JSX.Element | null {
        if (typeof track?.level !== "number") return null;
        const definition =
            findDefinitionByTrack(
                definitions,
                kind,
                track.name,
                track.definitionId,
            ) ??
            ((track as any)?.statWeights
                ? ({
                      id: track.definitionId ?? makeId("definition-preview"),
                      kind,
                      name: track.name ?? "Preview Track",
                      rarity: (track as any).rarity ?? "Common",
                      minTier: 1,
                      statWeights: (track as any).statWeights,
                      description: "",
                      notes: "",
                  } satisfies AdvancementDefinition)
                : null);
        if (!definition) return null;
        const singleLevelGain = distributedStatGain(
            draft,
            definition,
            assignedTier,
            tierDefinitions,
            characterTypeDefinitions,
            rarityDefinitions,
        );
        const totalGain = scaledStatGain(singleLevelGain, track.level);
        const bonuses = statKeys
            .map((key) => ({
                label: STAT_LABELS[key],
                value: Math.round(partialStatTotal(totalGain, key) * 100) / 100,
            }))
            .filter((entry) => entry.value > 0);
        if (!bonuses.length) return null;
        return (
            <div className="tier-stat-summary">
                {bonuses.map(({ label, value }) => (
                    <span key={label} className="tier-stat-bonus">
                        +{value} {label}
                    </span>
                ))}
            </div>
        );
    }

    return (
        <section className="creator glass-panel">
            <header className="creator-header">
                <div>
                    <p className="eyebrow">Guided System registration</p>
                    <h2>{draft.name || "New Character"}</h2>
                </div>
                <div className="toolbar compact">
                    <button
                        type="button"
                        className="secondary"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button type="button" onClick={onSave}>
                        Save Character
                    </button>
                </div>
            </header>

            <ol className="wizard-steps">
                {steps.map((label, index) => (
                    <li
                        key={label.key}
                        className={currentStepIndex === index ? "active" : ""}
                    >
                        <button type="button" onClick={() => onStep(index)}>
                            {index + 1}. {label.label}
                        </button>
                    </li>
                ))}
            </ol>

            {currentStep === "identity" ? (
                <div className="form-grid two-col">
                    <label>
                        Name
                        <input
                            value={draft.name}
                            onChange={(event) =>
                                onDraft((current) => ({
                                    ...current,
                                    name: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label>
                        Player / Table
                        <select
                            value={draft.playerId}
                            onChange={(event) =>
                                onDraft((current) => ({
                                    ...current,
                                    playerId: event.target.value,
                                }))
                            }
                        >
                            {players.map((player) => (
                                <option key={player.id} value={player.id}>
                                    {player.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Character Type
                        <select
                            value={draft.kind}
                            onChange={(event) =>
                                setKind(event.target.value as CharacterKind)
                            }
                        >
                            {characterKinds.map((kind) => (
                                <option key={kind} value={kind}>
                                    {titleCase(kind)}
                                </option>
                            ))}
                        </select>
                    </label>
                    {draft.kind === "half-monster" ? (
                        <label>
                            Half-Monster Choice
                            <select
                                value={draft.halfMonsterFocus ?? "class"}
                                onChange={(event) =>
                                    setHalfFocus(
                                        event.target.value as HalfMonsterFocus,
                                    )
                                }
                            >
                                <option value="class">Class only</option>
                                <option value="job">Job only</option>
                            </select>
                        </label>
                    ) : null}
                    <label>
                        Current Tier
                        <select
                            value={draft.currentTier}
                            onChange={(event) =>
                                setCurrentTier(
                                    finiteInteger(
                                        event.target.value,
                                        draft.currentTier,
                                        1,
                                        maxConfiguredTier(tierDefinitions),
                                    ),
                                )
                            }
                        >
                            {tierDefinitions.map((rule) => (
                                <option key={rule.tier} value={rule.tier}>
                                    T{String(rule.tier).padStart(2, "0")} ·{" "}
                                    {rule.title} · max {rule.maxLevel}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="rule-card full-width">
                        <strong>{currentTierRule.title}</strong>
                        <p>{currentTierRule.details}</p>
                    </div>
                    <fieldset className="full-width affinity-picker-fieldset">
                        <legend>Affinities</legend>
                        <div className="affinity-picker">
                            {affinityDefinitions.map((aff) => {
                                const active = draft.affinities.includes(
                                    aff.name,
                                );
                                return (
                                    <button
                                        key={aff.id}
                                        type="button"
                                        className={`affinity-tag ${active ? "active" : ""}`}
                                        style={{
                                            backgroundColor: active
                                                ? aff.color
                                                : "transparent",
                                            color: active
                                                ? "#05070d"
                                                : aff.color,
                                            borderColor: aff.color,
                                        }}
                                        onClick={() =>
                                            onDraft((current) => ({
                                                ...current,
                                                affinities: active
                                                    ? current.affinities.filter(
                                                          (a) => a !== aff.name,
                                                      )
                                                    : [
                                                          ...current.affinities,
                                                          aff.name,
                                                      ],
                                            }))
                                        }
                                    >
                                        <span className="affinity-dot">
                                            {aff.emoji ?? aff.name.charAt(0)}
                                        </span>
                                        {aff.name}
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>
                    <label>
                        Age
                        <input
                            value={draft.age}
                            onChange={(event) =>
                                onDraft((current) => ({
                                    ...current,
                                    age: event.target.value,
                                }))
                            }
                            placeholder="0 (20)"
                        />
                    </label>
                    <label>
                        Size
                        <input
                            value={draft.size}
                            onChange={(event) =>
                                onDraft((current) => ({
                                    ...current,
                                    size: event.target.value,
                                }))
                            }
                            placeholder="Small, Medium, Large..."
                        />
                    </label>
                    <label>
                        Build
                        <input
                            value={draft.build}
                            onChange={(event) =>
                                onDraft((current) => ({
                                    ...current,
                                    build: event.target.value,
                                }))
                            }
                            placeholder="Lean, sturdy, athletic..."
                        />
                    </label>
                    <label>
                        Pronouns
                        <input
                            value={draft.pronouns}
                            onChange={(event) =>
                                onDraft((current) => ({
                                    ...current,
                                    pronouns: event.target.value,
                                }))
                            }
                            placeholder="they/them, she/her, he/him..."
                        />
                    </label>
                    <label>
                        Gender
                        <input
                            value={draft.gender}
                            onChange={(event) =>
                                onDraft((current) => ({
                                    ...current,
                                    gender: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label>
                        Sexual Preference
                        <input
                            value={draft.sexualPreference}
                            onChange={(event) =>
                                onDraft((current) => ({
                                    ...current,
                                    sexualPreference: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <label className="full-width">
                        Appearance
                        <textarea
                            value={draft.appearance}
                            onChange={(event) =>
                                onDraft((current) => ({
                                    ...current,
                                    appearance: event.target.value,
                                }))
                            }
                            placeholder="Physical appearance, clothing, markings, aura..."
                        />
                    </label>
                    <label className="full-width">
                        Notes
                        <textarea
                            value={draft.notes}
                            onChange={(event) =>
                                onDraft((current) => ({
                                    ...current,
                                    notes: event.target.value,
                                }))
                            }
                            placeholder="Backstory, mental age, System quirks, table rulings..."
                        />
                    </label>
                </div>
            ) : null}

            {currentStep === "progression" ? (
                <div className="form-grid two-col">
                    {/* Left column — compact tier slots */}
                    <div className="tier-slots-panel">
                        {draft.tiers.map((tierData) => (
                            <fieldset
                                key={tierData.tier}
                                className={`tier-slot ${tierData.status === "current" ? "" : "completed-tier"}`}
                            >
                                <legend>
                                    Tier {tierData.tier}{" "}
                                    {tierData.status === "current"
                                        ? "(Current)"
                                        : "(Maxed)"}
                                </legend>
                                <p className="muted small">
                                    Static tier bonus: +
                                    {displayNumber(
                                        tierDefinition(
                                            tierDefinitions,
                                            tierData.tier,
                                        ).staticBonus,
                                    )}{" "}
                                    to all stats
                                </p>

                                {/* Race slot */}
                                <div
                                    className="drop-zone tier-track-slot"
                                    onDragOver={(event) =>
                                        event.preventDefault()
                                    }
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        const defId =
                                            event.dataTransfer.getData(
                                                "text/plain",
                                            );
                                        const definition = definitions.find(
                                            (d) => d.id === defId,
                                        );
                                        if (definition) {
                                            assignRaceDefinition(
                                                definition,
                                                tierData.tier,
                                            );
                                        }
                                    }}
                                >
                                    <p className="eyebrow">Race</p>
                                    <div className="track-title">
                                        <strong>{tierData.race.name}</strong>
                                        <span
                                            className={rarityClass(
                                                tierData.race.rarity,
                                            )}
                                        >
                                            {tierData.race.rarity}
                                        </span>
                                    </div>
                                    {(() => {
                                        // For humanoids, race level is auto-calculated from class+job average.
                                        const isHumanoid =
                                            draft.kind === "humanoid";
                                        let displayRaceLevel: number;

                                        if (isHumanoid) {
                                            const classLv =
                                                tierData.classTrack?.level ?? 1;
                                            const jobLv =
                                                tierData.jobTrack?.level ?? 1;
                                            displayRaceLevel = Math.min(
                                                maxLevelForTier(
                                                    tierDefinitions,
                                                    tierData.tier,
                                                ),
                                                Math.max(
                                                    1,
                                                    Math.floor(
                                                        (classLv + jobLv) / 2,
                                                    ),
                                                ),
                                            );
                                        } else {
                                            displayRaceLevel =
                                                tierData.race.level;
                                        }

                                        // Use auto-calculated level for stat summary so it tracks class/job changes.
                                        const raceTrackForStats = isHumanoid
                                            ? {
                                                  ...tierData.race,
                                                  level: displayRaceLevel,
                                              }
                                            : tierData.race;

                                        return (
                                            <>
                                                {tierData.status ===
                                                "current" ? (
                                                    <div className="level-buttons">
                                                        {!isHumanoid ? (
                                                            <button
                                                                type="button"
                                                                className="level-btn"
                                                                onClick={() =>
                                                                    adjustLevel(
                                                                        tierData.tier,
                                                                        "race",
                                                                        -1,
                                                                    )
                                                                }
                                                                disabled={
                                                                    tierData
                                                                        .race
                                                                        .level <=
                                                                    1
                                                                }
                                                            >
                                                                −
                                                            </button>
                                                        ) : null}
                                                        <span className="level-value">
                                                            Lv{" "}
                                                            {displayRaceLevel}/
                                                            {maxLevelForTier(
                                                                tierDefinitions,
                                                                tierData.tier,
                                                            )}
                                                        </span>
                                                        {!isHumanoid ? (
                                                            <button
                                                                type="button"
                                                                className="level-btn"
                                                                onClick={() =>
                                                                    adjustLevel(
                                                                        tierData.tier,
                                                                        "race",
                                                                        1,
                                                                    )
                                                                }
                                                                disabled={
                                                                    tierData
                                                                        .race
                                                                        .level >=
                                                                    maxLevelForTier(
                                                                        tierDefinitions,
                                                                        tierData.tier,
                                                                    )
                                                                }
                                                            >
                                                                +
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                                {renderTrackStatSummary(
                                                    raceTrackForStats,
                                                    "race",
                                                    tierData.tier,
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>

                                {/* Class slot — only if track exists */}
                                {tierData.classTrack ? (
                                    <div
                                        className="drop-zone tier-track-slot"
                                        onDragOver={(event) =>
                                            event.preventDefault()
                                        }
                                        onDrop={(event) => {
                                            event.preventDefault();
                                            const defId =
                                                event.dataTransfer.getData(
                                                    "text/plain",
                                                );
                                            const definition = definitions.find(
                                                (d) => d.id === defId,
                                            );
                                            if (definition) {
                                                assignClassDefinition(
                                                    definition,
                                                    tierData.tier,
                                                );
                                            }
                                        }}
                                    >
                                        <p className="eyebrow">Class</p>
                                        <div className="track-title">
                                            <strong>
                                                {tierData.classTrack.name}
                                            </strong>
                                            <span
                                                className={rarityClass(
                                                    tierData.classTrack.rarity,
                                                )}
                                            >
                                                {tierData.classTrack.rarity}
                                            </span>
                                        </div>
                                        {tierData.status === "current" ? (
                                            <div className="level-buttons">
                                                <button
                                                    type="button"
                                                    className="level-btn"
                                                    onClick={() =>
                                                        adjustLevel(
                                                            tierData.tier,
                                                            "classTrack",
                                                            -1,
                                                        )
                                                    }
                                                    disabled={
                                                        (tierData.classTrack
                                                            .level ?? 1) <= 1
                                                    }
                                                >
                                                    −
                                                </button>
                                                <span className="level-value">
                                                    Lv{" "}
                                                    {tierData.classTrack
                                                        .level ?? 1}
                                                    /
                                                    {maxLevelForTier(
                                                        tierDefinitions,
                                                        tierData.tier,
                                                    )}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="level-btn"
                                                    onClick={() =>
                                                        adjustLevel(
                                                            tierData.tier,
                                                            "classTrack",
                                                            1,
                                                        )
                                                    }
                                                    disabled={
                                                        (tierData.classTrack
                                                            .level ?? 1) >=
                                                        maxLevelForTier(
                                                            tierDefinitions,
                                                            tierData.tier,
                                                        )
                                                    }
                                                >
                                                    +
                                                </button>
                                            </div>
                                        ) : null}
                                        {renderTrackStatSummary(
                                            tierData.classTrack,
                                            "class",
                                            tierData.tier,
                                        )}
                                    </div>
                                ) : null}

                                {/* Job slot — only if track exists */}
                                {tierData.jobTrack ? (
                                    <div
                                        className="drop-zone tier-track-slot"
                                        onDragOver={(event) =>
                                            event.preventDefault()
                                        }
                                        onDrop={(event) => {
                                            event.preventDefault();
                                            const defId =
                                                event.dataTransfer.getData(
                                                    "text/plain",
                                                );
                                            const definition = definitions.find(
                                                (d) => d.id === defId,
                                            );
                                            if (definition) {
                                                assignJobDefinition(
                                                    definition,
                                                    tierData.tier,
                                                );
                                            }
                                        }}
                                    >
                                        <p className="eyebrow">Job</p>
                                        <div className="track-title">
                                            <strong>
                                                {tierData.jobTrack.name}
                                            </strong>
                                            <span
                                                className={rarityClass(
                                                    tierData.jobTrack.rarity,
                                                )}
                                            >
                                                {tierData.jobTrack.rarity}
                                            </span>
                                        </div>
                                        {tierData.status === "current" ? (
                                            <div className="level-buttons">
                                                <button
                                                    type="button"
                                                    className="level-btn"
                                                    onClick={() =>
                                                        adjustLevel(
                                                            tierData.tier,
                                                            "jobTrack",
                                                            -1,
                                                        )
                                                    }
                                                    disabled={
                                                        (tierData.jobTrack
                                                            .level ?? 1) <= 1
                                                    }
                                                >
                                                    −
                                                </button>
                                                <span className="level-value">
                                                    Lv{" "}
                                                    {tierData.jobTrack.level ??
                                                        1}
                                                    /
                                                    {maxLevelForTier(
                                                        tierDefinitions,
                                                        tierData.tier,
                                                    )}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="level-btn"
                                                    onClick={() =>
                                                        adjustLevel(
                                                            tierData.tier,
                                                            "jobTrack",
                                                            1,
                                                        )
                                                    }
                                                    disabled={
                                                        (tierData.jobTrack
                                                            .level ?? 1) >=
                                                        maxLevelForTier(
                                                            tierDefinitions,
                                                            tierData.tier,
                                                        )
                                                    }
                                                >
                                                    +
                                                </button>
                                            </div>
                                        ) : null}
                                        {renderTrackStatSummary(
                                            tierData.jobTrack,
                                            "job",
                                            tierData.tier,
                                        )}
                                    </div>
                                ) : null}
                            </fieldset>
                        ))}
                    </div>

                    {/* Right column — shared source panels */}
                    <div className="source-panel-stack">
                        <div className="available-definition-panel">
                            <p className="eyebrow">Available Races</p>
                            <div className="definition-card-list">
                                {definitions
                                    .filter(
                                        (d) =>
                                            d.kind === "race" &&
                                            (d.raceType ?? "humanoid") ===
                                                draft.kind,
                                    )
                                    .map((definition) => (
                                        <DefinitionChipWithTooltip
                                            key={definition.id}
                                            definition={definition}
                                            onDragStart={(event) =>
                                                event.dataTransfer.setData(
                                                    "text/plain",
                                                    definition.id,
                                                )
                                            }
                                        />
                                    ))}
                            </div>
                        </div>

                        {draft.tiers.some((t) => t.classTrack) ? (
                            <div className="available-definition-panel">
                                <p className="eyebrow">Available Classes</p>
                                <div className="definition-card-list">
                                    {definitions
                                        .filter(
                                            (d) =>
                                                d.kind === "class" &&
                                                d.minTier <= draft.currentTier,
                                        )
                                        .map((definition) => (
                                            <DefinitionChipWithTooltip
                                                key={definition.id}
                                                definition={definition}
                                                onDragStart={(event) =>
                                                    event.dataTransfer.setData(
                                                        "text/plain",
                                                        definition.id,
                                                    )
                                                }
                                            />
                                        ))}
                                    {!definitions.filter(
                                        (d) =>
                                            d.kind === "class" &&
                                            d.minTier <= draft.currentTier,
                                    ).length ? (
                                        <p className="muted small">
                                            No available class templates.
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}

                        {draft.tiers.some((t) => t.jobTrack) ? (
                            <div className="available-definition-panel">
                                <p className="eyebrow">Available Jobs</p>
                                <div className="definition-card-list">
                                    {definitions
                                        .filter(
                                            (d) =>
                                                d.kind === "job" &&
                                                d.minTier <= draft.currentTier,
                                        )
                                        .map((definition) => (
                                            <DefinitionChipWithTooltip
                                                key={definition.id}
                                                definition={definition}
                                                onDragStart={(event) =>
                                                    event.dataTransfer.setData(
                                                        "text/plain",
                                                        definition.id,
                                                    )
                                                }
                                            />
                                        ))}
                                    {!definitions.filter(
                                        (d) =>
                                            d.kind === "job" &&
                                            d.minTier <= draft.currentTier,
                                    ).length ? (
                                        <p className="muted small">
                                            No available job templates.
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {currentStep === "skills" ? (
                <div className="creator-detail-grid">
                    <section>
                        <div className="skill-source-list creator-skills-panel">
                            <p className="eyebrow">
                                Available Skills (Tier {draft.currentTier} and
                                below)
                            </p>
                            <input
                                className="skill-filter-input"
                                type="text"
                                placeholder="Filter skills..."
                                value={skillFilter}
                                onChange={(event) =>
                                    setSkillFilter(event.target.value)
                                }
                            />
                            <div className="definition-card-list compact-list">
                                {filteredSkillDefinitions.map((definition) => (
                                    <SkillChipWithTooltip
                                        key={definition.id}
                                        skill={definition}
                                        affinityDefinitions={
                                            affinityDefinitions
                                        }
                                        onDragStart={(event) =>
                                            event.dataTransfer.setData(
                                                "text/plain",
                                                definition.id,
                                            )
                                        }
                                    />
                                ))}
                            </div>
                        </div>
                    </section>
                    <div
                        className="drop-zone skills-drop-zone"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                            event.preventDefault();
                            const skillId =
                                event.dataTransfer.getData("text/plain");
                            const definition = skillDefinitions.find(
                                (d) => d.id === skillId,
                            );
                            if (definition) addSkillFromDefinition(definition);
                        }}
                    >
                        <p className="eyebrow">Character Skills</p>
                        <p className="muted small">
                            Drag skills here to add them to your character.
                        </p>
                        {draft.skills.map((skill) => (
                            <SkillEditor
                                key={skill.id}
                                skill={skill}
                                onChange={(updater) =>
                                    updateSkill(skill.id, updater)
                                }
                                onRemove={() => removeSkill(skill.id)}
                            />
                        ))}
                    </div>
                </div>
            ) : null}

            {currentStep === "items" ? (
                <div className="creator-detail-grid">
                    <section>
                        <div className="item-source-list creator-items-panel">
                            <p className="eyebrow">
                                Available Items (Tier {draft.currentTier} and
                                below)
                            </p>
                            <input
                                className="skill-filter-input"
                                type="text"
                                placeholder="Filter items..."
                                value={itemFilter}
                                onChange={(event) =>
                                    setItemFilter(event.target.value)
                                }
                            />
                            <div className="definition-card-list compact-list">
                                {filteredItemDefinitions.map((definition) => (
                                    <button
                                        key={definition.id}
                                        type="button"
                                        className="definition-chip"
                                        draggable
                                        onDragStart={(event) =>
                                            event.dataTransfer.setData(
                                                "text/plain",
                                                definition.id,
                                            )
                                        }
                                    >
                                        <span>{definition.name}</span>
                                        <span className="definition-chip-tags">
                                            <span className="tag-scroll-inner">
                                                <span className="race-type-tag">
                                                    T{definition.tier}
                                                </span>
                                                <span
                                                    className={rarityClass(
                                                        definition.rarity,
                                                    )}
                                                >
                                                    {definition.rarity}
                                                </span>
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>
                    <div
                        className="drop-zone items-drop-zone"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                            event.preventDefault();
                            const itemId =
                                event.dataTransfer.getData("text/plain");
                            const definition = itemDefinitions.find(
                                (d) => d.id === itemId,
                            );
                            if (definition) addItemFromDefinition(definition);
                        }}
                    >
                        <p className="eyebrow">Character Items</p>
                        <p className="muted small">
                            Drag items here to add them to your character.
                        </p>
                        {draft.items.map((item) => (
                            <ItemEditor
                                key={item.id}
                                item={item}
                                tier={draft.currentTier}
                                itemSkillSetCount={itemSetSkillCount(
                                    draft.items,
                                )}
                                itemSkillLimit={draft.currentTier}
                                onChange={(updater) =>
                                    updateItem(item.id, updater)
                                }
                                onRemove={() => removeItem(item.id)}
                            />
                        ))}
                    </div>
                </div>
            ) : null}

            {currentStep === "review" ? (
                <SystemPath
                    character={draft}
                    compact
                    definitions={definitions}
                    tierDefinitions={tierDefinitions}
                    characterTypeDefinitions={characterTypeDefinitions}
                    rarityDefinitions={rarityDefinitions}
                    onEdit={() => undefined}
                />
            ) : null}

            <footer className="wizard-footer">
                <button
                    type="button"
                    className="secondary"
                    disabled={currentStepIndex === 0}
                    onClick={() => onStep(currentStepIndex - 1)}
                >
                    Back
                </button>
                <button
                    type="button"
                    disabled={currentStepIndex === steps.length - 1}
                    onClick={() => onStep(currentStepIndex + 1)}
                >
                    Next
                </button>
            </footer>
        </section>
    );
}

function TrackAssignment({
    title,
    track,
    definitions,
    onAssign,
    onStep,
}: {
    title: string;
    track: LevelTrack;
    definitions: AdvancementDefinition[];
    onAssign: (definition: AdvancementDefinition) => void;
    onStep: (direction: 1 | -1) => void;
}) {
    function handleDrop(definitionId: string): void {
        const definition = definitions.find(
            (entry) => entry.id === definitionId,
        );
        if (definition) onAssign(definition);
    }

    return (
        <fieldset className="track-editor full-width">
            <legend>{title}</legend>
            <div className="assignment-layout full-width">
                <div
                    className="drop-zone"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                        event.preventDefault();
                        handleDrop(event.dataTransfer.getData("text/plain"));
                    }}
                >
                    <p className="eyebrow">Drop {title} Here</p>
                    <div className="track-title">
                        <strong>{track.name}</strong>
                        <span className={rarityClass(track.rarity)}>
                            {track.rarity}
                        </span>
                    </div>
                    <ProgressionControls
                        levelLabel={`Level ${track.level} / {track.maxLevel}`}
                        exp={track.exp}
                        onDecrease={() => onStep(-1)}
                        onIncrease={() => onStep(1)}
                        decreaseDisabled={track.level <= 1 && track.exp <= 0}
                        increaseDisabled={
                            track.level >= track.maxLevel && track.exp >= 100
                        }
                    />
                </div>
                <div className="available-definition-panel">
                    <p className="eyebrow">Available {title}s</p>
                    <div className="definition-card-list">
                        {definitions.map((definition) => (
                            <DefinitionChipWithTooltip
                                key={definition.id}
                                definition={definition}
                                onDragStart={(event) =>
                                    event.dataTransfer.setData(
                                        "text/plain",
                                        definition.id,
                                    )
                                }
                            />
                        ))}
                        {!definitions.length ? (
                            <p className="muted small">
                                No available {title.toLowerCase()} templates for
                                this character.
                            </p>
                        ) : null}
                    </div>
                </div>
            </div>
        </fieldset>
    );
}

function SkillEditor({
    skill,
    onChange,
    onRemove,
}: {
    skill: Skill;
    onChange: (updater: (skill: Skill) => Skill) => void;
    onRemove: () => void;
}) {
    return (
        <article className="editor-card">
            <div className="form-grid two-col compact-grid">
                <label>
                    Name
                    <input value={skill.name} readOnly />
                </label>
                <label>
                    Rarity
                    <input value={skill.rarity} readOnly />
                </label>
                <label>
                    Source
                    <select
                        value={skill.source}
                        onChange={(event) =>
                            onChange((current) => ({
                                ...current,
                                source: event.target.value as SkillSource,
                            }))
                        }
                    >
                        {skillSources.map((source) => (
                            <option key={source} value={source}>
                                {source}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Kind
                    <select
                        value={skill.kind}
                        onChange={(event) =>
                            onChange((current) => ({
                                ...current,
                                kind: event.target.value as SkillKind,
                            }))
                        }
                    >
                        {skillKinds.map((kind) => (
                            <option key={kind} value={kind}>
                                {kind}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="full-width">
                    <ProgressionControls
                        levelLabel={`Level ${skill.level ?? 1}`}
                        exp={skill.exp}
                        onDecrease={() =>
                            onChange((current) =>
                                stepSkillExperience(current, -1),
                            )
                        }
                        onIncrease={() =>
                            onChange((current) =>
                                stepSkillExperience(current, 1),
                            )
                        }
                        decreaseDisabled={
                            (skill.level ?? 1) <= 1 && skill.exp <= 0
                        }
                    />
                </div>
                <label>
                    MP Cost
                    <input value={skill.mpCost} readOnly />
                </label>
                <label>
                    Casting Time
                    <input value={skill.castingTime} readOnly />
                </label>
                <label>
                    Cooldown
                    <input value={skill.cooldown} readOnly />
                </label>
                <label className="full-width">
                    Description
                    <textarea value={skill.description} readOnly />
                </label>
            </div>
            <button type="button" className="danger" onClick={onRemove}>
                Remove Skill
            </button>
        </article>
    );
}

function ItemEditor({
    item,
    tier,
    itemSkillSetCount,
    itemSkillLimit,
    onChange,
    onRemove,
}: {
    item: Item;
    tier: number;
    itemSkillSetCount: number;
    itemSkillLimit: number;
    onChange: (updater: (item: Item) => Item) => void;
    onRemove: () => void;
}) {
    const hasSkills = (item.skillNames?.length ?? (item.skillName ? 1 : 0)) > 0;
    const itemSkillSlotsFull = itemSkillSetCount >= itemSkillLimit;

    // Count equipped items by slot
    const equippedBySlot = {} as Record<ItemSlot, number>;

    return (
        <article className="editor-card">
            <div className="form-grid two-col compact-grid">
                <label>
                    Name
                    <input value={item.name} readOnly />
                </label>
                <label>
                    Slot
                    <input value={item.slot} readOnly />
                </label>
                <label>
                    Rarity
                    <input value={item.rarity} readOnly />
                </label>
                <label>
                    Tier
                    <input value={item.tier ?? 1} readOnly />
                </label>
                <label className="toggle-row">
                    <input
                        type="checkbox"
                        checked={Boolean(item.equipped)}
                        onChange={(event) =>
                            onChange((current) => ({
                                ...current,
                                equipped: event.target.checked,
                            }))
                        }
                    />{" "}
                    Equipped
                </label>
                {hasSkills ? (
                    <div className="full-width">
                        <p
                            className="eyebrow"
                            style={{ marginBottom: "0.4rem" }}
                        >
                            Available Skills ({itemSkillSetCount}/
                            {itemSkillLimit} set)
                        </p>
                        {(item.skillNames?.length ?? 0) > 0 ? (
                            <div className="skill-toggle-list">
                                {item.skillNames?.map((skillName) => (
                                    <label
                                        key={skillName}
                                        className="toggle-row"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={Boolean(
                                                item.setSkillNames?.includes(
                                                    skillName,
                                                ) ||
                                                (item.skillSet &&
                                                    item.skillName ===
                                                        skillName),
                                            )}
                                            onChange={() =>
                                                onChange((current) => {
                                                    const currentSet =
                                                        current.setSkillNames ??
                                                        (current.skillSet &&
                                                        current.skillName
                                                            ? [
                                                                  current.skillName,
                                                              ]
                                                            : []);
                                                    const isSet =
                                                        currentSet.includes(
                                                            skillName,
                                                        );
                                                    if (
                                                        !isSet &&
                                                        itemSkillSlotsFull
                                                    ) {
                                                        return current;
                                                    }
                                                    return {
                                                        ...current,
                                                        setSkillNames: isSet
                                                            ? currentSet.filter(
                                                                  (s) =>
                                                                      s !==
                                                                      skillName,
                                                              )
                                                            : [
                                                                  ...currentSet,
                                                                  skillName,
                                                              ],
                                                        skillSet: true,
                                                    };
                                                })
                                            }
                                            disabled={
                                                !(
                                                    item.setSkillNames?.includes(
                                                        skillName,
                                                    ) ||
                                                    (item.skillSet &&
                                                        item.skillName ===
                                                            skillName)
                                                ) && itemSkillSlotsFull
                                            }
                                        />
                                        Set: {skillName}
                                    </label>
                                ))}
                            </div>
                        ) : (
                            <p className="muted small">
                                No skills defined for this item.
                            </p>
                        )}
                        {itemSkillSlotsFull ? (
                            <p className="muted small">
                                Item skill slots are full for this tier.
                            </p>
                        ) : null}
                    </div>
                ) : null}
            </div>
            <button type="button" className="danger" onClick={onRemove}>
                Remove Item
            </button>
        </article>
    );
}

function CatalogManager({
    state,
    onChange,
}: {
    state: AppState;
    onChange: (patch: Partial<AppState>) => void;
}) {
    const [activeTab, setActiveTab] = useState<CompendiumTab>("race");
    const [selectedId, setSelectedId] = useState<string | null>(
        state.definitions.find((definition) => definition.kind === "race")
            ?.id ?? null,
    );

    function switchTab(tab: CompendiumTab): void {
        setActiveTab(tab);
        if (tab === "affinity")
            setSelectedId(state.affinityDefinitions[0]?.id ?? null);
        else if (tab === "tier")
            setSelectedId(state.tierDefinitions[0]?.id ?? null);
        else if (tab === "character-type")
            setSelectedId(state.characterTypeDefinitions[0]?.id ?? null);
        else if (tab === "stat-category")
            setSelectedId(state.statCategoryDefinitions[0]?.id ?? null);
        else if (tab === "primary-stat")
            setSelectedId(state.primaryStatDefinitions[0]?.id ?? null);
        else if (tab === "secondary-stat")
            setSelectedId(state.secondaryStatDefinitions[0]?.id ?? null);
        else if (tab === "rarity")
            setSelectedId(state.rarityDefinitions[0]?.id ?? null);
        else if (tab === "currency")
            setSelectedId(state.currencyDefinitions[0]?.id ?? null);
        else if (tab === "skill")
            setSelectedId(state.skillDefinitions[0]?.id ?? null);
        else if (tab === "item")
            setSelectedId(state.itemDefinitions[0]?.id ?? null);
        else
            setSelectedId(
                state.definitions.find((definition) => definition.kind === tab)
                    ?.id ?? null,
            );
    }

    function addCurrent(): void {
        if (activeTab === "affinity") {
            const entry = createAffinityDefinition();
            onChange({
                affinityDefinitions: [...state.affinityDefinitions, entry],
            });
            setSelectedId(entry.id);
        } else if (activeTab === "character-type") {
            setSelectedId(state.characterTypeDefinitions[0]?.id ?? null);
        } else if (activeTab === "tier") {
            const entry = createTierDefinition(state.tierDefinitions);
            onChange({ tierDefinitions: [...state.tierDefinitions, entry] });
            setSelectedId(entry.id);
        } else if (activeTab === "stat-category") {
            const entry = createStatCategoryDefinition(
                state.statCategoryDefinitions,
            );
            onChange({
                statCategoryDefinitions: [
                    ...state.statCategoryDefinitions,
                    entry,
                ],
            });
            setSelectedId(entry.id);
        } else if (activeTab === "primary-stat") {
            setSelectedId(state.primaryStatDefinitions[0]?.id ?? null);
        } else if (activeTab === "secondary-stat") {
            const entry = createSecondaryStatDefinition(
                state.secondaryStatDefinitions,
            );
            onChange({
                secondaryStatDefinitions: [
                    ...state.secondaryStatDefinitions,
                    entry,
                ],
            });
            setSelectedId(entry.id);
        } else if (activeTab === "rarity") {
            const entry = createRarityDefinition();
            onChange({
                rarityDefinitions: [...state.rarityDefinitions, entry],
            });
            setSelectedId(entry.id);
        } else if (activeTab === "currency") {
            const entry = createCurrencyDefinition();
            onChange({
                currencyDefinitions: [...state.currencyDefinitions, entry],
            });
            setSelectedId(entry.id);
        } else if (activeTab === "skill") {
            const entry = createSkillDefinition();
            onChange({ skillDefinitions: [...state.skillDefinitions, entry] });
            setSelectedId(entry.id);
        } else if (activeTab === "item") {
            const entry = createItemDefinition();
            onChange({ itemDefinitions: [...state.itemDefinitions, entry] });
            setSelectedId(entry.id);
        } else {
            const entry = createDefinition(activeTab);
            onChange({ definitions: [...state.definitions, entry] });
            setSelectedId(entry.id);
        }
    }

    const tabs: Array<{ key: CompendiumTab; label: string }> = [
        { key: "race", label: "Races" },
        { key: "class", label: "Classes" },
        { key: "job", label: "Jobs" },
        { key: "skill", label: "Skills" },
        { key: "item", label: "Items" },
        { key: "affinity", label: "Affinities" },
        { key: "currency", label: "Currencies" },
        { key: "rarity", label: "Rarities" },
        { key: "tier", label: "Tiers" },
        { key: "character-type", label: "Types" },
        { key: "stat-category", label: "Stat Categories" },
        { key: "primary-stat", label: "Primary Stats" },
        { key: "secondary-stat", label: "Secondary Stats" },
    ];

    function getNewButtonText(): string {
        const tab = tabs.find((t) => t.key === activeTab);
        if (!tab) return "Entry";
        if (activeTab === "tier") return "Tier";
        if (activeTab === "character-type") return "Character Type";
        if (activeTab === "stat-category") return "Stat Category";
        if (activeTab === "primary-stat") return "Primary Stat";
        if (activeTab === "secondary-stat") return "Secondary Stat";
        if (activeTab === "affinity") return "Affinity";
        if (activeTab === "rarity") return "Rarity";
        if (activeTab === "class") return "Class";
        return tab.label.slice(0, -1);
    }

    return (
        <section className="catalog-manager glass-panel">
            <header className="section-title-row">
                <div>
                    <p className="eyebrow">System compendium</p>
                </div>
                <button
                    type="button"
                    onClick={addCurrent}
                    disabled={
                        activeTab === "character-type" ||
                        activeTab === "primary-stat"
                    }
                >
                    New {getNewButtonText()}
                </button>
            </header>
            <div className="catalog-tabs">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        className={activeTab === tab.key ? "active" : ""}
                        onClick={() => switchTab(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === "affinity" ? (
                <AffinityCompendium
                    affinities={state.affinityDefinitions}
                    selectedId={selectedId}
                    onSelected={setSelectedId}
                    onChange={(affinityDefinitions) =>
                        onChange({ affinityDefinitions })
                    }
                />
            ) : null}
            {activeTab === "rarity" ? (
                <RarityCompendium
                    rarities={state.rarityDefinitions}
                    selectedId={selectedId}
                    onSelected={setSelectedId}
                    onChange={(rarityDefinitions) =>
                        onChange({ rarityDefinitions })
                    }
                />
            ) : null}
            {activeTab === "tier" ? (
                <TierCompendium
                    tiers={state.tierDefinitions}
                    selectedId={selectedId}
                    onSelected={setSelectedId}
                    onChange={(tierDefinitions) =>
                        onChange({ tierDefinitions })
                    }
                />
            ) : null}
            {activeTab === "character-type" ? (
                <CharacterTypeCompendium
                    characterTypes={state.characterTypeDefinitions}
                    selectedId={selectedId}
                    onSelected={setSelectedId}
                    onChange={(characterTypeDefinitions) =>
                        onChange({ characterTypeDefinitions })
                    }
                />
            ) : null}
            {activeTab === "stat-category" ? (
                <StatCategoryCompendium
                    categories={state.statCategoryDefinitions}
                    selectedId={selectedId}
                    onSelected={setSelectedId}
                    onChange={(statCategoryDefinitions) =>
                        onChange({ statCategoryDefinitions })
                    }
                />
            ) : null}
            {activeTab === "primary-stat" ? (
                <PrimaryStatCompendium
                    stats={state.primaryStatDefinitions}
                    categories={state.statCategoryDefinitions}
                    selectedId={selectedId}
                    onSelected={setSelectedId}
                    onChange={(primaryStatDefinitions) =>
                        onChange({ primaryStatDefinitions })
                    }
                />
            ) : null}
            {activeTab === "secondary-stat" ? (
                <SecondaryStatCompendium
                    stats={state.secondaryStatDefinitions}
                    primaryStats={state.primaryStatDefinitions}
                    selectedId={selectedId}
                    onSelected={setSelectedId}
                    onChange={(secondaryStatDefinitions) =>
                        onChange({ secondaryStatDefinitions })
                    }
                />
            ) : null}
            {activeTab === "currency" ? (
                <CurrencyCompendium
                    currencies={state.currencyDefinitions}
                    selectedId={selectedId}
                    onSelected={setSelectedId}
                    onChange={(currencyDefinitions) =>
                        onChange({ currencyDefinitions })
                    }
                />
            ) : null}
            {activeTab === "skill" ? (
                <SkillCompendium
                    skills={state.skillDefinitions}
                    tierDefinitions={state.tierDefinitions}
                    rarityDefinitions={state.rarityDefinitions}
                    affinityDefinitions={state.affinityDefinitions}
                    selectedId={selectedId}
                    onSelected={setSelectedId}
                    onChange={(skillDefinitions) =>
                        onChange({ skillDefinitions })
                    }
                />
            ) : null}
            {activeTab === "item" ? (
                <ItemCompendium
                    items={state.itemDefinitions}
                    tierDefinitions={state.tierDefinitions}
                    rarityDefinitions={state.rarityDefinitions}
                    skills={state.skillDefinitions}
                    primaryStatDefinitions={state.primaryStatDefinitions}
                    affinityDefinitions={state.affinityDefinitions}
                    selectedId={selectedId}
                    onSelected={setSelectedId}
                    onChange={(itemDefinitions) =>
                        onChange({ itemDefinitions })
                    }
                />
            ) : null}
            {activeTab === "race" ||
            activeTab === "class" ||
            activeTab === "job" ? (
                <AdvancementCompendium
                    kind={activeTab}
                    definitions={state.definitions}
                    tierDefinitions={state.tierDefinitions}
                    primaryStatDefinitions={state.primaryStatDefinitions}
                    rarityDefinitions={state.rarityDefinitions}
                    affinityDefinitions={state.affinityDefinitions}
                    selectedId={selectedId}
                    onSelected={setSelectedId}
                    onChange={(definitions) => onChange({ definitions })}
                />
            ) : null}
        </section>
    );
}

function TierCompendium({
    tiers,
    selectedId,
    onSelected,
    onChange,
}: {
    tiers: TierDefinition[];
    selectedId: string | null;
    onSelected: (id: string | null) => void;
    onChange: (tiers: TierDefinition[]) => void;
}) {
    const selected =
        tiers.find((tier) => tier.id === selectedId) ?? tiers[0] ?? null;
    const update = (
        id: string,
        updater: (tier: TierDefinition) => TierDefinition,
    ) =>
        onChange(
            tiers
                .map((tier) => (tier.id === id ? updater(tier) : tier))
                .sort((a, b) => a.tier - b.tier),
        );
    const remove = (id: string) => {
        const remaining = tiers
            .filter((tier) => tier.id !== id)
            .sort((a, b) => a.tier - b.tier);
        onChange(remaining);
        onSelected(remaining[0]?.id ?? null);
    };

    return (
        <div className="catalog-grid">
            <aside className="definition-list">
                {[...tiers]
                    .sort((a, b) => a.tier - b.tier)
                    .map((tier) => (
                        <button
                            key={tier.id}
                            type="button"
                            className={`definition-row ${selected?.id === tier.id ? "selected" : ""}`}
                            onClick={() => onSelected(tier.id)}
                        >
                            <span>
                                T{tier.tier} · {tier.title}
                            </span>
                            <span className="race-type-tag">
                                max {tier.maxLevel}
                            </span>
                        </button>
                    ))}
            </aside>
            {selected ? (
                <section className="definition-editor compact">
                    <div className="editor-header grid-header">
                        <label className="header-field">
                            Number
                            <input
                                type="number"
                                min="1"
                                value={selected.tier}
                                onChange={(event) =>
                                    update(selected.id, (tier) => ({
                                        ...tier,
                                        tier: finiteInteger(
                                            event.target.value,
                                            tier.tier,
                                            1,
                                            999,
                                        ),
                                    }))
                                }
                            />
                        </label>
                        <label className="header-field name-field">
                            Title
                            <input
                                value={selected.title}
                                onChange={(event) =>
                                    update(selected.id, (tier) => ({
                                        ...tier,
                                        title: event.target.value,
                                    }))
                                }
                            />
                        </label>
                        <label className="header-field">
                            Max Level
                            <input
                                type="number"
                                min="1"
                                value={selected.maxLevel}
                                onChange={(event) =>
                                    update(selected.id, (tier) => ({
                                        ...tier,
                                        maxLevel: finiteInteger(
                                            event.target.value,
                                            tier.maxLevel,
                                            1,
                                            999,
                                        ),
                                    }))
                                }
                            />
                        </label>
                    </div>
                    <label className="full-width">
                        Description
                        <textarea
                            value={selected.details}
                            onChange={(event) =>
                                update(selected.id, (tier) => ({
                                    ...tier,
                                    details: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <div className="form-grid two-col compact-grid">
                        {(
                            [
                                ["Race Multiplier", "raceMultiplier"],
                                ["Class Multiplier", "classMultiplier"],
                                ["Job Multiplier", "jobMultiplier"],
                                ["Item Multiplier", "itemMultiplier"],
                                ["Static Tier Bonus", "staticBonus"],
                            ] as const
                        ).map(([label, key]) => (
                            <label key={key}>
                                {label}
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={selected[key]}
                                    onChange={(event) =>
                                        update(selected.id, (tier) => ({
                                            ...tier,
                                            [key]: finiteNumber(
                                                event.target.value,
                                                tier[key],
                                                0,
                                                999999,
                                            ),
                                        }))
                                    }
                                />
                            </label>
                        ))}
                    </div>
                    <div className="toolbar compact">
                        <button
                            type="button"
                            className="danger"
                            onClick={() => remove(selected.id)}
                            disabled={tiers.length <= 1}
                        >
                            Delete Tier
                        </button>
                    </div>
                </section>
            ) : null}
        </div>
    );
}

function RarityCompendium({
    rarities,
    selectedId,
    onSelected,
    onChange,
}: {
    rarities: RarityDefinition[];
    selectedId: string | null;
    onSelected: (id: string | null) => void;
    onChange: (rarities: RarityDefinition[]) => void;
}) {
    const selected =
        rarities.find((rarity) => rarity.id === selectedId) ??
        rarities[0] ??
        null;
    const update = (
        id: string,
        updater: (rarity: RarityDefinition) => RarityDefinition,
    ) =>
        onChange(
            rarities.map((rarity) =>
                rarity.id === id ? updater(rarity) : rarity,
            ),
        );
    const remove = (id: string) => {
        const remaining = rarities.filter((rarity) => rarity.id !== id);
        onChange(remaining);
        onSelected(remaining[0]?.id ?? null);
    };

    return (
        <div className="catalog-grid">
            <aside className="definition-list">
                {rarities.map((rarity) => (
                    <button
                        key={rarity.id}
                        type="button"
                        className={`definition-row ${selected?.id === rarity.id ? "selected" : ""}`}
                        onClick={() => onSelected(rarity.id)}
                    >
                        <span>{rarity.name}</span>
                        <span
                            className="rarity"
                            style={{ color: rarity.color }}
                        >
                            ×{rarity.multiplier}
                        </span>
                    </button>
                ))}
            </aside>
            {selected ? (
                <section className="definition-editor compact">
                    <div className="editor-header grid-header">
                        <label className="header-field name-field">
                            Name
                            <input
                                value={selected.name}
                                onChange={(event) =>
                                    update(selected.id, (rarity) => ({
                                        ...rarity,
                                        name: event.target.value,
                                    }))
                                }
                            />
                        </label>
                        <label className="header-field">
                            Multiplier
                            <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={selected.multiplier}
                                onChange={(event) =>
                                    update(selected.id, (rarity) => ({
                                        ...rarity,
                                        multiplier: finiteNumber(
                                            event.target.value,
                                            rarity.multiplier,
                                            0,
                                            100,
                                        ),
                                    }))
                                }
                            />
                        </label>
                        <label className="header-field">
                            Color
                            <input
                                type="color"
                                value={selected.color}
                                onChange={(event) =>
                                    update(selected.id, (rarity) => ({
                                        ...rarity,
                                        color: event.target.value,
                                    }))
                                }
                            />
                        </label>
                    </div>
                    <div className="toolbar compact">
                        <button
                            type="button"
                            className="danger"
                            onClick={() => remove(selected.id)}
                            disabled={rarities.length <= 1}
                        >
                            Delete Rarity
                        </button>
                    </div>
                </section>
            ) : null}
        </div>
    );
}

function CharacterTypeCompendium({
    characterTypes,
    selectedId,
    onSelected,
    onChange,
}: {
    characterTypes: CharacterTypeDefinition[];
    selectedId: string | null;
    onSelected: (id: string | null) => void;
    onChange: (characterTypes: CharacterTypeDefinition[]) => void;
}) {
    const selected =
        characterTypes.find((entry) => entry.id === selectedId) ??
        characterTypes[0] ??
        null;
    const update = (
        id: string,
        updater: (entry: CharacterTypeDefinition) => CharacterTypeDefinition,
    ) =>
        onChange(
            characterTypes.map((entry) =>
                entry.id === id ? updater(entry) : entry,
            ),
        );

    return (
        <div className="catalog-grid">
            <aside className="definition-list">
                {characterTypes.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        className={`definition-row ${selected?.id === entry.id ? "selected" : ""}`}
                        onClick={() => onSelected(entry.id)}
                    >
                        <span>{entry.label}</span>
                        <span className={raceTypeClass(entry.kind)}>
                            ×{entry.multiplier}
                        </span>
                    </button>
                ))}
            </aside>
            {selected ? (
                <section className="definition-editor compact">
                    <div className="editor-header grid-header">
                        <label className="header-field name-field">
                            Label
                            <input
                                value={selected.label}
                                onChange={(event) =>
                                    update(selected.id, (entry) => ({
                                        ...entry,
                                        label: event.target.value,
                                    }))
                                }
                            />
                        </label>
                        <label className="header-field">
                            Type
                            <span className={raceTypeClass(selected.kind)}>
                                {raceTypeLabel(selected.kind)}
                            </span>
                        </label>
                        <label className="header-field">
                            Multiplier
                            <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={selected.multiplier}
                                onChange={(event) =>
                                    update(selected.id, (entry) => ({
                                        ...entry,
                                        multiplier: finiteNumber(
                                            event.target.value,
                                            entry.multiplier,
                                            0,
                                            100,
                                        ),
                                    }))
                                }
                            />
                        </label>
                    </div>
                </section>
            ) : null}
        </div>
    );
}

function StatCategoryCompendium({
    categories,
    selectedId,
    onSelected,
    onChange,
}: {
    categories: StatCategoryDefinition[];
    selectedId: string | null;
    onSelected: (id: string | null) => void;
    onChange: (categories: StatCategoryDefinition[]) => void;
}) {
    const selected =
        categories.find((entry) => entry.id === selectedId) ??
        categories[0] ??
        null;
    const update = (
        id: string,
        updater: (entry: StatCategoryDefinition) => StatCategoryDefinition,
    ) =>
        onChange(
            categories.map((entry) =>
                entry.id === id ? updater(entry) : entry,
            ),
        );
    const remove = (id: string) => {
        const next = categories.filter((entry) => entry.id !== id);
        onChange(next);
        onSelected(next[0]?.id ?? null);
    };

    return (
        <div className="catalog-grid">
            <aside className="definition-list">
                {[...categories]
                    .sort((a, b) => a.order - b.order)
                    .map((entry) => (
                        <button
                            key={entry.id}
                            type="button"
                            className={`definition-row ${selected?.id === entry.id ? "selected" : ""}`}
                            onClick={() => onSelected(entry.id)}
                        >
                            <span>{entry.name}</span>
                            <span className="race-type-tag">
                                #{entry.order}
                            </span>
                        </button>
                    ))}
            </aside>
            {selected ? (
                <section className="definition-editor compact">
                    <div className="editor-header grid-header">
                        <label className="header-field name-field">
                            Name
                            <input
                                value={selected.name}
                                onChange={(event) =>
                                    update(selected.id, (entry) => ({
                                        ...entry,
                                        name: event.target.value,
                                    }))
                                }
                            />
                        </label>
                        <label className="header-field">
                            Order
                            <input
                                type="number"
                                min="1"
                                value={selected.order}
                                onChange={(event) =>
                                    update(selected.id, (entry) => ({
                                        ...entry,
                                        order: finiteInteger(
                                            event.target.value,
                                            entry.order,
                                            1,
                                            999,
                                        ),
                                    }))
                                }
                            />
                        </label>
                    </div>
                    <label className="full-width">
                        Description
                        <textarea
                            value={selected.description}
                            onChange={(event) =>
                                update(selected.id, (entry) => ({
                                    ...entry,
                                    description: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <button
                        type="button"
                        className="danger"
                        onClick={() => remove(selected.id)}
                    >
                        Delete Category
                    </button>
                </section>
            ) : null}
        </div>
    );
}

function PrimaryStatCompendium({
    stats,
    categories,
    selectedId,
    onSelected,
    onChange,
}: {
    stats: PrimaryStatDefinition[];
    categories: StatCategoryDefinition[];
    selectedId: string | null;
    onSelected: (id: string | null) => void;
    onChange: (stats: PrimaryStatDefinition[]) => void;
}) {
    const selected =
        stats.find((entry) => entry.id === selectedId) ?? stats[0] ?? null;
    const update = (
        id: string,
        updater: (entry: PrimaryStatDefinition) => PrimaryStatDefinition,
    ) =>
        onChange(
            stats.map((entry) => (entry.id === id ? updater(entry) : entry)),
        );

    return (
        <div className="catalog-grid">
            <aside className="definition-list">
                {sortedPrimaryStats(categories, stats).map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        className={`definition-row ${selected?.id === entry.id ? "selected" : ""}`}
                        onClick={() => onSelected(entry.id)}
                    >
                        <span>{entry.label}</span>
                        <span className="race-type-tag">
                            {entry.role === "aggressive" ? "A" : "D"}
                        </span>
                    </button>
                ))}
            </aside>
            {selected ? (
                <section className="definition-editor compact">
                    <div className="editor-header grid-header">
                        <label className="header-field name-field">
                            Label
                            <input
                                value={selected.label}
                                onChange={(event) =>
                                    update(selected.id, (entry) => ({
                                        ...entry,
                                        label: event.target.value,
                                    }))
                                }
                            />
                        </label>
                        <label className="header-field">
                            Key
                            <input value={selected.key} readOnly />
                        </label>
                        <label className="header-field">
                            Role
                            <select
                                value={selected.role}
                                onChange={(event) =>
                                    update(selected.id, (entry) => ({
                                        ...entry,
                                        role: event.target
                                            .value as PrimaryStatRole,
                                    }))
                                }
                            >
                                {primaryStatRoles.map((role) => (
                                    <option key={role} value={role}>
                                        {titleCase(role)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="header-field">
                            Category
                            <select
                                value={selected.categoryId}
                                onChange={(event) =>
                                    update(selected.id, (entry) => ({
                                        ...entry,
                                        categoryId: event.target.value,
                                    }))
                                }
                            >
                                {categories.map((category) => (
                                    <option
                                        key={category.id}
                                        value={category.id}
                                    >
                                        {category.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="header-field">
                            Order
                            <input
                                type="number"
                                min="1"
                                value={selected.order}
                                onChange={(event) =>
                                    update(selected.id, (entry) => ({
                                        ...entry,
                                        order: finiteInteger(
                                            event.target.value,
                                            entry.order,
                                            1,
                                            999,
                                        ),
                                    }))
                                }
                            />
                        </label>
                    </div>
                    <label className="full-width">
                        Description
                        <textarea
                            value={selected.description}
                            onChange={(event) =>
                                update(selected.id, (entry) => ({
                                    ...entry,
                                    description: event.target.value,
                                }))
                            }
                        />
                    </label>
                </section>
            ) : null}
        </div>
    );
}

function SecondaryStatCompendium({
    stats,
    primaryStats,
    selectedId,
    onSelected,
    onChange,
}: {
    stats: SecondaryStatDefinition[];
    primaryStats: PrimaryStatDefinition[];
    selectedId: string | null;
    onSelected: (id: string | null) => void;
    onChange: (stats: SecondaryStatDefinition[]) => void;
}) {
    const selected =
        stats.find((entry) => entry.id === selectedId) ?? stats[0] ?? null;
    const update = (
        id: string,
        updater: (entry: SecondaryStatDefinition) => SecondaryStatDefinition,
    ) =>
        onChange(
            stats.map((entry) => (entry.id === id ? updater(entry) : entry)),
        );
    const remove = (id: string) => {
        const next = stats.filter((entry) => entry.id !== id);
        onChange(next);
        onSelected(next[0]?.id ?? null);
    };

    return (
        <div className="catalog-grid">
            <aside className="definition-list">
                {[...stats]
                    .sort((a, b) => a.order - b.order)
                    .map((entry) => (
                        <button
                            key={entry.id}
                            type="button"
                            className={`definition-row ${selected?.id === entry.id ? "selected" : ""}`}
                            onClick={() => onSelected(entry.id)}
                        >
                            <span>{entry.shortName}</span>
                            <span className="race-type-tag">
                                {entry.longName}
                            </span>
                        </button>
                    ))}
            </aside>
            {selected ? (
                <section className="definition-editor compact">
                    <div className="editor-header grid-header">
                        <label className="header-field">
                            <span>Key</span>
                            <input
                                value={selected.key}
                                onChange={(event) =>
                                    update(selected.id, (entry) => ({
                                        ...entry,
                                        key: event.target.value
                                            .toLowerCase()
                                            .replace(/[^a-z0-9-]/g, "-"),
                                    }))
                                }
                            />
                        </label>
                        <label className="header-field">
                            <span>Short Name</span>
                            <input
                                value={selected.shortName}
                                onChange={(event) =>
                                    update(selected.id, (entry) => ({
                                        ...entry,
                                        shortName: event.target.value,
                                    }))
                                }
                            />
                        </label>
                        <label className="header-field name-field">
                            <span>Long Name</span>
                            <input
                                value={selected.longName}
                                onChange={(event) =>
                                    update(selected.id, (entry) => ({
                                        ...entry,
                                        longName: event.target.value,
                                    }))
                                }
                            />
                        </label>
                        <label className="header-field">
                            <span>Order</span>
                            <input
                                type="number"
                                min="1"
                                value={selected.order}
                                onChange={(event) =>
                                    update(selected.id, (entry) => ({
                                        ...entry,
                                        order: finiteInteger(
                                            event.target.value,
                                            entry.order,
                                            1,
                                            999,
                                        ),
                                    }))
                                }
                            />
                        </label>
                        <label className="header-field">
                            <span>Tier-scaled stat</span>
                            <select
                                value={selected.multipliedStat}
                                onChange={(event) =>
                                    update(selected.id, (entry) => ({
                                        ...entry,
                                        multipliedStat: event.target
                                            .value as StatKey,
                                    }))
                                }
                            >
                                {statKeys.map((key) => (
                                    <option key={key} value={key}>
                                        {statLabel(primaryStats, key)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="header-field">
                            <span>Added stat</span>
                            <select
                                value={selected.addedStat}
                                onChange={(event) =>
                                    update(selected.id, (entry) => ({
                                        ...entry,
                                        addedStat: event.target
                                            .value as StatKey,
                                    }))
                                }
                            >
                                {statKeys.map((key) => (
                                    <option key={key} value={key}>
                                        {statLabel(primaryStats, key)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <p className="muted small">
                        Formula: tier-scaled stat × current tier + added stat.
                    </p>
                    <label className="full-width">
                        Description
                        <textarea
                            value={selected.description}
                            onChange={(event) =>
                                update(selected.id, (entry) => ({
                                    ...entry,
                                    description: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <button
                        type="button"
                        className="danger"
                        onClick={() => remove(selected.id)}
                    >
                        Delete Secondary Stat
                    </button>
                </section>
            ) : null}
        </div>
    );
}

function StepperControl({
    value,
    min,
    max,
    onChange,
    label,
}: {
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
    label: string;
}) {
    return (
        <span className="stepper-control">
            <span className="stepper-label">{label}</span>
            <span className="stepper-row">
                <button
                    type="button"
                    className="stepper-btn"
                    disabled={value <= min}
                    onClick={() => onChange(value - 1)}
                    aria-label={`Decrease ${label}`}
                >
                    −
                </button>
                <span className="stepper-value">{value}</span>
                <button
                    type="button"
                    className="stepper-btn"
                    disabled={value >= max}
                    onClick={() => onChange(value + 1)}
                    aria-label={`Increase ${label}`}
                >
                    +
                </button>
            </span>
        </span>
    );
}

function RarityStepper({
    value,
    rarities = RARITIES,
    onChange,
}: {
    value: Rarity;
    rarities?: Rarity[];
    onChange: (value: Rarity) => void;
}) {
    const index = rarities.indexOf(value);
    return (
        <span className="stepper-control">
            <span className="stepper-label">Rarity</span>
            <span className="stepper-row">
                <button
                    type="button"
                    className="stepper-btn"
                    disabled={index <= 0}
                    onClick={() => onChange(rarities[index - 1])}
                    aria-label="Decrease rarity"
                >
                    −
                </button>
                <span className={`stepper-value ${rarityClass(value)}`}>
                    {value}
                </span>
                <button
                    type="button"
                    className="stepper-btn"
                    disabled={index >= rarities.length - 1}
                    onClick={() => onChange(rarities[index + 1])}
                    aria-label="Increase rarity"
                >
                    +
                </button>
            </span>
        </span>
    );
}

function EditorBadges({ children }: { children: React.ReactNode }) {
    return <div className="editor-badges">{children}</div>;
}

function AdvancementCompendium({
    kind,
    definitions,
    tierDefinitions,
    primaryStatDefinitions,
    rarityDefinitions,
    affinityDefinitions,
    selectedId,
    onSelected,
    onChange,
}: {
    kind: DefinitionKind;
    definitions: AdvancementDefinition[];
    tierDefinitions: TierDefinition[];
    primaryStatDefinitions: PrimaryStatDefinition[];
    rarityDefinitions: RarityDefinition[];
    affinityDefinitions: AffinityDefinition[];
    selectedId: string | null;
    onSelected: (id: string | null) => void;
    onChange: (definitions: AdvancementDefinition[]) => void;
}) {
    const activeDefinitions = definitions
        .filter((definition) => definition.kind === kind)
        .sort((a, b) => a.name.localeCompare(b.name));
    const selectedDefinition =
        definitions.find(
            (definition) =>
                definition.id === selectedId && definition.kind === kind,
        ) ??
        activeDefinitions[0] ??
        null;
    const rarityOptions = rarityNames(rarityDefinitions);
    const maxTier = maxConfiguredTier(tierDefinitions);
    const update = (
        id: string,
        updater: (definition: AdvancementDefinition) => AdvancementDefinition,
    ) =>
        onChange(
            definitions.map((definition) =>
                definition.id === id ? updater(definition) : definition,
            ),
        );
    const remove = (id: string) => {
        const remaining = definitions.filter(
            (definition) => definition.id !== id,
        );
        onChange(remaining);
        onSelected(
            remaining.find((definition) => definition.kind === kind)?.id ??
                null,
        );
    };
    const duplicate = (definition: AdvancementDefinition) => {
        const copy = {
            ...definition,
            id: makeId("definition"),
            name: duplicatedName(definition.name),
            statWeights: { ...definition.statWeights },
            affinityIds: [...(definition.affinityIds ?? [])],
        };
        onChange([...definitions, copy]);
        onSelected(copy.id);
    };
    const toggleAffinity = (affinityId: string) => {
        if (!selectedDefinition) return;
        const has = selectedDefinition.affinityIds?.includes(affinityId);
        update(selectedDefinition.id, (definition) => ({
            ...definition,
            affinityIds: has
                ? (definition.affinityIds ?? []).filter(
                      (id) => id !== affinityId,
                  )
                : [...(definition.affinityIds ?? []), affinityId],
        }));
    };
    const getAffinityTag = (affinity: AffinityDefinition) =>
        affinity.emoji ?? affinity.name.charAt(0);

    return (
        <div className="catalog-grid">
            <aside className="definition-list">
                {activeDefinitions.map((definition) => (
                    <button
                        key={definition.id}
                        type="button"
                        className={`definition-row ${selectedDefinition?.id === definition.id ? "selected" : ""}`}
                        onClick={() => onSelected(definition.id)}
                    >
                        <span>{definition.name}</span>
                        <span className="definition-chip-tags">
                            <span className="tag-scroll-inner">
                                <span className="race-type-tag">
                                    T{definition.minTier}+
                                </span>
                                <span
                                    className={rarityClass(definition.rarity)}
                                >
                                    {definition.rarity}
                                </span>
                                {definition.kind === "race" &&
                                definition.raceType ? (
                                    <span
                                        className={raceTypeClass(
                                            definition.raceType,
                                        )}
                                    >
                                        {raceTypeLabel(definition.raceType)}
                                    </span>
                                ) : null}
                                {definition.affinityIds?.length
                                    ? definition.affinityIds.map((aId) => {
                                          const aff = affinityDefinitions.find(
                                              (a) => a.id === aId,
                                          );
                                          return aff ? (
                                              <span
                                                  key={aId}
                                                  className="race-type-tag"
                                                  style={{
                                                      color: aff.color,
                                                      borderColor: aff.color,
                                                  }}
                                              >
                                                  {getAffinityTag(aff)}
                                              </span>
                                          ) : null;
                                      })
                                    : null}
                            </span>
                        </span>
                    </button>
                ))}
            </aside>
            {selectedDefinition ? (
                <section className="definition-editor compact">
                    <div className="editor-header grid-header">
                        <label className="header-field name-field">
                            Name
                            <input
                                value={selectedDefinition.name}
                                onChange={(event) =>
                                    update(
                                        selectedDefinition.id,
                                        (definition) => ({
                                            ...definition,
                                            name: event.target.value,
                                        }),
                                    )
                                }
                            />
                        </label>
                        {selectedDefinition.kind === "race" ? (
                            <label className="header-field">
                                Race Type
                                <select
                                    value={
                                        selectedDefinition.raceType ??
                                        "humanoid"
                                    }
                                    onChange={(event) =>
                                        update(
                                            selectedDefinition.id,
                                            (definition) => ({
                                                ...definition,
                                                raceType: event.target
                                                    .value as CharacterKind,
                                            }),
                                        )
                                    }
                                >
                                    {characterKinds.map((entry) => (
                                        <option key={entry} value={entry}>
                                            {titleCase(entry)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : (
                            <div className="header-field placeholder" />
                        )}
                        <label className="header-field">
                            Rarity
                            <RarityStepper
                                value={selectedDefinition.rarity}
                                rarities={rarityOptions}
                                onChange={(rarity) =>
                                    update(
                                        selectedDefinition.id,
                                        (definition) => ({
                                            ...definition,
                                            rarity,
                                        }),
                                    )
                                }
                            />
                        </label>
                        <label className="header-field">
                            Min Tier
                            <span className="inline-stepper">
                                <button
                                    type="button"
                                    className="stepper-btn"
                                    disabled={selectedDefinition.minTier <= 1}
                                    onClick={() =>
                                        update(
                                            selectedDefinition.id,
                                            (definition) => ({
                                                ...definition,
                                                minTier:
                                                    selectedDefinition.minTier -
                                                    1,
                                            }),
                                        )
                                    }
                                    aria-label="Decrease Min Tier"
                                >
                                    −
                                </button>
                                <span className="stepper-value">
                                    {selectedDefinition.minTier}
                                </span>
                                <button
                                    type="button"
                                    className="stepper-btn"
                                    disabled={
                                        selectedDefinition.minTier >= maxTier
                                    }
                                    onClick={() =>
                                        update(
                                            selectedDefinition.id,
                                            (definition) => ({
                                                ...definition,
                                                minTier:
                                                    selectedDefinition.minTier +
                                                    1,
                                            }),
                                        )
                                    }
                                    aria-label="Increase Min Tier"
                                >
                                    +
                                </button>
                            </span>
                        </label>
                    </div>
                    <label className="description-field compact-field">
                        Description
                        <textarea
                            value={selectedDefinition.description}
                            onChange={(event) =>
                                update(selectedDefinition.id, (definition) => ({
                                    ...definition,
                                    description: event.target.value,
                                    notes: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <RadarEditor
                        weights={selectedDefinition.statWeights}
                        primaryStats={primaryStatDefinitions}
                        onChange={(statWeights) =>
                            update(selectedDefinition.id, (definition) => ({
                                ...definition,
                                statWeights,
                            }))
                        }
                        compact
                    />
                    <fieldset className="full-width compact-field">
                        <legend>Affinities</legend>
                        <div className="affinity-picker">
                            {affinityDefinitions.map((aff) => {
                                const active =
                                    selectedDefinition.affinityIds?.includes(
                                        aff.id,
                                    );
                                return (
                                    <button
                                        key={aff.id}
                                        type="button"
                                        className={`affinity-tag ${active ? "active" : ""}`}
                                        style={{
                                            backgroundColor: active
                                                ? aff.color
                                                : "transparent",
                                            color: active
                                                ? "#05070d"
                                                : aff.color,
                                            borderColor: aff.color,
                                        }}
                                        onClick={() => toggleAffinity(aff.id)}
                                    >
                                        <span className="affinity-dot">
                                            {getAffinityTag(aff)}
                                        </span>{" "}
                                        {aff.name}
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>
                    <div className="toolbar compact">
                        <button
                            type="button"
                            className="secondary"
                            onClick={() => duplicate(selectedDefinition)}
                        >
                            Duplicate
                        </button>
                        <button
                            type="button"
                            className="danger"
                            onClick={() => remove(selectedDefinition.id)}
                        >
                            Delete Template
                        </button>
                    </div>
                </section>
            ) : (
                <section className="definition-editor empty-state">
                    <p>No {pluralDefinitionLabel(kind).toLowerCase()} yet.</p>
                </section>
            )}
        </div>
    );
}

function AffinityCompendium({
    affinities,
    selectedId,
    onSelected,
    onChange,
}: {
    affinities: AffinityDefinition[];
    selectedId: string | null;
    onSelected: (id: string | null) => void;
    onChange: (affinities: AffinityDefinition[]) => void;
}) {
    const selected =
        affinities.find((affinity) => affinity.id === selectedId) ??
        affinities[0] ??
        null;
    const update = (
        id: string,
        updater: (affinity: AffinityDefinition) => AffinityDefinition,
    ) =>
        onChange(
            affinities.map((affinity) =>
                affinity.id === id ? updater(affinity) : affinity,
            ),
        );
    const remove = (id: string) => {
        const remaining = affinities.filter((affinity) => affinity.id !== id);
        onChange(remaining);
        onSelected(remaining[0]?.id ?? null);
    };
    const duplicate = (affinity: AffinityDefinition) => {
        const copy = {
            ...affinity,
            id: makeId("affinity"),
            name: duplicatedName(affinity.name),
        };
        onChange([...affinities, copy]);
        onSelected(copy.id);
    };
    const getAffinityTag = (affinity: AffinityDefinition) =>
        affinity.emoji ?? affinity.name.charAt(0);

    return (
        <div className="catalog-grid">
            <aside className="definition-list">
                {[...affinities]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((affinity) => (
                        <button
                            key={affinity.id}
                            type="button"
                            className={`definition-row ${selected?.id === affinity.id ? "selected" : ""}`}
                            onClick={() => onSelected(affinity.id)}
                        >
                            <span>{affinity.name}</span>
                            <span
                                className="race-type-tag"
                                style={{
                                    color: affinity.color,
                                    borderColor: affinity.color,
                                }}
                            >
                                {getAffinityTag(affinity)}
                            </span>
                        </button>
                    ))}
            </aside>
            {selected ? (
                <section className="definition-editor">
                    <div className="form-grid two-col">
                        <label>
                            Name
                            <input
                                value={selected.name}
                                onChange={(event) =>
                                    update(selected.id, (affinity) => ({
                                        ...affinity,
                                        name: event.target.value,
                                    }))
                                }
                            />
                        </label>
                        <label>
                            Tag Color
                            <input
                                type="color"
                                value={selected.color}
                                onChange={(event) =>
                                    update(selected.id, (affinity) => ({
                                        ...affinity,
                                        color: event.target.value,
                                    }))
                                }
                            />
                        </label>
                        <label>
                            Tag Emoji
                            <input
                                value={selected.emoji ?? ""}
                                onChange={(event) =>
                                    update(selected.id, (affinity) => ({
                                        ...affinity,
                                        emoji: event.target.value.slice(0, 2),
                                    }))
                                }
                                placeholder="🔥"
                                maxLength={2}
                            />
                        </label>
                        <span
                            className="affinity-preview-tag"
                            style={{
                                color: selected.color,
                                borderColor: selected.color,
                            }}
                        >
                            {getAffinityTag(selected)}
                        </span>
                    </div>
                    <label className="full-width">
                        Description
                        <textarea
                            value={selected.description}
                            onChange={(event) =>
                                update(selected.id, (affinity) => ({
                                    ...affinity,
                                    description: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <div className="toolbar compact">
                        <button
                            type="button"
                            className="secondary"
                            onClick={() => duplicate(selected)}
                        >
                            Duplicate
                        </button>
                        <button
                            type="button"
                            className="danger"
                            onClick={() => remove(selected.id)}
                        >
                            Delete Affinity
                        </button>
                    </div>
                </section>
            ) : null}
        </div>
    );
}

function CurrencyCompendium({
    currencies,
    selectedId,
    onSelected,
    onChange,
}: {
    currencies: CurrencyDefinition[];
    selectedId: string | null;
    onSelected: (id: string | null) => void;
    onChange: (currencies: CurrencyDefinition[]) => void;
}) {
    const selected =
        currencies.find((currency) => currency.id === selectedId) ??
        currencies[0] ??
        null;
    const update = (
        id: string,
        updater: (currency: CurrencyDefinition) => CurrencyDefinition,
    ) =>
        onChange(
            currencies.map((currency) =>
                currency.id === id ? updater(currency) : currency,
            ),
        );
    const remove = (id: string) => {
        const remaining = currencies.filter((currency) => currency.id !== id);
        onChange(remaining);
        onSelected(remaining[0]?.id ?? null);
    };
    const duplicate = (currency: CurrencyDefinition) => {
        const copy = {
            ...currency,
            id: makeId("currency"),
            name: duplicatedName(currency.name),
        };
        onChange([...currencies, copy]);
        onSelected(copy.id);
    };

    return (
        <div className="catalog-grid">
            <aside className="definition-list">
                {[...currencies]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((currency) => (
                        <button
                            key={currency.id}
                            type="button"
                            className={`definition-row ${selected?.id === currency.id ? "selected" : ""}`}
                            onClick={() => onSelected(currency.id)}
                        >
                            <span>{currency.name}</span>
                            <span
                                className="race-type-tag"
                                style={{
                                    fontWeight: "bold",
                                }}
                            >
                                {currency.symbol}
                            </span>
                        </button>
                    ))}
            </aside>
            {selected ? (
                <section className="definition-editor">
                    <div className="form-grid two-col">
                        <label>
                            Name
                            <input
                                value={selected.name}
                                onChange={(event) =>
                                    update(selected.id, (currency) => ({
                                        ...currency,
                                        name: event.target.value,
                                    }))
                                }
                            />
                        </label>
                        <label>
                            Symbol
                            <input
                                value={selected.symbol}
                                onChange={(event) =>
                                    update(selected.id, (currency) => ({
                                        ...currency,
                                        symbol: event.target.value.slice(0, 4),
                                    }))
                                }
                                placeholder="G"
                                maxLength={4}
                            />
                        </label>
                    </div>
                    <label className="full-width">
                        Description
                        <textarea
                            value={selected.description}
                            onChange={(event) =>
                                update(selected.id, (currency) => ({
                                    ...currency,
                                    description: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <div className="toolbar compact">
                        <button
                            type="button"
                            className="secondary"
                            onClick={() => duplicate(selected)}
                        >
                            Duplicate
                        </button>
                        <button
                            type="button"
                            className="danger"
                            onClick={() => remove(selected.id)}
                        >
                            Delete Currency
                        </button>
                    </div>
                </section>
            ) : null}
        </div>
    );
}

function SkillCompendium({
    skills,
    tierDefinitions,
    rarityDefinitions,
    affinityDefinitions,
    selectedId,
    onSelected,
    onChange,
}: {
    skills: SkillDefinition[];
    tierDefinitions: TierDefinition[];
    rarityDefinitions: RarityDefinition[];
    affinityDefinitions: AffinityDefinition[];
    selectedId: string | null;
    onSelected: (id: string | null) => void;
    onChange: (skills: SkillDefinition[]) => void;
}) {
    const selected =
        skills.find((skill) => skill.id === selectedId) ?? skills[0] ?? null;
    const update = (
        id: string,
        updater: (skill: SkillDefinition) => SkillDefinition,
    ) =>
        onChange(
            skills.map((skill) => (skill.id === id ? updater(skill) : skill)),
        );
    const remove = (id: string) => {
        const remaining = skills.filter((skill) => skill.id !== id);
        onChange(remaining);
        onSelected(remaining[0]?.id ?? null);
    };
    const duplicate = (skill: SkillDefinition) => {
        const copy = {
            ...skill,
            id: makeId("skill-definition"),
            name: duplicatedName(skill.name),
            affinityIds: [...skill.affinityIds],
        };
        onChange([...skills, copy]);
        onSelected(copy.id);
    };
    const toggleAffinity = (affinityId: string) => {
        if (!selected) return;
        const has = selected.affinityIds.includes(affinityId);
        update(selected.id, (skill) => ({
            ...skill,
            affinityIds: has
                ? skill.affinityIds.filter((id) => id !== affinityId)
                : [...skill.affinityIds, affinityId],
        }));
    };
    const getAffinityTag = (affinity: AffinityDefinition) =>
        affinity.emoji ?? affinity.name.charAt(0);
    const rarityOptions = rarityNames(rarityDefinitions);
    const maxTier = maxConfiguredTier(tierDefinitions);

    return (
        <div className="catalog-grid">
            <aside className="definition-list">
                {[...skills]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((skill) => (
                        <button
                            key={skill.id}
                            type="button"
                            className={`definition-row ${selected?.id === skill.id ? "selected" : ""}`}
                            draggable
                            onDragStart={(event) =>
                                event.dataTransfer.setData(
                                    "text/plain",
                                    skill.id,
                                )
                            }
                            onClick={() => onSelected(skill.id)}
                        >
                            <span>{skill.name}</span>
                            <span className="definition-chip-tags no-scroll">
                                <span className="race-type-tag">
                                    T{skill.minTier}+
                                </span>
                                <span className={rarityClass(skill.rarity)}>
                                    {skill.rarity}
                                </span>
                                <span className="race-type-tag">
                                    {skill.kind[0]}
                                </span>
                                {skill.levelled ? (
                                    <span className="race-type-tag">L</span>
                                ) : null}
                                {skill.affinityIds.length > 0
                                    ? skill.affinityIds.map((aId) => {
                                          const aff = affinityDefinitions.find(
                                              (a) => a.id === aId,
                                          );
                                          return aff ? (
                                              <span
                                                  key={aId}
                                                  className="race-type-tag"
                                                  style={{
                                                      color: aff.color,
                                                      borderColor: aff.color,
                                                  }}
                                              >
                                                  {getAffinityTag(aff)}
                                              </span>
                                          ) : null;
                                      })
                                    : null}
                            </span>
                        </button>
                    ))}
            </aside>
            {selected ? (
                <section className="definition-editor">
                    <div className="editor-header grid-header">
                        <label className="header-field name-field">
                            Name
                            <input
                                value={selected.name}
                                onChange={(event) =>
                                    update(selected.id, (skill) => ({
                                        ...skill,
                                        name: event.target.value,
                                    }))
                                }
                            />
                        </label>
                        <label className="header-field">
                            Min Tier
                            <span className="inline-stepper">
                                <button
                                    type="button"
                                    className="stepper-btn"
                                    disabled={selected.minTier <= 1}
                                    onClick={() =>
                                        update(selected.id, (skill) => ({
                                            ...skill,
                                            minTier: selected.minTier - 1,
                                        }))
                                    }
                                >
                                    −
                                </button>
                                <span className="stepper-value">
                                    {selected.minTier}
                                </span>
                                <button
                                    type="button"
                                    className="stepper-btn"
                                    disabled={selected.minTier >= maxTier}
                                    onClick={() =>
                                        update(selected.id, (skill) => ({
                                            ...skill,
                                            minTier: selected.minTier + 1,
                                        }))
                                    }
                                >
                                    +
                                </button>
                            </span>
                        </label>
                        <label className="header-field">
                            Rarity
                            <RarityStepper
                                value={selected.rarity}
                                rarities={rarityOptions}
                                onChange={(rarity) =>
                                    update(selected.id, (skill) => ({
                                        ...skill,
                                        rarity,
                                    }))
                                }
                            />
                        </label>
                        <span className="header-field header-toggle">
                            Active
                            <label className="toggle-switch inline-toggle">
                                <input
                                    type="checkbox"
                                    checked={selected.kind === "Active"}
                                    onChange={(event) =>
                                        update(selected.id, (skill) => ({
                                            ...skill,
                                            kind: event.target.checked
                                                ? "Active"
                                                : "Passive",
                                        }))
                                    }
                                />
                                <span className="toggle-track" />
                            </label>
                        </span>
                        <span className="header-field header-toggle">
                            Leveled
                            <label className="toggle-switch inline-toggle">
                                <input
                                    type="checkbox"
                                    checked={selected.levelled}
                                    onChange={(event) =>
                                        update(selected.id, (skill) => ({
                                            ...skill,
                                            levelled: event.target.checked,
                                        }))
                                    }
                                />
                                <span className="toggle-track" />
                            </label>
                        </span>
                    </div>
                    <label className="full-width">
                        Description
                        <textarea
                            value={selected.description}
                            onChange={(event) =>
                                update(selected.id, (skill) => ({
                                    ...skill,
                                    description: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <div className="form-grid two-col compact-grid">
                        <label>
                            MP Cost
                            <select
                                value={selected.mpCost ?? "Average"}
                                onChange={(event) =>
                                    update(selected.id, (skill) => ({
                                        ...skill,
                                        mpCost: event.target
                                            .value as SkillDefinition["mpCost"],
                                    }))
                                }
                            >
                                <option>None</option>
                                <option>Negligible</option>
                                <option>Tiny</option>
                                <option>Small</option>
                                <option>Average</option>
                                <option>Somewhat High</option>
                                <option>High</option>
                                <option>Gargantuan</option>
                                <option>Cataclysmic</option>
                            </select>
                        </label>
                        <label>
                            Cooldown
                            <select
                                value={selected.cooldown ?? "Instant"}
                                onChange={(event) =>
                                    update(selected.id, (skill) => ({
                                        ...skill,
                                        cooldown: event.target
                                            .value as SkillDefinition["cooldown"],
                                    }))
                                }
                            >
                                <option>Instant</option>
                                <option>A few seconds</option>
                                <option>30 seconds</option>
                                <option>1 minute</option>
                                <option>5 minutes</option>
                                <option>30 minutes</option>
                                <option>1 hour</option>
                                <option>4 hours</option>
                                <option>1 day</option>
                                <option>1 week</option>
                                <option>1 month</option>
                                <option>1 year</option>
                            </select>
                        </label>
                        <label className="full-width">
                            Casting Time
                            <select
                                value={selected.castingTime ?? "Instant"}
                                onChange={(event) =>
                                    update(selected.id, (skill) => ({
                                        ...skill,
                                        castingTime: event.target
                                            .value as SkillDefinition["castingTime"],
                                    }))
                                }
                            >
                                <option>Instant</option>
                                <option>A few seconds</option>
                                <option>30 seconds</option>
                                <option>1 minute</option>
                                <option>5 minutes</option>
                                <option>30 minutes</option>
                                <option>1 hour</option>
                                <option>4 hours</option>
                                <option>1 day</option>
                                <option>1 week</option>
                                <option>1 month</option>
                                <option>1 year</option>
                            </select>
                        </label>
                    </div>
                    <fieldset className="full-width">
                        <legend>Affinities</legend>
                        <div className="affinity-picker">
                            {affinityDefinitions.map((aff) => {
                                const active = selected.affinityIds.includes(
                                    aff.id,
                                );
                                return (
                                    <button
                                        key={aff.id}
                                        type="button"
                                        className={`affinity-tag ${active ? "active" : ""}`}
                                        style={{
                                            backgroundColor: active
                                                ? aff.color
                                                : "transparent",
                                            color: active
                                                ? "#05070d"
                                                : aff.color,
                                            borderColor: aff.color,
                                        }}
                                        onClick={() => toggleAffinity(aff.id)}
                                    >
                                        <span className="affinity-dot">
                                            {getAffinityTag(aff)}
                                        </span>{" "}
                                        {aff.name}
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>
                    <div className="toolbar compact">
                        <button
                            type="button"
                            className="secondary"
                            onClick={() => duplicate(selected)}
                        >
                            Duplicate
                        </button>
                        <button
                            type="button"
                            className="danger"
                            onClick={() => remove(selected.id)}
                        >
                            Delete Skill
                        </button>
                    </div>
                </section>
            ) : null}
        </div>
    );
}

function SkillChipWithTooltip({
    skill,
    affinityDefinitions,
    onDragStart,
}: {
    skill: SkillDefinition;
    affinityDefinitions: AffinityDefinition[];
    onDragStart: (event: React.DragEvent) => void;
}) {
    const [hovered, setHovered] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);
    const [flipUp, setFlipUp] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0 });
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (hovered) {
            timerRef.current = setTimeout(
                () => setShowTooltip(true),
                HOVER_CARD_DELAY_MS,
            );
        } else {
            if (timerRef.current) clearTimeout(timerRef.current);
            setShowTooltip(false);
        }
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [hovered]);

    useEffect(() => {
        if (!showTooltip || !buttonRef.current) return;

        const updatePosition = () => {
            if (!buttonRef.current) return;
            const rect = buttonRef.current.getBoundingClientRect();
            const tooltipWidth = 416;
            const estimatedTooltipHeight = 260;
            const gap = 8;
            const viewportPadding = 12;
            const maxLeft = Math.max(
                viewportPadding,
                window.innerWidth - tooltipWidth - viewportPadding,
            );
            const spaceBelow = window.innerHeight - rect.bottom;
            const shouldFlipUp =
                spaceBelow < estimatedTooltipHeight + gap &&
                rect.top > estimatedTooltipHeight + gap;

            setFlipUp(shouldFlipUp);
            setTooltipPosition({
                left: Math.min(Math.max(rect.left, viewportPadding), maxLeft),
                top: shouldFlipUp
                    ? Math.max(
                          viewportPadding,
                          rect.top - estimatedTooltipHeight - gap,
                      )
                    : Math.min(
                          rect.bottom + gap,
                          window.innerHeight - viewportPadding,
                      ),
            });
        };

        updatePosition();
        window.addEventListener("scroll", updatePosition, true);
        window.addEventListener("resize", updatePosition);
        return () => {
            window.removeEventListener("scroll", updatePosition, true);
            window.removeEventListener("resize", updatePosition);
        };
    }, [showTooltip]);

    const skillAffinities = skill.affinityIds
        .map((aId) => affinityDefinitions.find((a) => a.id === aId))
        .filter((a): a is AffinityDefinition => Boolean(a));

    return (
        <button
            ref={buttonRef}
            type="button"
            className="definition-chip skill-chip-with-tooltip"
            draggable
            onDragStart={onDragStart}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => {
                setHovered(false);
                setShowTooltip(false);
            }}
            onFocus={() => setHovered(true)}
            onBlur={() => {
                setHovered(false);
                setShowTooltip(false);
            }}
        >
            <span className="skill-chip-name">{skill.name}</span>
            <span className="definition-chip-tags">
                <span className="tag-scroll-inner">
                    <span className="race-type-tag">T{skill.minTier}+</span>
                    <span className={rarityClass(skill.rarity)}>
                        {skill.rarity}
                    </span>
                    <span className="race-type-tag">{skill.kind[0]}</span>
                    {skill.levelled ? (
                        <span className="race-type-tag">L</span>
                    ) : null}
                    {skillAffinities.map((aff) => (
                        <span
                            key={aff.id}
                            className="race-type-tag"
                            style={{ color: aff.color, borderColor: aff.color }}
                        >
                            {aff.emoji ?? aff.name.charAt(0)}
                        </span>
                    ))}
                </span>
            </span>
            {showTooltip && typeof document !== "undefined"
                ? createPortal(
                      <span
                          className={`skill-tooltip calculation-popover hover-card-portal ${flipUp ? "flip-up" : ""}`}
                          style={{
                              left: tooltipPosition.left,
                              top: tooltipPosition.top,
                          }}
                      >
                          <strong>{skill.name}</strong>
                          <span className={rarityClass(skill.rarity)}>
                              {skill.rarity}
                          </span>
                          <span className="race-type-tag">
                              Min Tier {skill.minTier}+
                          </span>
                          <span className="race-type-tag">{skill.kind}</span>
                          {skill.levelled ? (
                              <span className="race-type-tag">Leveled</span>
                          ) : (
                              <span className="race-type-tag">Unleveled</span>
                          )}
                          <span className="skill-tooltip-meta">
                              <span>
                                  <strong>MP Cost</strong>
                                  {skill.mpCost ?? "Average"}
                              </span>
                              <span>
                                  <strong>Cooldown</strong>
                                  {skill.cooldown ?? "Instant"}
                              </span>
                              <span>
                                  <strong>Casting Time</strong>
                                  {skill.castingTime ?? "Instant"}
                              </span>
                          </span>
                          {skillAffinities.length > 0 ? (
                              <span className="skill-tooltip-affinities">
                                  {skillAffinities.map((aff) => (
                                      <span
                                          key={aff.id}
                                          className="race-type-tag"
                                          style={{
                                              color: aff.color,
                                              borderColor: aff.color,
                                          }}
                                      >
                                          {aff.emoji ?? aff.name.charAt(0)}{" "}
                                          {aff.name}
                                      </span>
                                  ))}
                              </span>
                          ) : null}
                          <span className="skill-tooltip-desc">
                              {skill.description}
                          </span>
                      </span>,
                      document.body,
                  )
                : null}
        </button>
    );
}

function DefinitionChipWithTooltip({
    definition,
    onDragStart,
}: {
    definition: AdvancementDefinition;
    onDragStart?: (event: React.DragEvent) => void;
}) {
    const [hovered, setHovered] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0 });
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (hovered) {
            timerRef.current = setTimeout(
                () => setShowTooltip(true),
                HOVER_CARD_DELAY_MS,
            );
        } else {
            if (timerRef.current) clearTimeout(timerRef.current);
            setShowTooltip(false);
        }
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [hovered]);

    useEffect(() => {
        if (!showTooltip || !buttonRef.current) return;

        const updatePosition = () => {
            if (!buttonRef.current) return;
            const rect = buttonRef.current.getBoundingClientRect();
            const tooltipWidth = 384;
            const estimatedTooltipHeight = 180;
            const gap = 8;
            const viewportPadding = 12;
            const maxLeft = Math.max(
                viewportPadding,
                window.innerWidth - tooltipWidth - viewportPadding,
            );
            const spaceBelow = window.innerHeight - rect.bottom;
            const shouldFlipUp =
                spaceBelow < estimatedTooltipHeight + gap &&
                rect.top > estimatedTooltipHeight + gap;

            setTooltipPosition({
                left: Math.min(Math.max(rect.left, viewportPadding), maxLeft),
                top: shouldFlipUp
                    ? Math.max(
                          viewportPadding,
                          rect.top - estimatedTooltipHeight - gap,
                      )
                    : Math.min(
                          rect.bottom + gap,
                          window.innerHeight - viewportPadding,
                      ),
            });
        };

        updatePosition();
        window.addEventListener("scroll", updatePosition, true);
        window.addEventListener("resize", updatePosition);
        return () => {
            window.removeEventListener("scroll", updatePosition, true);
            window.removeEventListener("resize", updatePosition);
        };
    }, [showTooltip]);

    const definitionRaceTypeLabel =
        definition.kind === "race" && definition.raceType
            ? raceTypeLabel(definition.raceType)
            : null;

    return (
        <button
            ref={buttonRef}
            type="button"
            className="definition-chip definition-chip-with-tooltip"
            draggable
            onDragStart={onDragStart}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => {
                setHovered(false);
                setShowTooltip(false);
            }}
            onFocus={() => setHovered(true)}
            onBlur={() => {
                setHovered(false);
                setShowTooltip(false);
            }}
        >
            <span>{definition.name}</span>
            <span className="definition-chip-tags">
                <span className="tag-scroll-inner">
                    {definition.kind === "race" && definition.raceType ? (
                        <span className={raceTypeClass(definition.raceType)}>
                            {definitionRaceTypeLabel}
                        </span>
                    ) : null}
                    <span className="race-type-tag">
                        T{definition.minTier}+
                    </span>
                    <span className={rarityClass(definition.rarity)}>
                        {definition.rarity}
                    </span>
                </span>
            </span>
            {showTooltip && typeof document !== "undefined"
                ? createPortal(
                      <span
                          className="definition-tooltip calculation-popover hover-card-portal"
                          style={{
                              left: tooltipPosition.left,
                              top: tooltipPosition.top,
                          }}
                      >
                          <strong>{definition.name}</strong>
                          {definitionRaceTypeLabel ? (
                              <span className="race-type-tag">
                                  {definitionRaceTypeLabel}
                              </span>
                          ) : null}
                          <span className="race-type-tag">
                              Min Tier {definition.minTier}+
                          </span>
                          <span className={rarityClass(definition.rarity)}>
                              {definition.rarity}
                          </span>
                          <span className="skill-tooltip-desc">
                              {definition.description}
                          </span>
                      </span>,
                      document.body,
                  )
                : null}
        </button>
    );
}

function ItemCompendium({
    items,
    tierDefinitions,
    rarityDefinitions,
    skills,
    primaryStatDefinitions,
    affinityDefinitions,
    selectedId,
    onSelected,
    onChange,
}: {
    items: ItemDefinition[];
    tierDefinitions: TierDefinition[];
    rarityDefinitions: RarityDefinition[];
    skills: SkillDefinition[];
    primaryStatDefinitions: PrimaryStatDefinition[];
    affinityDefinitions: AffinityDefinition[];
    selectedId: string | null;
    onSelected: (id: string | null) => void;
    onChange: (items: ItemDefinition[]) => void;
}) {
    const selected =
        items.find((item) => item.id === selectedId) ?? items[0] ?? null;
    const update = (
        id: string,
        updater: (item: ItemDefinition) => ItemDefinition,
    ) => onChange(items.map((item) => (item.id === id ? updater(item) : item)));
    const remove = (id: string) => {
        const remaining = items.filter((item) => item.id !== id);
        onChange(remaining);
        onSelected(remaining[0]?.id ?? null);
    };
    const duplicate = (item: ItemDefinition) => {
        const copy = {
            ...item,
            id: makeId("item-definition"),
            name: duplicatedName(item.name),
            statWeights: { ...item.statWeights },
            skillIds: [...item.skillIds],
            affinityIds: [...item.affinityIds],
        };
        onChange([...items, copy]);
        onSelected(copy.id);
    };
    const availableSlots: Array<Exclude<ItemSlot, "Other">> = [
        "Armor",
        "Accessory",
        "Weapon",
    ];
    const [skillFilter, setSkillFilter] = useState("");
    const sortedSkills = useMemo(
        () => [...skills].sort((a, b) => a.name.localeCompare(b.name)),
        [skills],
    );
    const filteredSkills = useMemo(
        () =>
            skillFilter
                ? sortedSkills.filter((skill) =>
                      skill.name
                          .toLowerCase()
                          .includes(skillFilter.toLowerCase()),
                  )
                : sortedSkills,
        [sortedSkills, skillFilter],
    );
    const isCommon = selected?.rarity === "Common";
    const rarityOptions = rarityNames(rarityDefinitions);
    const maxTier = maxConfiguredTier(tierDefinitions);
    const toggleAffinity = (affinityId: string) => {
        if (!selected) return;
        const has = selected.affinityIds.includes(affinityId);
        update(selected.id, (item) => ({
            ...item,
            affinityIds: has
                ? item.affinityIds.filter((id) => id !== affinityId)
                : [...item.affinityIds, affinityId],
        }));
    };

    const displayAffinities = useMemo(() => {
        return [...items]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((item) => ({
                item,
                affinities: item.affinityIds
                    .map((aId) => affinityDefinitions.find((a) => a.id === aId))
                    .filter((a): a is AffinityDefinition => Boolean(a)),
            }));
    }, [items, affinityDefinitions]);

    return (
        <div className="catalog-grid">
            <aside className="definition-list">
                {displayAffinities.map(({ item, affinities }) => (
                    <button
                        key={item.id}
                        type="button"
                        className={`definition-row ${selected?.id === item.id ? "selected" : ""}`}
                        onClick={() => onSelected(item.id)}
                    >
                        <span>{item.name}</span>
                        <span className="definition-chip-tags">
                            <span className="tag-scroll-inner">
                                <span className="race-type-tag">
                                    T{item.tier}
                                </span>
                                <span className={rarityClass(item.rarity)}>
                                    {item.rarity}
                                </span>
                                {affinities.map((aff) => (
                                    <span
                                        key={aff.id}
                                        className="race-type-tag"
                                        style={{
                                            color: aff.color,
                                            borderColor: aff.color,
                                        }}
                                    >
                                        {aff.emoji ?? aff.name.charAt(0)}
                                    </span>
                                ))}
                            </span>
                        </span>
                    </button>
                ))}
            </aside>
            {selected ? (
                <section className="definition-editor">
                    <div className="editor-header grid-header">
                        <label className="header-field name-field">
                            Name
                            <input
                                value={selected.name}
                                onChange={(event) =>
                                    update(selected.id, (item) => ({
                                        ...item,
                                        name: event.target.value,
                                    }))
                                }
                            />
                        </label>
                        <label className="header-field">
                            Type
                            <select
                                value={selected.slot}
                                onChange={(event) =>
                                    update(selected.id, (item) => ({
                                        ...item,
                                        slot: event.target.value as Exclude<
                                            ItemSlot,
                                            "Other"
                                        >,
                                    }))
                                }
                            >
                                {availableSlots.map((slot) => (
                                    <option key={slot} value={slot}>
                                        {slot}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="header-field">
                            Rarity
                            <RarityStepper
                                value={selected.rarity}
                                rarities={rarityOptions}
                                onChange={(rarity) =>
                                    update(selected.id, (item) => ({
                                        ...item,
                                        rarity,
                                        skillIds: item.skillIds.slice(
                                            0,
                                            Math.max(
                                                0,
                                                rarityOptions.indexOf(rarity),
                                            ),
                                        ),
                                    }))
                                }
                            />
                        </label>
                        <label className="header-field">
                            Tier
                            <span className="inline-stepper">
                                <button
                                    type="button"
                                    className="stepper-btn"
                                    disabled={selected.tier <= 1}
                                    onClick={() =>
                                        update(selected.id, (item) => ({
                                            ...item,
                                            tier: selected.tier - 1,
                                        }))
                                    }
                                >
                                    −
                                </button>
                                <span className="stepper-value">
                                    {selected.tier}
                                </span>
                                <button
                                    type="button"
                                    className="stepper-btn"
                                    disabled={selected.tier >= maxTier}
                                    onClick={() =>
                                        update(selected.id, (item) => ({
                                            ...item,
                                            tier: selected.tier + 1,
                                        }))
                                    }
                                >
                                    +
                                </button>
                            </span>
                        </label>
                    </div>
                    <label className="full-width">
                        Description
                        <textarea
                            value={selected.description}
                            onChange={(event) =>
                                update(selected.id, (item) => ({
                                    ...item,
                                    description: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <RadarEditor
                        weights={selected.statWeights}
                        primaryStats={primaryStatDefinitions}
                        onChange={(statWeights) =>
                            update(selected.id, (item) => ({
                                ...item,
                                statWeights,
                            }))
                        }
                    />
                    <fieldset className="full-width">
                        <legend>Affinities</legend>
                        <div className="affinity-picker">
                            {affinityDefinitions.map((aff) => {
                                const active = selected.affinityIds.includes(
                                    aff.id,
                                );
                                return (
                                    <button
                                        key={aff.id}
                                        type="button"
                                        className={`affinity-tag ${active ? "active" : ""}`}
                                        style={{
                                            backgroundColor: active
                                                ? aff.color
                                                : "transparent",
                                            color: active
                                                ? "#05070d"
                                                : aff.color,
                                            borderColor: aff.color,
                                        }}
                                        onClick={() => toggleAffinity(aff.id)}
                                    >
                                        <span className="affinity-dot">
                                            {aff.emoji ?? aff.name.charAt(0)}
                                        </span>{" "}
                                        {aff.name}
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>
                    {!isCommon ? (
                        <div className="item-skill-workbench">
                            <div className="definition-list skill-source-list">
                                <p className="eyebrow">Available Skills</p>
                                <input
                                    className="skill-filter-input"
                                    type="text"
                                    placeholder="Filter skills..."
                                    value={skillFilter}
                                    onChange={(event) =>
                                        setSkillFilter(event.target.value)
                                    }
                                />
                                <div className="skill-scroll-container">
                                    {filteredSkills.map((skill) => (
                                        <SkillChipWithTooltip
                                            key={skill.id}
                                            skill={skill}
                                            affinityDefinitions={
                                                affinityDefinitions
                                            }
                                            onDragStart={(event) =>
                                                event.dataTransfer.setData(
                                                    "text/plain",
                                                    skill.id,
                                                )
                                            }
                                        />
                                    ))}
                                </div>
                            </div>
                            <div
                                className="item-skill-drop"
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    const skillId =
                                        event.dataTransfer.getData(
                                            "text/plain",
                                        );
                                    if (
                                        !skillId ||
                                        selected.skillIds.includes(skillId) ||
                                        selected.skillIds.length >=
                                            Math.max(
                                                0,
                                                rarityOptions.indexOf(
                                                    selected.rarity,
                                                ),
                                            )
                                    )
                                        return;
                                    update(selected.id, (item) => ({
                                        ...item,
                                        skillIds: [...item.skillIds, skillId],
                                    }));
                                }}
                            >
                                <p className="eyebrow">
                                    Item Skills ({selected.skillIds.length}/
                                    {Math.max(
                                        0,
                                        rarityOptions.indexOf(selected.rarity),
                                    )}
                                    )
                                </p>
                                <p className="muted small">
                                    Drag skills from the list on the left onto
                                    this item.
                                </p>
                                {selected.skillIds.map((skillId) => {
                                    const skill = skills.find(
                                        (entry) => entry.id === skillId,
                                    );
                                    return (
                                        <button
                                            key={skillId}
                                            type="button"
                                            className="definition-chip"
                                            onClick={() =>
                                                update(selected.id, (item) => ({
                                                    ...item,
                                                    skillIds:
                                                        item.skillIds.filter(
                                                            (entry) =>
                                                                entry !==
                                                                skillId,
                                                        ),
                                                }))
                                            }
                                        >
                                            {skill?.name ?? skillId}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}
                    <div className="toolbar compact">
                        <button
                            type="button"
                            className="secondary"
                            onClick={() => duplicate(selected)}
                        >
                            Duplicate
                        </button>
                        <button
                            type="button"
                            className="danger"
                            onClick={() => remove(selected.id)}
                        >
                            Delete Item
                        </button>
                    </div>
                </section>
            ) : null}
        </div>
    );
}

function RadarEditor({
    weights,
    primaryStats,
    onChange,
    compact,
}: {
    weights: Partial<StatBlock>;
    primaryStats?: PrimaryStatDefinition[];
    onChange: (weights: Partial<StatBlock>) => void;
    compact?: boolean;
}) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [activeKey, setActiveKey] = useState<StatKey | null>(null);
    const size = 320;
    const center = size / 2;
    const radius = 106;

    function axisPoint(key: StatKey, value = 10): { x: number; y: number } {
        const index = statKeys.indexOf(key);
        const angle = -Math.PI / 2 + (index / statKeys.length) * Math.PI * 2;
        const scaledRadius = (radius * value) / 10;
        return {
            x: center + Math.cos(angle) * scaledRadius,
            y: center + Math.sin(angle) * scaledRadius,
        };
    }

    function updateFromPointer(
        key: StatKey,
        event: { clientX: number; clientY: number },
    ): void {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const x = event.clientX - rect.left - center;
        const y = event.clientY - rect.top - center;
        const index = statKeys.indexOf(key);
        const angle = -Math.PI / 2 + (index / statKeys.length) * Math.PI * 2;
        const projection = x * Math.cos(angle) + y * Math.sin(angle);
        const value = Math.min(
            10,
            Math.max(1, Math.round((projection / radius) * 10)),
        );
        onChange({ ...weights, [key]: value });
    }

    const polygonPoints = statKeys
        .map((key) => axisPoint(key, weights[key] ?? 5))
        .map((point) => `${point.x},${point.y}`)
        .join(" ");

    return (
        <div className={`radar-editor ${compact ? "compact-radar" : ""}`}>
            <svg
                ref={svgRef}
                viewBox={`0 0 ${size} ${size}`}
                className="radar-chart"
                onPointerMove={(event) =>
                    activeKey && updateFromPointer(activeKey, event)
                }
                onPointerUp={() => setActiveKey(null)}
                onPointerLeave={() => setActiveKey(null)}
            >
                {[2, 4, 6, 8, 10].map((ring) => (
                    <polygon
                        key={ring}
                        points={statKeys
                            .map((key) => axisPoint(key, ring))
                            .map((point) => `${point.x},${point.y}`)
                            .join(" ")}
                        className="radar-ring"
                    />
                ))}
                {statKeys.map((key) => {
                    const end = axisPoint(key, 10);
                    const label = axisPoint(key, 11.8);
                    const point = axisPoint(key, weights[key] ?? 5);
                    return (
                        <g key={key}>
                            <line
                                x1={center}
                                y1={center}
                                x2={end.x}
                                y2={end.y}
                                className="radar-axis"
                            />
                            <text
                                x={label.x}
                                y={label.y}
                                textAnchor="middle"
                                dominantBaseline="middle"
                            >
                                {statLabel(primaryStats, key).replace(
                                    " ",
                                    "\n",
                                )}
                            </text>
                            <circle
                                cx={point.x}
                                cy={point.y}
                                r="7"
                                className="radar-handle"
                                onPointerDown={(event) => {
                                    setActiveKey(key);
                                    event.currentTarget.setPointerCapture(
                                        event.pointerId,
                                    );
                                    updateFromPointer(key, event);
                                }}
                            />
                        </g>
                    );
                })}
                <polygon points={polygonPoints} className="radar-shape" />
            </svg>
        </div>
    );
}

function LevelUpModal({
    notice,
    onClose,
}: {
    notice: LevelUpNotice;
    onClose: () => void;
}) {
    return (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
            <section className="level-up-modal glass-panel">
                <p className="eyebrow">The System recognizes your growth</p>
                <h2>Level Up!</h2>
                <p>
                    <strong>{notice.characterName}</strong>'s {notice.trackName}{" "}
                    reached level {notice.level}.
                </p>
                <h3>Stat points added</h3>
                <div className="gain-list">
                    {formatStatGain(notice.gained).map((entry) => (
                        <span key={entry}>{entry}</span>
                    ))}
                </div>
                <button type="button" onClick={onClose}>
                    Continue
                </button>
            </section>
        </div>
    );
}

function SystemPath({
    character,
    compact = false,
    onEdit,
    definitions,
    tierDefinitions,
    characterTypeDefinitions,
    rarityDefinitions,
}: {
    character: Character;
    compact?: boolean;
    onEdit: () => void;
    definitions: AdvancementDefinition[];
    tierDefinitions: TierDefinition[];
    characterTypeDefinitions: CharacterTypeDefinition[];
    rarityDefinitions: RarityDefinition[];
}) {
    const milestones = sortedPath(character, tierDefinitions);

    function getPathTrackStatSummary(
        track: TierTrackSelection & { level?: number },
        kind: DefinitionKind,
        assignedTier: number,
    ): JSX.Element | null {
        if (typeof track.level !== "number") return null;
        const definition =
            findDefinitionByTrack(
                definitions,
                kind,
                track.name,
                track.definitionId,
            ) ??
            ((track as any).statWeights
                ? ({
                      id: track.definitionId ?? makeId("definition-path"),
                      kind,
                      name: track.name,
                      rarity: track.rarity,
                      minTier: 1,
                      statWeights: (track as any).statWeights,
                      description: "",
                      notes: "",
                  } satisfies AdvancementDefinition)
                : null);
        if (!definition) return null;
        const singleLevelGain = distributedStatGain(
            character,
            definition,
            assignedTier,
            tierDefinitions,
            characterTypeDefinitions,
            rarityDefinitions,
        );
        const totalGain = scaledStatGain(singleLevelGain, track.level);
        const bonuses = statKeys
            .map((key) => ({
                label: STAT_LABELS[key],
                value: Math.round(partialStatTotal(totalGain, key) * 100) / 100,
            }))
            .filter((entry) => entry.value > 0);
        if (!bonuses.length) return null;
        return (
            <div className="tier-stat-summary">
                {bonuses.map(({ label, value }) => (
                    <span key={label} className="tier-stat-bonus">
                        +{value} {label}
                    </span>
                ))}
            </div>
        );
    }

    return (
        <section
            className={`path-view glass-panel ${compact ? "compact-path" : ""}`}
        >
            <header className="section-title-row">
                <div>
                    <p className="eyebrow">Visual path through The System</p>
                    <h2>{character.name}</h2>
                </div>
                {!compact ? (
                    <button type="button" onClick={onEdit}>
                        Edit Path
                    </button>
                ) : null}
            </header>
            <div className="timeline">
                {tierDefinitions.map((rule) => {
                    const allTierMilestones = milestones.filter(
                        (milestone) => milestone.tier === rule.tier,
                    );
                    const status =
                        rule.tier < character.currentTier
                            ? "complete"
                            : rule.tier === character.currentTier
                              ? "current"
                              : "future";

                    // Track data for this tier from the character's progression
                    const tierData = character.tiers.find(
                        (t) => t.tier === rule.tier,
                    );

                    // For current tier, filter out auto-generated track milestones
                    // that duplicate what's already shown in the stat summary section.
                    // Keep only manually-added path milestones.
                    const displayMilestones =
                        status === "current"
                            ? allTierMilestones.filter(
                                  (m) =>
                                      m.source !== "Race" &&
                                      m.source !== "Class" &&
                                      m.source !== "Job",
                              )
                            : allTierMilestones;

                    return (
                        <article
                            key={rule.tier}
                            className={`tier-node ${status}`}
                        >
                            <div className="tier-orb">
                                {String(rule.tier).padStart(2, "0")}
                            </div>
                            <div className="tier-content">
                                <h3>
                                    {rule.title}{" "}
                                    <span>max {rule.maxLevel}</span>
                                </h3>
                                <p>{rule.details}</p>
                                <p className="muted small">
                                    Static tier bonus: +
                                    {displayNumber(rule.staticBonus)} to all
                                    stats
                                </p>

                                {/* Race / Class / Job stat summaries */}
                                {tierData ? (
                                    <div className="path-track-stats">
                                        <div className="path-track-entry">
                                            <div className="path-track-header">
                                                <span className="eyebrow-small">
                                                    Race
                                                </span>
                                                <strong>
                                                    {tierData.race.name}
                                                </strong>
                                                <span
                                                    className={rarityClass(
                                                        tierData.race.rarity,
                                                    )}
                                                >
                                                    {tierData.race.rarity}
                                                </span>
                                                {typeof tierData.race.level ===
                                                "number" ? (
                                                    <span className="muted small">
                                                        Lv {tierData.race.level}
                                                    </span>
                                                ) : null}
                                            </div>
                                            {getPathTrackStatSummary(
                                                tierData.race,
                                                "race",
                                                tierData.tier,
                                            )}
                                        </div>
                                        {tierData.classTrack ? (
                                            <div className="path-track-entry">
                                                <div className="path-track-header">
                                                    <span className="eyebrow-small">
                                                        Class
                                                    </span>
                                                    <strong>
                                                        {
                                                            tierData.classTrack
                                                                .name
                                                        }
                                                    </strong>
                                                    <span
                                                        className={rarityClass(
                                                            tierData.classTrack
                                                                .rarity,
                                                        )}
                                                    >
                                                        {
                                                            tierData.classTrack
                                                                .rarity
                                                        }
                                                    </span>
                                                    {typeof tierData.classTrack
                                                        .level === "number" ? (
                                                        <span className="muted small">
                                                            Lv{" "}
                                                            {(
                                                                tierData.classTrack as any
                                                            ).level ?? "-"}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                {getPathTrackStatSummary(
                                                    tierData.classTrack,
                                                    "class",
                                                    tierData.tier,
                                                )}
                                            </div>
                                        ) : null}
                                        {tierData.jobTrack ? (
                                            <div className="path-track-entry">
                                                <div className="path-track-header">
                                                    <span className="eyebrow-small">
                                                        Job
                                                    </span>
                                                    <strong>
                                                        {tierData.jobTrack.name}
                                                    </strong>
                                                    <span
                                                        className={rarityClass(
                                                            tierData.jobTrack
                                                                .rarity,
                                                        )}
                                                    >
                                                        {
                                                            tierData.jobTrack
                                                                .rarity
                                                        }
                                                    </span>
                                                    {typeof tierData.jobTrack
                                                        .level === "number" ? (
                                                        <span className="muted small">
                                                            Lv{" "}
                                                            {(
                                                                tierData.jobTrack as any
                                                            ).level ?? "-"}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                {getPathTrackStatSummary(
                                                    tierData.jobTrack,
                                                    "job",
                                                    tierData.tier,
                                                )}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                                {displayMilestones.length ? (
                                    <div className="milestone-list">
                                        {displayMilestones.map((milestone) => (
                                            <div
                                                key={milestone.id}
                                                className="milestone-chip"
                                            >
                                                <span
                                                    className={rarityClass(
                                                        milestone.rarity,
                                                    )}
                                                >
                                                    {milestone.rarity}
                                                </span>
                                                <strong>
                                                    {milestone.label}
                                                </strong>
                                                <small>
                                                    {milestone.source} ·{" "}
                                                    {milestone.notes}
                                                </small>
                                            </div>
                                        ))}
                                    </div>
                                ) : status === "future" && !tierData ? (
                                    <p className="muted small">
                                        No recorded branch yet.
                                    </p>
                                ) : null}
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}

export default App;
