import { clampPercent, createCharacter, DEFAULT_AFFINITIES, DEFAULT_CHARACTER_TYPE_DEFINITIONS, DEFAULT_CURRENCIES, DEFAULT_DEFINITIONS, DEFAULT_ITEM_DEFINITIONS, DEFAULT_PRIMARY_STAT_DEFINITIONS, DEFAULT_RARITY_DEFINITIONS, DEFAULT_SECONDARY_STAT_DEFINITIONS, DEFAULT_SKILL_DEFINITIONS, DEFAULT_STAT_CATEGORIES, DEFAULT_TIER_DEFINITIONS, EMPTY_STATS, makeId, RARITIES, STAT_LABELS, tierRule } from './data';
import type {
  AdvancementDefinition,
  AffinityDefinition,
  AppState,
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
} from './types';

const STATE_ENDPOINT = '/api/state';
let currentRevision = 0;
const statKeys = Object.keys(EMPTY_STATS) as StatKey[];
const characterKinds: CharacterKind[] = ['humanoid', 'monster', 'half-monster'];
const focusOptions: HalfMonsterFocus[] = ['class', 'job'];
const definitionKinds: DefinitionKind[] = ['race', 'class', 'job'];
const skillKinds: SkillKind[] = ['Active', 'Passive'];
const skillSources: SkillSource[] = ['Race', 'Class', 'Job', 'Item', 'Other'];
const itemSlots: ItemSlot[] = ['Armor', 'Accessory', 'Weapon', 'Other'];
const primaryStatRoles: PrimaryStatRole[] = ['aggressive', 'defensive'];
let availableRarities: Rarity[] = RARITIES;
let availableTierDefinitions: TierDefinition[] = DEFAULT_TIER_DEFINITIONS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function colorValue(value: unknown, fallback: string): string {
  const raw = stringValue(value, fallback).trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback;
}

function optionValue<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function rarityValue(value: unknown, fallback: Rarity): Rarity {
  return optionValue(value, availableRarities, fallback);
}

function sanitizeRarityDefinition(value: unknown): RarityDefinition | null {
  if (!isRecord(value)) return null;
  const name = stringValue(value.name, '').trim();
  if (!name) return null;
  return {
    id: stringValue(value.id, makeId('rarity')),
    name,
    multiplier: numberValue(value.multiplier, 1, 0, 100),
    color: colorValue(value.color, '#c9d0dc'),
  };
}

function sanitizeRarityDefinitions(value: unknown): RarityDefinition[] {
  const imported = Array.isArray(value)
    ? value.map(sanitizeRarityDefinition).filter((entry): entry is RarityDefinition => Boolean(entry))
    : [];
  const byName = new Map<string, RarityDefinition>();
  [...DEFAULT_RARITY_DEFINITIONS, ...imported].forEach((definition) => byName.set(definition.name, definition));
  return [...byName.values()];
}

function sanitizeCharacterTypeDefinition(value: unknown): CharacterTypeDefinition | null {
  if (!isRecord(value)) return null;
  const kind = optionValue(value.kind, characterKinds, 'humanoid');
  return {
    id: stringValue(value.id, makeId('character-type')),
    kind,
    label: stringValue(value.label, kind),
    multiplier: numberValue(value.multiplier, 1, 0, 100),
  };
}

function sanitizeCharacterTypeDefinitions(value: unknown): CharacterTypeDefinition[] {
  const imported = Array.isArray(value)
    ? value.map(sanitizeCharacterTypeDefinition).filter((entry): entry is CharacterTypeDefinition => Boolean(entry))
    : [];
  const byKind = new Map<CharacterKind, CharacterTypeDefinition>();
  [...DEFAULT_CHARACTER_TYPE_DEFINITIONS, ...imported].forEach((definition) => byKind.set(definition.kind, definition));
  return [...byKind.values()];
}

function tierDefinitionFor(tier: number): TierDefinition {
  return availableTierDefinitions.find((definition) => definition.tier === tier) ?? availableTierDefinitions[0] ?? DEFAULT_TIER_DEFINITIONS[0];
}

function maxConfiguredTier(): number {
  return Math.max(1, ...availableTierDefinitions.map((definition) => definition.tier));
}

function sanitizeTierDefinition(value: unknown): TierDefinition | null {
  if (!isRecord(value)) return null;
  const tier = Math.round(numberValue(value.tier, 1, 1, 999));
  return {
    id: stringValue(value.id, `tier-${tier}`),
    tier,
    maxLevel: Math.round(numberValue(value.maxLevel, tierRule(tier).maxLevel, 1, 999)),
    title: stringValue(value.title, tierRule(tier).title),
    details: stringValue(value.details, stringValue(value.description, tierRule(tier).details)),
    raceMultiplier: numberValue(value.raceMultiplier, tier * 20, 0, 999999),
    classMultiplier: numberValue(value.classMultiplier, tier * 20, 0, 999999),
    jobMultiplier: numberValue(value.jobMultiplier, tier * 20, 0, 999999),
    itemMultiplier: numberValue(value.itemMultiplier, tier * 10, 0, 999999),
    staticBonus: numberValue(value.staticBonus, tier * 10, 0, 999999),
  };
}

function sanitizeTierDefinitions(value: unknown): TierDefinition[] {
  const imported = Array.isArray(value)
    ? value.map(sanitizeTierDefinition).filter((entry): entry is TierDefinition => Boolean(entry))
    : [];
  const byTier = new Map<number, TierDefinition>();
  [...DEFAULT_TIER_DEFINITIONS, ...imported].forEach((definition) => byTier.set(definition.tier, definition));
  return [...byTier.values()].sort((a, b) => a.tier - b.tier);
}

function statKeyValue(value: unknown, fallback: StatKey): StatKey {
  return optionValue(value, statKeys, fallback);
}

function sanitizeStatCategoryDefinition(value: unknown): StatCategoryDefinition | null {
  if (!isRecord(value)) return null;
  const name = stringValue(value.name, '').trim();
  if (!name) return null;
  return {
    id: stringValue(value.id, makeId('stat-category')),
    name,
    description: stringValue(value.description, ''),
    order: Math.round(numberValue(value.order, 1, 1, 999)),
  };
}

function sanitizeStatCategoryDefinitions(value: unknown): StatCategoryDefinition[] {
  const imported = Array.isArray(value)
    ? value.map(sanitizeStatCategoryDefinition).filter((entry): entry is StatCategoryDefinition => Boolean(entry))
    : [];
  const byId = new Map<string, StatCategoryDefinition>();
  [...DEFAULT_STAT_CATEGORIES, ...imported].forEach((definition) => byId.set(definition.id, definition));
  return [...byId.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function sanitizePrimaryStatDefinition(value: unknown): PrimaryStatDefinition | null {
  if (!isRecord(value)) return null;
  const key = statKeyValue(value.key, 'strength');
  const fallback = DEFAULT_PRIMARY_STAT_DEFINITIONS.find((definition) => definition.key === key);
  return {
    id: stringValue(value.id, fallback?.id ?? `primary-stat-${key}`),
    key,
    label: stringValue(value.label, fallback?.label ?? STAT_LABELS[key]),
    categoryId: stringValue(value.categoryId, fallback?.categoryId ?? DEFAULT_STAT_CATEGORIES[0].id),
    role: optionValue(value.role, primaryStatRoles, fallback?.role ?? 'defensive'),
    description: stringValue(value.description, fallback?.description ?? ''),
    order: Math.round(numberValue(value.order, fallback?.order ?? 1, 1, 999)),
  };
}

function sanitizePrimaryStatDefinitions(value: unknown): PrimaryStatDefinition[] {
  const imported = Array.isArray(value)
    ? value.map(sanitizePrimaryStatDefinition).filter((entry): entry is PrimaryStatDefinition => Boolean(entry))
    : [];
  const byKey = new Map<StatKey, PrimaryStatDefinition>();
  [...DEFAULT_PRIMARY_STAT_DEFINITIONS, ...imported].forEach((definition) => byKey.set(definition.key, definition));
  return statKeys
    .map((key) => byKey.get(key) ?? DEFAULT_PRIMARY_STAT_DEFINITIONS.find((definition) => definition.key === key))
    .filter((entry): entry is PrimaryStatDefinition => Boolean(entry));
}

function sanitizeSecondaryStatDefinition(value: unknown): SecondaryStatDefinition | null {
  if (!isRecord(value)) return null;
  const key = stringValue(value.key, '').trim().toLowerCase();
  if (!key) return null;
  const fallback = DEFAULT_SECONDARY_STAT_DEFINITIONS.find((definition) => definition.key === key);
  return {
    id: stringValue(value.id, fallback?.id ?? makeId('secondary-stat')),
    key,
    shortName: stringValue(value.shortName, fallback?.shortName ?? key.toUpperCase()),
    longName: stringValue(value.longName, fallback?.longName ?? key.toUpperCase()),
    description: stringValue(value.description, fallback?.description ?? ''),
    multipliedStat: statKeyValue(value.multipliedStat, fallback?.multipliedStat ?? 'fortitude'),
    addedStat: statKeyValue(value.addedStat, fallback?.addedStat ?? 'strength'),
    order: Math.round(numberValue(value.order, fallback?.order ?? 1, 1, 999)),
  };
}

function sanitizeSecondaryStatDefinitions(value: unknown): SecondaryStatDefinition[] {
  const imported = Array.isArray(value)
    ? value.map(sanitizeSecondaryStatDefinition).filter((entry): entry is SecondaryStatDefinition => Boolean(entry))
    : [];
  const byKey = new Map<string, SecondaryStatDefinition>();
  [...DEFAULT_SECONDARY_STAT_DEFINITIONS, ...imported].forEach((definition) => byKey.set(definition.key, definition));
  return [...byKey.values()].sort((a, b) => a.order - b.order || a.shortName.localeCompare(b.shortName));
}

function sanitizeStats(value: unknown, fallback: Partial<StatBlock>, fillMissing = false): Partial<StatBlock> {
  const record = isRecord(value) ? value : {};
  return statKeys.reduce<Partial<StatBlock>>((stats, key) => {
    const fallbackValue = fallback[key] ?? (fillMissing ? EMPTY_STATS[key] : undefined);
    const raw = record[key];
    if (raw !== undefined || fallbackValue !== undefined) {
      stats[key] = numberValue(raw, fallbackValue ?? 0, -9999, 9999);
    }
    return stats;
  }, {});
}

function sanitizeTrack(value: unknown, fallback: LevelTrack, tier: number): LevelTrack {
  const record = isRecord(value) ? value : {};
  const maxLevel = tierDefinitionFor(tier).maxLevel;
  return {
    definitionId: typeof record.definitionId === 'string' ? record.definitionId : fallback.definitionId,
    name: stringValue(record.name, fallback.name),
    rarity: rarityValue(record.rarity, fallback.rarity),
    level: Math.round(numberValue(record.level, fallback.level, 1, maxLevel)),
    exp: clampPercent(numberValue(record.exp, fallback.exp, 0, 100)),
    maxLevel,
    perLevelBonus: sanitizeStats(record.perLevelBonus, fallback.perLevelBonus),
  };
}

function sanitizeDefinition(value: unknown): AdvancementDefinition | null {
  if (!isRecord(value)) return null;
  const kind = optionValue(value.kind, definitionKinds, 'race');
  return {
    id: stringValue(value.id, makeId('definition')),
    kind,
    raceType: kind === 'race' ? optionValue(value.raceType, characterKinds, 'humanoid') : undefined,
    name: stringValue(value.name, 'Unnamed Definition'),
    rarity: rarityValue(value.rarity, 'Common'),
    minTier: Math.round(numberValue(value.minTier, 1, 1, maxConfiguredTier())),
    statWeights: sanitizeStats(value.statWeights, { strength: 5, fortitude: 5, agility: 5, dexterity: 5, intelligence: 5, willpower: 5, wisdom: 5, charisma: 5, mana: 5, manaControl: 5, perception: 5, stealth: 5 }),
    description: stringValue(value.description, stringValue(value.notes, '')),
    notes: stringValue(value.notes, stringValue(value.description, '')),
  };
}

function sanitizeDefinitions(value: unknown): AdvancementDefinition[] {
  const imported = Array.isArray(value)
    ? value.map(sanitizeDefinition).filter((entry): entry is AdvancementDefinition => Boolean(entry))
    : [];
  const byId = new Map<string, AdvancementDefinition>();
  [...DEFAULT_DEFINITIONS, ...imported].forEach((definition) => byId.set(definition.id, definition));
  return [...byId.values()];
}

function sanitizeAffinityDefinition(value: unknown): AffinityDefinition | null {
  if (!isRecord(value)) return null;
  return {
    id: stringValue(value.id, makeId('affinity')),
    name: stringValue(value.name, 'Unnamed Affinity'),
    color: stringValue(value.color, '#8be9fd'),
    description: stringValue(value.description, ''),
  };
}

function sanitizeAffinityDefinitions(value: unknown): AffinityDefinition[] {
  const imported = Array.isArray(value)
    ? value.map(sanitizeAffinityDefinition).filter((entry): entry is AffinityDefinition => Boolean(entry))
    : [];
  const byId = new Map<string, AffinityDefinition>();
  [...DEFAULT_AFFINITIES, ...imported].forEach((definition) => byId.set(definition.id, definition));
  return [...byId.values()];
}

function sanitizeCurrencyDefinition(value: unknown): CurrencyDefinition | null {
  if (!isRecord(value)) return null;
  return {
    id: stringValue(value.id, makeId('currency')),
    name: stringValue(value.name, 'Unnamed Currency'),
    symbol: stringValue(value.symbol, '?'),
    description: stringValue(value.description, ''),
  };
}

function sanitizeCurrencyDefinitions(value: unknown): CurrencyDefinition[] {
  const imported = Array.isArray(value)
    ? value.map(sanitizeCurrencyDefinition).filter((entry): entry is CurrencyDefinition => Boolean(entry))
    : [];
  const byId = new Map<string, CurrencyDefinition>();
  [...DEFAULT_CURRENCIES, ...imported].forEach((definition) => byId.set(definition.id, definition));
  return [...byId.values()];
}

function sanitizeCharacterCurrency(value: unknown): CharacterCurrency | null {
  if (!isRecord(value)) return null;
  return {
    id: stringValue(value.id, makeId('character-currency')),
    currencyId: stringValue(value.currencyId, ''),
    quantity: Math.round(numberValue(value.quantity, 0, 0, 99999999)),
  };
}

function sanitizeSkillDefinition(value: unknown): SkillDefinition | null {
  if (!isRecord(value)) return null;
  return {
    id: stringValue(value.id, makeId('skill-definition')),
    name: stringValue(value.name, 'Unnamed Skill'),
    rarity: rarityValue(value.rarity, 'Common'),
    minTier: Math.round(numberValue(value.minTier, 1, 1, maxConfiguredTier())),
    description: stringValue(value.description, ''),
    kind: optionValue(value.kind, skillKinds, 'Active'),
    levelled: Boolean(value.levelled),
    affinityIds: Array.isArray(value.affinityIds) ? value.affinityIds.filter((entry: unknown): entry is string => typeof entry === 'string') : [],
    mpCost: stringValue(value.mpCost, value.kind === 'Passive' ? 'N/A' : 'Average') as SkillDefinition['mpCost'],
    costStatKey: stringValue(value.costStatKey, 'mp'),
    castingTime: stringValue(value.castingTime, value.kind === 'Passive' ? 'N/A' : 'Instant') as SkillDefinition['castingTime'],
    cooldown: stringValue(value.cooldown, value.kind === 'Passive' ? 'N/A' : 'Instant') as SkillDefinition['cooldown'],
  };
}

function sanitizeSkillDefinitions(value: unknown): SkillDefinition[] {
  const imported = Array.isArray(value)
    ? value.map(sanitizeSkillDefinition).filter((entry): entry is SkillDefinition => Boolean(entry))
    : [];
  const byId = new Map<string, SkillDefinition>();
  [...DEFAULT_SKILL_DEFINITIONS, ...imported].forEach((definition) => byId.set(definition.id, definition));
  return [...byId.values()];
}

function sanitizeItemDefinition(value: unknown): ItemDefinition | null {
  if (!isRecord(value)) return null;
  const slot = optionValue(value.slot, ['Armor', 'Accessory', 'Weapon'] as const, 'Armor');
  return {
    id: stringValue(value.id, makeId('item-definition')),
    name: stringValue(value.name, 'Unnamed Item'),
    slot,
    tier: Math.round(numberValue(value.tier, 1, 1, maxConfiguredTier())),
    rarity: rarityValue(value.rarity, 'Common'),
    description: stringValue(value.description, ''),
    statWeights: sanitizeStats(value.statWeights, { strength: 5, fortitude: 5, agility: 5, dexterity: 5, intelligence: 5, willpower: 5, wisdom: 5, charisma: 5, mana: 5, manaControl: 5, perception: 5, stealth: 5 }),
    skillIds: Array.isArray(value.skillIds) ? value.skillIds.filter((entry): entry is string => typeof entry === 'string') : [],
    affinityIds: Array.isArray(value.affinityIds) ? value.affinityIds.filter((entry: unknown): entry is string => typeof entry === 'string') : [],
  };
}

function sanitizeItemDefinitions(value: unknown): ItemDefinition[] {
  const imported = Array.isArray(value)
    ? value.map(sanitizeItemDefinition).filter((entry): entry is ItemDefinition => Boolean(entry))
    : [];
  const byId = new Map<string, ItemDefinition>();
  [...DEFAULT_ITEM_DEFINITIONS, ...imported].forEach((definition) => byId.set(definition.id, definition));
  return [...byId.values()];
}

function sanitizeSkill(value: unknown): Skill | null {
  if (!isRecord(value)) return null;
  return {
    id: stringValue(value.id, makeId('skill')),
    definitionId: typeof value.definitionId === 'string' ? value.definitionId : undefined,
    name: stringValue(value.name, 'Unnamed Skill'),
    kind: optionValue(value.kind, skillKinds, 'Passive'),
    source: optionValue(value.source, skillSources, 'Other'),
    rarity: rarityValue(value.rarity, 'Common'),
    level: value.level === null ? null : Math.round(numberValue(value.level, 1, 0, 999)),
    exp: clampPercent(numberValue(value.exp, 0, 0, 100)),
    mpCost: stringValue(value.mpCost, 'N/A'),
    costStatKey: stringValue(value.costStatKey, 'mp'),
    castingTime: stringValue(value.castingTime, 'N/A'),
    cooldown: stringValue(value.cooldown, 'N/A'),
    description: stringValue(value.description, ''),
  };
}

function sanitizeItem(value: unknown): Item | null {
  if (!isRecord(value)) return null;
  return {
    id: stringValue(value.id, makeId('item')),
    definitionId: typeof value.definitionId === 'string' ? value.definitionId : undefined,
    name: stringValue(value.name, 'Unnamed Item'),
    slot: optionValue(value.slot, itemSlots, 'Other'),
    tier: Math.round(numberValue(value.tier, 1, 1, maxConfiguredTier())),
    rarity: rarityValue(value.rarity, 'Common'),
    statBonuses: sanitizeStats(value.statBonuses, {}),
    skillName: stringValue(value.skillName, ''),
    skillNames: Array.isArray(value.skillNames) ? value.skillNames.filter((entry): entry is string => typeof entry === 'string') : [],
    skillSet: Boolean(value.skillSet),
    setSkillNames: Array.isArray(value.setSkillNames) ? value.setSkillNames.filter((entry): entry is string => typeof entry === 'string') : [],
    equipped: Boolean(value.equipped),
    description: stringValue(value.description, ''),
    notes: stringValue(value.notes, ''),
  };
}

function enforceItemSkillLimit(items: Item[], tier: number): Item[] {
  let setCount = 0;
  return items.map((item) => {
    const legacySkillNames = item.skillNames?.length ? item.skillNames : item.skillName ? [item.skillName] : [];
    if (item.setSkillNames?.length) {
      const availableSet = new Set(legacySkillNames);
      const allowed: string[] = [];
      item.setSkillNames.forEach((skillName) => {
        if (availableSet.has(skillName) && setCount < tier) {
          allowed.push(skillName);
          setCount += 1;
        }
      });
      return { ...item, setSkillNames: allowed, skillSet: allowed.length > 0 };
    }
    if (!item.skillName || !item.skillSet) return { ...item, skillNames: legacySkillNames };
    if (setCount >= tier) return { ...item, skillSet: false };
    setCount += 1;
    return { ...item, skillNames: legacySkillNames, setSkillNames: [item.skillName] };
  });
}

function sanitizePath(value: unknown): PathMilestone | null {
  if (!isRecord(value)) return null;
  return {
    id: stringValue(value.id, makeId('path')),
    tier: Math.round(numberValue(value.tier, 1, 1, maxConfiguredTier())),
    label: stringValue(value.label, 'Unrecorded Milestone'),
    rarity: rarityValue(value.rarity, 'Common'),
    source: optionValue(value.source, [...skillSources, 'System'] as const, 'System'),
    notes: stringValue(value.notes, ''),
  };
}

function sanitizePlayers(value: unknown): Player[] {
  const players = Array.isArray(value)
    ? value.filter(isRecord).map((player) => ({
        id: stringValue(player.id, makeId('player')),
        name: stringValue(player.name, 'Player'),
      }))
    : [];
  return players.length ? players : blankState().players;
}

function sanitizeCharacter(value: unknown, players: Player[]): Character | null {
  if (!isRecord(value)) return null;
  const playerId = players.some((player) => player.id === value.playerId) ? stringValue(value.playerId, players[0].id) : players[0].id;
  const kind = optionValue(value.kind, characterKinds, 'humanoid');
  const focus = optionValue(value.halfMonsterFocus, focusOptions, 'class');
  const tier = Math.round(numberValue(value.tier, 1, 1, maxConfiguredTier()));
  const fallback = createCharacter(playerId, kind, focus);
  const fallbackTier = fallback.tiers[0];

  const character: Character = {
    ...fallback,
    id: stringValue(value.id, fallback.id),
    playerId,
    name: stringValue(value.name, fallback.name),
    age: stringValue(value.age, fallback.age),
    size: stringValue(value.size, fallback.size),
    build: stringValue(value.build, fallback.build),
    pronouns: stringValue(value.pronouns, fallback.pronouns),
    gender: stringValue(value.gender, fallback.gender),
    sexualPreference: stringValue(value.sexualPreference, fallback.sexualPreference),
    appearance: stringValue(value.appearance, fallback.appearance),
    kind,
    halfMonsterFocus: kind === 'half-monster' ? focus : undefined,
    currentTier: tier,
    tiers: [
      {
        tier,
        status: 'current' as const,
        race: sanitizeTrack((value as any).race ?? (value as any).tiers?.[0]?.race, fallbackTier.race as LevelTrack, tier),
        classTrack: ((value as any).classTrack ?? (value as any).tiers?.[0]?.classTrack) ? sanitizeTrack((value as any).classTrack ?? (value as any).tiers?.[0]?.classTrack, (fallbackTier.classTrack as LevelTrack | undefined) ?? { name: 'Page', rarity: 'Common', level: 1, exp: 0, maxLevel: tierDefinitionFor(tier).maxLevel, perLevelBonus: {} }, tier) : undefined,
        jobTrack: ((value as any).jobTrack ?? (value as any).tiers?.[0]?.jobTrack) ? sanitizeTrack((value as any).jobTrack ?? (value as any).tiers?.[0]?.jobTrack, (fallbackTier.jobTrack as LevelTrack | undefined) ?? { name: 'Apprentice Apothecary', rarity: 'Common', level: 1, exp: 0, maxLevel: tierDefinitionFor(tier).maxLevel, perLevelBonus: {} }, tier) : undefined,
      }
    ],
    baseStats: sanitizeStats(value.baseStats, fallback.baseStats, true) as StatBlock,
    raceBonuses: sanitizeStats(value.raceBonuses, fallback.raceBonuses),
    progressionBonuses: sanitizeStats(value.progressionBonuses, fallback.progressionBonuses),
    passiveBonuses: sanitizeStats(value.passiveBonuses, fallback.passiveBonuses),
    affinities: Array.isArray(value.affinities) ? value.affinities.filter((entry): entry is string => typeof entry === 'string') : [],
    currencies: Array.isArray(value.currencies) ? value.currencies.map(sanitizeCharacterCurrency).filter((entry): entry is CharacterCurrency => Boolean(entry)) : [],
    skills: Array.isArray(value.skills) ? value.skills.map(sanitizeSkill).filter((entry): entry is Skill => Boolean(entry)) : [],
    items: enforceItemSkillLimit(
      Array.isArray(value.items) ? value.items.map(sanitizeItem).filter((entry): entry is Item => Boolean(entry)) : [],
      tier,
    ),
    path: Array.isArray(value.path) ? value.path.map(sanitizePath).filter((entry): entry is PathMilestone => Boolean(entry)) : fallback.path,
    notes: stringValue(value.notes, ''),
    updatedAt: stringValue(value.updatedAt, new Date().toISOString()),
  };

  return character;
}

function sanitizeState(value: unknown): AppState {
  if (!isRecord(value)) return blankState();
  const players = sanitizePlayers(value.players);
  const tierDefinitions = sanitizeTierDefinitions(value.tierDefinitions);
  availableTierDefinitions = tierDefinitions;
  const characterTypeDefinitions = sanitizeCharacterTypeDefinitions(value.characterTypeDefinitions);
  const statCategoryDefinitions = sanitizeStatCategoryDefinitions(value.statCategoryDefinitions);
  const primaryStatDefinitions = sanitizePrimaryStatDefinitions(value.primaryStatDefinitions);
  const secondaryStatDefinitions = sanitizeSecondaryStatDefinitions(value.secondaryStatDefinitions);
  const rarityDefinitions = sanitizeRarityDefinitions(value.rarityDefinitions);
  availableRarities = rarityDefinitions.map((definition) => definition.name);
  const definitions = sanitizeDefinitions(value.definitions);
  const affinityDefinitions = sanitizeAffinityDefinitions(value.affinityDefinitions);
  const currencyDefinitions = sanitizeCurrencyDefinitions(value.currencyDefinitions);
  const skillDefinitions = sanitizeSkillDefinitions(value.skillDefinitions);
  const itemDefinitions = sanitizeItemDefinitions(value.itemDefinitions);
  const characters = Array.isArray(value.characters)
    ? value.characters.map((character) => sanitizeCharacter(character, players)).filter((character): character is Character => Boolean(character))
    : [];
  if (!characters.length) {
    return { players, characters: [], tierDefinitions, characterTypeDefinitions, statCategoryDefinitions, primaryStatDefinitions, secondaryStatDefinitions, definitions, rarityDefinitions, affinityDefinitions, currencyDefinitions, skillDefinitions, itemDefinitions, selectedCharacterId: undefined };
  }
  const selectedCharacterId = characters.some((character) => character.id === value.selectedCharacterId)
    ? stringValue(value.selectedCharacterId, characters[0].id)
    : characters[0].id;
  return { players, characters, tierDefinitions, characterTypeDefinitions, statCategoryDefinitions, primaryStatDefinitions, secondaryStatDefinitions, definitions, rarityDefinitions, affinityDefinitions, currencyDefinitions, skillDefinitions, itemDefinitions, selectedCharacterId };
}

export function blankState(): AppState {
  const playerId = makeId('player');
  return {
    players: [{ id: playerId, name: 'Default Group' }],
    characters: [],
    tierDefinitions: DEFAULT_TIER_DEFINITIONS,
    characterTypeDefinitions: DEFAULT_CHARACTER_TYPE_DEFINITIONS,
    statCategoryDefinitions: DEFAULT_STAT_CATEGORIES,
    primaryStatDefinitions: DEFAULT_PRIMARY_STAT_DEFINITIONS,
    secondaryStatDefinitions: DEFAULT_SECONDARY_STAT_DEFINITIONS,
    definitions: DEFAULT_DEFINITIONS,
    rarityDefinitions: DEFAULT_RARITY_DEFINITIONS,
    affinityDefinitions: DEFAULT_AFFINITIES,
    currencyDefinitions: DEFAULT_CURRENCIES,
    skillDefinitions: DEFAULT_SKILL_DEFINITIONS,
    itemDefinitions: DEFAULT_ITEM_DEFINITIONS,
    selectedCharacterId: undefined,
  };
}

export async function loadState(): Promise<AppState> {
  if (typeof window === 'undefined') return blankState();

  const response = await window.fetch(STATE_ENDPOINT, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });

  if (response.status === 204) {
    currentRevision = 0;
    return blankState();
  }
  if (!response.ok) throw new Error(`Failed to load shared ledger (${response.status}).`);

  try {
    currentRevision = Number(response.headers.get('etag')?.replaceAll('"', '') || 0);
    return sanitizeState(await response.json());
  } catch {
    throw new Error('Shared ledger response was not valid Evolution RPG data.');
  }
}

export async function saveState(state: AppState): Promise<void> {
  const response = await window.fetch(STATE_ENDPOINT, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'if-match': String(currentRevision) },
    body: JSON.stringify(state),
  });

  if (response.status === 409) throw new Error('Shared ledger changed on the server. Reload before saving again.');
  if (!response.ok) throw new Error(`Failed to save shared ledger (${response.status}).`);

  const result = await response.json() as { revision?: unknown };
  currentRevision = typeof result.revision === 'number' ? result.revision : currentRevision + 1;
}

export function exportState(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `evolution-rpg-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importState(file: File): Promise<AppState> {
  const text = await file.text();
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.players) || !Array.isArray(parsed.characters)) {
    throw new Error('Import file does not look like an Evolution RPG ledger export.');
  }
  return sanitizeState(parsed);
}
