export type CharacterKind = 'humanoid' | 'monster' | 'half-monster';
export type HalfMonsterFocus = 'class' | 'job';
export type Rarity = string;
export type SkillKind = 'Active' | 'Passive';
export type SkillSource = 'Race' | 'Class' | 'Job' | 'Item' | 'Other';
export type ItemSlot = 'Armor' | 'Accessory' | 'Weapon' | 'Other';
export type DefinitionKind = 'race' | 'class' | 'job';
export type StatKey =
  | 'strength'
  | 'fortitude'
  | 'agility'
  | 'dexterity'
  | 'intelligence'
  | 'willpower'
  | 'wisdom'
  | 'charisma'
  | 'mana'
  | 'manaControl'
  | 'perception'
  | 'stealth';

export type StatBlock = Record<StatKey, number>;

export interface Player {
  id: string;
  name: string;
}

export interface TierRule {
  tier: number;
  maxLevel: number;
  title: string;
  details: string;
}

export interface TierDefinition extends TierRule {
  id: string;
  raceMultiplier: number;
  classMultiplier: number;
  jobMultiplier: number;
  itemMultiplier: number;
  staticBonus: number;
}

export interface LevelTrack {
  definitionId?: string;
  name: string;
  rarity: Rarity;
  level: number;
  exp: number;
  maxLevel: number;
  perLevelBonus: Partial<StatBlock>;
}

export interface AdvancementDefinition {
  id: string;
  kind: DefinitionKind;
  raceType?: CharacterKind;
  name: string;
  rarity: Rarity;
  minTier: number;
  statWeights: Partial<StatBlock>;
  description: string;
  notes: string;
  affinityIds?: string[];
}

export interface PathMilestone {
  id: string;
  tier: number;
  label: string;
  rarity: Rarity;
  source: SkillSource | 'System';
  notes: string;
}

export interface Skill {
  id: string;
  definitionId?: string;
  name: string;
  kind: SkillKind;
  source: SkillSource;
  rarity: Rarity;
  level: number | null;
  exp: number;
  mpCost: string;
  castingTime: string;
  cooldown: string;
  description: string;
}

export interface AffinityDefinition {
  id: string;
  name: string;
  color: string;
  description: string;
  emoji?: string;
}

export interface CurrencyDefinition {
  id: string;
  name: string;
  symbol: string;
  description: string;
}

export interface RarityDefinition {
  id: string;
  name: Rarity;
  multiplier: number;
  color: string;
}

export interface CharacterTypeDefinition {
  id: string;
  kind: CharacterKind;
  label: string;
  multiplier: number;
}

export interface CharacterCurrency {
  id: string;
  currencyId: string;
  quantity: number;
}

export interface SkillDefinition {
  id: string;
  name: string;
  rarity: Rarity;
  minTier: number;
  description: string;
  kind: SkillKind;
  levelled: boolean;
  affinityIds: string[];
  mpCost?: 'None' | 'Negligible' | 'Tiny' | 'Small' | 'Average' | 'Somewhat High' | 'High' | 'Gargantuan' | 'Cataclysmic';
  cooldown?: 'Instant' | 'A few seconds' | '30 seconds' | '1 minute' | '5 minutes' | '30 minutes' | '1 hour' | '4 hours' | '1 day' | '1 week' | '1 month' | '1 year';
  castingTime?: 'Instant' | 'A few seconds' | '30 seconds' | '1 minute' | '5 minutes' | '30 minutes' | '1 hour' | '4 hours' | '1 day' | '1 week' | '1 month' | '1 year';
}

export interface ItemDefinition {
  id: string;
  name: string;
  slot: Exclude<ItemSlot, 'Other'>;
  tier: number;
  rarity: Rarity;
  description: string;
  statWeights: Partial<StatBlock>;
  skillIds: string[];
  affinityIds: string[];
}

export interface Item {
  id: string;
  definitionId?: string;
  name: string;
  slot: ItemSlot;
  tier?: number;
  rarity: Rarity;
  statBonuses: Partial<StatBlock>;
  skillName: string;
  skillNames?: string[];
  skillSet: boolean;
  setSkillNames?: string[];
  equipped?: boolean;
  description?: string;
  notes: string;
}

export interface TierTrackSelection {
  definitionId?: string;
  name: string;
  rarity: Rarity;
  level?: number;
}

export interface TierProgression {
  tier: number;
  status: 'completed' | 'current';
  race: TierTrackSelection & { level: number; exp: number };
  classTrack?: TierTrackSelection;
  jobTrack?: TierTrackSelection;
}

export interface Character {
  id: string;
  playerId: string;
  name: string;
  age: string;
  kind: CharacterKind;
  halfMonsterFocus?: HalfMonsterFocus;
  currentTier: number;
  tiers: TierProgression[];
  baseStats: StatBlock;
  raceBonuses: Partial<StatBlock>;
  progressionBonuses: Partial<StatBlock>;
  passiveBonuses: Partial<StatBlock>;
  affinities: string[];
  currencies: CharacterCurrency[];
  skills: Skill[];
  items: Item[];
  path: PathMilestone[];
  notes: string;
  updatedAt: string;
}

export interface AppState {
  players: Player[];
  characters: Character[];
  tierDefinitions: TierDefinition[];
  characterTypeDefinitions: CharacterTypeDefinition[];
  definitions: AdvancementDefinition[];
  rarityDefinitions: RarityDefinition[];
  affinityDefinitions: AffinityDefinition[];
  currencyDefinitions: CurrencyDefinition[];
  skillDefinitions: SkillDefinition[];
  itemDefinitions: ItemDefinition[];
  selectedCharacterId?: string;
}
